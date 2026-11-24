// Conduite de la voiture dans le garage : état de course (feux de départ, tours, secteurs, limites de piste,
// écart au meilleur tour) par-dessus la dynamique de lib/car-physics.js et les pistes de lib/drive-track.js.
// Module pur (pas de three.js) pour être testé avec `node --test`.
//
// Repère : voir lib/drive-track.js (mètres, cap positif = la voiture tourne à gauche).

import { createCarState, stepCar, SURFACES } from './car-physics.js'
import { KERB_WIDTH, getFeatures, wallOffsetAt } from './circuit-features.js'
import { hitsScenery } from './circuit-scenery.js'
import { closestOnTrack, indexAt, pointAt, signedOffset } from './drive-track.js'

export { TRACK_WIDTH, CIRCUIT_WIDTH, buildCircuitTrack, buildDriveTrack, closestOnTrack, minCurvatureRadius, pointAt } from './drive-track.js'

// À changer quand la physique change : les meilleurs tours enregistrés avec une autre version sont ignorés.
export const PHYSICS_VERSION = 5

export const DRIVE = {
  subStep: 1 / 240, // pas d'intégration, en secondes
  maxStep: 1 / 15, // plus grand pas de temps pris en compte : en dessous de 15 images/s la simulation ralentit ; reprise d'un onglet caché plafonnée
  lapMinProgress: 0.9, // part du tour à avoir parcourue pour qu'un passage de ligne compte
  lightsCount: 5,
  lightsInterval: 0.8, // s entre deux feux qui s'allument
  defaultHold: 1, // s entre le 5e feu et l'extinction
  trackLimitMargin: 1, // m au-delà du bord : le centre d'une voiture large de 2 m est là quand ses quatre roues sont dehors, le tour est supprimé
  recoverDistance: 40, // m au-delà du bord : les commissaires remettent la voiture sur la piste
  jumpDistance: 25, // m d'écart d'abscisse en un pas : téléportation, pas de la conduite
  profileBin: 10, // m entre deux relevés du temps de passage (pour l'écart au meilleur tour)
  sectors: 3,
}

const IDLE = { throttle: 0, brake: 0, steer: 0 }
const START_S = 4 // m après la ligne : le premier tour est un tour de lancement
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const lerp = (from, to, amount) => from + (to - from) * amount

// Écart signé entre deux abscisses sur un tour, ramené dans [−length/2, length/2].
function wrapDelta(from, to, length) {
  let delta = to - from
  if (delta > length / 2) delta -= length
  if (delta < -length / 2) delta += length
  return delta
}

const emptyProfile = (track) => new Array(Math.ceil(track.length / DRIVE.profileBin) + 2).fill(null)

// État initial : voiture sur la grille juste après la ligne, à l'arrêt, feux éteints.
// `hold` : durée de l'attente après le 5e feu. `best` : meilleur tour déjà connu { time, sectors, profile }.
// `lights: false` saute le départ (tests).
export function createDriveState(track, { hold = DRIVE.defaultHold, best = null, lights = true } = {}) {
  const start = pointAt(track, START_S)
  return {
    ...createCarState({ x: start.x, z: start.z, heading: start.heading }),
    speed: 0,
    distance: 0,
    onTrack: true,
    offset: 0,
    surface: 'asphalt',
    crashes: 0,
    s: START_S,
    travelled: START_S, // distance parcourue dans le tour en cours (signée : reculer la diminue)
    phase: lights ? 'lights' : 'racing',
    t: 0,
    hold,
    lightsLit: 0,
    lapTime: 0,
    running: !lights,
    lapValid: true,
    sector: 0,
    sectors: [null, null, null],
    lastSectors: null,
    bestSectors: best?.sectors ?? [null, null, null],
    profile: emptyProfile(track),
    bestProfile: best?.profile ?? null,
    delta: null,
    laps: 0,
    lastLap: null,
    lastLapValid: true,
    bestLap: best?.time ?? null,
    bestSerial: 0, // augmente à chaque nouveau meilleur tour : le signal pour l'enregistrer
    recoveries: 0,
  }
}

