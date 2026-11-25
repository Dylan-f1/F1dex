// Roues de la voiture 3D (module pur : pas de three.js, testé avec `node --test` sur le vrai fichier du modèle).
// public/models/f1.glb est une seule maille, et ses pneus reconstruits par IA sont troués et déchiquetés sur les
// faces cachées : on les retire, et des roues construites en code (components/car-wheel-geometry.js) prennent leur
// place, aux mêmes centres et dimensions. Elles tournent et braquent vraiment.
//
// Repère du modèle : x latéral (+x = gauche de la voiture), y vers le haut, z vers l'avant. Unités du fichier
// (la voiture mesure 1 de long).

// Centres et rayons ajustés sur le contour des quatre pneus de CE modèle. `innerX` / `outerX` : faces intérieure
// et extérieure du pneu, en distance à l'axe de la voiture. À remesurer si le fichier du modèle change.
const FRONT = { y: -0.0822, z: 0.2721, radius: 0.1085, innerX: 0.172, outerX: 0.301, front: true }
// `bulgeFloor` : à l'arrière, des renflements de l'ancien pneu tiennent à la carrosserie ; on retire ce qui dépasse
// autour de la roue au-dessus de cette hauteur (en dessous, c'est le fond plat). Devant, ce voisinage est occupé par
// l'aileron : on n'y touche pas.
const REAR = { y: -0.0808, z: -0.3519, radius: 0.1082, innerX: 0.168, outerX: 0.287, front: false, bulgeFloor: -0.155 }

export const MODEL_WHEELS = [
  { id: 'avant-gauche', side: 1, ...FRONT },
  { id: 'avant-droite', side: -1, ...FRONT },
  { id: 'arriere-gauche', side: 1, ...REAR },
  { id: 'arriere-droite', side: -1, ...REAR },
]

// Marge autour du pneu : le contour reconstruit n’est pas un cercle parfait. Au-delà, ce sont les pièces voisines
// (dérive de l’aileron avant, déflecteurs) : elles restent sur la carrosserie.
export const CUT_MARGIN = 0.005
const INNER_REACH = 0.012 // dépassement toléré d’un sommet vers l’intérieur de la voiture
// Morceaux restés en l'air une fois le pneu retiré (renflements du pneu) : petits, détachés du reste, et entièrement
// dans cette enveloppe élargie autour d'une roue.
const DEBRIS_MARGIN = 0.045
const BULGE_MARGIN = 0.035 // même idée pour les renflements restés attachés (voir `bulgeFloor`)
const DEBRIS_MAX_TRIANGLES = 200
const BULGE_INSET = 0.006 // les renflements sont au moins à cette distance au-delà du flanc intérieur

// Centre d'une roue : le milieu du pneu.
export function wheelCentre(wheel) {
  return [(wheel.side * (wheel.innerX + wheel.outerX)) / 2, wheel.y, wheel.z]
}

export const wheelWidth = (wheel) => wheel.outerX - wheel.innerX

const radialFrom = (wheel, y, z) => Math.hypot(y - wheel.y, z - wheel.z)

// Le triangle fait-il partie de ce pneu ? Il faut que son centre soit du bon côté du plan intérieur et qu'aucun
// sommet ne rentre franchement vers la voiture. Ensuite : centre dans le pneu → oui ; centre dans la marge → oui
// seulement si aucun sommet n'en sort (sinon c'est une pièce voisine).
function isTyre(wheel, positions, corners) {
  const centre = [0, 1, 2].map((axis) => corners.reduce((sum, corner) => sum + positions[corner * 3 + axis], 0) / 3)
  if (centre[0] * wheel.side < wheel.innerX) return false
  if (corners.some((corner) => positions[corner * 3] * wheel.side < wheel.innerX - INNER_REACH)) return false
  const reach = radialFrom(wheel, centre[1], centre[2])
  if (reach <= wheel.radius) return true
  if (reach > wheel.radius + CUT_MARGIN) return false
  return corners.every(
    (corner) => radialFrom(wheel, positions[corner * 3 + 1], positions[corner * 3 + 2]) <= wheel.radius + CUT_MARGIN,
  )
}

// Renflement de l'ancien pneu resté sur la carrosserie (voir `bulgeFloor`).
function isBulge(wheel, positions, corners) {
  if (wheel.bulgeFloor === undefined) return false
  const [x, y, z] = [0, 1, 2].map((axis) => corners.reduce((sum, corner) => sum + positions[corner * 3 + axis], 0) / 3)
  return (
    x * wheel.side >= wheel.innerX + BULGE_INSET &&
    y > wheel.bulgeFloor &&
    radialFrom(wheel, y, z) <= wheel.radius + BULGE_MARGIN
  )
}

