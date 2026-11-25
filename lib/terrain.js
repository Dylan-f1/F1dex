// Sol autour d'une piste en relief : une grille de hauteurs calée sur la piste proche, adoucie au loin, à plat sur
// les bords. Module pur (pas de three.js), testé avec `node --test`.

import { KERB_WIDTH, getFeatures } from './circuit-features.js'
import { indexAt, offsetPoint } from './drive-track.js'
import { heightAt } from './relief.js'

export const TERRAIN = {
  cell: 10, // m entre deux points de la grille
  margin: 260, // m de grille au-delà du circuit
  drop: 0.18, // m : le sol passe juste sous la piste et ses équipements
  near: 30, // m : jusque-là, le sol a l'altitude de la piste voisine
  blend: 100, // m : au-delà, il suit une moyenne adoucie du circuit
  flat: 140, // m : à partir d'ici il rejoint le niveau de fond, atteint au bord de la grille
}
const BUCKET = 40 // m, grille de recherche des points de piste
const OTHER_SECTION = 80 // m d'abscisse : au-delà, c'est un autre tronçon du circuit
const COARSE_STEP = 16 // un point sur 16 pour la moyenne lointaine
const CLEARANCE = 0.03 // m : le sol reste au moins à cette distance sous la piste
const ACROSS = [-1, -0.5, 0, 0.5, 1] // positions contrôlées sur la largeur (part de la demi-largeur)
const SKIRT_GAP = 0.45 // m : quand la piste domine le sol de plus que cela, un mur de soutènement descend jusqu'à lui
const VERGE = 2 // m : raccord de la voiture entre le bord du revêtement et le sol
const FALL = { min: 0.6, max: 1.2 } // m de dénivelé vers le sol : au-delà, la voiture reste au niveau de la piste
const GROUND_REACH = KERB_WIDTH + 14 // m au-delà du bord : plus loin, la voiture suit toujours le sol

const clamp01 = (value) => Math.max(0, Math.min(1, value))

// Deux échantillons de la piste appartiennent-ils à des tronçons différents du circuit ?
function otherSection({ cumulative, length }, a, b) {
  const gap = Math.abs(cumulative[a] - cumulative[b])
  return Math.min(gap, length - gap) > OTHER_SECTION
}

const smoothstep = (from, to, value) => {
  const t = clamp01((value - from) / (to - from))
  return t * t * (3 - 2 * t)
}

function bucketPoints(track) {
  const buckets = new Map()
  track.points.forEach((point, index) => {
    const key = (Math.floor(point.x / BUCKET) + 5000) * 10000 + Math.floor(point.z / BUCKET) + 5000
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(index)
  })
  return (x, z, reach, visit) => {
    const cx = Math.floor(x / BUCKET)
    const cz = Math.floor(z / BUCKET)
    const rings = Math.ceil(reach / BUCKET)
    for (let dx = -rings; dx <= rings; dx += 1) {
      for (let dz = -rings; dz <= rings; dz += 1) {
        for (const index of buckets.get((cx + dx + 5000) * 10000 + cz + dz + 5000) ?? []) visit(index)
      }
    }
  }
}

// Altitude de la piste au droit de (x, z), près du point `index` : projection sur les deux segments voisins.
function projectedHeight(track, index, x, z) {
  const { points, cumulative, length } = track
  const count = points.length
  let best = { distance: Infinity, s: cumulative[index] }
  for (const from of [(index - 1 + count) % count, index]) {
    const a = points[from]
    const b = points[(from + 1) % count]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const squared = dx * dx + dz * dz
    const t = squared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / squared))
    const distance = Math.hypot(x - a.x - dx * t, z - a.z - dz * t)
    if (distance < best.distance) best = { distance, s: (cumulative[from] + (cumulative[from + 1] - cumulative[from]) * t) % length }
  }
  return heightAt(track, best.s)
}

