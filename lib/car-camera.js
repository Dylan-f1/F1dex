// Angles de caméra de la visionneuse (comme les caméras d'une retransmission) et interpolation
// entre deux positions. Module pur, sans three.js. Repère identique à car-model.js (x vers l'avant).

export const CAMERA_TARGET = [0, 0.45, 0]

export const CAMERA_VIEWS = [
  { id: 'avant', label: '3/4 avant', position: [4.6, 1.8, 4.8] },
  { id: 'profil', label: 'Profil', position: [0.4, 0.9, 7.6] },
  { id: 'dessus', label: 'Dessus', position: [0.3, 9.4, 1.0] },
  { id: 'arriere', label: '3/4 arrière', position: [-4.8, 1.7, -4.6] },
]

export const DEFAULT_VIEW = CAMERA_VIEWS[0]
export const VIEW_TRANSITION_MS = 600

export function easeOutCubic(progress) {
  const clamped = Math.min(1, Math.max(0, progress))
  return 1 - (1 - clamped) ** 3
}

// Position intermédiaire entre deux points, progress de 0 (départ) à 1 (arrivée).
export function lerpPoint(from, to, progress) {
  return from.map((value, axis) => value + (to[axis] - value) * progress)
}
