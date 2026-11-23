// Jeux de données de développement pour éprouver TrackMap (route /dev/track). Jamais utilisés en production.
import { MULTIVIEWER_CIRCUITS_URL, SEASON_YEAR } from '../constants'
import { buildSectorMarks, buildTrack } from '../track'

const MELBOURNE = 10
const JEDDAH = 149
const SPA = 7
const SAMPLE_SECTORS = [28.553, 18.537, 35.077]

async function fetchRaw(circuitKey) {
  const response = await fetch(`${MULTIVIEWER_CIRCUITS_URL}/${circuitKey}/${SEASON_YEAR}`)
  return response.json()
}

// Passages voiture synthétiques : trois points du tracé brut (début, 1/3, 2/3).
function crossingsFor(raw) {
  const at = (ratio) => {
    const index = Math.floor(raw.x.length * ratio)
    return { x: raw.x[index], y: raw.y[index] }
  }
  return { start: at(0.02), firstEnd: at(0.36), secondEnd: at(0.68) }
}

function withSectors(raw, track, sectors = SAMPLE_SECTORS) {
  return {
    track,
    sectorMarks: buildSectorMarks(track, crossingsFor(raw)),
    fastestLap: { code: 'VER', sectors },
  }
}

export const FIXTURE_NAMES = ['demo', 'worst', 'empty', 'one', 'minimal', 'broken', 'noSectors', 'spa']

export async function loadFixture(name) {
  if (name === 'worst') {
    // Jeddah : 27 virages, circuit long et étroit. Numéros à 2 chiffres, doublons, temps de secteur longs.
    const raw = await fetchRaw(JEDDAH)
    raw.corners = raw.corners.map((corner, index) => ({ ...corner, number: index === 5 ? 5 : corner.number }))
    return {
      ...withSectors(raw, buildTrack(raw), [41.372, 54.906, 61.298]),
      circuit: 'Jeddah Corniche Circuit, Djeddah (Arabie saoudite)',
    }
  }
  if (name === 'spa') {
    const raw = await fetchRaw(SPA)
    return { ...withSectors(raw, buildTrack(raw), [33.912, 52.488, 29.115]), circuit: 'Spa-Francorchamps' }
  }

  const raw = await fetchRaw(MELBOURNE)
  if (name === 'empty') return { track: buildTrack({ ...raw, corners: [] }), circuit: 'Melbourne' }
  if (name === 'one') {
    const track = buildTrack({ ...raw, corners: raw.corners.slice(0, 1) })
    return { ...withSectors(raw, track), circuit: 'Melbourne' }
  }
  if (name === 'minimal') {
    const square = { x: [0, 5000, 5000], y: [0, 0, 3000], rotation: 0, corners: [] }
    return { track: buildTrack(square), circuit: 'Triangle' }
  }
  if (name === 'broken') {
    // Un virage sans position, un autre sans angle : une donnée tierce peut être incomplète.
    const corners = [...raw.corners]
    corners[2] = { number: 3, angle: 10 }
    corners[4] = { ...corners[4], angle: undefined }
    return { track: buildTrack({ ...raw, corners }), circuit: 'Melbourne' }
  }
  const track = buildTrack(raw)
  if (name === 'noSectors') return { track, fastestLap: { code: 'NOR', sectors: SAMPLE_SECTORS }, circuit: 'Melbourne' }
  return { ...withSectors(raw, track), circuit: 'Melbourne' }
}
