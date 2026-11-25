// Ambiances de la conduite : soleil, ciel, brume. Trois directions à comparer par l'adresse
// (`/garage?ciel=soir`) en attendant le choix. Module pur (pas de three.js), testé.
//
// `sun.elevation` : degrés au-dessus de l'horizon. `sun.azimuth` : degrés par rapport au cap de départ (0 = droit
// devant, positif = vers la gauche).

export const AMBIANCES = {
  jour: {
    label: 'Après-midi clair',
    sun: { elevation: 36, azimuth: 104, colour: '#fff0d4', intensity: 2.3 },
    ambient: { sky: '#bcd5ff', ground: '#5c6a42', intensity: 0.65 },
    fill: 0.55,
    sky: { zenith: '#2c66b8', horizon: '#c6d9ea', cloud: '#ffffff', shade: '#9fb0c6', coverage: 0.44, glow: 0.45, disc: 1 },
    fog: { colour: '#c2d4e4', near: 220, far: 1900 },
    mountains: '#4d6272',
  },
  soir: {
    label: 'Fin de journée',
    sun: { elevation: 11, azimuth: 42, colour: '#ffac5c', intensity: 2.7 },
    ambient: { sky: '#8ea2d6', ground: '#4d3a28', intensity: 0.6 },
    fill: 0.55,
    sky: { zenith: '#2d447a', horizon: '#f0a870', cloud: '#ffc79a', shade: '#6d5a80', coverage: 0.4, glow: 1, disc: 1 },
    fog: { colour: '#d99f7c', near: 180, far: 1600 },
    mountains: '#584a68',
  },
  couvert: {
    label: 'Ciel couvert',
    sun: { elevation: 55, azimuth: 150, colour: '#e6ecf2', intensity: 0.75 },
    ambient: { sky: '#d5dde6', ground: '#4c5444', intensity: 1.15 },
    fill: 0.3,
    sky: { zenith: '#7d8894', horizon: '#b9c1c8', cloud: '#d3d8dd', shade: '#666f7b', coverage: 0.88, glow: 0, disc: 0 },
    fog: { colour: '#b2bac1', near: 110, far: 1150 },
    mountains: '#525e66',
  },
}

export const DEFAULT_AMBIANCE = 'jour'

// Nom de l'ambiance demandée dans la partie « ?… » de l'adresse, sinon celle par défaut.
export function pickAmbiance(search) {
  const wanted = new URLSearchParams(search ?? '').get('ciel')
  return Object.hasOwn(AMBIANCES, wanted) ? wanted : DEFAULT_AMBIANCE
}

// Direction du soleil (vecteur unitaire, repère de la piste) pour un départ au cap `heading`.
export function sunVector({ elevation, azimuth }, heading = 0) {
  const up = (elevation * Math.PI) / 180
  const around = heading + (azimuth * Math.PI) / 180
  return { x: Math.cos(up) * Math.cos(around), y: Math.sin(up), z: -Math.cos(up) * Math.sin(around) }
}
