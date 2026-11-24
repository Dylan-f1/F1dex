'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { buildCircuitTrack } from '@/lib/car-drive'
import { CAMERA_VIEWS } from '@/lib/car-camera'
import { countryNameFr } from '@/lib/format'
import { liveryFor } from '@/lib/liveries'
import DriveHud from './DriveHud'
import { useCarScene } from './use-car-scene'

const NEUTRAL_TEAM = { name: 'Couleurs neutres', colour: '#9aa5b5', drivers: [] }
const FOCUS = 'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest'
const BUTTON_CLASS = `border border-line bg-bg px-3 py-1.5 text-[14px] text-ink hover:border-mute ${FOCUS} aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg`

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
function subscribeReducedMotion(notify) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}
const readReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches
// Côté serveur on suppose « mouvement réduit » : la rotation ne démarre jamais sans que le navigateur l'ait permis.
const readReducedMotionOnServer = () => true

const ASSIST_CHOICES = [
  { id: 'high', label: 'Fortes (stable)', hint: 'Voiture très stable : peu de glisse, le tour reste facile. Elle pardonne les coups de volant brusques.' },
  { id: 'normal', label: 'Normales', hint: 'Plus vive : elle exploite plus d’adhérence et peut glisser si on pousse, l’aide rattrape les petites erreurs.' },
  { id: 'off', label: 'Aucune (sportif)', hint: 'Sans aide à la stabilité ni anti-patinage : on exploite le maximum d’adhérence, elle glisse dès qu’on dépasse la limite. Pour tester.' },
]

