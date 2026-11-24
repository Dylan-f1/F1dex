// Meilleur tour par circuit, gardé dans le navigateur (localStorage). Les fonctions reçoivent le stockage en
// paramètre : testables sans navigateur, et tolérantes aux pannes (navigation privée, stockage plein ou bloqué).
import { PHYSICS_VERSION } from './car-drive.js'

const KEY_PREFIX = 'f1dex.drive.best'
const SECTOR_COUNT = 3

export const bestLapKey = (circuitKey) => `${KEY_PREFIX}.v${PHYSICS_VERSION}.${circuitKey}`

const isTime = (value) => Number.isFinite(value) && value > 0
const isTimeOrNull = (value) => value === null || isTime(value)

// Le contenu vient du disque de l'utilisateur : on ne le croit pas sur parole.
export function isValidBest(record) {
  return (
    record !== null &&
    typeof record === 'object' &&
    isTime(record.time) &&
    Array.isArray(record.sectors) &&
    record.sectors.length === SECTOR_COUNT &&
    record.sectors.every(isTime) &&
    Array.isArray(record.profile) &&
    record.profile.length < 5000 &&
    record.profile.every(isTimeOrNull)
  )
}

export function loadBest(storage, circuitKey) {
  try {
    const raw = storage?.getItem(bestLapKey(circuitKey))
    if (!raw) return null
    const record = JSON.parse(raw)
    return isValidBest(record) ? record : null
  } catch {
    return null
  }
}

const toMillis = (value) => (value === null ? null : Math.round(value * 1000) / 1000)

// Renvoie vrai si l'enregistrement a réussi.
export function saveBest(storage, circuitKey, { time, sectors, profile }) {
  try {
    const record = { time: toMillis(time), sectors: sectors.map(toMillis), profile: profile.map(toMillis) }
    if (!isValidBest(record)) return false
    storage.setItem(bestLapKey(circuitKey), JSON.stringify(record))
    return true
  } catch {
    return false
  }
}
