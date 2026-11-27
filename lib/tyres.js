// Pneus de la conduite : trois gommes, leur adhérence et leur usure. Module pur, testé avec `node --test`.
// Réglages de jeu (pas des données Pirelli) : tout se règle ici.

import { maxLateralAccel } from './car-physics.js'

// `grip` : adhérence à neuf (multiplicateur ; le medium neuf vaut exactement la voiture sans usure). `life` : part de
// la distance de course au bout de laquelle le train est usé à 100 %.
export const COMPOUNDS = {
  SOFT: { grip: 1.04, life: 0.45 },
  MEDIUM: { grip: 1, life: 0.7 },
  HARD: { grip: 0.97, life: 1.05 },
}
export const COMPOUND_IDS = Object.keys(COMPOUNDS)
export const DEFAULT_COMPOUND = 'MEDIUM'

export const TYRE_WEAR = {
  freeLaps: 5, // en roulage libre, l'usure est celle d'une course de cinq tours
  minDistance: 4000, // m : une course très courte ne détruit pas les pneus en un tour
  fade: 0.06, // adhérence perdue de façon régulière jusqu'à 100 % d'usure
  cliffFrom: 0.7, // usure à partir de laquelle le pneu « s'écroule »
  cliff: 0.14, // adhérence perdue en plus, entre ce seuil et 100 %
}
const SLIDE_FULL = 0.12 // rapport vitesse latérale / vitesse qui compte comme une franche glissade

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const compoundOr = (id, fallback = DEFAULT_COMPOUND) => (id in COMPOUNDS ? id : fallback)

// Gomme proposée d'office pour l'arrêt : une autre que celle montée au départ.
export const suggestedNext = (compound) => (compound === 'MEDIUM' ? 'HARD' : 'MEDIUM')

// Distance (m) que fait un train avant 100 % d'usure. `laps` : tours de course, ou null en roulage libre.
export function tyreLife(compound, { laps, length }) {
  const distance = Math.max((laps ?? TYRE_WEAR.freeLaps) * length, TYRE_WEAR.minDistance)
  return distance * COMPOUNDS[compoundOr(compound)].life
}

// Adhérence d'un train (multiplicateur) selon son usure, de 0 (neuf) à 1.
export function tyreGrip(compound, wear) {
  const { fade, cliffFrom, cliff } = TYRE_WEAR
  const used = clamp(wear, 0, 1)
  const collapse = Math.max(0, (used - cliffFrom) / (1 - cliffFrom))
  return COMPOUNDS[compoundOr(compound)].grip * (1 - fade * used - cliff * collapse)
}

// Fatigue infligée au pneu à cet instant : autour de 1 en roulant normalement, plus en virage appuyé et en glissade.
export function wearStress({ u, v, r }) {
  const speed = Math.abs(u)
  const lateral = Math.min(1, Math.abs(u * r) / maxLateralAccel(speed))
  const slide = Math.min(1, Math.abs(v) / Math.max(speed, 8) / SLIDE_FULL)
  return 0.8 + 0.5 * lateral + 0.8 * slide
}

export const addWear = (wear, distance, life, stress = 1) => Math.min(1, wear + (distance * stress) / life)
