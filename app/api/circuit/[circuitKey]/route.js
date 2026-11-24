import { SEASON_YEAR } from '@/lib/constants'
import { getTrack } from '@/lib/multiviewer'

// Points de la ligne centrale d'un circuit (dixièmes de mètre, repère du SVG, dans le sens de la course) pour
// la conduite du garage. Le numéro de circuit est validé dans getTrack (chiffres seulement).
export async function GET(_request, { params }) {
  const { circuitKey } = await params
  const track = await getTrack(circuitKey, SEASON_YEAR)
  if (!track) return Response.json({ error: 'no-data' }, { status: 404 })
  return Response.json({ points: track.points }, { headers: { 'Cache-Control': 'public, max-age=86400' } })
}
