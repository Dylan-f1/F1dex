// Arrêt aux stands : limiteur de vitesse dans la voie, arrêt devant le box, immobilisation le temps de changer les
// pneus, et glissement le long du muret. Module pur, testé avec `node --test`. La géométrie est dans lib/pit-lane.js.

import { pointAt } from './drive-track.js'
import { PIT_LANE } from './pit-lane.js'

export const PIT_RULES = {
  limit: 80 / 3.6, // m/s : la limite habituelle des voies des stands
  limiterDecel: 35, // m/s² : le limiteur ramène à la limite une voiture arrivée trop vite
  boxDecel: 10, // m/s² : freinage automatique à l'approche du box
  creep: 2.5, // m/s : vitesse des derniers mètres
  boxHalf: 5, // m de part et d'autre du box où un arrêt compte
  stopped: 0.8, // m/s : sous cette vitesse dans la zone du box, la voiture est arrêtée
  service: 2.8, // s d'immobilisation
  entryMargin: 1.5, // m au-delà du bord de piste : sur la route d'entrée, le limiteur s'enclenche
  wallTurn: 2.5, // rad/s : la voiture qui frotte le muret se remet dans son axe
  wallFriction: 0.6, // part de la vitesse perdue par seconde de frottement
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))

// `inLane` : sous limiteur ; `served` : arrêt déjà fait pendant ce passage ; `service` : secondes d'arrêt restantes.
export const createPit = () => ({ inLane: false, served: false, service: 0 })

// La voiture à (rel, p) est-elle dans la partie limitée de la voie (route d'entrée et voie, pas la sortie) ?
export function inLimitedLane(track, lane, rel, p) {
  if (rel < lane.entry || rel > lane.wallEnd) return false
  const margin = rel < lane.wallStart ? PIT_RULES.entryMargin : PIT_LANE.wall
  return p > track.width / 2 + margin
}

// Vitesse maximale (m/s) à `toBox` mètres avant le box (négatif : dépassé).
export function pitSpeedCap(toBox, served) {
  const { limit, boxDecel, creep, boxHalf } = PIT_RULES
  if (served || toBox < -boxHalf) return limit
  return Math.min(limit, Math.max(creep, Math.sqrt(2 * boxDecel * Math.max(0, toBox))))
}

// La voiture, ralentie comme il faut à cet instant de la voie : { car, pit }. `speed` en sortie ≤ la limite.
export function applyPitLane(car, pit, toBox, dt) {
  const cap = pitSpeedCap(toBox, pit.served)
  let { u, v, r } = car
  const speed = Math.hypot(u, v)
  if (speed > cap) {
    const scale = Math.max(cap, speed - PIT_RULES.limiterDecel * dt) / speed
    u *= scale
    v *= scale
  }
  const { boxHalf, stopped } = PIT_RULES
  const arrived = !pit.served && toBox <= 0.4 && toBox >= -boxHalf
  const halted = !pit.served && Math.abs(toBox) <= boxHalf && Math.hypot(u, v) <= stopped
  if (arrived || halted) return { car: halt({ ...car, u, v, r }), pit: { inLane: true, served: false, service: PIT_RULES.service } }
  return { car: { ...car, u, v, r }, pit: { ...pit, inLane: true } }
}

// Voiture immobilisée devant le box.
export const halt = (car) => ({ ...car, u: 0, v: 0, r: 0, steer: 0, gear: 1, shift: 0, fx: 0, side: 0, brakePedal: 0 })

// Ramène la voiture à l'écart signé `target` (elle est à `offset`) : elle glisse le long de l'obstacle, perd la part de
// sa vitesse dirigée contre lui et se remet peu à peu dans l'axe.
export function slideAlong(track, s, car, offset, target, dt) {
  const along = pointAt(track, s).heading
  // Normale à la piste vers la droite (voir signedOffset).
  const nx = Math.sin(along)
  const nz = Math.cos(along)
  const into = Math.sign(offset - target)
  let vx = car.u * Math.cos(car.heading) - car.v * Math.sin(car.heading)
  let vz = -(car.u * Math.sin(car.heading) + car.v * Math.cos(car.heading))
  const across = vx * nx + vz * nz
  if (across * into > 0) {
    vx -= across * nx
    vz -= across * nz
  }
  const keep = Math.max(0, 1 - PIT_RULES.wallFriction * dt)
  vx *= keep
  vz *= keep
  // Dans l'axe de la piste, dans le sens le plus proche du cap actuel (on peut reculer le long du muret).
  const wanted = Math.abs(wrapAngle(along - car.heading)) <= Math.PI / 2 ? along : along + Math.PI
  const turn = PIT_RULES.wallTurn * dt
  const heading = car.heading + clamp(wrapAngle(wanted - car.heading), -turn, turn)
  return {
    ...car,
    x: car.x + (target - offset) * nx,
    z: car.z + (target - offset) * nz,
    heading,
    u: vx * Math.cos(heading) - vz * Math.sin(heading),
    v: -vx * Math.sin(heading) - vz * Math.cos(heading),
    r: 0,
  }
}
