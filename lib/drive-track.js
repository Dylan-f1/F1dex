// Pistes pour la conduite : le circuit fictif d'origine et les vrais circuits (tracés MultiViewer). Module pur
// (pas de three.js), testé avec `node --test`.
//
// Repère : mètres, x vers la droite de l'écran, z vers le bas (comme le SVG de TrackMap, donc un circuit se
// voit ici comme sur la carte), y vers le haut. Cap = angle de la direction de marche : avancer = (cos cap,
// −sin cap) en (x, z) ; cap croissant = la voiture tourne à gauche (comme `rotation.y` de three.js).

import { buildRelief } from './relief.js'

export const TRACK_WIDTH = 14
export const CIRCUIT_WIDTH = 13 // les circuits de F1 font 12 à 15 m
export const SAMPLE_SPACING = 2.5 // pas régulier de la ligne centrale, en mètres
const DECIMETRES_PER_METRE = 10 // MultiViewer donne ses coordonnées en dixièmes de mètre
const SMOOTHING_PASSES = 3 // lissage du bruit d'arrondi (0,1 m) des tracés MultiViewer
const SEARCH_WINDOW = 80 // m de part et d'autre de l'abscisse précédente
// m : plus loin, la recherche locale est douteuse, on cherche partout. Doit rester au-dessus de la distance de remise en
// piste (bord + 40 m) : entre les deux, une recherche globale pourrait choisir un autre tronçon du circuit.
const WINDOW_FALLBACK_DISTANCE = 60
const INNER_EDGE_SHARE = 0.85 // part du rayon de courbure que peut atteindre un bord intérieur

// Circuit fictif : points de contrôle d'une courbe fermée, en mètres. Départ au premier point, vers le deuxième.
const FICTIVE_CONTROL_POINTS = [
  [-70, 0],
  [60, 0],
  [150, -8],
  [195, -55],
  [170, -110],
  [95, -112],
  [55, -150],
  [-10, -185],
  [-90, -170],
  [-140, -115],
  [-135, -50],
  [-115, -12],
].map(([x, z]) => ({ x, z }))

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))

function dropDuplicates(points) {
  return points.filter((point, index) => {
    const next = points[(index + 1) % points.length]
    return Math.hypot(next.x - point.x, next.z - point.z) > 1e-6
  })
}

// Courbe fermée de Catmull-Rom « centripète » : contrairement à la version uniforme, elle ne fait ni boucle ni
// dépassement quand les points sont très inégalement espacés (Suzuka : 1 m dans les virages, 100 m en ligne droite).
function centripetalSpline(control, spacing) {
  const count = control.length
  const points = []
  const knot = (from, to) => Math.hypot(to.x - from.x, to.z - from.z) ** 0.5
  const mix = (p, q, weight) => ({ x: p.x + (q.x - p.x) * weight, z: p.z + (q.z - p.z) * weight })
  for (let index = 0; index < count; index += 1) {
    const p0 = control[(index - 1 + count) % count]
    const p1 = control[index]
    const p2 = control[(index + 1) % count]
    const p3 = control[(index + 2) % count]
    const t1 = knot(p0, p1)
    const t2 = t1 + knot(p1, p2)
    const t3 = t2 + knot(p2, p3)
    const steps = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / spacing))
    for (let step = 0; step < steps; step += 1) {
      const t = t1 + ((t2 - t1) * step) / steps
      const a1 = mix(p0, p1, (t - 0) / t1)
      const a2 = mix(p1, p2, (t - t1) / (t2 - t1))
      const a3 = mix(p2, p3, (t - t2) / (t3 - t2))
      const b1 = mix(a1, a2, (t - 0) / t2)
      const b2 = mix(a2, a3, (t - t1) / (t3 - t1))
      points.push(mix(b1, b2, (t - t1) / (t2 - t1)))
    }
  }
  return points
}

// Points régulièrement espacés (au pas `spacing`, ajusté pour que le dernier rejoigne le premier).
function resampleClosed(points, spacing) {
  const cumulative = [0]
  for (let index = 1; index <= points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index % points.length]
    cumulative.push(cumulative[index - 1] + Math.hypot(to.x - from.x, to.z - from.z))
  }
  const total = cumulative[points.length]
  const count = Math.max(8, Math.round(total / spacing))
  const result = []
  let segment = 0
  for (let index = 0; index < count; index += 1) {
    const s = (total * index) / count
    while (cumulative[segment + 1] < s) segment += 1
    const span = cumulative[segment + 1] - cumulative[segment]
    const t = span === 0 ? 0 : (s - cumulative[segment]) / span
    const a = points[segment]
    const b = points[(segment + 1) % points.length]
    result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
  }
  return result
}

