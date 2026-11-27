// Voie des stands, déduite de la ligne centrale : un couloir le long de la piste, autour de la ligne de départ, avec
// une route d'entrée, une partie séparée de la piste par un muret, l'emplacement du box et une route de sortie.
// MultiViewer ne donne que l'axe du circuit : ce n'est pas la vraie voie des stands. Module pur, testé avec
// `node --test`. Ne dépend que de lib/drive-track.js : les équipements et le décor s'adaptent à elle.
//
// `rel` : abscisse comptée depuis la ligne de départ, négative avant la ligne. `p` : écart à l'axe de la piste,
// positif du côté des stands.

import { indexAt, offsetPoint } from './drive-track.js'

export const PIT_LANE = {
  wall: 2.2, // m au-delà du bord de piste : axe du muret
  wallHalf: 0.25, // m : demi-épaisseur du muret
  wallHeight: 1,
  wallEase: 8, // m : le muret prend sa pleine emprise sur cette longueur, pas d'un coup
  width: 11.5, // m au-delà du bord : bord extérieur de la voie
  box: 7.4, // m au-delà du bord : axe de l'emplacement du box
  buildingGap: 1.2, // m entre le bord de la voie et le bâtiment des stands
  taper: { min: 40, max: 70, share: 0.22 }, // longueur des routes d'entrée et de sortie
  reach: { behind: 220, ahead: 300 }, // m de part et d'autre de la ligne de départ
  minLength: 150,
  gentle: 1 / 110, // courbure maximale que la voie peut suivre
  straight: 1 / 300, // courbure maximale devant le bâtiment des stands
  minBuilding: 30,
  maxBuilding: 220,
}
const CAR_HALF_WIDTH = 1 // m
const LINE_MARGIN = 8 // m : la ligne de départ reste au moins à cette distance des deux bouts du muret
const BOX_FROM_START = 30 // m : le box n'est pas collé au début du muret (il faut la place de s'arrêter)
const BOX_FROM_END = 20
const BOX_WINDOW = 25 // m de part et d'autre du box où la piste doit être la plus droite possible
const OTHER_MARGIN = 3 // m au-delà du bord d'un autre tronçon
const CHECK_STEP = 3 // échantillons entre deux contrôles de place

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1)
  return t * t * (3 - 2 * t)
}

// Abscisse comptée depuis la ligne de départ, dans [−longueur/2, longueur/2].
export function relOf(track, s) {
  const wrapped = ((s % track.length) + track.length) % track.length
  return wrapped > track.length / 2 ? wrapped - track.length : wrapped
}

const bendAt = (track, rel) => Math.abs(track.curvature[indexAt(track, rel)])

// Longueur sur laquelle la piste reste assez droite, vers l'arrière (−1) ou l'avant (+1) de la ligne.
function reach(track, direction, most) {
  let length = 0
  while (length < most && bendAt(track, direction * length) < PIT_LANE.gentle) length += track.spacing
  return length
}

const taperFor = (length) => clamp(length * PIT_LANE.taper.share, PIT_LANE.taper.min, PIT_LANE.taper.max)

// Début et fin de la voie. La ligne de départ est soit entre les deux bouts du muret, soit hors de la voie : jamais sur
// une route d'entrée ou de sortie, où un poteau du portique barrerait le passage.
function extent(track) {
  let entry = -reach(track, -1, PIT_LANE.reach.behind)
  let exit = reach(track, 1, PIT_LANE.reach.ahead)
  const taper = taperFor(exit - entry)
  if (-entry < taper + LINE_MARGIN) entry = LINE_MARGIN + 2
  else if (exit < taper + LINE_MARGIN) exit = -(LINE_MARGIN + 2)
  const length = exit - entry
  if (length < PIT_LANE.minLength || length > track.length / 2) return null
  return { entry, exit, taper: taperFor(length) }
}

// Écart à l'axe (m) du bord extérieur de la voie à `rel` : il part du bord de piste, s'ouvre, puis s'y referme.
export function laneOuter(track, lane, rel) {
  const share = smoothstep(lane.entry, lane.wallStart, rel) * (1 - smoothstep(lane.wallEnd, lane.exit, rel))
  return track.width / 2 + PIT_LANE.width * share
}

// La voie passerait-elle sur un autre tronçon du circuit de ce côté ?
function blocked(track, shape, sign) {
  const edge = track.width / 2
  const need = edge + OTHER_MARGIN
  for (let rel = shape.entry; rel <= shape.exit; rel += track.spacing * CHECK_STEP) {
    const index = indexAt(track, rel)
    for (const p of [edge + PIT_LANE.wall, edge + 7, laneOuter(track, shape, rel) + 1.5]) {
      const spot = offsetPoint(track, index, sign * p)
      for (let other = 0; other < track.points.length; other += 1) {
        const gap = Math.abs(track.cumulative[other] - track.cumulative[index])
        if (Math.min(gap, track.length - gap) <= p + 60) continue
        if (Math.hypot(track.points[other].x - spot.x, track.points[other].z - spot.z) < need) return true
      }
    }
  }
  return false
}

