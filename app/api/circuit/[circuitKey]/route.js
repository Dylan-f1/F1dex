import { SEASON_YEAR } from '@/lib/constants'
import { getTrack } from '@/lib/multiviewer'
import { RELIEF } from '@/lib/relief-data'

// Points de la ligne centrale d'un circuit (dixièmes de mètre, repère du SVG, dans le sens de la course) pour
// la conduite du garage, et son profil d'altitude (null s'il manque). Le numéro de circuit est validé dans getTrack
// (chiffres seulement).
export async function GET(_request, { params }) {
  const { circuitKey } = await params
  const track = await getTrack(circuitKey, SEASON_YEAR)
  if (!track) return Response.json({ error: 'no-data' }, { status: 404 })
  const relief = RELIEF[circuitKey] ?? null
  return Response.json({ points: track.points, relief }, { headers: { 'Cache-Control': 'public, max-age=86400' } })
}
