// Décor de bord de piste déduit de la ligne centrale : tribunes, bâtiment des stands, portique de départ, panneaux
// de freinage, arbres. MultiViewer ne donne que l'axe du circuit : ce ne sont pas les vraies installations, elles
// sont placées comme sur un circuit moderne. Module pur (pas de three.js), testé avec `node --test`.
//
// Toutes les positions sont en mètres dans le repère de la piste (voir lib/drive-track.js). `rotation` est le cap
// (angle `rotation.y` de three.js) du repère local de l'objet : x local le long de la piste, z local vers l'extérieur
// (loin de la piste), y vers le haut.

import { KERB_WIDTH, getFeatures } from './circuit-features.js'
import { indexAt, offsetPoint, pointAt } from './drive-track.js'
import { PIT_LANE, getPitLane, laneOuter, nearPitLane } from './pit-lane.js'

export const STAND_DEPTH = 11 // m
export const STAND_ROWS = 8
export const PIT = { depth: 10, height: 4.5 } // bâtiment des stands, posé au bord de la voie (lib/pit-lane.js)
export const GANTRY = { height: 8 }
export const BOARD_DISTANCES = [150, 100, 50] // m avant l'entrée du virage ; 3, 2 puis 1 barre rouge
const MAX_STANDS = 16
const MAX_TREES = 1200
const STRAIGHT_CURVATURE = 1 / 500 // en dessous : « ligne droite » pour y poser une tribune ou le bâtiment des stands
const MIN_SEPARATION = 12 // m entre deux équipements de bord de piste
const CELL = 40 // m, grille de recherche du point de piste le plus proche
const SAFE_MARGIN = 6 // m entre un équipement et le bord d'un autre tronçon de piste

const sign = (side) => (side === 'right' ? 1 : -1)
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// Générateur pseudo-aléatoire déterministe : un même circuit a toujours le même décor.
function seeded(text) {
  let hash = 2166136261
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  let state = hash >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

// Distance (m) de (x, z) au point de ligne centrale le plus proche, si elle est inférieure à `limit`, sinon Infinity.
export function makeNearest(track) {
  const cells = new Map()
  const keyOf = (cx, cz) => (cx + 5000) * 10000 + (cz + 5000) // clé numérique : pas de chaîne à construire dans la boucle
  for (const point of track.points) {
    const key = keyOf(Math.floor(point.x / CELL), Math.floor(point.z / CELL))
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(point)
  }
  return (x, z, limit) => {
    const reach = Math.ceil(limit / CELL)
    const cx = Math.floor(x / CELL)
    const cz = Math.floor(z / CELL)
    let best = Infinity
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dz = -reach; dz <= reach; dz += 1) {
        const bucket = cells.get(keyOf(cx + dx, cz + dz))
        if (!bucket) continue
        for (const point of bucket) best = Math.min(best, Math.hypot(point.x - x, point.z - z))
      }
    }
    // Les points sont espacés de 2,5 m : la vraie distance à la ligne peut être plus courte de 1,25 m.
    return best < limit ? Math.max(0, best - 1.3) : Infinity
  }
}

// Point du repère local (x le long, z vers l'extérieur) d'un objet posé à (originX, originZ), de cap `rotation`.
function toWorld(originX, originZ, rotation, localX, localZ) {
  return {
    x: originX + localX * Math.cos(rotation) + localZ * Math.sin(rotation),
    z: originZ - localX * Math.sin(rotation) + localZ * Math.cos(rotation),
  }
}

// Emprise rectangulaire (longueur le long de la piste, profondeur vers l'extérieur) : aucun de ses points ne doit être
// près d'un tronçon de piste (le sien compris, pour garder la distance voulue). `nearOffset` : écart du bord proche.
function rectangleIsClear(nearest, track, rect, nearOffset) {
  const edge = track.width / 2
  const need = Math.max(edge + SAFE_MARGIN, nearOffset - 4)
  for (let i = 0; i <= 4; i += 1) {
    for (let j = 0; j <= 3; j += 1) {
      const point = toWorld(rect.x, rect.z, rect.rotation, (i / 4 - 0.5) * rect.length, (j / 3) * rect.depth - rect.depth / 2)
      if (nearest(point.x, point.z, need) < need) return false
    }
  }
  return true
}

const overlaps = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < (a.length + b.length) / 2 + MIN_SEPARATION

// Plus grand rayon de courbure serrée sur [first, last] (indices, avec bouclage) : 0 = ligne droite.
function peakCurvature(track, first, last) {
  const count = track.points.length
  let peak = 0
  for (let index = first; index <= last; index += 1) peak = Math.max(peak, Math.abs(track.curvature[((index % count) + count) % count]))
  return peak
}

