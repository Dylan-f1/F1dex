import { gapLabel, positionLabel, stopsLabel } from '@/lib/format'
import TowerLegend from './TowerLegend'
import TyreBar from './TyreBar'

// Grille de la tour : position, repère d'écurie, code, nom, barre de pneus, arrêts, écart.
// Sous 721 px, le nom et les arrêts disparaissent (display none : ils ne prennent pas de colonne).
const ROW_GRID =
  'grid items-center gap-x-2 grid-cols-[42px_5px_46px_minmax(0,1fr)_auto] min-[721px]:gap-x-2.5 min-[721px]:grid-cols-[48px_6px_54px_132px_minmax(140px,1fr)_126px_124px]'

const POSITION_BOX =
  'grid h-full place-items-center bg-white font-display text-[21px] font-extrabold text-bg italic [clip-path:polygon(0_0,100%_0,calc(100%_-_9px)_100%,0_100%)]'
const OUT_POSITION_BOX =
  'grid h-full place-items-center font-display text-[13px] font-extrabold text-mute italic shadow-[inset_0_0_0_1px_var(--color-mute)]'

export default function Tower({ results, totalLaps }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-[30px] leading-none font-extrabold uppercase italic">
        Course et stratégie
      </h2>
      <TowerLegend />
      <div
        aria-hidden="true"
        className={`${ROW_GRID} hidden pb-1.5 text-[13px] text-mute min-[721px]:grid`}
      >
        <span>Pos.</span>
        <span />
        <span>Pilote</span>
        <span />
        <span>Pneus sur {totalLaps} tours</span>
        <span>Arrêts</span>
        <span className="pr-2.5 text-right">Écart</span>
      </div>
      <ol>
        {results.map((result) => {
          const isClassified = result.position != null
          return (
            <li key={result.number} className={`${ROW_GRID} mb-[3px] h-10 bg-panel min-[721px]:h-[38px]`}>
              <span className={isClassified ? POSITION_BOX : OUT_POSITION_BOX}>
                {positionLabel(result)}
              </span>
              <span className="h-full" style={{ backgroundColor: `#${result.colour}` }} />
              <span className="font-display text-[23px] font-extrabold tracking-[.02em]">
                {result.code}
              </span>
              <span
                title={result.team}
                className="hidden truncate text-[15px] text-mute min-[721px]:block"
              >
                {result.firstName} {result.lastName}
              </span>
              <TyreBar result={result} totalLaps={totalLaps} />
              <span className="hidden text-[15px] whitespace-nowrap text-mute tabular-nums min-[721px]:block">
                {stopsLabel(result)}
              </span>
              <span
                className={`pr-2.5 text-right whitespace-nowrap tabular-nums ${
                  isClassified ? 'text-[14px] min-[721px]:text-base' : 'text-sm text-mute'
                }`}
              >
                {gapLabel(result)}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
