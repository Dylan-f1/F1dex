const DEGREES_TO_RADIANS = Math.PI / 180
// Distance entre un virage et son numéro, dans l'unité des coordonnées MultiViewer.
const CORNER_LABEL_OFFSET = 560
// Marge autour du tracé pour que les numéros de virage ne soient pas coupés.
const VIEWBOX_PADDING = 900

function rotate(x, y, degrees) {
  const angle = degrees * DEGREES_TO_RADIANS
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle),
  }
}

// Même transformation pour le tracé et pour les points de la voiture : rotation puis axe Y inversé.
export function toSvgSpace(x, y, rotation) {
  const turned = rotate(x, y, rotation)
  return { x: turned.x, y: -turned.y }
}

// Transforme la réponse brute de MultiViewer en données prêtes pour le SVG :
// tracé tourné comme l'affiche MultiViewer, axe Y inversé (le SVG descend), numéros de virage
// posés à côté de la piste. Renvoie null si les données sont inutilisables.
export function buildTrack(raw) {
  if (!raw || !Array.isArray(raw.x) || !Array.isArray(raw.y)) return null
  if (raw.x.length < 3 || raw.x.length !== raw.y.length) return null

  const rotation = Number(raw.rotation) || 0
  const toSvg = (x, y) => toSvgSpace(x, y, rotation)

  const points = raw.x.map((x, index) => toSvg(x, raw.y[index]))
  // Une donnée tierce peut être incomplète : un virage sans position ou sans angle est ignoré,
  // il ne doit ni faire échouer ni déformer tout le tracé.
  const usableCorners = (raw.corners ?? []).filter(
    (corner) =>
      Number.isFinite(corner?.trackPosition?.x) &&
      Number.isFinite(corner.trackPosition.y) &&
      Number.isFinite(corner.angle),
  )
  const corners = usableCorners.map((corner) => {
    const { x, y } = corner.trackPosition
    const labelAngle = corner.angle * DEGREES_TO_RADIANS
    return {
      number: corner.number,
      on: toSvg(x, y),
      label: toSvg(
        x + CORNER_LABEL_OFFSET * Math.cos(labelAngle),
        y + CORNER_LABEL_OFFSET * Math.sin(labelAngle),
      ),
    }
  })

  const everyPoint = [...points, ...corners.map((corner) => corner.label)]
  const xs = everyPoint.map((point) => point.x)
  const ys = everyPoint.map((point) => point.y)
  const minX = Math.min(...xs) - VIEWBOX_PADDING / 2
  const minY = Math.min(...ys) - VIEWBOX_PADDING / 2
  const width = Math.max(...xs) - Math.min(...xs) + VIEWBOX_PADDING
  const height = Math.max(...ys) - Math.min(...ys) + VIEWBOX_PADDING

  const round = (value) => Math.round(value)
  const path = `${points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join('')}Z`

  return {
    path,
    points: points.map((point) => [round(point.x), round(point.y)]),
    rotation,
    viewBox: `${round(minX)} ${round(minY)} ${round(width)} ${round(height)}`,
    width,
    height,
    corners,
  }
}

// Écart maximal toléré entre la voiture et le tracé (dixièmes de mètre, soit 30 m). Au-delà, les deux
// sources ne parlent pas du même repère ou du même circuit : mieux vaut ne rien dessiner.
const MAX_DISTANCE_TO_TRACK = 300
const MIN_POINTS_PER_SECTOR = 3

// Projette (x, y) sur le tracé fermé. La distance est mesurée au segment le plus proche, pas au point :
// MultiViewer ne donne parfois que ~300 points (Suzuka), très espacés sur les lignes droites.
// `index` = le point du tracé le plus proche de la projection.
function nearestPoint(points, x, y) {
  let index = 0
  let distance = Infinity
  points.forEach(([ax, ay], candidate) => {
    const [bx, by] = points[(candidate + 1) % points.length]
    const segmentX = bx - ax
    const segmentY = by - ay
    const lengthSquared = segmentX * segmentX + segmentY * segmentY
    const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * segmentX + (y - ay) * segmentY) / lengthSquared))
    const d = Math.hypot(ax + ratio * segmentX - x, ay + ratio * segmentY - y)
    if (d < distance) {
      distance = d
      index = ratio < 0.5 ? candidate : (candidate + 1) % points.length
    }
  })
  return { index, distance }
}

// Repères des trois secteurs chronométrés. `crossings` : position de la voiture (repère OpenF1, le même
// que MultiViewer avant rotation) à la ligne de départ, à la fin du secteur 1 et à la fin du secteur 2,
// sur un même tour. Renvoie null si ces points ne tombent pas sur le tracé, dans l'ordre de course.
export function buildSectorMarks(track, crossings) {
  if (!crossings) return null
  const spots = [crossings.start, crossings.firstEnd, crossings.secondEnd].map((crossing) => {
    if (!crossing || !Number.isFinite(crossing.x) || !Number.isFinite(crossing.y)) return null
    const { x, y } = toSvgSpace(crossing.x, crossing.y, track.rotation)
    return nearestPoint(track.points, x, y)
  })
  if (spots.some((spot) => !spot || spot.distance > MAX_DISTANCE_TO_TRACK)) return null

  const count = track.points.length
  const [start, firstEnd, secondEnd] = spots.map((spot) => spot.index)
  const ahead = (from, to) => (to - from + count) % count
  const firstLength = ahead(start, firstEnd)
  const secondLength = ahead(firstEnd, secondEnd)
  const thirdLength = ahead(secondEnd, start)
  const isInRaceOrder = [firstLength, secondLength, thirdLength].every(
    (length) => length >= MIN_POINTS_PER_SECTOR,
  )
  if (!isInRaceOrder || firstLength + secondLength + thirdLength !== count) return null

  const bounds = [start, firstEnd, secondEnd]
  const lengths = [firstLength, secondLength, thirdLength]
  const labels = bounds.map((from, sector) => {
    const [x, y] = track.points[(from + Math.floor(lengths[sector] / 2)) % count]
    return { number: sector + 1, x, y }
  })
  const boundaries = bounds.map((index) => {
    const [x, y] = track.points[index]
    const [beforeX, beforeY] = track.points[(index - 1 + count) % count]
    const [afterX, afterY] = track.points[(index + 1) % count]
    const heading = Math.atan2(afterY - beforeY, afterX - beforeX)
    return { x, y, headingDegrees: heading / DEGREES_TO_RADIANS }
  })
  return { labels, boundaries }
}
