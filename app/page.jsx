import { Suspense } from 'react'
import CalendarGrid from '@/components/CalendarGrid'
import LowerThird from '@/components/LowerThird'
import { SEASON_YEAR } from '@/lib/constants'
import { getCalendar } from '@/lib/openf1'

const PAGE_PADDING = 'mx-auto max-w-[1380px] px-[clamp(12px,3vw,40px)] pb-[72px]'

export default function HomePage() {
  return (
    <main className={PAGE_PADDING}>
      <Suspense fallback={<p className="mt-8 text-mute">Chargement du calendrier…</p>}>
        <Season />
      </Suspense>
    </main>
  )
}

async function Season() {
  const calendar = await getCalendar()
  const races = calendar.map((race, index) => ({ ...race, round: index + 1 }))

  return (
    <>
      <LowerThird
        title={`Saison ${SEASON_YEAR}`}
        headline={`${calendar.length} Grands Prix`}
        details="Choisis une course pour voir la stratégie pneus et les temps au tour."
      />
      <CalendarGrid races={races} />
    </>
  )
}
