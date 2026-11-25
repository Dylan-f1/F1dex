'use client'

import { formatDelta, formatLapTime } from '@/lib/car-drive'

// Tableau de bord de la conduite, dans le vocabulaire « retransmission » du reste du site : panneaux `panel`,
// chiffres Saira en tabulaires, meilleur temps en violet (`fastest`), drapeau jaune (`tyre-medium`) quand on sort de
// la piste ou que le tour est supprimé. Aucune couleur nouvelle : le sens ne repose jamais sur la couleur seule.
// Superposé à la visionneuse 3D ; les panneaux ne captent pas le pointeur, seuls les boutons tactiles le font.

const PAD_CLASS =
  'pointer-events-auto flex h-14 min-w-14 touch-none items-center justify-center bg-panel/70 px-3 font-display text-[16px] font-bold uppercase select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] active:bg-ink active:text-bg'
const LIGHTS = [0, 1, 2, 3, 4]

// `lowPads` : le bandeau du bas est masqué (téléphone), les boutons tactiles descendent sous les pouces.
export default function DriveHud({ hud, onTouch, onQuit, lowPads = false }) {
  if (!hud) return null
  const lapMessage = hud.laps > 0 ? `Tour ${hud.laps} terminé en ${formatLapTime(hud.lastLap)}${hud.lastLapValid ? '' : ', supprimé'}.` : ''
  return (
    <>
      <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-1.5">
        <div className="flex items-stretch bg-panel/90">
          <div className="px-3 py-1">
            <div className="font-display text-[34px] leading-none font-extrabold tabular-nums" aria-hidden="true">
              {hud.speed}
            </div>
            <div className="text-[12px] text-mute uppercase" aria-hidden="true">
              km/h
            </div>
          </div>
          <div className="border-l border-line px-2.5 py-1 text-center" aria-hidden="true">
            <div className="font-display text-[34px] leading-none font-extrabold tabular-nums">{hud.gear}</div>
            <div className="text-[12px] text-mute uppercase">Rapp.</div>
          </div>
        </div>
        {!hud.onTrack && hud.surface !== 'kerb' && <Flag>{hud.surface === 'gravel' ? 'Gravier' : 'Hors piste'}</Flag>}
        {hud.notice && <Flag>{hud.notice}</Flag>}
        {hud.running && !hud.lapValid && <Flag>Tour supprimé</Flag>}
        <button
          type="button"
          aria-label="Quitter la conduite"
          onClick={onQuit}
          className="pointer-events-auto hidden h-11 touch-manipulation items-center bg-panel/90 px-3 font-display text-[15px] font-bold uppercase select-none [-webkit-tap-highlight-color:transparent] pointer-coarse:flex active:bg-ink active:text-bg"
        >
          Quitter
        </button>
      </div>

      <dl className="pointer-events-none absolute top-3 right-3 bg-panel/90 px-3 py-1 text-right">
        <div className="flex items-baseline justify-end gap-3">
          <dt className="text-[12px] text-mute uppercase">Tour {hud.laps + 1}</dt>
          <dd
            className={`font-display text-[26px] leading-none font-bold tabular-nums ${hud.running && !hud.lapValid ? 'line-through' : ''}`}
          >
            {hud.running ? formatLapTime(hud.lapTime) : '–'}
          </dd>
        </div>
        <div className="flex items-baseline justify-end gap-3 text-[14px]">
          <dt className="text-mute">Écart</dt>
          <dd className={`font-display font-semibold tabular-nums ${hud.delta !== null && hud.delta < 0 ? 'text-fastest' : ''}`}>
            {hud.delta === null ? '–' : formatDelta(hud.delta)}
          </dd>
        </div>
        <div className="mt-0.5 flex justify-end gap-2 text-[13px]">
          {hud.sectors.map((sector, index) => (
            <div key={index} className="text-right">
              <dt className="text-[11px] text-mute uppercase">S{index + 1}</dt>
              <dd
                className={`font-display font-semibold tabular-nums ${sector.best ? 'text-fastest' : ''} ${sector.time !== null && !sector.fresh ? 'opacity-60' : ''}`}
              >
                {sector.time === null ? '–' : sector.time.toFixed(1)}
              </dd>
            </div>
          ))}
        </div>
        {hud.lastLap !== null && (
          <div className="flex items-baseline justify-end gap-3 text-[14px]">
            <dt className="text-mute">Dernier</dt>
            <dd className={`font-display font-semibold tabular-nums ${hud.lastLapValid ? '' : 'line-through'}`}>
              {formatLapTime(hud.lastLap)}
            </dd>
          </div>
        )}
        {hud.bestLap !== null && (
          <div className="flex items-baseline justify-end gap-3 text-[14px]">
            <dt className="text-mute">Meilleur</dt>
            <dd className="font-display font-semibold text-fastest tabular-nums">{formatLapTime(hud.bestLap)}</dd>
          </div>
        )}
      </dl>

      {hud.lights !== null && (
        <div
          role="img"
          aria-label={hud.phase === 'lights' ? `Feux de départ : ${hud.lights} sur 5 allumés` : 'Départ !'}
          className="pointer-events-none absolute top-[38%] left-1/2 flex -translate-x-1/2 gap-2 bg-panel/90 px-3 py-2"
        >
          {LIGHTS.map((light) => (
            <span
              key={light}
              className={`h-4 w-4 rounded-full border border-line ${light < hud.lights ? 'bg-tyre-soft' : 'bg-bg'}`}
            />
          ))}
        </div>
      )}

      {/* Seuls les tours terminés et le départ sont annoncés : la vitesse change dix fois par seconde. */}
      <p className="sr-only" aria-live="polite">
        {hud.phase === 'racing' && hud.lights !== null ? 'Départ.' : lapMessage}
      </p>

      <TouchPads onTouch={onTouch} low={lowPads} />
    </>
  )
}

