import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import TrackMap from '@/components/TrackMap'
import { FIXTURE_NAMES, loadFixture } from '@/lib/dev/track-fixtures'

// Route de développement (break-ui) : éprouve TrackMap avec des données extrêmes. 404 en production.
const WIDTHS = [320, 445, 900]

export default function DevTrackPage({ searchParams }) {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <main className="mx-auto max-w-[1380px] p-6 pb-28">
      <Suspense fallback={<p className="text-mute">Chargement…</p>}>
        <Fixture searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function Fixture({ searchParams }) {
  const { data = 'demo', w = '445' } = await searchParams
  const name = FIXTURE_NAMES.includes(data) ? data : 'demo'
  const width = WIDTHS.includes(Number(w)) ? Number(w) : 445
  const fixture = await loadFixture(name)

  return (
    <>
      <p className="mb-4 text-mute">
        Jeu : <b className="text-ink">{name}</b>, largeur du panneau : <b className="text-ink">{width}px</b>
      </p>
      <div style={{ width }}>
        <TrackMap
          track={fixture.track}
          circuit={fixture.circuit}
          sectorMarks={fixture.sectorMarks ?? null}
          fastestLap={fixture.fastestLap}
        />
      </div>
      <nav className="fixed bottom-4 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-1 rounded-md bg-ink p-1 text-[13px] text-bg">
        {FIXTURE_NAMES.map((fixtureName) => (
          <a
            key={fixtureName}
            href={`?data=${fixtureName}&w=${width}`}
            className={`rounded px-2 py-1 ${fixtureName === name ? 'bg-bg text-ink' : ''}`}
          >
            {fixtureName}
          </a>
        ))}
        <span className="px-1">|</span>
        {WIDTHS.map((candidate) => (
          <a
            key={candidate}
            href={`?data=${name}&w=${candidate}`}
            className={`rounded px-2 py-1 ${candidate === width ? 'bg-bg text-ink' : ''}`}
          >
            {candidate}
          </a>
        ))}
      </nav>
    </>
  )
}
