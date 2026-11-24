// Monoplace de F1 stylisée, décrite comme une liste de pièces (module pur : pas de three.js ici, donc
// testable sans WebGL). Le composant 3D transforme chaque pièce en maillage.
//
// Repère : mètres, x vers l'avant, y vers le haut, z vers la droite. Proportions du règlement 2022-2025 (FIA) :
// largeur et empattement au plus 2,0 m et 3,6 m (1,9 m et 3,4 m en 2026), roues de 18 pouces (pneu d'environ
// 0,72 m de diamètre), pneu avant de 305 mm et arrière de 405 mm.
//
// Une pièce : { name, shape, size, position, rotation?, scale?, material, points? }.
//   shape 'box' : size = [longueur x, hauteur y, largeur z]
//   shape 'roundedBox' : size = [x, y, z, rayon des arrondis]
//   shape 'cylinder' : size = [rayon haut, rayon bas, hauteur, segments] ; l'axe est y avant rotation
//   shape 'sphere' : size = [rayon]
//   shape 'tube' : points = [[x, y, z], ...], size = [rayon]
// Rôles de matière : livery (couleur de l'écurie), accent, carbon, tyre, rim, metal, helmet.

const HALF_PI = Math.PI / 2

export const PART_SHAPES = ['box', 'roundedBox', 'cylinder', 'sphere', 'tube']
export const MATERIAL_ROLES =['livery', 'accent', 'carbon', 'tyre', 'rim', 'metal', 'helmet']

const FRONT_AXLE_X = 1.85
const REAR_AXLE_X = -1.75
const FRONT_TYRE = { radius: 0.36, width: 0.305, z: 0.8 }
const REAR_TYRE = { radius: 0.36, width: 0.405, z: 0.78 }

// Symétrie gauche/droite : même pièce avec z inversé.
function mirror(part) {
  const flip = (position) => [position[0], position[1], -position[2]]
  return {
    ...part,
    name: `${part.name}-droite`,
    position: flip(part.position),
    points: part.points?.map(flip),
  }
}

function withSides(part) {
  return [{ ...part, name: `${part.name}-gauche` }, mirror(part)]
}

function wheel(name, axleX, tyre) {
  const common = { position: [axleX, tyre.radius, tyre.z], rotation: [HALF_PI, 0, 0] }
  return [
    ...withSides({ name: `${name}-pneu`, shape: 'cylinder', size: [tyre.radius, tyre.radius, tyre.width, 32], material: 'tyre', ...common }),
    ...withSides({ name: `${name}-jante`, shape: 'cylinder', size: [0.23, 0.23, tyre.width + 0.012, 24], material: 'rim', ...common }),
  ]
}

function suspension(prefix, axleX, tyre, tubX) {
  const hub = [axleX, tyre.radius, tyre.z - tyre.width / 2]
  return [
    ...withSides({ name: `${prefix}-bras-haut`, shape: 'tube', size: [0.014], position: [0, 0, 0], points: [[tubX + 0.1, 0.46, 0.22], hub], material: 'carbon' }),
    ...withSides({ name: `${prefix}-bras-bas`, shape: 'tube', size: [0.014], position: [0, 0, 0], points: [[tubX - 0.1, 0.22, 0.22], hub], material: 'carbon' }),
  ]
}

