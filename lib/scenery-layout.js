// Placement des éléments purement visuels du décor (aucun n'a d'effet sur la conduite) : trace de gomme sur
// l'asphalte, piles de pneus et grillages derrière les murs, bosquets autour des arbres. Module pur, testé.

import { getFeatures } from './circuit-features.js'
import { getScenery, makeNearest } from './circuit-scenery.js'
import { offsetPoint } from './drive-track.js'
import { seededRandom } from './noise.js'
import { nearPitLane } from './pit-lane.js'

export const TYRE_STACK = { radius: 0.36, spacing: 0.74 } // m
export const FENCE_SETBACK = 1.5 // m entre le mur et le grillage
const LINE_REACH = 0.62 // part de la demi-largeur que la trajectoire peut atteindre
const LINE_GAIN = 420 // m d'écart par unité de courbure (1/m)
const LINE_SMOOTH = 55 // m de lissage de chaque côté : la trajectoire s'ouvre avant et après le virage
const GROVE_MAX = 1400
const TREE_CLEARANCE = 24 // m minimum entre un arbre et le bord de piste

const sign = (side) => (side === 'right' ? 1 : -1)
const SIDES = ['left', 'right']

// Calculé une fois par piste (préparé au repos, avant la conduite).
function perTrack(compute) {
  const cache = new WeakMap()
  return (track) => {
    if (!cache.has(track)) cache.set(track, compute(track))
    return cache.get(track)
  }
}

// Écart latéral (m, positif = droite) de la trajectoire suivie par les voitures, à chaque échantillon : vers
// l'intérieur des virages, au centre dans les longues lignes droites.
export const racingLine = perTrack(computeRacingLine)

function computeRacingLine(track) {
  const count = track.points.length
  const reach = (track.width / 2) * LINE_REACH
  const raw = track.curvature.map((bend) => Math.max(-reach, Math.min(reach, -bend * LINE_GAIN)))
  const span = Math.max(1, Math.round(LINE_SMOOTH / track.spacing))
  // Moyenne glissante sur la boucle.
  let sum = 0
  for (let offset = -span; offset <= span; offset += 1) sum += raw[(offset + count * span) % count]
  return raw.map((_, index) => {
    const value = sum / (2 * span + 1)
    sum += raw[(index + span + 1) % count] - raw[(index - span + count * span) % count]
    return value
  })
}

// Piles de pneus derrière chaque mur (leur face côté piste est à l'écart exact du mur, là où la voiture le touche)
// et échantillons qui peuvent recevoir un grillage en retrait sans empiéter sur un autre tronçon.
export const barrierLayout = perTrack(computeBarriers)

function computeBarriers(track) {
  const { wall } = getFeatures(track)
  const count = track.points.length
  const nearest = makeNearest(track)
  const clearance = track.width / 2 + 2.5
  const clearOfTrack = (spot) => nearest(spot.x, spot.z, clearance) >= clearance
  const stacks = []
  const fence = { left: new Uint8Array(count), right: new Uint8Array(count) }
  for (const side of SIDES) {
    let carried = 0 // distance depuis la dernière pile, reportée d'un segment au suivant
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count
      const here = wall[side][index]
      if (here <= 0) continue
      const behind = offsetPoint(track, index, sign(side) * (here + FENCE_SETBACK))
      if (clearOfTrack(behind)) fence[side][index] = 1
      const there = wall[side][next]
      if (there <= 0) {
        carried = 0
        continue
      }
      const a = offsetPoint(track, index, sign(side) * (here + TYRE_STACK.radius))
      const b = offsetPoint(track, next, sign(side) * (there + TYRE_STACK.radius))
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      let along = TYRE_STACK.spacing - carried
      while (along <= length) {
        const t = along / length
        stacks.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, index, side, t })
        along += TYRE_STACK.spacing
      }
      carried = length - (along - TYRE_STACK.spacing)
    }
  }
  return { stacks, fence }
}

// Tous les arbres à dessiner : ceux de lib/circuit-scenery.js, plus des voisins qui en font des bosquets.
// `kind` : 0 = feuillu, 1 = résineux (les bosquets sont presque toujours d'une seule essence).
export const groveTrees = perTrack(computeGrove)

function computeGrove(track) {
  const { trees, stands, pit } = getScenery(track)
  const random = seededRandom(`bosquet:${track.key}`)
  const nearest = makeNearest(track)
  const need = track.width / 2 + TREE_CLEARANCE
  const buildings = pit ? [...stands, pit] : stands
  const free = (x, z) =>
    nearest(x, z, need) >= need &&
    !nearPitLane(track, x, z, 8) &&
    buildings.every((other) => Math.hypot(other.x - x, other.z - z) >= other.length / 2 + other.depth / 2 + 4)
  const grove = []
  for (const tree of trees) {
    // L'essence change par grandes plages, pas d'un arbre à l'autre.
    const patch = Math.sin(tree.x / 130) + Math.cos(tree.z / 170)
    const kind = patch + (random() - 0.5) * 0.7 > 0.2 ? 1 : 0
    grove.push({ x: tree.x, z: tree.z, scale: tree.scale, kind, turn: random() * Math.PI * 2 })
  }
  const base = grove.length
  for (let index = 0; index < base && grove.length < GROVE_MAX; index += 1) {
    const parent = grove[index]
    const companions = Math.floor(random() * 3)
    for (let companion = 0; companion < companions && grove.length < GROVE_MAX; companion += 1) {
      const angle = random() * Math.PI * 2
      const distance = 4 + random() * 6
      const x = parent.x + Math.cos(angle) * distance
      const z = parent.z + Math.sin(angle) * distance
      if (!free(x, z)) continue
      grove.push({ x, z, scale: parent.scale * (0.6 + random() * 0.5), kind: parent.kind, turn: random() * Math.PI * 2 })
    }
  }
  return grove
}
