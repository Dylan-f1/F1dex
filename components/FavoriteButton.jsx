'use client'

import { useFavorites } from '@/lib/use-favorites'

const STAR_PATH =
  'M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z'

// Étoile de favori. Le libellé reste fixe (« Favori : Las Vegas ») et l'état passe par aria-pressed,
// pour qu'un lecteur d'écran n'annonce pas deux noms différents pour le même bouton.
export default function FavoriteButton({ kind, id, label, className = '' }) {
  const { isFavorite, toggle } = useFavorites(kind)
  const isPressed = isFavorite(id)

  return (
    <button
      type="button"
      aria-pressed={isPressed}
      aria-label={`Favori : ${label}`}
      onClick={() => toggle(id)}
      className={`grid size-10 place-items-center focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest ${className}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" strokeWidth="1.6" strokeLinejoin="round">
        <path
          d={STAR_PATH}
          className={isPressed ? 'fill-tyre-medium stroke-bg' : 'fill-none stroke-mute group-hover:stroke-bg'}
        />
      </svg>
    </button>
  )
}
