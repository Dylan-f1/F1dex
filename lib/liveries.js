// Livrées des écuries pour la voiture 3D : quatre zones de couleur. Les logos et inscriptions sont décrits à part
// (lib/decals.js).
//   base   carrosserie (nez, capot, pontons)
//   wing   ailerons avant et arrière
//   trim   bout du nez et bande basse des pontons
//   spine  arête centrale du capot moteur
// Couleurs approchées des livrées 2025 (à valider à l'œil : elles viennent de la mémoire des voitures, pas d'une
// charte officielle). Une écurie absente de la table garde sa couleur OpenF1 sur toute la carrosserie.
// Les noms sont ceux de l'API OpenF1 (`team_name`).

export const LIVERIES = {
  'Red Bull Racing': { base: '#1b2a5e', wing: '#d6202c', trim: '#f4c20d', spine: '#d6202c' },
  McLaren: { base: '#ff8000', wing: '#ff8000', trim: '#0b2f78', spine: '#0b2f78' },
  Ferrari: { base: '#dc0000', wing: '#dc0000', trim: '#f4f4f2', spine: '#f4f4f2' },
  Mercedes: { base: '#b8bfc7', wing: '#14171a', trim: '#27f4d2', spine: '#14171a' },
  'Aston Martin': { base: '#00594f', wing: '#00594f', trim: '#cedc00', spine: '#cedc00' },
  Alpine: { base: '#1b5fb8', wing: '#1b5fb8', trim: '#ff87bc', spine: '#ff87bc' },
  Williams: { base: '#1a4b9c', wing: '#00a0dd', trim: '#f4f4f2', spine: '#f4f4f2' },
  'Haas F1 Team': { base: '#eceef0', wing: '#e10600', trim: '#14171a', spine: '#e10600' },
  'Kick Sauber': { base: '#52e252', wing: '#111315', trim: '#111315', spine: '#111315' },
  'Racing Bulls': { base: '#eef1f6', wing: '#1b3d9c', trim: '#e8112d', spine: '#1b3d9c' },
}

const HEX = /^#[0-9a-f]{6}$/

// Livrée d'une écurie { name, colour } : la table si elle la connaît, sinon une seule couleur partout.
export function liveryFor(team) {
  const known = LIVERIES[team?.name]
  if (known) return known
  const colour = HEX.test(team?.colour ?? '') ? team.colour : '#9aa5b5'
  return { base: colour, wing: colour, trim: colour, spine: colour }
}
