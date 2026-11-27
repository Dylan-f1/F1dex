import { splitSlots } from '@/lib/digit-slots'

// Valeur chiffrée qui ne bouge pas quand elle change (voir lib/digit-slots.js). Les lecteurs d'écran reçoivent le
// texte d'un seul tenant ; `spoken={false}` là où la valeur leur est déjà masquée. `struck` barre un temps supprimé :
// `line-through` ne traverse pas les cases (blocs en ligne), le trait est donc dessiné par-dessus.
export default function Digits({ value, spoken = true, struck = false }) {
  const text = String(value)
  return (
    <>
      <span aria-hidden="true" className="relative inline-block whitespace-nowrap">
        {splitSlots(text).map(({ char, className }, index) => (
          <span key={index} className={className}>
            {char}
          </span>
        ))}
        {struck && <span data-struck className="absolute inset-x-0 top-1/2 h-0.5 bg-current" />}
      </span>
      {spoken && <span className="sr-only">{text}</span>}
    </>
  )
}