// Remet la voiture sur la ligne centrale, à l'arrêt, au point le plus proche (commissaires, ou touche R).
// Le tour en cours est supprimé.
export function resetToTrack(track, state) {
  const spot = pointAt(track, state.s)
  return {
    ...state,
    ...createCarState({ x: spot.x, z: spot.z, heading: spot.heading }),
    speed: 0,
    distance: 0,
    onTrack: true,
    offset: 0,
    surface: 'asphalt',
    lapValid: false,
    recoveries: state.recoveries + 1,
  }
}

// Surface sous la voiture : asphalte, vibreur, gravier ou herbe, selon sa position latérale et les équipements du
// circuit. Le passage de l'asphalte à la surface voisine se fait sur 2 m autour du bord de piste.
export function surfaceAt(track, s, offset) {
  const out = Math.abs(offset) - track.width / 2
  if (out <= -1) return { kind: 'asphalt', ...SURFACES.asphalt }
  const features = getFeatures(track)
  const index = indexAt(track, s)
  const side = offset > 0 ? 'right' : 'left'
  const gravel = features.gravel[side][index]
  let kind = 'grass'
  if (features.kerb[side][index] && out <= KERB_WIDTH) kind = 'kerb'
  else if (gravel > 0 && out <= KERB_WIDTH + gravel) kind = 'gravel'
  const target = SURFACES[kind]
  const blend = clamp((out + 1) / 2, 0, 1)
  return {
    kind: blend > 0.5 ? kind : 'asphalt',
    grip: lerp(SURFACES.asphalt.grip, target.grip, blend),
    drag: lerp(SURFACES.asphalt.drag, target.drag, blend),
    rolling: lerp(SURFACES.asphalt.rolling, target.rolling, blend),
  }
}

