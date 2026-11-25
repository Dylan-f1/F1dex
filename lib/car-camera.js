// Angles de caméra de la visionneuse (comme les caméras d'une retransmission) et interpolation
// entre deux positions. Module pur, sans three.js. Repère identique à car-model.js (x vers l'avant).

export const CAMERA_TARGET = [0, 0.45, 0]

export const CAMERA_VIEWS = [
  { id: 'avant', label: '3/4 avant', position: [5.2, 2.0, 5.4] },
  { id: 'profil', label: 'Profil', position: [0.4, 0.9, 8.8] },
  { id: 'dessus', label: 'Dessus', position: [0.3, 11, 1.0] },
  { id: 'arriere', label: '3/4 arrière', position: [-5.4, 1.9, -5.2] },
]

export const DEFAULT_VIEW = CAMERA_VIEWS[0]
export const VIEW_TRANSITION_MS = 600

// Champ de vision vertical du showroom (degrés) selon les proportions du cadre (largeur / hauteur). Sous
// `SHOWROOM_ASPECT` (téléphone en portrait), on l'ouvre pour garder la même largeur visible, donc la voiture
// entière ; au-delà d'une certaine ouverture la perspective se déforme, on plafonne.
export const SHOWROOM_FOV = 32
const SHOWROOM_ASPECT = 1.5
const SHOWROOM_MAX_FOV = 66

export function showroomFov(aspect) {
  if (!(aspect > 0) || aspect >= SHOWROOM_ASPECT) return SHOWROOM_FOV
  const half = Math.tan((SHOWROOM_FOV * Math.PI) / 360)
  return Math.min(SHOWROOM_MAX_FOV, (Math.atan((half * SHOWROOM_ASPECT) / aspect) * 360) / Math.PI)
}

export function easeOutCubic(progress) {
  const clamped = Math.min(1, Math.max(0, progress))
  return 1 - (1 - clamped) ** 3
}

// Position intermédiaire entre deux points, progress de 0 (départ) à 1 (arrivée).
export function lerpPoint(from, to, progress) {
  return from.map((value, axis) => value + (to[axis] - value) * progress)
}
