import { MIN_STINT_WIDTH_FOR_LETTER_PERCENT, TYRES } from '@/lib/constants'
import { formatDecimal } from '@/lib/format'

function describeUsage(tyreAge) {
  return tyreAge ? `pneu déjà roulé de ${tyreAge} tours` : 'pneu neuf'
}

// Une barre = la course d'un pilote. Chaque relais est un segment coloré par pneu,
// chaque arrêt aux stands une encoche blanche.
export default function TyreBar({ result, totalLaps }) {
  const stints = result.stints.map((stint) => ({
    ...stint,
    endLap: stint.endLap ?? result.lapsCompleted,
    tyre: TYRES[stint.compound] ?? TYRES.UNKNOWN,
  }))
  const description = stints
    .map((stint) => `${stint.tyre.label} tours ${stint.startLap} à ${stint.endLap}`)
    .join(', ')

  return (
    <span role="img" aria-label={description} className="relative block h-5 bg-track">
      {stints.map((stint, index) => {
        const widthPercent = ((stint.endLap - stint.startLap + 1) / totalLaps) * 100
        const leftPercent = ((stint.startLap - 1) / totalLaps) * 100
        return (
          <span
            key={`${stint.startLap}-${index}`}
            className={`absolute inset-y-0 grid place-items-center text-[13px] font-extrabold shadow-[inset_-2px_0_0_var(--color-panel)] ${stint.tyre.className}`}
            style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
            title={`${stint.tyre.label}, tours ${stint.startLap} à ${stint.endLap}, ${describeUsage(stint.tyreAge)}`}
          >
            {widthPercent >= MIN_STINT_WIDTH_FOR_LETTER_PERCENT ? stint.tyre.letter : ''}
          </span>
        )
      })}
      {result.pits.map((pit, index) => (
        <span
          key={`${pit.lap}-${index}`}
          className="absolute -top-1 -bottom-1 w-0.5 -translate-x-px bg-white"
          style={{ left: `${(pit.lap / totalLaps) * 100}%` }}
          title={`Arrêt au tour ${pit.lap} : ${
            pit.stopSeconds != null ? `${formatDecimal(pit.stopSeconds)} s à l’arrêt, ` : ''
          }${formatDecimal(pit.laneSeconds)} s dans la voie des stands`}
        />
      ))}
    </span>
  )
}
