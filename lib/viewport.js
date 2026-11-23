// Fenêtre de vue du SVG ({ x, y, w, h } dans le repère du tracé) : zoom et déplacement.
// La vue garde toujours le rapport largeur/hauteur de la vue de base, le niveau de zoom va de 1 à MAX_ZOOM.
export const MAX_ZOOM = 12

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function parseViewBox(text) {
  const [x, y, w, h] = text.split(' ').map(Number)
  return { x, y, w, h }
}

export function formatViewBox(view) {
  return `${view.x} ${view.y} ${view.w} ${view.h}`
}

export function zoomLevel(view, base) {
  return base.w / view.w
}

// Le centre de la vue ne sort jamais du cadre de base : impossible de « perdre » le circuit.
function keepCenterInside(view, base) {
  const centerX = clamp(view.x + view.w / 2, base.x, base.x + base.w)
  const centerY = clamp(view.y + view.h / 2, base.y, base.y + base.h)
  return { x: centerX - view.w / 2, y: centerY - view.h / 2, w: view.w, h: view.h }
}

// Zoom d'un facteur autour de `anchor` (point du repère du tracé qui reste sous le curseur).
export function zoomView(view, base, factor, anchor) {
  const level = clamp(zoomLevel(view, base) * factor, 1, MAX_ZOOM)
  const w = base.w / level
  const h = base.h / level
  const ratioX = (anchor.x - view.x) / view.w
  const ratioY = (anchor.y - view.y) / view.h
  return keepCenterInside({ x: anchor.x - ratioX * w, y: anchor.y - ratioY * h, w, h }, base)
}

export function panView(view, base, dx, dy) {
  return keepCenterInside({ ...view, x: view.x + dx, y: view.y + dy }, base)
}

export function centerOn(view, base, x, y) {
  return keepCenterInside({ ...view, x: x - view.w / 2, y: y - view.h / 2 }, base)
}
