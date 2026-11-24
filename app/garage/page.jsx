import { Suspense } from 'react'
import CarViewer from '@/components/CarViewer'
import LowerThird from '@/components/LowerThird'
import { SEASON_YEAR } from '@/lib/constants'
import { getCalendar, getTeams } from '@/lib/openf1'

export const metadata = {
  title: 'Garage — F1 Dex',
  description: 'Une monoplace de F1 en 3D, aux couleurs de chaque écurie de la saison.',
}

const PAGE_PADDING = 'mx-auto max-w-[1380px] px-[clamp(12px,3vw,40px)] pb-[72px]'

export default function GaragePage() {
  return (
    <main className={PAGE_PADDING}>
      <LowerThird
        title="Garage"
        headline={`Saison ${SEASON_YEAR}`}
        details="Choisis une écurie et fais tourner sa monoplace."
      />
      <Suspense fallback={<p className="mt-8 text-mute">Chargement des écuries…</p>}>
        <Viewer />
      </Suspense>
    </main>
  )
}

async function Viewer() {
  let teams = []
  try {
    teams = await getTeams()
  } catch {
    // OpenF1 indisponible : la voiture reste visible, aux couleurs neutres.
  }
  // Les circuits de la saison, pour la conduite : sans calendrier on garde seulement le circuit fictif.
  let circuits = []
  try {
    const calendar = await getCalendar()
    circuits = calendar.map((race) => ({ key: String(race.circuitKey), name: race.circuit, country: race.country }))
  } catch {
    // OpenF1 indisponible : pas de choix de circuit.
  }
  return <CarViewer teams={teams} circuits={circuits} />
}