// L'emprise mord-elle sur la voie des stands ?
function onPitLane(track, rect) {
  for (let i = 0; i <= 8; i += 1) {
    for (let j = 0; j <= 3; j += 1) {
      const point = toWorld(rect.x, rect.z, rect.rotation, (i / 8 - 0.5) * rect.length, (j / 3 - 0.5) * rect.depth)
      if (nearPitLane(track, point.x, point.z, 1)) return true
    }
  }
  return false
}

// Rectangle droit posé face au box, reculé de ce qu'il faut pour que la courbe de la voie ne le traverse pas. On le
// raccourcit tant qu'il ne tient pas ; null s'il n'y a pas la place.
function placePitBuilding(track, nearest, lane, rectAt, indexOfS) {
  if (!lane?.building) return null
  const centre = (lane.building.from + lane.building.to) / 2
  const nearOffset = track.width / 2 + PIT_LANE.width + PIT_LANE.buildingGap
  for (let length = lane.building.to - lane.building.from; length >= PIT_LANE.minBuilding; length *= 0.8) {
    const index = indexOfS(centre)
    let rect = rectAt(index, lane.side, nearOffset, length, PIT.depth)
    let intrusion = 0
    for (let rel = centre - length / 2 - 5; rel <= centre + length / 2 + 5; rel += track.spacing) {
      const spot = offsetPoint(track, indexAt(track, rel), lane.sign * laneOuter(track, lane, rel))
      const dx = spot.x - rect.x
      const dz = spot.z - rect.z
      const along = dx * Math.cos(rect.rotation) - dz * Math.sin(rect.rotation)
      const out = dx * Math.sin(rect.rotation) + dz * Math.cos(rect.rotation)
      if (Math.abs(along) <= length / 2 + 1) intrusion = Math.max(intrusion, out + PIT.depth / 2 + PIT_LANE.buildingGap - 0.1)
    }
    if (intrusion > 0) rect = rectAt(index, lane.side, nearOffset + intrusion, length, PIT.depth)
    if (rectangleIsClear(nearest, track, rect, nearOffset)) return { ...rect, height: PIT.height }
  }
  return null
}

const cache = new WeakMap()

const CAR_HALF_WIDTH = 1 // m : la voiture touche dès que son flanc entre dans l'obstacle
const POST_RADIUS = 0.7 // m, poteaux du portique

// La voiture en (x, z) est-elle dans une tribune, le bâtiment des stands ou un poteau du portique ? (Pas les arbres.)
export function hitsScenery(track, x, z) {
  const { stands, pit, gantry } = getScenery(track)
  for (const rect of pit ? [...stands, pit] : stands) {
    const dx = x - rect.x
    const dz = z - rect.z
    const cos = Math.cos(rect.rotation)
    const sin = Math.sin(rect.rotation)
    const along = dx * cos - dz * sin
    const out = dx * sin + dz * cos
    if (Math.abs(along) <= rect.length / 2 + CAR_HALF_WIDTH && Math.abs(out) <= rect.depth / 2 + CAR_HALF_WIDTH) return true
  }
  for (const leg of gantry.legs) {
    if (leg.onPitWall) continue // c'est le muret qui arrête la voiture à cet endroit
    const post = toWorld(gantry.x, gantry.z, gantry.heading, 0, leg.across)
    if (Math.hypot(x - post.x, z - post.z) <= POST_RADIUS + CAR_HALF_WIDTH) return true
  }
  return false
}

