// Construit lib/relief-data.js : le profil d'altitude de chaque circuit de la saison, mesuré par OpenF1 (`location.z`)
// sur quelques tours rapides de la course, rapporté au tracé MultiViewer utilisé par la conduite.
// À relancer seulement si la saison ou les tracés changent :  node scripts/relief.mjs
import { writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'

// Les modules de lib/ importent parfois sans extension (résolu par Next) : même règle ici.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.')) return next(`${specifier}.js`, context)
      throw error
    }
  },
})

const { SEASON_YEAR, MULTIVIEWER_CIRCUITS_URL } = await import('../lib/constants.js')
const { buildTrack, toSvgSpace } = await import('../lib/track.js')
const { buildCircuitTrack, closestOnTrack } = await import('../lib/drive-track.js')

const OPENF1 = 'https://api.openf1.org/v1'
const LAPS_PER_CIRCUIT = 5 // tours de pilotes différents
const BIN = 20 // m entre deux relevés du profil
const MAX_OFF_TRACK = 25 // m : au-delà, le point n'est pas sur ce tracé
const SMOOTHING_PASSES = 3
const MIN_COVERAGE = 0.8

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function get(url) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sleep(450)
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (response.status === 429) {
      await sleep(2000 * (attempt + 1))
      continue
    }
    if (!response.ok) throw new Error(`${response.status} ${url}`)
    return response.json()
  }
  throw new Error(`toujours limité : ${url}`)
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// Les tours les plus rapides, un par pilote.
function pickLaps(laps) {
  const usable = laps.filter((lap) => lap.date_start && lap.lap_duration && !lap.is_pit_out_lap && lap.lap_number > 1)
  usable.sort((a, b) => a.lap_duration - b.lap_duration)
  const drivers = new Set()
  return usable.filter((lap) => !drivers.has(lap.driver_number) && drivers.add(lap.driver_number)).slice(0, LAPS_PER_CIRCUIT)
}

// Bouche les relevés manquants par interpolation, sur la boucle.
function fillGaps(values) {
  const count = values.length
  return values.map((value, index) => {
    if (value !== null) return value
    let before = 1
    while (values[(index - before + count) % count] === null) before += 1
    let after = 1
    while (values[(index + after) % count] === null) after += 1
    const a = values[(index - before + count) % count]
    const b = values[(index + after) % count]
    return a + ((b - a) * before) / (before + after)
  })
}

function smooth(values) {
  let current = values
  for (let pass = 0; pass < SMOOTHING_PASSES; pass += 1) {
    current = current.map((value, index) => (current.at(index - 1) + 2 * value + current[(index + 1) % current.length]) / 4)
  }
  return current
}

async function profileOf(session) {
  const raw = await get(`${MULTIVIEWER_CIRCUITS_URL}/${session.circuit_key}/${SEASON_YEAR}`)
  const svg = buildTrack(raw)
  const road = buildCircuitTrack(svg.points, { key: String(session.circuit_key) })
  const count = Math.round(road.length / BIN)
  const bins = Array.from({ length: count }, () => [])
  const distances = []
  const laps = pickLaps(await get(`${OPENF1}/laps?session_key=${session.session_key}`))
  for (const lap of laps) {
    const from = new Date(lap.date_start)
    const to = new Date(from.getTime() + lap.lap_duration * 1000)
    const samples = await get(
      `${OPENF1}/location?session_key=${session.session_key}&driver_number=${lap.driver_number}` +
        `&date%3E=${from.toISOString().slice(0, 23)}&date%3C=${to.toISOString().slice(0, 23)}`,
    )
    let hint
    for (const sample of samples) {
      if (sample.x === 0 && sample.y === 0) continue // pas de signal
      const spot = toSvgSpace(sample.x, sample.y, svg.rotation)
      const x = spot.x / 10 - road.origin.x
      const z = spot.y / 10 - road.origin.z
      const near = closestOnTrack(road, x, z, hint)
      if (near.distance > MAX_OFF_TRACK) continue
      hint = near.s
      distances.push(near.distance)
      bins[Math.min(count - 1, Math.floor((near.s / road.length) * count))].push(sample.z / 10)
    }
  }
  const measured = bins.map((values) => (values.length ? median(values) : null))
  const coverage = measured.filter((value) => value !== null).length / count
  if (coverage < MIN_COVERAGE) throw new Error(`seulement ${Math.round(coverage * 100)} % du tour mesuré`)
  const smoothed = smooth(fillGaps(measured))
  const lowest = Math.min(...smoothed)
  const heights = smoothed.map((value) => Math.round((value - lowest) * 10) / 10)
  const step = road.length / count
  const steepest = Math.max(...heights.map((value, index) => Math.abs(heights[(index + 1) % count] - value) / step))
  console.log(
    `${session.circuit_short_name.padEnd(20)} clé ${String(session.circuit_key).padStart(3)} | tours ${laps.length} | couvert ${Math.round(coverage * 100)} %` +
      ` | écart au tracé ${median(distances).toFixed(1)} m | dénivelé ${Math.max(...heights).toFixed(1)} m | pente max ${(steepest * 100).toFixed(1)} %`,
  )
  return heights
}

const sessions = await get(`${OPENF1}/sessions?year=${SEASON_YEAR}&session_name=Race`)
const profiles = []
const failures = []
for (const session of sessions) {
  try {
    profiles.push([session.circuit_key, session.circuit_short_name, await profileOf(session)])
  } catch (error) {
    failures.push(`${session.circuit_short_name} : ${error.message}`)
  }
}
profiles.sort(([a], [b]) => a - b)

const body = profiles.map(([key, name, heights]) => `  // ${name}\n  '${key}': [${heights.join(',')}],`).join('\n')
writeFileSync(
  new URL('../lib/relief-data.js', import.meta.url),
  `// Fichier généré par scripts/relief.mjs : ne pas modifier à la main.
// Altitude en mètres au-dessus du point le plus bas, à intervalles réguliers le long du tracé (depuis son premier
// point). Source : OpenF1 (https://openf1.org), saison ${SEASON_YEAR}, tours rapides de chaque course.
export const RELIEF = {
${body}
}
`,
)
console.log(`\n${profiles.length}/${sessions.length} circuits écrits`)
if (failures.length) console.log(`Sans relief :\n${failures.join('\n')}`)
