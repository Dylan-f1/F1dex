import { Saira_Condensed, Saira_Semi_Condensed } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const sairaCondensed = Saira_Condensed({
  subsets: ['latin'],
  // Pas d'italique réel chez Google : la classe `italic` donne l'inclinaison synthétique de la maquette.
  weight: ['500', '700', '800'],
  variable: '--font-saira-condensed',
  display: 'swap',
})

const sairaSemiCondensed = Saira_Semi_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-saira-semi',
  display: 'swap',
})

export const metadata = {
  title: 'SpeedTrack Paddock',
  description: 'Stratégie pneus, arrêts aux stands et temps au tour de chaque Grand Prix.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${sairaCondensed.variable} ${sairaSemiCondensed.variable}`}>
      <body className="min-h-screen bg-bg font-text text-base text-ink antialiased">
        <header className="mx-auto flex max-w-[1380px] items-baseline gap-6 px-[clamp(12px,3vw,40px)] pt-3">
          <Link
            href="/"
            className="font-display text-xl font-extrabold tracking-wide uppercase italic focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest"
          >
            SpeedTrack Paddock
          </Link>
          <Link
            href="/garage"
            className="font-display text-lg font-bold text-mute hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest"
          >
            Garage
          </Link>
        </header>
        {children}
      </body>
    </html>
  )
}