// Décor de `track` (calculé une fois par piste) : { stands, pit, gantry, boards, trees }.
export function getScenery(track) {
  const known = cache.get(track)
  if (known) return known
  const count = track.points.length
  const edge = track.width / 2
  const features = getFeatures(track)
  const nearest = makeNearest(track)
  const random = seeded(`${track.key}:${Math.round(track.length)}`)
  const spacing = track.spacing
  const placed = []

  const headingAt = (index) => pointAt(track, track.cumulative[((index % count) + count) % count]).heading
  const indexOfS = (s) => ((Math.round(s / spacing) % count) + count) % count
  const fits = (rect, nearOffset) => placed.every((other) => !overlaps(rect, other)) && rectangleIsClear(nearest, track, rect, nearOffset)

  // Une emprise posée à l'écart `nearOffset` du bord proche, centrée sur l'échantillon `index`, côté `side`.
  const rectAt = (index, side, nearOffset, length, depth) => {
    const centre = offsetPoint(track, index, sign(side) * (nearOffset + depth / 2))
    return { x: centre.x, z: centre.z, rotation: headingAt(index) + (side === 'right' ? 0 : Math.PI), length, depth, side, index }
  }

  // Portique de départ : à l'abscisse 0, au-dessus de la piste. `legs[].across` : écart de chaque pied à l'axe
  // (positif = droite). Quand le muret des stands passe par la ligne, le pied de ce côté est posé dessus.
  const lane = getPitLane(track)
  const start = pointAt(track, 0)
  const legs = [-1, 1].map((direction) => {
    const onPitWall = Boolean(lane && lane.sign === direction && lane.wallStart < 0 && lane.wallEnd > 0)
    return { across: direction * (onPitWall ? edge + PIT_LANE.wall : edge + 1.5), onPitWall }
  })
  const gantry = { x: start.x, z: start.z, heading: start.heading, span: legs[1].across - legs[0].across, legs }

  // Bâtiment des stands : au bord de la voie des stands, face au box.
  const pit = placePitBuilding(track, nearest, lane, rectAt, indexOfS)
  if (pit) placed.push(pit)
  const straightAhead = (() => {
    let length = 0
    while (length < 360 && peakCurvature(track, indexOfS(length), indexOfS(length)) < STRAIGHT_CURVATURE) length += spacing
    return length
  })()

  // Tribunes : d'abord sur la ligne droite de départ, puis à l'extérieur des virages, puis le long des lignes droites.
  const stands = []
  const addStand = (index, side, nearOffset, length, big) => {
    if (stands.length >= MAX_STANDS) return false
    const rect = rectAt(index, side, nearOffset, length, STAND_DEPTH)
    if (peakCurvature(track, index - Math.round(length / 2 / spacing), index + Math.round(length / 2 / spacing)) > 1 / 60) return false
    if (!fits(rect, nearOffset) || onPitLane(track, rect)) return false
    stands.push({ ...rect, rows: STAND_ROWS, roof: big || length >= 60 })
    placed.push(rect)
    return true
  }
  if (straightAhead >= 100) {
    for (const side of ['right', 'left']) {
      if (lane?.side === side) continue // ce côté est pris par les stands
      for (const centre of [120, 220]) addStand(indexOfS(centre), side, edge + 20, 90, true)
    }
  }
  for (const corner of features.cornerList) {
    const outside = corner.direction > 0 ? 'right' : 'left'
    const middle = corner.start + Math.round(((corner.end - corner.start + count) % count) / 2)
    const index = middle % count
    const wall = features.wall[outside][index]
    if (wall <= 0) continue
    addStand(index, outside, wall + 3, clamp(corner.length * 0.8, 30, 55), false)
  }
  for (let attempt = 0; attempt < count && stands.length < MAX_STANDS; attempt += Math.round(260 / spacing)) {
    const index = (attempt + Math.round(random() * 40)) % count
    for (const side of ['right', 'left']) {
      if (peakCurvature(track, index - 30, index + 30) < STRAIGHT_CURVATURE) addStand(index, side, edge + 18, 70, false)
    }
  }

  // Panneaux de freinage : 150, 100 et 50 m avant les virages serrés, côté intérieur, sur une partie droite.
  const boards = []
  for (const corner of features.cornerList) {
    if (corner.radius > 140) continue
    const inside = corner.direction > 0 ? 'left' : 'right'
    BOARD_DISTANCES.forEach((distance, order) => {
      const index = (((corner.start - Math.round(distance / spacing)) % count) + count) % count
      if (peakCurvature(track, index - 2, index + 2) > STRAIGHT_CURVATURE) return
      const spot = offsetPoint(track, index, sign(inside) * (edge + 3))
      if (nearest(spot.x, spot.z, edge + 1) < edge + 1) return // près d'un autre tronçon (le sien est à edge + 3)
      if (nearPitLane(track, spot.x, spot.z, 1.5)) return
      if (placed.some((other) => Math.hypot(other.x - spot.x, other.z - spot.z) < other.length / 2 + other.depth / 2 + 3)) return
      boards.push({ x: spot.x, z: spot.z, rotation: headingAt(index), bars: 3 - order })
    })
  }

  // Arbres : le long du circuit, assez loin des équipements et de tout tronçon de piste.
  const trees = []
  const wallReach = edge + KERB_WIDTH + 14 + 1.5 + 6
  for (let index = 0; index < count && trees.length < MAX_TREES; index += Math.max(1, Math.round(14 / spacing))) {
    for (const side of ['right', 'left']) {
      const offset = wallReach + 8 + random() * 85
      const spot = offsetPoint(track, index, sign(side) * offset)
      const jitter = (random() - 0.5) * 10
      const x = spot.x + jitter
      const z = spot.z + jitter * 0.7
      if (nearest(x, z, offset) < offset - 8) continue
      if (nearest(x, z, edge + 30) < edge + 30) continue
      if (nearPitLane(track, x, z, 8)) continue
      if (placed.some((other) => Math.hypot(other.x - x, other.z - z) < other.length / 2 + other.depth + 8)) continue
      trees.push({ x, z, scale: 0.8 + random() * 0.9 })
    }
  }

  const scenery = { stands, pit, gantry, boards, trees }
  cache.set(track, scenery)
  return scenery
}
