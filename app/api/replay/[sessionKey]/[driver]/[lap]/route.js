import { getLapReplay } from '@/lib/openf1'

// Positions d'un pilote sur un tour, pour le lecteur du tracé. Les paramètres sont validés dans
// getLapReplay (chiffres seulement). 404 : pas de données ; 502 : OpenF1 ne répond pas.
export async function GET(_request, { params }) {
  const { sessionKey, driver, lap } = await params
  try {
    const replay = await getLapReplay(sessionKey, driver, lap)
    if (!replay) return Response.json({ error: 'no-data' }, { status: 404 })
    return Response.json(replay)
  } catch {
    return Response.json({ error: 'upstream' }, { status: 502 })
  }
}
