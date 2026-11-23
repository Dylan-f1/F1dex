import { LEGEND_COMPOUNDS, TYRES } from '@/lib/constants'

// Petit sommaire de la tour de chrono : ce que veulent dire les couleurs et les repères des barres.
export default function TowerLegend() {
  return (
    <ul
      aria-label="Légende de la tour de chrono"
      className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-mute"
    >
      {LEGEND_COMPOUNDS.map((compound) => (
        <li key={compound} className="flex items-center gap-1.5">
          <span className={`block size-3.5 rounded-full ${TYRES[compound].className}`} />
          {TYRES[compound].label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="block h-3.5 w-0.5 bg-white" />
        Arrêt aux stands
      </li>
      <li>
        <b className="font-display text-ink italic">DNF</b> abandon
      </li>
      <li>
        <b className="font-display text-ink italic">DSQ</b> disqualifié
      </li>
    </ul>
  )
}