// Moyenne glissante [1 2 1] / 4 sur une boucle fermée.
function smoothClosed(points, passes) {
  let current = points
  for (let pass = 0; pass < passes; pass += 1) {
    current = current.map((point, index) => {
      const before = current[(index - 1 + current.length) % current.length]
      const after = current[(index + 1) % current.length]
      return { x: (before.x + 2 * point.x + after.x) / 4, z: (before.z + 2 * point.z + after.z) / 4 }
    })
  }
  return current
}

// Piste : { key, points, cumulative, length, width, spacing, curvature, bounds, clockwise }.
// `relief` : altitudes le long du tour (lib/relief.js), null si la piste est plate.
// `cumulative[i]` = abscisse curviligne du point i ; `length` = longueur du tour (le dernier point rejoint le
// premier). `curvature[i]` = courbure signée en 1/m (positive = virage à gauche).
function finishTrack(rawPoints, { key, width, smoothing, relief }) {
  const spline = centripetalSpline(dropDuplicates(rawPoints), SAMPLE_SPACING)
  // On rééchantillonne une seconde fois : le lissage rapproche les points dans les épingles.
  const points = resampleClosed(smoothClosed(resampleClosed(spline, SAMPLE_SPACING), smoothing), SAMPLE_SPACING)
  const cumulative = [0]
  for (let index = 1; index <= points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index % points.length]
    cumulative.push(cumulative[index - 1] + Math.hypot(to.x - from.x, to.z - from.z))
  }
  const length = cumulative[points.length]
  const spacing = length / points.length

  const count = points.length
  const tangent = points.map((point, index) => {
    const before = points[(index - 2 + count) % count]
    const after = points[(index + 2) % count]
    return Math.atan2(-(after.z - before.z), after.x - before.x)
  })
  const curvature = tangent.map((_, index) =>
    wrapAngle(tangent[(index + 1) % count] - tangent[(index - 1 + count) % count]) / (2 * spacing),
  )

  const xs = points.map((point) => point.x)
  const zs = points.map((point) => point.z)
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
  bounds.radius = Math.hypot(Math.max(bounds.maxX, -bounds.minX), Math.max(bounds.maxZ, -bounds.minZ))

  let area = 0
  points.forEach((point, index) => {
    const next = points[(index + 1) % count]
    area += point.x * next.z - next.x * point.z
  })

  const track = { key, points, cumulative, length, width, spacing, curvature, bounds, clockwise: area > 0 }
  return { ...track, relief: buildRelief(track, relief) }
}

// Circuit fictif.
export function buildDriveTrack({ control = FICTIVE_CONTROL_POINTS, width = TRACK_WIDTH, relief } = {}) {
  return finishTrack(control, { key: 'fictive', width, smoothing: 0, relief })
}

// Vrai circuit, à partir des points de `buildTrack` (lib/track.js) : dixièmes de mètre, repère du SVG, dans le
// sens de la course. Le tracé est recentré sur son centre : `origin` est le décalage retiré (en mètres).
// Le premier point du tracé MultiViewer est proche de la ligne de départ, sans plus (vérifié sur les 24
// circuits de 2025) : le départ est donc approximatif.
export function buildCircuitTrack(svgPoints, { key, width = CIRCUIT_WIDTH, relief } = {}) {
  if (!Array.isArray(svgPoints) || svgPoints.length < 8) return null
  const metres = svgPoints.map(([x, y]) => ({ x: x / DECIMETRES_PER_METRE, z: y / DECIMETRES_PER_METRE }))
  if (metres.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.z))) return null
  const xs = metres.map((point) => point.x)
  const zs = metres.map((point) => point.z)
  const origin = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  }
  const track = finishTrack(
    metres.map((point) => ({ x: point.x - origin.x, z: point.z - origin.z })),
    { key: String(key), width, smoothing: SMOOTHING_PASSES, relief },
  )
  return { ...track, origin }
}

