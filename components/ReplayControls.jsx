'use client'

import { formatDecimal, formatLapTime } from '@/lib/format'

export const SPEEDS = [1, 2, 4, 8]

const SELECT_CLASS =
  'min-w-0 flex-1 border border-line bg-bg px-2.5 py-2 text-[15px] text-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest'
const BUTTON_CLASS =
  'border border-line bg-bg px-3 py-1.5 text-[14px] text-ink hover:border-mute focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg'

function lapLabel(lap, bestLap) {
  const notes = []
  if (lap === bestLap) notes.push('meilleur')
  if (lap.excluded) notes.push('hors rythme')
  return `Tour ${lap.lap}, ${formatLapTime(lap.seconds)}${notes.length ? ` (${notes.join(', ')})` : ''}`
}

// Choix du pilote et du tour (listes natives : clavier et lecteurs d'écran gratuits).
export function ReplayPickers({ drivers, driver, lapNumber, bestLap, onDriverChange, onLapChange }) {
  return (
    <div className="flex gap-2">
      <select
        aria-label="Pilote à rejouer"
        value={driver.number}
        onChange={(event) => onDriverChange(Number(event.target.value))}
        className={SELECT_CLASS}
      >
        {drivers.map((candidate) => (
          <option key={candidate.number} value={candidate.number}>
            {candidate.code} {candidate.lastName}
          </option>
        ))}
      </select>
      <select
        aria-label="Tour à rejouer"
        value={lapNumber}
        onChange={(event) => onLapChange(Number(event.target.value))}
        className={SELECT_CLASS}
      >
        {driver.laps.map((lap) => (
          <option key={lap.lap} value={lap.lap}>
            {lapLabel(lap, bestLap)}
          </option>
        ))}
      </select>
    </div>
  )
}

// Lecture, vitesse, curseur de position et chrono. Le chrono et le curseur sont mis à jour par
// l'animation directement dans le DOM (refs) : pas de rendu React à chaque image.
export function PlaybackBar({
  durationMs,
  playLabel,
  isReady,
  speed,
  onPlayToggle,
  onSpeedChange,
  onSeek,
  clockRef,
  sliderRef,
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={onPlayToggle} disabled={!isReady} className={`${BUTTON_CLASS} min-w-[88px] disabled:opacity-50`}>
          {playLabel}
        </button>
        <div role="group" aria-label="Vitesse de lecture" className="flex gap-[3px]">
          {SPEEDS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={candidate === speed}
              onClick={() => onSpeedChange(candidate)}
              className={BUTTON_CLASS}
            >
              ×{candidate}
            </button>
          ))}
        </div>
        <p className="ml-auto flex items-baseline gap-1.5 font-display tabular-nums">
          {/* Mis à jour hors de React ; masqué aux lecteurs d'écran (60 annonces par seconde) */}
          <span ref={clockRef} aria-hidden="true" className="text-[30px] leading-none font-extrabold italic">
            0:00.000
          </span>
          <span className="text-[15px] text-mute">
            <span className="sr-only">Durée du tour : </span>/ {formatLapTime(durationMs / 1000)}
          </span>
        </p>
      </div>
      <input
        ref={sliderRef}
        type="range"
        min={0}
        max={durationMs}
        step={1}
        defaultValue={0}
        disabled={!isReady}
        aria-label="Position dans le tour"
        onInput={(event) => onSeek(Number(event.target.value))}
        className="w-full accent-ink disabled:opacity-50"
      />
    </div>
  )
}

export function ZoomBar({ zoom, isFollowing, onZoomIn, onZoomOut, onReset, onFollowToggle, canFollow }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={onZoomOut} aria-label="Dézoomer" className={BUTTON_CLASS}>
        −
      </button>
      <button type="button" onClick={onZoomIn} aria-label="Zoomer" className={BUTTON_CLASS}>
        +
      </button>
      <button type="button" onClick={onReset} className={BUTTON_CLASS}>
        Tout voir
      </button>
      {canFollow && (
        <button type="button" aria-pressed={isFollowing} onClick={onFollowToggle} className={BUTTON_CLASS}>
          Suivre la voiture
        </button>
      )}
      <span className="ml-auto text-[13px] text-mute tabular-nums">
        Zoom ×{zoom.toFixed(1).replace('.', ',')}
      </span>
    </div>
  )
}

// Temps de secteur du tour affiché ; le secteur en cours (d'après le chrono) est mis en évidence par
// l'animation via data-active, sans rendu React.
export function SectorTimes({ sectors, cellRefs }) {
  return (
    <dl className="grid grid-cols-3 gap-[3px]">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          ref={(element) => {
            cellRefs.current[index] = element
          }}
          data-active="false"
          className="bg-track px-2.5 py-1 data-[active=true]:bg-ink data-[active=true]:text-bg"
        >
          <dt className="text-[12px] opacity-70">S{index + 1}</dt>
          <dd className="font-display text-[19px] leading-[1.1] font-bold tabular-nums">
            {sectors ? formatDecimal(sectors[index], 3) : '—'}
          </dd>
        </div>
      ))}
    </dl>
  )
}
