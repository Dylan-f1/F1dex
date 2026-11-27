// Outils des tests de la voie des stands : faire avancer la simulation, suivre la ligne centrale par téléportation, et
// un pilote automatique qui passe par les stands.
import { pointAt, stepDrive } from '../lib/car-drive.js'
import { CAR, maxSteerAngle } from '../lib/car-physics.js'
import { PIT_LANE, getPitLane, laneOuter, relOf } from '../lib/pit-lane.js'

export const STEP = 1 / 60
const APPROACH = 60 // m avant l'entrée pour se ranger du côté des stands
const CRUISE = 22 // m/s

export function run(road, state, input, seconds) {
  let current = state
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += STEP) {
    current = stepDrive(road, current, typeof input === 'function' ? input(current) : input, STEP)
  }
  return current
}

// Conduit la ligne centrale en téléportant la voiture à chaque pas : pour amener la course à un endroit donné.
export function followCentreLine(road, state, fromS, toS, metresPerStep = 2) {
  let current = state
  for (let s = fromS; s <= toS; s += metresPerStep) {
    const point = pointAt(road, s)
    const placed = { ...current, x: point.x, z: point.z, heading: point.heading, u: 20, v: 0, r: 0 }
    current = stepDrive(road, placed, { throttle: 1, brake: 0, steer: 0 }, STEP)
  }
  return current
}

// Écart à l'axe (côté stands) que le pilote vise à `rel`.
function target(road, lane, rel) {
  const edge = road.width / 2
  if (rel < lane.entry - APPROACH || rel > lane.exit) return 0
  if (rel < lane.entry) return (edge - 1.5) * ((rel - lane.entry + APPROACH) / APPROACH)
  const outer = laneOuter(road, lane, rel)
  if (rel > lane.wallEnd) return Math.max(0, outer - 5)
  return Math.max(edge - 1.5, Math.min(edge + PIT_LANE.box, outer - 3.5))
}

export function makePitPilot(road) {
  const lane = getPitLane(road)
  return function pilot(state) {
    const speed = Math.hypot(state.u, state.v)
    const lookAhead = 7 + 0.35 * speed
    const rel = relOf(road, state.s)
    const spot = pointAt(road, state.s + lookAhead)
    const offset = target(road, lane, rel + lookAhead) * lane.sign
    const x = spot.x + Math.sin(spot.heading) * offset
    const z = spot.z + Math.cos(spot.heading) * offset
    const wanted = Math.atan2(-(z - state.z), x - state.x)
    const error = Math.atan2(Math.sin(wanted - state.heading), Math.cos(wanted - state.heading))
    const angle = Math.atan2(2 * CAR.wheelbase * Math.sin(error), lookAhead)
    return {
      throttle: speed < CRUISE ? 0.8 : 0,
      brake: speed > CRUISE + 2 ? 0.6 : 0,
      steer: Math.max(-1, Math.min(1, angle / maxSteerAngle(speed))),
    }
  }
}
