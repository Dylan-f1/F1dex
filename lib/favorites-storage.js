// Adaptateur de stockage des favoris (navigateur). Seul fichier qui touche localStorage :
// pour changer de support (cookie, API, base), on ne modifie que celui-ci.

const STORAGE_KEY_PREFIX = 'f1dex:favorites:'

// Repli en mémoire quand localStorage est inaccessible (navigation privée, stockage bloqué).
const memoryFallback = new Map()

function storageKey(kind) {
  return `${STORAGE_KEY_PREFIX}${kind}`
}

export function readRawFavorites(kind) {
  try {
    return window.localStorage.getItem(storageKey(kind))
  } catch {
    return memoryFallback.get(kind) ?? null
  }
}

export function writeRawFavorites(kind, raw) {
  memoryFallback.set(kind, raw)
  try {
    window.localStorage.setItem(storageKey(kind), raw)
  } catch {
    // Le repli en mémoire suffit : les favoris durent le temps de la session.
  }
}