export function buildCarParts() {
  return [
    // Fond plat et diffuseur
    { name: 'fond', shape: 'roundedBox', size: [4.4, 0.06, 1.5, 0.02], position: [-0.05, 0.1, 0], material: 'carbon' },
    { name: 'diffuseur', shape: 'box', size: [0.8, 0.1, 1.0], position: [-2.4, 0.2, 0], rotation: [0, 0, 0.18], material: 'carbon' },

    // Monocoque, nez, cockpit
    { name: 'monocoque', shape: 'roundedBox', size: [1.9, 0.42, 0.5, 0.1], position: [0.6, 0.42, 0], material: 'livery' },
    { name: 'nez', shape: 'cylinder', size: [0.06, 0.22, 1.25, 24], position: [2.12, 0.33, 0], rotation: [0, 0, -HALF_PI], material: 'livery' },
    { name: 'cockpit', shape: 'box', size: [0.7, 0.04, 0.32], position: [0.45, 0.635, 0], material: 'carbon' },
    { name: 'casque', shape: 'sphere', size: [0.15], position: [0.4, 0.72, 0], material: 'helmet' },

    // Pontons et capot moteur
    ...withSides({ name: 'ponton', shape: 'roundedBox', size: [1.55, 0.42, 0.46, 0.1], position: [-0.15, 0.34, 0.5], material: 'livery' }),
    ...withSides({ name: 'entree-ponton', shape: 'box', size: [0.04, 0.22, 0.34], position: [0.64, 0.36, 0.5], material: 'carbon' }),
    ...withSides({ name: 'liseré-ponton', shape: 'box', size: [1.2, 0.035, 0.012], position: [-0.2, 0.42, 0.735], material: 'accent' }),
    { name: 'capot', shape: 'cylinder', size: [0.05, 0.24, 2.1, 24], position: [-1.15, 0.58, 0], rotation: [0, 0, HALF_PI], scale: [1, 1, 0.85], material: 'livery' },
    { name: 'prise-air', shape: 'roundedBox', size: [0.5, 0.34, 0.32, 0.06], position: [-0.05, 0.74, 0], material: 'livery' },
    { name: 'entree-prise-air', shape: 'box', size: [0.03, 0.22, 0.22], position: [0.21, 0.76, 0], material: 'carbon' },

    // Arceau de protection (halo)
    ...withSides({
      name: 'halo',
      shape: 'tube',
      size: [0.022],
      position: [0, 0, 0],
      points: [[0.9, 0.66, 0.02], [0.78, 0.88, 0.02], [0.45, 0.9, 0.24], [0.05, 0.72, 0.28]],
      material: 'metal',
    }),

    // Aileron avant
    { name: 'aileron-avant', shape: 'box', size: [0.42, 0.035, 1.95], position: [2.62, 0.1, 0], material: 'carbon' },
    { name: 'volet-avant-1', shape: 'box', size: [0.28, 0.03, 1.8], position: [2.55, 0.16, 0], rotation: [0, 0, 0.18], material: 'carbon' },
    { name: 'volet-avant-2', shape: 'box', size: [0.22, 0.03, 1.7], position: [2.5, 0.21, 0], rotation: [0, 0, 0.3], material: 'accent' },
    ...withSides({ name: 'dérive-avant', shape: 'box', size: [0.55, 0.22, 0.03], position: [2.55, 0.18, 0.97], material: 'livery' }),

    // Aileron arrière
    { name: 'aileron-arriere', shape: 'box', size: [0.38, 0.03, 1.0], position: [-2.35, 0.95, 0], rotation: [0, 0, -0.12], material: 'carbon' },
    { name: 'volet-arriere', shape: 'box', size: [0.3, 0.03, 1.0], position: [-2.42, 1.08, 0], rotation: [0, 0, -0.35], material: 'accent' },
    ...withSides({ name: 'dérive-arriere', shape: 'box', size: [0.75, 0.5, 0.03], position: [-2.38, 0.86, 0.52], material: 'livery' }),
    { name: 'pilier-arriere', shape: 'box', size: [0.08, 0.4, 0.06], position: [-2.3, 0.72, 0], material: 'carbon' },
    { name: 'aileron-bas', shape: 'box', size: [0.3, 0.025, 0.8], position: [-2.3, 0.42, 0], material: 'carbon' },

    // Roues et suspensions
    ...wheel('avant', FRONT_AXLE_X, FRONT_TYRE),
    ...wheel('arriere', REAR_AXLE_X, REAR_TYRE),
    ...suspension('avant', FRONT_AXLE_X, FRONT_TYRE, 1.7),
    ...suspension('arriere', REAR_AXLE_X, REAR_TYRE, -1.3),
  ]
}

// Couleur d'écurie OpenF1 (« 3671C6 », sans #, parfois absente) vers « #3671c6 ». Repli : gris neutre.
const NEUTRAL_COLOUR = '#9aa5b5'
export function parseTeamColour(value) {
  if (typeof value !== 'string') return NEUTRAL_COLOUR
  const hex = value.trim().replace(/^#/, '')
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : NEUTRAL_COLOUR
}

// Luminance relative (WCAG) d'une couleur « #rrggbb », de 0 (noir) à 1 (blanc).
export function luminance(hex) {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

// Couleur d'accent lisible sur la couleur d'écurie : blanc sur une teinte foncée, presque noir sur une claire.
export function accentFor(liveryHex) {
  return luminance(liveryHex) > 0.4 ? '#14171c' : '#f2f4f7'
}
