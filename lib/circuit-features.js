// Équipements d'un circuit déduits de sa seule ligne centrale : vibreurs, bacs à gravier, murs de pneus. Les vrais
// circuits n'ont pas ces données dans MultiViewer, on les place comme sur un circuit moderne : des vibreurs à
// l'intérieur des virages (et à la sortie, à l'extérieur), du gravier et un mur à l'extérieur. Module pur, testé.
//
// Les côtés sont `left` / `right` dans le sens de la marche (comme offsetPoint : positif = droite). Chaque tableau a
// une valeur par échantillon de la ligne centrale.

import { indexAt, offsetPoint } from './drive-track.js'

export const KERB_WIDTH = 1.4 // m, au-delà du trait blanc
export const WALL_GAP = 1.5 // m entre le bord du gravier et le mur
export const WALL_HEIGHT = 1.1
export const GRAVEL_WIDTH = { min: 6, max: 14 } // m, selon la vitesse du virage
const CORNER_RADIUS = 280 // m : plus serré, c'est un virage qui reçoit des équipements
const MIN_CORNER_LENGTH = 15 // m
const MERGE_GAP = 12 // m : deux portions de virage de même sens plus proches que cela n'en font qu'une
const EXIT_SHARE = 0.45 // part finale du virage où l'extérieur reçoit aussi un vibreur
const GRAVEL_RUNOFF = 15 // m de gravier après la fin du virage
const TAPER = 4 // échantillons de raccord aux extrémités du gravier
const CLEAR_SPAN = 80 // m : les tronçons plus proches que cela (le long de la piste) ne comptent pas comme « autre »
const CLEARANCE = 4 // m minimum entre un équipement et un autre tronçon de piste

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const SIDES = ['left', 'right']
const sign = (side) => (side === 'right' ? 1 : -1)

// Tronçons de virage : { start, end, direction } en indices « déroulés » à partir d'un échantillon droit (pas de
// virage qui enjambe le début du tableau), direction +1 = à gauche.
function findCorners(track) {
  const count = track.points.length
  const limit = 1 / CORNER_RADIUS
  // Courbure lissée sur 5 échantillons : le bruit d'un tracé ne doit pas fabriquer de faux virages.
  const smooth = track.curvature.map((_, index) => {
    let total = 0
    for (let offset = -2; offset <= 2; offset += 1) total += track.curvature[(index + offset + count) % count]
    return total / 5
  })
  const direction = smooth.map((value) => (Math.abs(value) > limit ? Math.sign(value) : 0))
  const base = Math.max(0, direction.indexOf(0))
  const runs = []
  for (let step = 0; step < count; step += 1) {
    const index = (base + step) % count
    const here = direction[index]
    if (here === 0) continue
    const last = runs[runs.length - 1]
    if (last && last.direction === here && step - last.end - 1 <= MERGE_GAP / track.spacing) last.end = step
    else runs.push({ start: step, end: step, direction: here })
  }
  return { runs: runs.filter((run) => (run.end - run.start + 1) * track.spacing >= MIN_CORNER_LENGTH), base, smooth }
}

const emptyFeatures = (count) => ({
  kerb: { left: new Uint8Array(count), right: new Uint8Array(count) },
  gravel: { left: new Float32Array(count), right: new Float32Array(count) },
  wall: { left: new Float32Array(count), right: new Float32Array(count) },
  corners: 0,
})

// L'équipement le long de la normale en `index` passerait-il sur un autre tronçon de la piste ?
function blocked(track, index, side, offsets) {
  const count = track.points.length
  const clearSamples = Math.ceil(CLEAR_SPAN / track.spacing)
  const need = track.width / 2 + CLEARANCE
  for (const offset of offsets) {
    const spot = offsetPoint(track, index, sign(side) * offset)
    for (let other = 0; other < count; other += 1) {
      const gap = Math.abs(other - index)
      if (Math.min(gap, count - gap) <= clearSamples) continue
      const point = track.points[other]
      if (Math.hypot(point.x - spot.x, point.z - spot.z) < need) return true
    }
  }
  return false
}

// Efface les portions de moins de `MIN_RUN` échantillons (sur la boucle) : une portion isolée serait un mur ou un
// gravier qu'on pourrait toucher sans bien le voir.
const MIN_RUN = 3
function dropShortRuns(values) {
  const count = values.length
  const start = values.findIndex((value) => !(value > 0))
  if (start < 0) return
  let run = []
  for (let step = 1; step <= count; step += 1) {
    const index = (start + step) % count
    if (values[index] > 0) run.push(index)
    else {
      if (run.length < MIN_RUN) for (const at of run) values[at] = 0
      run = []
    }
  }
}

const cache = new WeakMap()

// Équipements de `track` (calculés une fois par piste).
export function getFeatures(track) {
  const known = cache.get(track)
  if (known) return known
  const count = track.points.length
  const features = emptyFeatures(count)
  const { runs, base, smooth } = findCorners(track)
  features.corners = runs.length
  const edge = track.width / 2
  for (const run of runs) {
    const inside = run.direction > 0 ? 'left' : 'right'
    const outside = run.direction > 0 ? 'right' : 'left'
    const length = run.end - run.start + 1
    let peak = 0
    for (let step = run.start; step <= run.end; step += 1) peak = Math.max(peak, Math.abs(smooth[(base + step) % count]))
    const width = clamp(1 / peak / 25, GRAVEL_WIDTH.min, GRAVEL_WIDTH.max)
    const exitStart = run.end - Math.floor(length * EXIT_SHARE)
    for (let step = run.start; step <= run.end + Math.ceil(GRAVEL_RUNOFF / track.spacing); step += 1) {
      const index = (base + step) % count
      if (step >= run.start + 1 && step <= run.end - 1) features.kerb[inside][index] = 1
      if (step >= exitStart && step <= run.end + 2) features.kerb[outside][index] = 1
      // Gravier à l'extérieur, raccordé en pente aux deux bouts.
      const fromStart = step - run.start
      const toEnd = run.end + Math.ceil(GRAVEL_RUNOFF / track.spacing) - step
      const taper = Math.min(1, (Math.min(fromStart, toEnd) + 1) / TAPER)
      features.gravel[outside][index] = Math.max(features.gravel[outside][index], width * taper)
    }
  }
  // Murs derrière le gravier ; rien là où l'équipement passerait sur un autre tronçon de la piste (Monaco, Suzuka).
  for (const side of SIDES) {
    for (let index = 0; index < count; index += 1) {
      const gravel = features.gravel[side][index]
      if (gravel <= 0) continue
      const wallOffset = edge + KERB_WIDTH + gravel + WALL_GAP
      if (blocked(track, index, side, [edge + KERB_WIDTH + 1, edge + KERB_WIDTH + gravel, wallOffset])) {
        features.gravel[side][index] = 0
      } else features.wall[side][index] = wallOffset
    }
  }
  for (const side of SIDES) {
    dropShortRuns(features.gravel[side])
    dropShortRuns(features.wall[side])
  }
  cache.set(track, features)
  return features
}

// Écart latéral du mur sous l'abscisse `s`, côté `side`, ou 0. Un mur n'existe qu'entre deux échantillons qui en ont
// tous deux : c'est exactement ce que dessine l'affichage (pas de mur invisible au bout d'une portion).
export function wallOffsetAt(track, s, side) {
  const wall = getFeatures(track).wall[side]
  const index = indexAt(track, s)
  const next = (index + 1) % wall.length
  return wall[index] > 0 && wall[next] > 0 ? wall[index] : 0
}
