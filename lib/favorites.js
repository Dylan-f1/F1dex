// Logique pure des favoris : aucune dépendance à React, au navigateur ni au stockage.
// Les identifiants sont des nombres (sessionKey d'une course) ou des chaînes (futur : code pilote).

export const FAVORITE_KINDS = {
  RACES: 'races',
}

function isValidId(value) {
  return typeof value === 'number' || typeof value === 'string'
}

// Le contenu du stockage est une donnée externe : on ne lui fait jamais confiance.
export function parseFavorites(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValidId) : []
  } catch {
    return []
  }
}

export function serializeFavorites(ids) {
  return JSON.stringify(ids)
}

export function toggleFavorite(ids, id) {
  return ids.includes(id) ? ids.filter((existingId) => existingId !== id) : [...ids, id]
}
