// Logos et inscriptions des voitures du garage : quoi, où, de quelle couleur. Module pur, testé avec
// `node --test` ; components/car-decals.js les pose sur la carrosserie. Les logos et les noms sont des marques de
// leurs propriétaires ; fichiers, sources et licences : public/logos/SOURCES.md.

// `colours` : couleurs du logo d'origine ; il est gardé tel quel si elles se détachent assez du fond, sinon repeint
// d'une seule couleur. `mono` : toujours repeint. Sans `colours` : toujours gardé.
export const LOGOS = {
  alpine: { mono: true },
  aramco: { mono: true },
  atlassian: { mono: true },
  bwt: { mono: true },
  chrome: {},
  haas: { colours: ['#e4002b', '#000000'] },
  hp: { mono: true },
  mclaren: { mono: true },
  mercedes: { mono: true },
  moneygram: { colours: ['#e31b23', '#000000'] },
  oracle: { mono: true },
  'red-bull': { colours: ['#d5003a'] },
  visa: { colours: ['#00579f'] },
  williams: { mono: true },
}

// Par écurie (noms de l'API OpenF1) : inscription principale (pontons, volet arrière) et seconde (capot, dérives).
// `text` : nom écrit dans la police du site, faute de logo utilisable sur Wikimedia Commons. Kick Sauber : le logo
// disponible porte « Stake », une marque de casino en ligne, d'où le nom seul.
export const TEAM_MARKS = {
  'Red Bull Racing': [{ logo: 'red-bull' }, { logo: 'oracle' }],
  McLaren: [{ logo: 'mclaren' }, { logo: 'chrome' }],
  Ferrari: [{ text: 'FERRARI' }, { logo: 'hp' }],
  Mercedes: [{ logo: 'mercedes' }, { text: 'PETRONAS' }],
  'Aston Martin': [{ logo: 'aramco' }, { text: 'ASTON MARTIN' }],
  Alpine: [{ logo: 'bwt' }, { logo: 'alpine' }],
  Williams: [{ logo: 'atlassian' }, { logo: 'williams' }],
  'Haas F1 Team': [{ logo: 'moneygram' }, { logo: 'haas' }],
  'Kick Sauber': [{ text: 'KICK SAUBER' }, { text: 'KICK SAUBER' }],
  'Racing Bulls': [{ logo: 'visa' }, { text: 'RACING BULLS' }],
}

const SIDES = [
  ['droite', 1],
  ['gauche', -1],
]
const FLAP_ANGLE = 0.5 // rad : inclinaison du volet arrière (voir lib/car-body.js)

// Emplacements, dans le repère de la voiture (x vers l'avant, z vers la droite, en mètres). `part` : zone de livrée
// qui donne le fond (et, sur la voiture construite en code, pièce visée) ; `normal` : côté d'où on lit ; `up` : haut
// de l'inscription ; `size` : largeur et hauteur à ne pas dépasser ; `depth` : profondeur de projection.

// Voiture construite en code (lib/car-body.js).
export const SLOTS = [
  ...SIDES.map(([name, side]) => ({
    id: `ponton-${name}`, mark: 0, part: 'livery', position: [0.04, 0.41, side * 0.745], normal: [0, 0, side], up: [0, 1, 0], size: [0.84, 0.23], depth: 0.3,
  })),
  ...SIDES.map(([name, side]) => ({
    id: `capot-${name}`, mark: 1, part: 'livery', position: [-0.5, 0.695, side * 0.2], normal: [0, 0, side], up: [0, 1, 0], size: [0.42, 0.13], depth: 0.16,
  })),
  ...SIDES.map(([name, side]) => ({
    id: `derive-${name}`, mark: 1, part: 'wing', position: [-2.57, 0.9, side * 0.525], normal: [0, 0, side], up: [0, 1, 0], size: [0.3, 0.12], depth: 0.016,
  })),
  {
    id: 'volet', mark: 0, part: 'trim', position: [-2.68, 0.956, 0],
    normal: [Math.sin(FLAP_ANGLE), Math.cos(FLAP_ANGLE), 0], up: [-Math.cos(FLAP_ANGLE), Math.sin(FLAP_ANGLE), 0], size: [0.62, 0.12], depth: 0.03,
  },
  { id: 'nez', mark: 'number', part: 'livery', position: [1.9, 0.45, 0], normal: [0.196, 0.981, 0], up: [-0.981, 0.196, 0], size: [0.2, 0.24], depth: 0.2 },
]

// Modèle 3D (public/models/f1.glb), une fois mis à ses proportions : emplacements mesurés sur sa surface, à
// remesurer si le fichier change. Rien sur le dessus de l'aileron arrière : trop déchiqueté, le texte y est haché.
export const MODEL_SLOTS = [
  ...SIDES.map(([name, side]) => ({
    id: `ponton-${name}`, mark: 0, part: 'livery', position: [-0.25, 0.47, side * 0.75], normal: [0, 0, side], up: [0, 1, 0], size: [0.84, 0.22], depth: 0.34,
  })),
  ...SIDES.map(([name, side]) => ({
    id: `capot-${name}`, mark: 1, part: 'livery', position: [-1.02, 0.76, side * 0.17], normal: [0, 0.45, side * 0.89], up: [0, 0.89, side * -0.45], size: [0.5, 0.13], depth: 0.2,
  })),
  ...SIDES.map(([name, side]) => ({
    id: `derive-${name}`, mark: 1, part: 'wing', position: [-2.5, 0.865, side * 0.495], normal: [0, 0, side], up: [0, 1, 0], size: [0.4, 0.13], depth: 0.05,
  })),
  { id: 'nez', mark: 'number', part: 'livery', position: [1.9, 0.58, 0], normal: [0.3, 0.954, 0], up: [-0.954, 0.3, 0], size: [0.18, 0.24], depth: 0.2 },
]

// Zone de livrée (lib/liveries.js) qui peint chaque matière.
const ZONES = { livery: 'base', wing: 'wing', trim: 'trim' }
const LIGHT = '#f4f6f8'
const DARK = '#14171a'
// Contraste minimal pour garder les couleurs d'origine d'un logo.
const KEEP_CONTRAST = 3

function relativeLuminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(first, second) {
  const [high, low] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a)
  return (high + 0.05) / (low + 0.05)
}

// Couleur à appliquer à une inscription sur ce fond ; `null` : garder les couleurs d'origine du logo.
export function markColour(mark, background) {
  const logo = mark.logo && LOGOS[mark.logo]
  if (logo && !logo.mono && (logo.colours ?? []).every((colour) => contrast(colour, background) >= KEEP_CONTRAST)) return null
  return contrast(LIGHT, background) >= contrast(DARK, background) ? LIGHT : DARK
}

// Tout ce qu'il faut poser pour une écurie { name, drivers } dans la livrée { base, wing, trim }, aux emplacements
// `slots` de la voiture affichée. Le numéro est celui du premier pilote de la liste.
export function decalPlan(team, livery, slots = SLOTS) {
  const marks = TEAM_MARKS[team?.name]
  const number = team?.drivers?.[0]?.number
  return slots.flatMap((slot) => {
    const mark = slot.mark === 'number' ? Number.isInteger(number) && { text: String(number) } : marks?.[slot.mark]
    if (!mark) return []
    return [{ ...slot, content: mark, colour: markColour(mark, livery[ZONES[slot.part]]) }]
  })
}
