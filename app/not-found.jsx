import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto max-w-[1380px] px-[clamp(12px,3vw,40px)] py-10">
      <h1 className="font-display text-[30px] font-extrabold uppercase italic">Course introuvable</h1>
      <p className="mt-2 text-mute">Ce Grand Prix n’existe pas dans les données OpenF1.</p>
      <Link href="/" className="mt-4 inline-block bg-white px-4 py-2 font-display text-lg font-bold text-bg focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest">
        Voir le calendrier
      </Link>
    </main>
  )
}
