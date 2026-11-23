import { cacheLife } from 'next/cache'
import { MULTIVIEWER_CIRCUITS_URL, TRACK_FETCH_TIMEOUT_MS } from './constants'
import { buildTrack } from './track'

const CIRCUIT_KEY_PATTERN = /^\d+$/

// Lève une erreur en cas d'échec : une fonction `use cache` qui lève n'est pas mise en cache,
// donc une panne passagère ne fige pas l'absence de tracé pendant un jour.
async function fetchTrack(circuitKey, year) {
  'use cache'
  cacheLife('days')

  const response = await fetch(`${MULTIVIEWER_CIRCUITS_URL}/${circuitKey}/${year}`, {
    signal: AbortSignal.timeout(TRACK_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`MultiViewer a répondu ${response.status} pour le circuit ${circuitKey}`)
  const track = buildTrack(await response.json())
  if (!track) throw new Error(`Tracé inutilisable pour le circuit ${circuitKey}`)
  return track
}

// Le tracé est un bonus : sans lui la fiche course reste complète, donc on renvoie null.
export async function getTrack(circuitKey, year) {
  if (!CIRCUIT_KEY_PATTERN.test(String(circuitKey))) return null
  try {
    return await fetchTrack(circuitKey, year)
  } catch {
    return null
  }
}