// Le box : là où la piste est la plus droite, au plus près du milieu du muret.
function boxPosition(track, shape) {
  const from = shape.wallStart + BOX_FROM_START
  const to = shape.wallEnd - BOX_FROM_END
  const middle = (from + to) / 2
  let best = null
  for (let rel = from; rel <= to; rel += track.spacing) {
    let peak = PIT_LANE.straight
    for (let aside = -BOX_WINDOW; aside <= BOX_WINDOW; aside += track.spacing) peak = Math.max(peak, bendAt(track, rel + aside))
    const distance = Math.abs(rel - middle)
    if (!best || peak < best.peak - 1e-6 || (peak < best.peak + 1e-6 && distance < best.distance)) best = { rel, peak, distance }
  }
  return best?.rel ?? null
}

// Portion droite autour du box, le long du muret, pour le bâtiment des stands ; null s'il n'y en a pas assez.
function buildingSpan(track, shape, box) {
  const straight = (rel) => bendAt(track, rel) < PIT_LANE.straight
  let from = box
  let to = box
  while (from - track.spacing >= shape.wallStart && straight(from - track.spacing)) from -= track.spacing
  while (to + track.spacing <= shape.wallEnd && straight(to + track.spacing)) to += track.spacing
  if (to - from < PIT_LANE.minBuilding) return null
  const length = Math.min(PIT_LANE.maxBuilding, to - from)
  const centre = clamp(box, from + length / 2, to - length / 2)
  return { from: centre - length / 2, to: centre + length / 2 }
}

function build(track) {
  const shape = extent(track)
  if (!shape) return null
  shape.wallStart = shape.entry + shape.taper
  shape.wallEnd = shape.exit - shape.taper
  // À l'intérieur de la boucle de préférence, comme sur la plupart des circuits.
  const inside = track.clockwise ? 'right' : 'left'
  const side = [inside, inside === 'right' ? 'left' : 'right'].find((name) => !blocked(track, shape, name === 'right' ? 1 : -1))
  if (!side) return null
  const box = boxPosition(track, shape)
  if (box === null) return null
  const lane = { ...shape, side, sign: side === 'right' ? 1 : -1, box, building: buildingSpan(track, shape, box) }
  // Points de repère le long de la voie : pour savoir si un équipement du décor empiète sur elle.
  const samples = []
  const edge = track.width / 2
  for (let rel = lane.entry; rel <= lane.exit; rel += track.spacing) {
    const outer = laneOuter(track, lane, rel)
    const spot = offsetPoint(track, indexAt(track, rel), (lane.sign * (edge + outer)) / 2)
    samples.push({ x: spot.x, z: spot.z, half: (outer - edge) / 2 })
  }
  return { ...lane, samples }
}

const cache = new WeakMap()

// Voie des stands de `track` (calculée une fois par piste), ou null si elle ne tient nulle part près de la ligne.
export function getPitLane(track) {
  if (!cache.has(track)) cache.set(track, build(track))
  return cache.get(track)
}

// (x, z) est-il à moins de `margin` mètres du revêtement de la voie (au-delà du bord de piste) ?
export function nearPitLane(track, x, z, margin = 0) {
  const lane = getPitLane(track)
  return Boolean(lane?.samples.some((sample) => Math.hypot(sample.x - x, sample.z - z) < sample.half + margin))
}

// La voiture, à l'abscisse `s` et à l'écart signé `offset`, est-elle sur le revêtement de la voie (entrée, voie ou
// sortie) ? Le bord de piste en fait partie.
export function onPitSurface(track, s, offset) {
  const lane = getPitLane(track)
  if (!lane) return false
  const rel = relOf(track, s)
  const p = offset * lane.sign
  return rel >= lane.entry && rel <= lane.exit && p > track.width / 2 - 1 && p <= laneOuter(track, lane, rel) + 0.4
}

// Contact avec le muret ou la façade des stands pendant un pas : renvoie l'écart `p` auquel ramener la voiture, ou
// null. `from` et `p` : écart côté stands avant et après le pas. On ne ramène que ce qui arrive d'à côté.
export function pitContact(track, lane, rel, from, p) {
  const edge = track.width / 2
  if (rel >= lane.wallStart && rel <= lane.wallEnd) {
    const axis = edge + PIT_LANE.wall
    const ease = clamp(Math.min(rel - lane.wallStart, lane.wallEnd - rel) / PIT_LANE.wallEase, 0, 1)
    const half = (PIT_LANE.wallHalf + CAR_HALF_WIDTH) * ease
    if (p > axis - half && p < axis + half) return from < axis ? axis - half : axis + half
  }
  const { building } = lane
  const limit = edge + PIT_LANE.width + 0.15
  if (building && rel >= building.from && rel <= building.to && from <= limit + 0.2 && p > limit && p < limit + 1.5) return limit
  return null
}
