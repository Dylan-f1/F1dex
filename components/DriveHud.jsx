'use client'

import { useRef } from 'react'
import { formatDelta, formatLapTime } from '@/lib/car-drive'
import { dragStick } from '@/lib/touch-stick'
import Digits from './Digits'
import { RaceOverlay, TyreStatus } from './RaceHud'

// Tableau de bord de la conduite, dans le vocabulaire « retransmission » du reste du site : panneaux `panel`,
// chiffres Saira en cases fixes (voir `Digits`), meilleur temps en violet (`fastest`), drapeau jaune (`tyre-medium`) quand on sort de
// la piste ou que le tour est supprimé. Aucune couleur nouvelle : le sens ne repose jamais sur la couleur seule.
// Superposé à la visionneuse 3D ; les panneaux ne captent pas le pointeur, seules les commandes tactiles le font.
// Sous 480 px, les deux panneaux se resserrent pour laisser la place au bouton du cadre, entre eux.

const PAD_CLASS =
  'pointer-events-auto flex h-14 min-w-14 touch-none items-center justify-center bg-panel/70 px-3 font-display text-[16px] font-bold uppercase select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] active:bg-ink active:text-bg'
const LIGHTS = [0, 1, 2, 3, 4]

// `lowPads` : le bandeau du bas est masqué (téléphone), les commandes tactiles descendent sous les pouces.
export default function DriveHud({ hud, onTouch, onQuit, onNextTyre, onRestart, lowPads = false }) {
  if (!hud) return null
  const lapMessage = hud.laps > 0 ? `Tour ${hud.laps} terminé en ${formatLapTime(hud.lastLap)}${hud.lastLapValid ? '' : ', supprimé'}.` : ''
  return (
    <>
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex flex-col items-start gap-1.5">
        <div className="flex items-stretch bg-panel/90">
          <div className="px-3 py-1 text-right max-[479px]:px-2">
            {/* Place réservée à trois chiffres : le rapport engagé ne glisse pas de 99 à 100 km/h. */}
            <div className="min-w-[1.47em] font-display text-[34px] leading-none font-extrabold" aria-hidden="true">
              <Digits value={hud.speed} spoken={false} />
            </div>
            <div className="text-[12px] text-mute uppercase" aria-hidden="true">
              km/h
            </div>
          </div>
          <div className="border-l border-line px-2.5 py-1 text-center max-[479px]:px-2" aria-hidden="true">
            <div className="font-display text-[34px] leading-none font-extrabold">{hud.gear}</div>
            <div className="text-[12px] text-mute uppercase">Rapp.</div>
          </div>
        </div>
        <TyreStatus hud={hud} />
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

      <dl className="pointer-events-none absolute top-3 right-3 bg-panel/90 px-3 py-1 text-right max-[479px]:min-w-[118px] max-[479px]:px-2 max-[359px]:min-w-[110px] max-[359px]:px-1.5">
        <div className="flex items-baseline justify-end gap-3 max-[479px]:flex-col max-[479px]:items-end max-[479px]:gap-0">
          <dt className="text-[12px] text-mute uppercase">
            Tour {hud.race.lap}
            {hud.race.total ? `/${hud.race.total}` : ''}
          </dt>
          {/* Largeur de « 8:88.888 » réservée : le panneau ne s'élargit pas à 10 secondes ni à la minute. */}
          <dd className="min-w-[3.4em] font-display text-[26px] leading-none font-bold">
            <Digits value={hud.running ? formatLapTime(hud.lapTime) : '–'} struck={hud.running && !hud.lapValid} />
          </dd>
        </div>
        <div className="flex items-baseline justify-end gap-3 text-[14px] max-[479px]:gap-2 max-[359px]:gap-1">
          <dt className="text-mute">Écart</dt>
          <dd className={`font-display font-semibold ${hud.delta !== null && hud.delta < 0 ? 'text-fastest' : ''}`}>
            <Digits value={hud.delta === null ? '–' : formatDelta(hud.delta)} />
          </dd>
        </div>
        <div className="mt-0.5 flex justify-end gap-2 text-[13px]">
          {hud.sectors.map((sector, index) => (
            <div key={index} className="text-right">
              <dt className="text-[11px] text-mute uppercase">S{index + 1}</dt>
              <dd
                className={`min-w-[1.75em] font-display font-semibold ${sector.best ? 'text-fastest' : ''} ${sector.time !== null && !sector.fresh ? 'opacity-60' : ''}`}
              >
                <Digits value={sector.time === null ? '–' : sector.time.toFixed(1)} />
              </dd>
            </div>
          ))}
        </div>
        {hud.lastLap !== null && (
          <div className="flex items-baseline justify-end gap-3 text-[14px] max-[479px]:gap-2 max-[359px]:gap-1">
            <dt className="text-mute">Dernier</dt>
            <dd className="font-display font-semibold">
              <Digits value={formatLapTime(hud.lastLap)} struck={!hud.lastLapValid} />
            </dd>
          </div>
        )}
        {hud.bestLap !== null && (
          <div className="flex items-baseline justify-end gap-3 text-[14px] max-[479px]:gap-2 max-[359px]:gap-1">
            <dt className="text-mute">Meilleur</dt>
            <dd className="font-display font-semibold text-fastest">
              <Digits value={formatLapTime(hud.bestLap)} />
            </dd>
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

      <TouchControls onTouch={onTouch} low={lowPads} />
      {/* Après les commandes tactiles : ses boutons passent devant la zone du joystick. */}
      <RaceOverlay hud={hud} onNextTyre={onNextTyre} onRestart={onRestart} onQuit={onQuit} />
    </>
  )
}

function Flag({ children }) {
  return (
    <div className="bg-tyre-medium px-3 py-1 font-display text-[16px] font-extrabold text-bg uppercase">{children}</div>
  )
}

// Commandes à l'écran, affichées seulement sur appareil tactile (`pointer: coarse`) : joystick de direction à gauche,
// frein et gaz à droite. Chaque commande suit son propre doigt (pointer capture) : on peut tourner et accélérer en
// même temps. Au clavier, ce sont les touches qui pilotent : le bloc est masqué aux lecteurs d'écran.
function TouchControls({ onTouch, low }) {
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
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden pointer-coarse:block">
      <SteeringStick onTouch={onTouch} low={low} />
      <div className={`absolute right-3 flex gap-2 ${low ? 'bottom-4' : 'bottom-[76px]'}`}>
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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// Joystick gauche-droite. La zone sensible (le quart bas gauche de la scène) est plus grande que le dessin : le
// socle vient se placer sous le pouce, où qu'il se pose, et le glissement se mesure depuis ce point. Les positions
// sont écrites directement dans le DOM, sans rendu React à chaque mouvement du doigt.
function SteeringStick({ onTouch, low }) {
  const base = useRef(null)
  const knob = useRef(null)
  const drag = useRef(null) // { id, origin, zone, rest, shiftY } tant qu'un doigt tient le joystick

  function move(x) {
    const { zone, rest, shiftY } = drag.current
    const next = dragStick(drag.current.origin, x)
    drag.current.origin = next.origin
    const shiftX = clamp(next.origin - (rest.left + rest.width / 2), zone.left - rest.left, zone.right - rest.right)
    base.current.style.transform = `translate(${shiftX}px, ${shiftY}px)`
    knob.current.style.transform = `translateX(${next.offset}px)`
    onTouch({ steer: next.steer })
  }

  function press(event) {
    if (drag.current) return // un deuxième doigt dans la zone est ignoré
    event.currentTarget.setPointerCapture(event.pointerId)
    const zone = event.currentTarget.getBoundingClientRect()
    const rest = base.current.getBoundingClientRect()
    const shiftY = clamp(event.clientY - (rest.top + rest.height / 2), zone.top - rest.top, zone.bottom - rest.bottom)
    knob.current.style.transition = 'none'
    drag.current = { id: event.pointerId, origin: event.clientX, zone, rest, shiftY }
    move(event.clientX)
  }

  function release(event) {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    base.current.style.transform = ''
    knob.current.style.transition = ''
    knob.current.style.transform = ''
    onTouch({ steer: 0 })
  }

  return (
    <div
      className={`pointer-events-auto absolute left-0 h-1/2 w-[max(55%,184px)] touch-none select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] ${low ? 'bottom-0' : 'bottom-[60px]'}`}
      onPointerDown={press}
      onPointerMove={(event) => drag.current?.id === event.pointerId && move(event.clientX)}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={base}
        data-stick
        className="absolute bottom-4 left-3 flex h-[68px] w-40 items-center justify-between rounded-full border border-ink/30 bg-panel/70 px-2.5 text-mute"
      >
        <Arrow direction="left" />
        <Arrow direction="right" />
        <span
          ref={knob}
          className="absolute top-1/2 left-1/2 -mt-7 -ml-7 size-14 rounded-full bg-ink transition-transform duration-100 ease-out motion-reduce:transition-none"
        />
      </div>
    </div>
  )
}

function Arrow({ direction }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
      <path d={direction === 'left' ? 'M16 4 6 12l10 8z' : 'M8 4l10 8-10 8z'} />
    </svg>
  )
}