// Un pas de simulation (`dt` ≤ subStep).
function substep(track, state, input, dt) {
  const edge = track.width / 2
  const t = state.t + dt
  let { phase, lightsLit, lapTime, running } = state
  if (phase === 'lights') {
    lightsLit = Math.min(DRIVE.lightsCount, Math.floor(t / DRIVE.lightsInterval))
    if (t >= DRIVE.lightsCount * DRIVE.lightsInterval + state.hold) {
      phase = 'racing'
      lightsLit = 0 // extinction des feux
      running = true
      lapTime = 0
    }
  }

  // Pendant les feux la voiture reste immobile : les ordres du pilote sont ignorés.
  const controls = state.phase === 'racing' ? input : IDLE

  const surface = surfaceAt(track, state.s, state.offset)
  const car = stepCar(state, controls, surface, dt)

  const now = closestOnTrack(track, car.x, car.z, state.s)
  const offset = signedOffset(track, car.x, car.z, now.s)
  let delta = wrapDelta(state.s, now.s, track.length)
  let lapValid = state.lapValid
  if (Math.abs(delta) > DRIVE.jumpDistance) {
    // La recherche a changé de tronçon (voiture très loin de la piste) : aucune distance gagnée, tour supprimé.
    delta = 0
    lapValid = false
  }
  if (state.phase === 'racing' && now.distance > edge + DRIVE.trackLimitMargin) lapValid = false

  let { travelled, sector, sectors, lastSectors, bestSectors, profile, bestProfile } = state
  let { laps, lastLap, lastLapValid, bestLap, bestSerial } = state
  travelled += delta
  if (running) lapTime += dt

  // Secteurs : trois tiers égaux de la longueur du tour (pas les secteurs officiels).
  const sectorLength = track.length / DRIVE.sectors
  if (running && sector < DRIVE.sectors - 1 && travelled >= (sector + 1) * sectorLength) {
    const before = sectors.slice(0, sector).reduce((sum, time) => sum + time, 0)
    sectors = sectors.map((time, index) => (index === sector ? lapTime - before : time))
    sector += 1
  }

  // Écart au meilleur tour : on note le temps de passage tous les `profileBin` mètres.
  const bin = Math.floor(travelled / DRIVE.profileBin)
  if (running && bin >= 0 && bin < profile.length && profile[bin] === null) profile[bin] = lapTime
  const best = bestProfile?.[bin]
  const gap = running && best != null ? lapTime - best : null

  // Passage de la ligne vers l'avant (s repasse de la fin au début) : ne compte que si on a fait presque tout le tour.
  const crossedForward = state.s > track.length / 2 && now.s < track.length / 2 && delta > 0
  if (crossedForward && travelled >= track.length * DRIVE.lapMinProgress) {
    const done = sectors.map((time, index) =>
      index === DRIVE.sectors - 1 ? lapTime - sectors.slice(0, index).reduce((sum, value) => sum + value, 0) : time,
    )
    laps += 1
    lastLap = lapTime
    lastLapValid = lapValid
    lastSectors = done
    if (lapValid) {
      bestSectors = bestSectors.map((time, index) => (time === null || done[index] < time ? done[index] : time))
      if (bestLap === null || lapTime < bestLap) {
        bestLap = lapTime
        bestProfile = profile
        bestSerial += 1
      }
    }
    travelled -= track.length
    lapTime = 0
    lapValid = true
    sector = 0
    sectors = [null, null, null]
    profile = emptyProfile(track)
  }

  const next = {
    ...state,
    ...car,
    speed: Math.hypot(car.u, car.v),
    distance: now.distance,
    onTrack: now.distance <= edge,
    offset,
    surface: surface.kind,
    s: now.s,
    travelled,
    phase,
    t,
    lightsLit,
    lapTime,
    running,
    lapValid,
    sector,
    sectors,
    lastSectors,
    bestSectors,
    profile,
    bestProfile,
    delta: gap,
    laps,
    lastLap,
    lastLapValid,
    bestLap,
    bestSerial,
  }
  // Mur de pneus, tribune, bâtiment des stands, poteau du portique : contre eux, les commissaires remettent la voiture
  // sur la piste (pas de collision simulée).
  const wall = wallOffsetAt(track, now.s, offset > 0 ? 'right' : 'left')
  const hitWall = wall > 0 && Math.abs(offset) > wall && Math.abs(delta) <= DRIVE.jumpDistance
  if (hitWall || (Math.abs(offset) > edge && hitsScenery(track, car.x, car.z))) {
    return { ...resetToTrack(track, next), crashes: state.crashes + 1 }
  }
  return now.distance > edge + DRIVE.recoverDistance ? resetToTrack(track, next) : next
}

// Fait avancer l'état de `rawDt` secondes. `input` : { throttle 0..1, brake 0..1, steer −1..1 (1 = gauche),
// reset (vrai pour remettre la voiture sur la piste) }.
export function stepDrive(track, state, input, rawDt) {
  const dt = clamp(rawDt, 0, DRIVE.maxStep)
  const steps = Math.ceil(dt / DRIVE.subStep - 1e-9)
  let current = state
  if (input.reset && state.phase === 'racing') current = resetToTrack(track, current)
  for (let step = 0; step < steps; step += 1) current = substep(track, current, input, dt / steps)
  return current
}

// Chrono « 1:23.456 » (ou « 23.456 » sous la minute).
export function formatLapTime(seconds) {
  if (!Number.isFinite(seconds)) return '–'
  const minutes = Math.floor(seconds / 60)
  const rest = (seconds - minutes * 60).toFixed(3).padStart(6, '0')
  return minutes > 0 ? `${minutes}:${rest}` : rest.replace(/^0/, '')
}

// Écart « +0.312 » / « −0.312 » (secondes).
export function formatDelta(seconds) {
  if (!Number.isFinite(seconds)) return '–'
  return `${seconds < 0 ? '−' : '+'}${Math.abs(seconds).toFixed(3)}`
}
