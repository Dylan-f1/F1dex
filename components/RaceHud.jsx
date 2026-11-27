'use client'

import { formatLapTime } from '@/lib/car-drive'
import { MIN_STINT_WIDTH_FOR_LETTER_PERCENT, TYRES } from '@/lib/constants'
import { PIT_RULES } from '@/lib/pit-stop'
import { COMPOUND_IDS, TYRE_WEAR } from '@/lib/tyres'
import Digits from './Digits'

// La course sur le tableau de bord : pneus et usure, voie des stands, arrivée. Même vocabulaire que DriveHud
// (panneaux `panel`, chiffres Saira, jaune pour ce qui demande attention) et que les barres de relais des résultats
// (couleur ET lettre de la gomme : le sens ne repose jamais sur la couleur seule).

const LIMIT = Math.round(PIT_RULES.limit * 3.6)
const BUTTON = `touch-manipulation select-none [-webkit-tap-highlight-color:transparent] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-fastest`
const spec = (compound) => TYRES[compound] ?? TYRES.UNKNOWN
const laps = (count) => `${count} tour${count > 1 ? 's' : ''}`
const isWorn = (tyre) => tyre.wear >= TYRE_WEAR.cliffFrom

// Colonne de gauche, sous le compteur : le train monté, puis ce qu'il faut savoir des stands.
export function TyreStatus({ hud }) {
  const { tyre, pit, race } = hud
  const { label, letter, className } = spec(tyre.compound)
  const percent = Math.floor(tyre.wear * 100)
  const worn = isWorn(tyre)
  const limited = pit?.inLane && hud.phase === 'racing'
  return (
    <>
      <div role="group" aria-label={`Pneus ${label} : usure ${percent} %, ${laps(tyre.age)}`} className="flex items-stretch bg-panel/90">
        <span aria-hidden="true" className={`flex w-9 items-center justify-center font-display text-[22px] font-extrabold ${className}`}>
          {letter}
        </span>
        <div aria-hidden="true" className="min-w-[92px] px-2 py-1">
          <div className="flex items-baseline gap-1.5">
            <span className="min-w-[2.4em] text-right font-display text-[22px] leading-none font-bold">
              <Digits value={`${percent} %`} spoken={false} />
            </span>
            <span className="text-[12px] text-mute uppercase">usure</span>
          </div>
          <div className="mt-1 h-1 bg-line">
            <div className={`h-full ${worn ? 'bg-tyre-medium' : 'bg-ink'}`} style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-0.5 text-[12px] text-mute">{laps(tyre.age)}</div>
        </div>
      </div>
      {limited && (
        <div className="bg-ink px-3 py-1 font-display text-[16px] font-extrabold text-bg uppercase">Limiteur {LIMIT}</div>
      )}
      {worn && !limited && !race.finished && (
        <div className="bg-tyre-medium px-3 py-1 font-display text-[16px] font-extrabold text-bg uppercase">Pneus usés</div>
      )}
      {pit && !pit.inLane && pit.toEntry !== null && !race.finished && (
        <div className="bg-panel/90 px-2 py-1 text-[13px]">
          Stands à {pit.side} : <span className="font-display font-bold">{pit.toEntry} m</span>
        </div>
      )}
    </>
  )
}

// Au centre de la scène : choix des pneus dans la voie des stands, arrêt en cours, arrivée.
export function RaceOverlay({ hud, onNextTyre, onRestart, onQuit }) {
  const { tyre, pit, race } = hud
  const stopping = pit !== null && pit.service > 0
  const choosing = pit !== null && pit.inLane && !pit.served && hud.phase === 'racing'
  return (
    <>
      {race.finished ? (
        <Finish race={race} onRestart={onRestart} onQuit={onQuit} />
      ) : (
        (choosing || stopping) && <PitPanel pit={pit} next={tyre.next} stopping={stopping} onNextTyre={onNextTyre} />
      )}
      <p className="sr-only" aria-live="polite">
        {announce(hud, stopping)}
      </p>
    </>
  )
}

// Message pour les lecteurs d'écran : il ne change qu'aux moments qui comptent.
function announce({ tyre, pit, race }, stopping) {
  if (race.finished) return `Arrivée après ${laps(race.total)}. Temps total ${formatLapTime(race.time)}.`
  if (stopping) return 'Arrêt aux stands, changement de pneus.'
  if (pit?.inLane) {
    return pit.served
      ? `Pneus ${spec(tyre.compound).label} montés.`
      : `Voie des stands, vitesse limitée à ${LIMIT} kilomètres par heure. Touches 1, 2, 3 pour choisir les pneus.`
  }
  return isWorn(tyre) ? 'Pneus usés.' : ''
}

