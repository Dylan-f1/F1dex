import { useCallback, useSyncExternalStore } from 'react'
import { parseFavorites, serializeFavorites, toggleFavorite } from './favorites'
import { readRawFavorites, writeRawFavorites } from './favorites-storage'

// useSyncExternalStore exige que getSnapshot renvoie la MÊME référence tant que rien ne change,
// sinon React boucle à l'infini. On ne re-parse donc que si la chaîne stockée a changé.
const EMPTY_FAVORITES = Object.freeze([])
const snapshotsByKind = new Map()
const listeners = new Set()

function getSnapshot(kind) {
  const raw = readRawFavorites(kind)
  const cached = snapshotsByKind.get(kind)
  if (cached && cached.raw === raw) return cached.ids
  const ids = parseFavorites(raw)
  snapshotsByKind.set(kind, { raw, ids })
  return ids
}

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

// L'événement `storage` ne se déclenche que dans les AUTRES onglets : on notifie nous-mêmes
// dans l'onglet courant après une écriture.
function subscribe(listener) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function toggleStoredFavorite(kind, id) {
  const next = toggleFavorite(getSnapshot(kind), id)
  writeRawFavorites(kind, serializeFavorites(next))
  notifyListeners()
}

export function useFavorites(kind) {
  // Côté serveur et à l'hydratation : liste vide, puis mise à jour au montage.
  const ids = useSyncExternalStore(
    subscribe,
    () => getSnapshot(kind),
    () => EMPTY_FAVORITES,
  )
  const isFavorite = useCallback((id) => ids.includes(id), [ids])
  const toggle = useCallback((id) => toggleStoredFavorite(kind, id), [kind])
  return { ids, isFavorite, toggle }
}