// Index du segment qui contient l'abscisse `s` (recherche dichotomique sur `cumulative`).
export function indexAt(track, s) {
  const { cumulative, points, length } = track
  const wrapped = ((s % length) + length) % length
  let low = 0
  let high = points.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (cumulative[middle] <= wrapped) low = middle
    else high = middle - 1
  }
  return low
}

function nearestAmong(track, x, z, firstIndex, count) {
  const { points, cumulative } = track
  const total = points.length
  let best = { distance: Infinity, s: 0 }
  for (let offset = 0; offset < count; offset += 1) {
    const index = (((firstIndex + offset) % total) + total) % total
    const a = points[index]
    const b = points[(index + 1) % total]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lengthSquared = dx * dx + dz * dz
    const t = lengthSquared === 0 ? 0 : clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSquared, 0, 1)
    const distance = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))
    if (distance < best.distance) {
      best = { distance, s: cumulative[index] + (cumulative[index + 1] - cumulative[index]) * t }
    }
  }
  return best
}

// Point de la piste le plus proche de (x, z) : distance à la ligne centrale et abscisse curviligne `s`.
// Avec `hintS` (abscisse précédente), la recherche reste dans une fenêtre autour d'elle : sur un circuit qui se
// croise (Suzuka) ou qui longe ses propres sections (Monaco), le point globalement le plus proche peut être
// sur un autre tronçon, ce qui ferait sauter `s` et fausserait les tours.
export function closestOnTrack(track, x, z, hintS) {
  const total = track.points.length
  if (hintS === undefined) return nearestAmong(track, x, z, 0, total)
  const radius = Math.ceil(SEARCH_WINDOW / track.spacing)
  const local = nearestAmong(track, x, z, indexAt(track, hintS) - radius, radius * 2 + 1)
  return local.distance <= WINDOW_FALLBACK_DISTANCE ? local : nearestAmong(track, x, z, 0, total)
}

// Position et cap (voir l'en-tête) d'un point de la piste, à l'abscisse `s`.
export function pointAt(track, s) {
  const { points, cumulative, length } = track
  const wrapped = ((s % length) + length) % length
  const index = indexAt(track, wrapped)
  const a = points[index]
  const b = points[(index + 1) % points.length]
  const span = cumulative[index + 1] - cumulative[index]
  const t = span === 0 ? 0 : (wrapped - cumulative[index]) / span
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(-(b.z - a.z), b.x - a.x) }
}

// Rayon de courbure minimal de la ligne centrale.
export function minCurvatureRadius(track) {
  const peak = Math.max(...track.curvature.map(Math.abs))
  return peak === 0 ? Infinity : 1 / peak
}

// Point à `offset` mètres de la ligne centrale, à l'échantillon `index` (positif = côté droit de la marche). Dans un
// virage serré, un bord intérieur est ramené en deçà du rayon de courbure : sans cela la bande dessinée entre deux
// bords se replierait sur elle-même dans les épingles.
export function offsetPoint(track, index, offset) {
  const { points, curvature } = track
  const here = points[index]
  const before = points[(index - 1 + points.length) % points.length]
  const after = points[(index + 1) % points.length]
  const length = Math.hypot(after.x - before.x, after.z - before.z) || 1
  // Normale à la piste, vers la droite dans le sens de la marche.
  const normalX = -(after.z - before.z) / length
  const normalZ = (after.x - before.x) / length
  const bend = curvature[index]
  const inner = bend * offset < 0
  const applied = inner ? Math.sign(offset) * Math.min(Math.abs(offset), INNER_EDGE_SHARE / Math.abs(bend)) : offset
  return { x: here.x + normalX * applied, z: here.z + normalZ * applied }
}

// Ligne parallèle à la ligne centrale, à `offset` mètres (positif = côté droit de la marche).
export function offsetLine(track, offset) {
  return track.points.map((_, index) => offsetPoint(track, index, offset))
}

// Écart latéral signé de (x, z) à la ligne centrale, à l'abscisse `s` (positif = côté droit de la marche).
export function signedOffset(track, x, z, s) {
  const spot = pointAt(track, s)
  return (x - spot.x) * Math.sin(spot.heading) + (z - spot.z) * Math.cos(spot.heading)
}
