import { cacheLife } from 'next/cache'
import {
  MAX_FETCH_ATTEMPTS,
  MIN_REQUEST_INTERVAL_MS,
  OPENF1_BASE_URL,
  RETRY_BASE_DELAY_MS,
  SEASON_YEAR,
} from './constants'
import { buildCalendar, buildRace } from './race-model'
import { toReplaySamples } from './replay'
import { buildTeams } from './teams'

const HTTP_NOT_FOUND = 404
const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_SERVER_ERROR = 500
const SESSION_KEY_PATTERN = /^\d+$/

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

// Limiteur de débit partagé par tous les appels du serveur : OpenF1 renvoie 429 au-delà
// de quelques requêtes par seconde. Chaque appel réserve un créneau, espacé du précédent.
let nextRequestSlotMs = 0

async function waitForRequestSlot() {
  const nowMs = performance.now()
  const slotMs = Math.max(nowMs, nextRequestSlotMs)
  nextRequestSlotMs = slotMs + MIN_REQUEST_INTERVAL_MS
  if (slotMs > nowMs) await wait(slotMs - nowMs)
}

function retryDelayMs(response, attempt) {
  const retryAfterSeconds = Number(response.headers.get('retry-after'))
  return retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : RETRY_BASE_DELAY_MS * attempt
}

async function fetchOpenF1(path) {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    await waitForRequestSlot()
    const response = await fetch(`${OPENF1_BASE_URL}${path}`)
    if (response.ok) return response.json()
    // OpenF1 répond 404 quand une requête valide ne trouve aucune ligne.
    if (response.status === HTTP_NOT_FOUND) return []

    const canRetry =
      response.status === HTTP_TOO_MANY_REQUESTS || response.status >= HTTP_SERVER_ERROR
    if (!canRetry || attempt === MAX_FETCH_ATTEMPTS) {
      throw new Error(`OpenF1 a répondu ${response.status} pour ${path}`)
    }
    await wait(retryDelayMs(response, attempt))
  }
}

export async function getCalendar() {
  'use cache'
  cacheLife('days')

  const sessions = await fetchOpenF1(`/sessions?session_name=Race&year=${SEASON_YEAR}`)
  return buildCalendar(sessions)
}

// Les requêtes sont séquentielles pour rester sous la limite de débit d'OpenF1.
export async function getRace(sessionKey) {
  'use cache'
  cacheLife('days')

  if (!SESSION_KEY_PATTERN.test(sessionKey)) return null

  const [session] = await fetchOpenF1(`/sessions?session_key=${sessionKey}`)
  if (!session) return null

  const query = `?session_key=${sessionKey}`
  const rawResults = await fetchOpenF1(`/session_result${query}`)
  const rawDrivers = await fetchOpenF1(`/drivers${query}`)
  const rawStints = await fetchOpenF1(`/stints${query}`)
  const rawPits = await fetchOpenF1(`/pit${query}`)
  const rawLaps = await fetchOpenF1(`/laps${query}`)
  const rawWeather = await fetchOpenF1(`/weather${query}`)

  return buildRace({ session, rawResults, rawDrivers, rawStints, rawPits, rawLaps, rawWeather })
}

// Écuries de la saison, lues sur la dernière course du calendrier (grille la plus récente).
export async function getTeams() {
  'use cache'
  cacheLife('days')

  const calendar = await getCalendar()
  const lastRace = calendar.at(-1)
  if (!lastRace) return []
  return buildTeams(await fetchOpenF1(`/drivers?session_key=${lastRace.sessionKey}`))
}

const MS_PER_SECOND = 1000
// Fenêtre autour du tour : OpenF1 échantillonne la position environ 3,7 fois par seconde.
const LOCATION_MARGIN_MS = 1500

function openF1Timestamp(milliseconds) {
  // OpenF1 attend une date sans fuseau (UTC), et « > » / « < » encodés dans l'URL.
  return new Date(milliseconds).toISOString().replace('Z', '')
}

function sampleNearest(samples, targetMs) {
  let best = null
  for (const sample of samples) {
    const gap = Math.abs(Date.parse(sample.date) - targetMs)
    if (!best || gap < best.gap) best = { sample, gap }
  }
  return best && { x: best.sample.x, y: best.sample.y }
}

// Position de la voiture à la ligne de départ, à la fin du secteur 1 et à la fin du secteur 2 sur un
// tour donné (le meilleur tour de la course). Les mêmes coordonnées que MultiViewer (avant rotation).
// Lève une erreur en cas d'échec (donc pas de mise en cache) ; l'appelant décide de s'en passer.
export async function getSectorCrossings(sessionKey, driverNumber, lapStartedAt, firstSeconds, secondSeconds) {
  'use cache'
  cacheLife('days')

  if (!SESSION_KEY_PATTERN.test(String(sessionKey)) || !SESSION_KEY_PATTERN.test(String(driverNumber))) return null
  const startMs = Date.parse(lapStartedAt)
  if (Number.isNaN(startMs)) return null

  const endMs = startMs + (firstSeconds + secondSeconds) * MS_PER_SECOND
  const query =
    `?session_key=${sessionKey}&driver_number=${driverNumber}` +
    `&date%3E=${openF1Timestamp(startMs - LOCATION_MARGIN_MS)}&date%3C=${openF1Timestamp(endMs + LOCATION_MARGIN_MS)}`
  const samples = await fetchOpenF1(`/location${query}`)
  if (!samples.length) return null

  return {
    start: sampleNearest(samples, startMs),
    firstEnd: sampleNearest(samples, startMs + firstSeconds * MS_PER_SECOND),
    secondEnd: sampleNearest(samples, endMs),
  }
}

const REPLAY_MARGIN_MS = 500

// Un tour complet d'un pilote pour le lecteur : début, durée et secteurs (OpenF1 /laps), puis ses
// positions pendant le tour (/location). Renvoie null s'il n'y a pas de données pour ce tour ;
// lève une erreur si OpenF1 échoue (donc pas de mise en cache de l'échec).
export async function getLapReplay(sessionKey, driverNumber, lapNumber) {
  'use cache'
  cacheLife('days')

  const parameters = [sessionKey, driverNumber, lapNumber].map(String)
  if (!parameters.every((value) => SESSION_KEY_PATTERN.test(value))) return null

  const [lap] = await fetchOpenF1(
    `/laps?session_key=${sessionKey}&driver_number=${driverNumber}&lap_number=${lapNumber}`,
  )
  if (!lap?.date_start || typeof lap.lap_duration !== 'number') return null

  const startMs = Date.parse(lap.date_start)
  const endMs = startMs + lap.lap_duration * MS_PER_SECOND
  const rawSamples = await fetchOpenF1(
    `/location?session_key=${sessionKey}&driver_number=${driverNumber}` +
      `&date%3E=${openF1Timestamp(startMs - REPLAY_MARGIN_MS)}&date%3C=${openF1Timestamp(endMs + REPLAY_MARGIN_MS)}`,
  )
  const samples = toReplaySamples(rawSamples, startMs)
  if (samples.length < 2) return null

  const sectors = [lap.duration_sector_1, lap.duration_sector_2, lap.duration_sector_3]
  return {
    lap: Number(lapNumber),
    seconds: lap.lap_duration,
    sectors: sectors.every((seconds) => typeof seconds === 'number') ? sectors : null,
    samples,
  }
}
