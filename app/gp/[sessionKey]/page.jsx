import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import DuelPanel from '@/components/DuelPanel'
import FavoriteButton from '@/components/FavoriteButton'
import LowerThird from '@/components/LowerThird'
import RaceFacts from '@/components/RaceFacts'
import Ribbon from '@/components/Ribbon'
import Tower from '@/components/Tower'
import TrackMap, { TrackMapFallback } from '@/components/TrackMap'
import { FAVORITE_KINDS } from '@/lib/favorites'
import { countryNameFr, formatDateLong } from '@/lib/format'
import { getTrack } from '@/lib/multiviewer'
import { buildSectorMarks } from '@/lib/track'
import { getCalendar, getRace, getSectorCrossings } from '@/lib/openf1'

const PAGE_PADDING = 'mx-auto max-w-[1380px] px-[clamp(12px,3vw,40px)] pb-[72px]'
// Deux colonnes au-dessus de 1000 px : faits + tour à gauche, tracé + duel à droite. Les colonnes
// s'étirent sur toute la hauteur (pas d'items-start) : c'est ce qui permet au duel de rester collant
// pendant qu'on fait défiler la tour. En dessous de 1000 px, les colonnes disparaissent (contents) et
// les blocs se suivent dans l'ordre faits, tracé, tour, duel (order négatif, le duel reste à 0).
const PAGE_GRID = 'grid gap-7 min-[1001px]:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)] min-[1001px]:gap-x-8'
const COLUMN = 'contents min-[1001px]:block'

export default function RacePage({ params }) {
  return (
    <main className={PAGE_PADDING}>
      <Suspense fallback={<RaceLoading />}>
        <Race params={params} />
      </Suspense>
    </main>
  )
}

function RaceLoading() {
  return (
    <p className="mt-8 text-mute" role="status">
      Chargement de la course depuis OpenF1. La première visite prend quelques secondes.
    </p>
  )
}

async function Race({ params }) {
  const { sessionKey } = await params
  const calendar = await getCalendar()
  const race = await getRace(sessionKey)
  if (!race) notFound()

  const round = calendar.findIndex((entry) => entry.sessionKey === race.sessionKey) + 1
  const hasResults = race.results.length > 0

  return (
    <>
      <Ribbon calendar={calendar} currentSessionKey={race.sessionKey} />
      <LowerThird
        title={race.circuit}
        headline={countryNameFr(race.country)}
        details={`${formatDateLong(race.date)}${
          race.totalLaps ? `, ${race.totalLaps} tours` : ''
        }${round ? `, manche ${round} sur ${calendar.length}` : ''}`}
        action={<FavoriteButton kind={FAVORITE_KINDS.RACES} id={race.sessionKey} label={race.circuit} />}
      />
      <div className={`mt-[3px] ${PAGE_GRID}`}>
        <div className={COLUMN}>
          <div className="max-[1000px]:order-[-3]">
            <RaceFacts weather={race.weather} fastestLap={race.fastestLap} />
          </div>
          {hasResults ? (
            <div className="min-[1001px]:mt-7 max-[1000px]:order-[-1]">
              <Tower results={race.results} totalLaps={race.totalLaps} />
            </div>
          ) : (
            <p className="mt-5 text-mute">Cette course n’a pas encore de résultats.</p>
          )}
        </div>
        <div className={COLUMN}>
          <div className="max-[1000px]:order-[-2] min-[1001px]:mb-7 empty:hidden">
            <Suspense fallback={<TrackMapFallback />}>
              <TrackSection
                key={race.sessionKey}
                circuitKey={race.circuitKey}
                year={race.year}
                circuit={race.circuit}
                sessionKey={race.sessionKey}
                fastestLap={race.fastestLap}
                drivers={race.results}
              />
            </Suspense>
          </div>
          {hasResults && (
            <DuelPanel drivers={race.results} fastestLap={race.fastestLap} totalLaps={race.totalLaps} />
          )}
        </div>
      </div>
    </>
  )
}

// Le tracé vient d'un service tiers : il se charge dans son propre Suspense pour ne jamais retarder la fiche.
// Les secteurs sont un second bonus : sans position de la voiture, on garde le tracé seul.
async function findSectorMarks(track, sessionKey, fastestLap) {
  if (!fastestLap?.sectors) return null
  const [first, second] = fastestLap.sectors
  try {
    const crossings = await getSectorCrossings(sessionKey, fastestLap.number, fastestLap.startedAt, first, second)
    return buildSectorMarks(track, crossings)
  } catch {
    return null
  }
}

async function TrackSection({ circuitKey, year, circuit, sessionKey, fastestLap, drivers }) {
  const track = await getTrack(circuitKey, year)
  if (!track) return null
  const sectorMarks = await findSectorMarks(track, sessionKey, fastestLap)
  return (
    <TrackMap
      track={track}
      circuit={circuit}
      sectorMarks={sectorMarks}
      fastestLap={fastestLap}
      sessionKey={sessionKey}
      drivers={drivers.map(({ number, code, lastName, colour, laps }) => ({ number, code, lastName, colour, laps }))}
    />
  )
}