function build(track) {
  const { bounds, points } = track
  const { cell, margin } = TERRAIN
  const minX = bounds.minX - margin
  const minZ = bounds.minZ - margin
  const columns = Math.ceil((bounds.maxX - bounds.minX + 2 * margin) / cell) + 1
  const rows = Math.ceil((bounds.maxZ - bounds.minZ + 2 * margin) / cell) + 1
  const sorted = [...track.relief.heights].sort((a, b) => a - b)
  const base = sorted[sorted.length >> 1]
  const around = bucketPoints(track)
  const coarse = points.map((point, index) => ({ ...point, h: track.relief.heights[index] })).filter((_, index) => index % COARSE_STEP === 0)
  const corridor = track.width / 2 + cell // là, aucun tronçon ne doit être recouvert par le sol

  const heights = new Float32Array(columns * rows)
  for (let row = 0; row < rows; row += 1) {
    const z = minZ + row * cell
    for (let column = 0; column < columns; column += 1) {
      const x = minX + column * cell
      // Distances au carré : cette boucle est la plus lourde du calcul.
      let nearest = -1
      let squaredDistance = TERRAIN.blend ** 2
      const close = []
      around(x, z, TERRAIN.blend, (index) => {
        const dx = points[index].x - x
        const dz = points[index].z - z
        const squared = dx * dx + dz * dz
        if (squared < squaredDistance) {
          squaredDistance = squared
          nearest = index
        }
        if (squared < corridor * corridor) close.push([squared, index])
      })
      const distance = Math.sqrt(squaredDistance)

      let near = 0
      if (nearest >= 0) {
        near = projectedHeight(track, nearest, x, z)
        // Deux tronçons à portée (croisement, épingle) : le sol passe sous le plus bas.
        const sections = [nearest]
        for (const [, index] of close.sort((a, b) => a[0] - b[0])) {
          if (sections.every((other) => otherSection(track, other, index))) {
            sections.push(index)
            near = Math.min(near, projectedHeight(track, index, x, z))
          }
        }
      }

      const farShare = nearest < 0 ? 1 : smoothstep(TERRAIN.near, TERRAIN.blend, distance)
      let value = near * (1 - farShare)
      if (farShare > 0) {
        let sum = 0
        let weights = 0
        let closest = Infinity
        for (const spot of coarse) {
          const squared = (spot.x - x) ** 2 + (spot.z - z) ** 2
          closest = Math.min(closest, squared)
          const weight = 1 / (squared + 400) ** 2
          sum += spot.h * weight
          weights += weight
        }
        const flatShare = smoothstep(TERRAIN.flat, TERRAIN.margin - 2 * cell, Math.sqrt(closest))
        value += ((sum / weights) * (1 - flatShare) + base * flatShare) * farShare
      }
      // Bords de la grille : exactement au niveau de fond, pour se raccorder au sol extérieur.
      const border = row === 0 || column === 0 || row === rows - 1 || column === columns - 1
      heights[row * columns + column] = (border ? base : value) - TERRAIN.drop
    }
  }

  // Altitude de la surface du sol (interpolation de la grille) ; hors grille : le niveau de fond.
  function surface(x, z) {
    const u = (x - minX) / cell
    const v = (z - minZ) / cell
    if (!(u >= 0 && v >= 0 && u < columns - 1 && v < rows - 1)) return base - TERRAIN.drop
    const column = Math.floor(u)
    const row = Math.floor(v)
    const du = u - column
    const dv = v - row
    const index = row * columns + column
    const top = heights[index] * (1 - du) + heights[index + 1] * du
    const bottom = heights[index + columns] * (1 - du) + heights[index + columns + 1] * du
    return top * (1 - dv) + bottom * dv
  }

  // Entre deux points de la grille, le sol peut encore dépasser la piste (épingle serrée, tronçon voisin plus haut) :
  // on abaisse alors la maille concernée, juste de ce qui dépasse.
  for (let pass = 0; pass < 3; pass += 1) {
    for (let index = 0; index < points.length; index += 1) {
      for (const share of ACROSS) {
        const spot = offsetPoint(track, index, (share * track.width) / 2)
        const excess = surface(spot.x, spot.z) - (track.relief.heights[index] - CLEARANCE)
        if (excess <= 0) continue
        const corner = Math.floor((spot.z - minZ) / cell) * columns + Math.floor((spot.x - minX) / cell)
        for (const vertex of [corner, corner + 1, corner + columns, corner + columns + 1]) heights[vertex] -= excess
      }
    }
  }

  return { minX, minZ, cell, columns, rows, heights, base, surface }
}

const cache = new WeakMap()

// Terrain de `track` (calculé une fois par piste), ou null si la piste est plate.
export function getTerrain(track) {
  if (!track.relief) return null
  if (!cache.has(track)) cache.set(track, build(track))
  return cache.get(track)
}

// Altitude du pied du mur de soutènement à `offset` m (positif = droite) de l'échantillon `index`, là où la piste
// domine nettement le sol (tronçons voisins à des hauteurs différentes). null s'il n'en faut pas, ou s'il barrerait
// un tronçon qui passe dessous (pont de Suzuka).
export function skirtFoot(track, index, offset) {
  const terrain = getTerrain(track)
  if (!terrain) return null
  const spot = offsetPoint(track, index, offset)
  const top = track.relief.heights[index]
  const ground = terrain.surface(spot.x, spot.z)
  if (top - ground <= SKIRT_GAP) return null
  const below = track.points.some(
    (point, other) =>
      Math.hypot(point.x - spot.x, point.z - spot.z) < track.width / 2 + 1 &&
      track.relief.heights[other] < top - SKIRT_GAP &&
      otherSection(track, index, other),
  )
  return below ? null : ground - 0.3
}

// Largeur revêtue (piste, puis vibreur ou gravier) d'un côté de l'échantillon `index`, depuis l'axe.
export function pavedEdge(track, index, side) {
  const { gravel, kerb } = getFeatures(track)
  const edge = track.width / 2
  if (gravel[side][index] > 0) return edge + KERB_WIDTH + gravel[side][index]
  return kerb[side][index] ? edge + KERB_WIDTH : edge
}

// Altitude sous la voiture, en (x, z), à l'abscisse `s` et à `offset` m de l'axe (positif = droite) : la piste
// jusqu'au bord de son revêtement, puis un raccord vers le sol. Là où la piste domine nettement le sol, la voiture
// reste à son niveau.
export function floorAt(track, { x, z, s, offset }) {
  const terrain = getTerrain(track)
  if (!terrain) return 0
  const ground = terrain.surface(x, z)
  const aside = Math.abs(offset)
  if (aside > track.width / 2 + GROUND_REACH) return ground
  const road = heightAt(track, s)
  const beyond = aside - pavedEdge(track, indexAt(track, s), offset > 0 ? 'right' : 'left')
  const share = smoothstep(0, VERGE, beyond) * clamp01((FALL.max - (road - ground)) / (FALL.max - FALL.min))
  return road + (ground - road) * share
}