export default function CarViewer({ teams, circuits = [] }) {
  const [teamName, setTeamName] = useState(teams[0]?.name)
  const [rotationChoice, setRotationChoice] = useState(null)
  const prefersReducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, readReducedMotionOnServer)
  const team = teams.find((candidate) => candidate.name === teamName) ?? teams[0] ?? NEUTRAL_TEAM
  const autoRotate = rotationChoice ?? !prefersReducedMotion
  const livery = useMemo(() => liveryFor(team), [team])

  // Circuit : '' = circuit fictif. Les tracés sont chargés à la demande (une fois chacun) ; la voiture ne change
  // de piste qu'une fois le nouveau tracé arrivé, pour ne pas redémarrer deux fois.
  const [circuitKey, setCircuitKey] = useState('')
  const [activeKey, setActiveKey] = useState('')
  const [loaded, setLoaded] = useState({})
  const [assist, setAssist] = useState('high')
  const road = activeKey ? (loaded[activeKey]?.road ?? null) : null
  const activeCircuit = activeKey ? circuits.find((circuit) => circuit.key === activeKey) : null
  const circuitFailed = circuitKey !== '' && loaded[circuitKey]?.failed === true
  const circuitLoading = circuitKey !== activeKey && !circuitFailed

  useEffect(() => {
    if (!circuitKey || loaded[circuitKey]) return undefined
    const controller = new AbortController()
    fetch(`/api/circuit/${circuitKey}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data) => {
        const built = buildCircuitTrack(data.points, { key: circuitKey })
        if (!built) throw new Error('tracé inutilisable')
        setLoaded((previous) => ({ ...previous, [circuitKey]: { road: built } }))
        setActiveKey(circuitKey)
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setLoaded((previous) => ({ ...previous, [circuitKey]: { failed: true } }))
      })
    return () => controller.abort()
  }, [circuitKey, loaded])

  const { containerRef, status, source, driving, hud, startDriving, stopDriving, setTouch, goToView } = useCarScene({
    livery,
    autoRotate,
    road,
    assist,
  })

  function pickCircuit(event) {
    const value = event.target.value
    // Les flèches pilotent la voiture : la liste ne doit pas garder le focus (elle changerait de circuit en roulant).
    event.target.blur()
    setCircuitKey(value)
    if (value === '' || loaded[value]?.road) setActiveKey(value)
  }

  function pickAssist(event) {
    setAssist(event.target.value)
    event.target.blur() // même raison que pour le circuit : les flèches pilotent la voiture
  }

  function toggleDriving() {
    if (driving) {
      stopDriving()
      return
    }
    // La rotation automatique n'a pas de sens au volant, et reprendrait au retour au showroom.
    setRotationChoice(false)
    startDriving()
    // Le cadre grandit en conduite et ne défile pas au doigt : on le ramène entièrement à l'écran (sans animation).
    requestAnimationFrame(() => containerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }))
  }

  function pickView(view) {
    // Une vue choisie à la main arrête la rotation automatique : sinon elle l'emporterait aussitôt.
    setRotationChoice(false)
    goToView(view.position)
  }

  return (
    <div className="mt-7 grid gap-6 min-[1001px]:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Visionneuse 3D" className="min-w-0">
        <div className="relative overflow-hidden bg-track">
          <div
            ref={containerRef}
            role="img"
            aria-label={
              driving
                ? `Conduite de la monoplace ${team.name} sur ${activeCircuit ? `le circuit ${activeCircuit.name}` : 'une piste fictive'}. Flèches ou Z Q S D pour piloter, Échap pour quitter.`
                : `Monoplace de F1 en 3D aux couleurs de ${team.name}. Glisser pour la faire tourner, molette pour s'approcher.`
            }
            className={`${driving ? 'h-[460px]' : 'h-[340px]'} min-[700px]:h-[540px]`}
          />
          {status === 'loading' && <Message>Chargement de la voiture…</Message>}
          {status === 'unavailable' && (
            <Message>
              Le rendu 3D n’est pas disponible sur cet appareil (WebGL est désactivé ou non pris en charge). Les
              couleurs des écuries restent consultables dans la liste.
            </Message>
          )}
          {driving && <DriveHud hud={hud} onTouch={setTouch} onQuit={stopDriving} />}
          <div className="pointer-events-none absolute bottom-4 left-0 flex max-w-full items-stretch">
            <span
              className="relative z-10 -mr-[18px] bg-white py-1 pr-9 pl-4 font-display text-[clamp(22px,3.2vw,34px)] leading-none font-extrabold text-bg uppercase italic [clip-path:polygon(0_0,100%_0,calc(100%_-_18px)_100%,0_100%)]"
              style={{ borderLeft: `10px solid ${team.colour}` }}
            >
              {team.name}
            </span>
            {team.drivers.length > 0 && (
              <span className="flex items-center bg-panel py-1 pr-3 pl-7 font-display text-[18px] font-bold">
                {team.drivers.map((driver) => driver.code).join(' ')}
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Angle de caméra">
          {CAMERA_VIEWS.map((view) => (
            <button key={view.id} type="button" className={`${BUTTON_CLASS} disabled:opacity-40`} disabled={driving} onClick={() => pickView(view)}>
              {view.label}
            </button>
          ))}
          <button
            type="button"
            className={`${BUTTON_CLASS} ml-auto disabled:opacity-40`}
            aria-pressed={autoRotate}
            disabled={driving}
            onClick={() => setRotationChoice(!autoRotate)}
          >
            Rotation automatique
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2 bg-panel px-3 py-3">
          <label className="flex min-w-0 flex-col gap-1 text-[13px] text-mute uppercase">
            Circuit
            <select
              value={circuitKey}
              onChange={pickCircuit}
              disabled={circuits.length === 0}
              className={`max-w-full min-w-0 border border-line bg-bg px-2 py-1.5 text-[15px] text-ink normal-case pointer-coarse:text-[16px] ${FOCUS}`}
            >
              <option value="">Circuit fictif</option>
              {circuits.map((circuit) => (
                <option key={circuit.key} value={circuit.key}>
                  {circuit.name} · {countryNameFr(circuit.country)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-[13px] text-mute uppercase">
            Aides à la conduite
            <select
              value={assist}
              onChange={pickAssist}
              className={`max-w-full min-w-0 border border-line bg-bg px-2 py-1.5 text-[15px] text-ink normal-case pointer-coarse:text-[16px] ${FOCUS}`}
            >
              {ASSIST_CHOICES.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`border border-ink px-4 py-1.5 font-display text-[18px] font-bold uppercase ${FOCUS} ${driving ? 'bg-ink text-bg' : 'bg-bg text-ink hover:bg-ink hover:text-bg'} disabled:opacity-40`}
            disabled={status !== 'ready' || (circuitLoading && !driving)}
            onClick={toggleDriving}
          >
            {driving ? 'Quitter (Échap)' : 'Conduire'}
          </button>
          <p role="status" className="basis-full text-[14px] text-mute">
            {circuits.length === 0
              ? 'Circuits indisponibles pour le moment (calendrier injoignable) : seul le circuit fictif est proposé. '
              : ''}
            {circuitLoading ? 'Chargement du tracé… ' : circuitFailed ? 'Tracé indisponible pour le moment : on reste sur la piste précédente. ' : ''}
            {ASSIST_CHOICES.find((choice) => choice.id === assist)?.hint}
          </p>
        </div>
        <p className="mt-3 max-w-[70ch] text-[14px] text-mute">
          {driving
            ? 'Flèches ou Z Q S D pour piloter (sur écran tactile : les boutons à l’écran), R pour revenir sur la piste, Échap pour quitter. Tour supprimé si les quatre roues sortent de la piste. Vibreurs, gravier (il freine fort) et murs de pneus (ils te remettent sur la piste) sont placés d’après la forme du tracé, pas d’après le vrai circuit. Secteurs : trois tiers égaux du tour, pas les secteurs officiels. Départ approximatif. Les roues ne tournent pas et ne braquent pas : le modèle n’est qu’une pièce.'
            : source === 'fallback'
              ? 'Le modèle 3D n’a pas pu être chargé : voici une monoplace stylisée construite en code, aux proportions d’une F1 de 2025. Ce n’est pas la reproduction d’une voiture précise.'
              : 'Modèle 3D généré par IA à partir d’une image de F1 générique, sans logo ni écurie réelle : ce n’est pas la reproduction d’une voiture précise. Les couleurs de chaque écurie (carrosserie, ailerons, liserés) sont approchées, sans logo ni sponsor.'}
        </p>
      </section>

      <aside aria-labelledby="teams-title" className="min-w-0 bg-panel px-4 pt-3 pb-4">
        <h2 id="teams-title" className="font-display text-[26px] font-extrabold uppercase italic">
          Écuries
        </h2>
        {teams.length === 0 ? (
          <p className="mt-2 text-mute">Liste des écuries indisponible pour le moment : la voiture reste aux couleurs neutres.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {teams.map((candidate) => (
              <li key={candidate.name}>
                <button
                  type="button"
                  aria-pressed={candidate.name === team.name}
                  onClick={() => setTeamName(candidate.name)}
                  className={`flex w-full items-stretch bg-bg text-left hover:bg-line ${FOCUS} aria-pressed:bg-line`}
                >
                  <span className="w-1.5 shrink-0" style={{ backgroundColor: candidate.colour }} aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col px-3 py-2">
                    <span className="font-display text-[20px] leading-tight font-bold">{candidate.name}</span>
                    <span className="text-[14px] text-mute">
                      {candidate.drivers.map((driver) => driver.lastName).join(', ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}

function Message({ children }) {
  return (
    <p role="status" className="absolute inset-0 flex items-center justify-center px-6 text-center text-mute">
      {children}
    </p>
  )
}