function PitPanel({ pit, next, stopping, onNextTyre }) {
  const done = stopping ? 1 - pit.service / pit.serviceTotal : 0
  return (
    // Juste sous les boutons du cadre : plus bas, le panneau cache la voiture et les mécaniciens pendant l’arrêt. En
    // écran étroit, il passe sous les deux panneaux du haut, qui occupent toute la largeur.
    <div className="pointer-events-auto absolute top-28 left-1/2 z-10 -translate-x-1/2 bg-panel/95 max-[639px]:top-[max(17rem,36%)] px-2.5 py-2 text-center">
      <p className="font-display text-[18px] leading-tight font-extrabold whitespace-nowrap uppercase">
        {stopping ? (
          <>
            À l’arrêt : <Digits value={`${pit.service.toFixed(1)} s`} spoken={false} />
          </>
        ) : (
          <>Box à {pit.toBox} m</>
        )}
      </p>
      {stopping && (
        <div aria-hidden="true" className="mt-1 h-1.5 bg-line">
          <div className="h-full bg-ink" style={{ width: `${done * 100}%` }} />
        </div>
      )}
      <div role="group" aria-label="Pneus à monter" className="mt-2 flex gap-1.5">
        {COMPOUND_IDS.map((id, index) => (
          <button
            key={id}
            type="button"
            aria-pressed={next === id}
            aria-keyshortcuts={String(index + 1)}
            // `pointerdown` : un deuxième doigt posé pendant que l'autre accélère ne produit pas toujours de `click`.
            onPointerDown={() => onNextTyre(id)}
            onClick={() => onNextTyre(id)}
            className={`flex min-h-12 w-[72px] flex-col items-center justify-center gap-0.5 border border-line bg-bg px-1 py-1 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg ${BUTTON}`}
          >
            <span aria-hidden="true" className={`flex size-6 items-center justify-center border border-line font-display text-[15px] font-extrabold ${spec(id).className}`}>
              {spec(id).letter}
            </span>
            <span className="font-display text-[14px] leading-none font-bold uppercase">{spec(id).label}</span>
          </button>
        ))}
      </div>
      <p aria-hidden="true" className="mt-1 text-[11px] text-mute pointer-coarse:hidden">
        Touches 1, 2, 3
      </p>
    </div>
  )
}

function Finish({ race, onRestart, onQuit }) {
  const stops = race.stints.length - 1
  const rows = [
    ['Temps total', formatLapTime(race.time)],
    ['Meilleur tour', race.bestLap === null ? 'aucun valide' : formatLapTime(race.bestLap)],
    ['Arrêts', String(stops)],
  ]
  return (
    <div
      role="group"
      aria-label="Résultat de la course"
      className="pointer-events-auto absolute top-[max(7rem,calc(50%-8rem))] left-1/2 z-20 w-[min(320px,calc(100%-24px))] -translate-x-1/2 bg-panel px-4 py-2.5"
    >
      <p className="font-display text-[28px] leading-none font-extrabold uppercase italic">Arrivée, {laps(race.total)}</p>
      <dl className="mt-2">
        {rows.map(([term, value]) => (
          <div key={term} className="flex items-baseline justify-between gap-4 border-t border-line py-1">
            <dt className="text-[14px] text-mute">{term}</dt>
            <dd className="font-display text-[20px] leading-tight font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <StintBar stints={race.stints} total={race.total} />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onRestart}
          className={`min-h-11 flex-1 border border-ink bg-ink font-display text-[18px] font-bold text-bg uppercase active:opacity-70 ${BUTTON}`}
        >
          Rejouer
        </button>
        <button
          type="button"
          onClick={onQuit}
          className={`min-h-11 flex-1 border border-ink font-display text-[18px] font-bold uppercase hover:bg-ink hover:text-bg active:bg-ink active:text-bg ${BUTTON}`}
        >
          Quitter
        </button>
      </div>
    </div>
  )
}

// La course en une barre, comme dans les résultats : un segment par train de pneus.
function StintBar({ stints, total }) {
  const description = stints.map((stint) => `${spec(stint.compound).label} à partir du tour ${stint.lap}`).join(', ')
  return (
    <div role="img" aria-label={description} className="relative mt-1 h-5 bg-track">
      {stints.map((stint, index) => {
        const width = ((stint.to - stint.from) / total) * 100
        const { letter, className } = spec(stint.compound)
        return (
          <span
            key={index}
            className={`absolute inset-y-0 flex items-center justify-center overflow-hidden text-[13px] font-extrabold shadow-[inset_-2px_0_0_var(--color-panel)] ${className}`}
            style={{ left: `${(stint.from / total) * 100}%`, width: `${width}%` }}
          >
            {width >= MIN_STINT_WIDTH_FOR_LETTER_PERCENT ? letter : ''}
          </span>
        )
      })}
    </div>
  )
}