// Regroupe les triangles qui se touchent (sommets à la même position, même s'ils sont dédoublés par la texture).
// Renvoie une liste d'indices par morceau.
export function connectedPieces(positions, indices) {
  const ids = new Map()
  const welded = Array.from(indices, (vertex) => {
    const key = [0, 1, 2].map((axis) => Math.round(positions[vertex * 3 + axis] * 1e5)).join()
    if (!ids.has(key)) ids.set(key, ids.size)
    return ids.get(key)
  })
  const parent = []
  const find = (start) => {
    let node = start
    parent[node] ??= node
    while (parent[node] !== node) {
      parent[node] = parent[parent[node]]
      node = parent[node]
    }
    return node
  }
  for (let triangle = 0; triangle < welded.length; triangle += 3) {
    for (const corner of [1, 2]) parent[find(welded[triangle + corner])] = find(welded[triangle])
  }
  const pieces = new Map()
  for (let triangle = 0; triangle < welded.length; triangle += 3) {
    const root = find(welded[triangle])
    if (!pieces.has(root)) pieces.set(root, [])
    pieces.get(root).push(indices[triangle], indices[triangle + 1], indices[triangle + 2])
  }
  return [...pieces.values()]
}

function isDebris(positions, piece, wheels) {
  if (piece.length / 3 > DEBRIS_MAX_TRIANGLES) return false
  return wheels.some((wheel) =>
    piece.every(
      (vertex) =>
        positions[vertex * 3] * wheel.side >= wheel.innerX - INNER_REACH &&
        radialFrom(wheel, positions[vertex * 3 + 1], positions[vertex * 3 + 2]) <= wheel.radius + DEBRIS_MARGIN,
    ),
  )
}

// Retire les pneus d'une maille indexée. Renvoie les triangles gardés (`body`) et, pour chaque roue, le nombre de
// triangles retirés (zéro = les mesures ne correspondent pas à ce fichier).
export function removeWheels(positions, indices, wheels = MODEL_WHEELS) {
  const kept = []
  const removed = wheels.map(() => 0)
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const corners = [indices[triangle], indices[triangle + 1], indices[triangle + 2]]
    const owner = wheels.findIndex((wheel) => isTyre(wheel, positions, corners))
    if (owner !== -1) removed[owner] += 1
    else if (!wheels.some((wheel) => isBulge(wheel, positions, corners))) kept.push(...corners)
  }
  const body = []
  for (const piece of connectedPieces(positions, kept)) {
    if (!isDebris(positions, piece, wheels)) for (const vertex of piece) body.push(vertex)
  }
  return { body, removed }
}

// Demi-coupe d'un pneu, tournée autour de l'essieu pour former la roue : points [distance à l'essieu, position le
// long de l'essieu], d'une face à l'autre. Flancs plats (les marquages s'y posent), épaules arrondies, bande de
// roulement plate.
export function tyreProfile(radius, width) {
  const half = width / 2
  const shoulder = [
    [0.62, 0.035], // [part du rayon, retrait depuis la face, en part du rayon]
    [0.66, 0],
    [0.86, 0],
    [0.92, 0.025],
    [0.965, 0.07],
    [0.99, 0.13],
    [1, 0.21],
  ]
  return [
    ...shoulder.map(([r, inset]) => [r * radius, -half + inset * radius]),
    ...shoulder.toReversed().map(([r, inset]) => [r * radius, half - inset * radius]),
  ]
}

// Réglages d'affichage des roues. L'angle montré n'est pas celui de la physique : à haute vitesse les pneus n'ont
// besoin que de 2 à 3° de braquage, invisibles à l'écran. On montre donc la consigne du volant, amplifiée.
export const WHEEL_VISUAL = {
  steerSlow: 0.38, // rad à l'arrêt, volant à fond (environ 22°)
  steerFast: 0.16, // rad à partir de `fastSpeed` (environ 9°)
  fastSpeed: 70, // m/s
  spokes: 5, // branches de la jante
  // Rotation maximale montrée d'une image à l'autre. Au-delà de la moitié de l'écart entre deux branches (π / 5), la
  // roue paraîtrait tourner à l'envers (à 300 km/h elle fait environ 30 tours par seconde).
  maxSpinStep: 0.45, // rad
}

// Angle des roues avant (rad, positif = vers la gauche) pour une position du volant −1..1 et une vitesse en m/s.
export function shownSteerAngle(steer, speed) {
  const amount = Math.min(1, Math.abs(speed) / WHEEL_VISUAL.fastSpeed)
  const max = WHEEL_VISUAL.steerSlow + (WHEEL_VISUAL.steerFast - WHEEL_VISUAL.steerSlow) * amount
  return Math.max(-1, Math.min(1, steer)) * max
}

// Nouvel angle de rotation d'une roue (rad, positif = roule vers l'avant), après `dt` secondes à la vitesse `u`.
export function advanceSpin(angle, u, radius, dt) {
  if (!(radius > 0) || !(dt > 0)) return angle
  const limit = WHEEL_VISUAL.maxSpinStep
  const step = Math.max(-limit, Math.min(limit, (u / radius) * dt))
  return (angle + step) % (2 * Math.PI)
}