function Flag({ children }) {
  return (
    <div className="bg-tyre-medium px-3 py-1 font-display text-[16px] font-extrabold text-bg uppercase">{children}</div>
  )
}

// Boutons à l'écran, affichés seulement sur appareil tactile (`pointer: coarse`). Chaque bouton suit son propre
// doigt (pointer capture) : on peut tourner et accélérer en même temps.
function TouchPads({ onTouch, low }) {
  const hold = (patch) => ({
    onPointerDown(event) {
      event.currentTarget.setPointerCapture(event.pointerId)
      onTouch(patch.on)
    },
    onPointerUp: () => onTouch(patch.off),
    onPointerCancel: () => onTouch(patch.off),
    // Le système peut reprendre le pointeur (geste, notification) sans envoyer `pointerup` : on lâche aussi dans ce cas.
    onLostPointerCapture: () => onTouch(patch.off),
    onContextMenu: (event) => event.preventDefault(),
  })
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-3 hidden items-end justify-between pointer-coarse:flex ${low ? 'bottom-4' : 'bottom-[76px]'}`}
    >
      <div className="flex gap-2">
        <button type="button" tabIndex={-1} aria-label="Tourner à gauche" className={PAD_CLASS} {...hold({ on: { steer: 1 }, off: { steer: 0 } })}>
          <Arrow direction="left" />
        </button>
        <button type="button" tabIndex={-1} aria-label="Tourner à droite" className={PAD_CLASS} {...hold({ on: { steer: -1 }, off: { steer: 0 } })}>
          <Arrow direction="right" />
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" tabIndex={-1} className={PAD_CLASS} {...hold({ on: { brake: 1 }, off: { brake: 0 } })}>
          Frein
        </button>
        <button type="button" tabIndex={-1} className={PAD_CLASS} {...hold({ on: { throttle: 1 }, off: { throttle: 0 } })}>
          Gaz
        </button>
      </div>
    </div>
  )
}

function Arrow({ direction }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="currentColor">
      <path d={direction === 'left' ? 'M16 4 6 12l10 8z' : 'M8 4l10 8-10 8z'} />
    </svg>
  )
}
