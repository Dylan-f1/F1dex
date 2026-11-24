import { FIRST_LAP_NUMBER } from './constants'

const MS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60
const UNCLASSIFIED_DISQUALIFIED_RANK = 200
const UNCLASSIFIED_RETIRED_BASE_RANK = 100

// OpenF1 donne le fuseau du circuit (« -08:00:00 », ou « 03:00:00 » sans signe pour l'est).
function parseUtcOffsetMs(offset) {
  const [, sign, hours, minutes] = /^([+-]?)(\d\d):(\d\d)/.exec(offset)
  const totalMinutes = Number(hours) * MINUTES_PER_HOUR + Number(minutes)
  return (sign === '-' ? -1 : 1) * totalMinutes * MS_PER_MINUTE
}

function localIsoDate(session) {
  const localTime = Date.parse(session.date_start) + parseUtcOffsetMs(session.gmt_offset)
  return new Date(localTime).toISOString().slice(0, 10)
}

export function buildCalendar(sessions) {
  return sessions
    .map((session) => ({
      sessionKey: session.session_key,
      circuitKey: session.circuit_key,
      circuit: session.circuit_short_name.replace(' Circuit', ''),
      country: session.country_name,
      date: localIsoDate(session),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function rankOf(result) {
  if (result.position != null) return result.position
  if (result.dsq) return UNCLASSIFIED_DISQUALIFIED_RANK
  return UNCLASSIFIED_RETIRED_BASE_RANK - (result.number_of_laps ?? 0)
}

function statusOf(result) {
  if (result.dsq) return 'DSQ'
  if (result.dnf) return 'DNF'
  if (result.dns) return 'DNS'
  return ''
}

function buildStints(rawStints, driverNumber) {
  return rawStints
    .filter((stint) => stint.driver_number === driverNumber)
    .sort((a, b) => a.stint_number - b.stint_number)
    .map((stint) => ({
      compound: stint.compound ?? 'UNKNOWN',
      startLap: stint.lap_start,
      endLap: stint.lap_end,
      tyreAge: stint.tyre_age_at_start,
    }))
}

function buildPits(rawPits, driverNumber) {
  return rawPits
    .filter((pit) => pit.driver_number === driverNumber)
    .sort((a, b) => a.lap_number - b.lap_number)
    .map((pit) => ({
      lap: pit.lap_number,
      stopSeconds: pit.stop_duration,
      laneSeconds: pit.pit_duration,
    }))
}

// Un tour est « exclu » du duel de rythme s'il n'est pas représentatif :
// premier tour, tour d'entrée aux stands, tour de sortie.
function buildLaps(rawLaps, driverNumber, pits) {
  const pitLaps = new Set(pits.map((pit) => pit.lap))
  return rawLaps
    .filter((lap) => lap.driver_number === driverNumber && lap.lap_duration != null)
    .sort((a, b) => a.lap_number - b.lap_number)
    .map((lap) => ({
      lap: lap.lap_number,
      seconds: lap.lap_duration,
      excluded:
        lap.lap_number === FIRST_LAP_NUMBER ||
        pitLaps.has(lap.lap_number) ||
        pitLaps.has(lap.lap_number - 1) ||
        Boolean(lap.is_pit_out_lap),
    }))
}

function buildWeather(rawWeather) {
  if (!rawWeather.length) return null
  const trackTemperatures = rawWeather.map((sample) => sample.track_temperature)
  const airTemperatures = rawWeather.map((sample) => sample.air_temperature)
  return {
    trackMin: Math.min(...trackTemperatures),
    trackMax: Math.max(...trackTemperatures),
    airMin: Math.min(...airTemperatures),
    airMax: Math.max(...airTemperatures),
    rain: rawWeather.some((sample) => sample.rainfall > 0),
    windMax: Math.max(...rawWeather.map((sample) => sample.wind_speed)),
  }
}

function findFastestLap(results) {
  let fastest = null
  for (const result of results) {
    for (const lap of result.laps) {
      if (!lap.excluded && (!fastest || lap.seconds < fastest.seconds)) {
        fastest = { code: result.code, number: result.number, lap: lap.lap, seconds: lap.seconds }
      }
    }
  }
  return fastest
}

// Départ et temps de secteur du meilleur tour, ou null si l'un d'eux manque.
function findFastestLapSectors(rawLaps, fastestLap) {
  if (!fastestLap) return null
  const rawLap = rawLaps.find(
    (lap) => lap.driver_number === fastestLap.number && lap.lap_number === fastestLap.lap,
  )
  if (!rawLap) return null
  const sectors = [rawLap.duration_sector_1, rawLap.duration_sector_2, rawLap.duration_sector_3]
  const isComplete = rawLap.date_start && sectors.every((seconds) => typeof seconds === 'number')
  return isComplete ? { startedAt: rawLap.date_start, sectors } : null
}

export function buildRace({ session, rawResults, rawDrivers, rawStints, rawPits, rawLaps, rawWeather }) {
  const driversByNumber = new Map(rawDrivers.map((driver) => [driver.driver_number, driver]))

  const results = [...rawResults]
    .filter((result) => driversByNumber.has(result.driver_number))
    .sort((a, b) => rankOf(a) - rankOf(b))
    .map((result) => {
      const driver = driversByNumber.get(result.driver_number)
      const stints = buildStints(rawStints, result.driver_number)
      const pits = buildPits(rawPits, result.driver_number)
      const lastStintEnd = Math.max(0, ...stints.map((stint) => stint.endLap ?? 0))
      return {
        position: result.position,
        number: result.driver_number,
        code: driver.name_acronym,
        firstName: driver.first_name,
        lastName: driver.last_name,
        team: driver.team_name,
        colour: driver.team_colour,
        lapsCompleted: result.number_of_laps ?? lastStintEnd,
        status: statusOf(result),
        gap: result.gap_to_leader,
        points: result.points,
        stints,
        pits,
        laps: buildLaps(rawLaps, result.driver_number, pits),
      }
    })

  const fastestLap = findFastestLap(results)

  return {
    sessionKey: session.session_key,
    circuitKey: session.circuit_key,
    year: session.year,
    circuit: session.circuit_short_name,
    country: session.country_name,
    date: localIsoDate(session),
    totalLaps: Math.max(0, ...rawResults.map((result) => result.number_of_laps ?? 0)),
    weather: buildWeather(rawWeather),
    fastestLap: fastestLap && { ...fastestLap, ...findFastestLapSectors(rawLaps, fastestLap) },
    results,
  }
}
