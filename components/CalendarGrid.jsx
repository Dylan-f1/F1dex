'use client'

import Link from 'next/link'
import { useState } from 'react'
import { FAVORITE_KINDS } from '@/lib/favorites'
import { countryNameFr, formatDateLong } from '@/lib/format'
import { useFavorites } from '@/lib/use-favorites'
import FavoriteButton from './FavoriteButton'

const FILTER_BUTTON =
  'px-4 py-2 font-display text-lg font-bold bg-panel text-ink aria-pressed:bg-white aria-pressed:text-bg focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest'

// Calendrier avec filtre « Favoris ». Le filtre est un état local : le serveur ne connaît pas
// les favoris (ils vivent dans le navigateur), donc pas de paramètre d'URL.
export default function CalendarGrid({ races }) {
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false)
  const { isFavorite } = useFavorites(FAVORITE_KINDS.RACES)

  const favoriteCount = races.filter((race) => isFavorite(race.sessionKey)).length
  const visibleRaces = showOnlyFavorites ? races.filter((race) => isFavorite(race.sessionKey)) : races

  return (
    <>
      <div role="group" aria-label="Filtrer le calendrier" className="mt-7 flex gap-[3px]">
        <button
          type="button"
          aria-pressed={!showOnlyFavorites}
          onClick={() => setShowOnlyFavorites(false)}
          className={FILTER_BUTTON}
        >
          Toutes ({races.length})
        </button>
        <button
          type="button"
          aria-pressed={showOnlyFavorites}
          onClick={() => setShowOnlyFavorites(true)}
          className={FILTER_BUTTON}
        >
          Favoris ({favoriteCount})
        </button>
      </div>

      {visibleRaces.length === 0 ? (
        <p className="mt-6 max-w-[60ch] text-mute">
          Aucun favori pour l’instant. Clique sur l’étoile d’un Grand Prix pour l’ajouter.
        </p>
      ) : (
        <ol className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-[3px]">
          {visibleRaces.map((race) => (
            <li key={race.sessionKey} className="group relative">
              <Link
                href={`/gp/${race.sessionKey}`}
                className="flex h-full flex-col gap-1 bg-panel p-4 group-hover:bg-white group-hover:text-bg focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest"
              >
                <span className="mb-2 grid h-8 w-[52px] place-items-center bg-white font-display text-xl font-extrabold text-bg italic group-hover:bg-bg group-hover:text-ink [clip-path:polygon(0_0,100%_0,calc(100%_-_9px)_100%,0_100%)]">
                  {race.round}
                </span>
                <strong className="font-display text-[26px] leading-[1.05] font-bold">{race.circuit}</strong>
                <span className="text-mute group-hover:text-bg">{countryNameFr(race.country)}</span>
                <span className="text-mute group-hover:text-bg">{formatDateLong(race.date)}</span>
              </Link>
              <FavoriteButton
                kind={FAVORITE_KINDS.RACES}
                id={race.sessionKey}
                label={race.circuit}
                className="absolute top-2 right-2"
              />
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
