'use client'

export default function RaceError({ reset }) {
  return (
    <main className="mx-auto max-w-[1380px] px-[clamp(12px,3vw,40px)] py-10">
      <h1 className="font-display text-[30px] font-extrabold uppercase italic">Course indisponible</h1>
      <p className="mt-2 max-w-[60ch] text-mute">
        OpenF1 ne répond pas ou limite les requêtes. Réessaie dans quelques secondes.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 bg-white px-4 py-2 font-display text-lg font-bold text-bg hover:bg-tyre-medium focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest"
      >
        Réessayer
      </button>
    </main>
  )
}
