'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { buildCircuitTrack } from '@/lib/car-drive'
import { CAMERA_VIEWS } from '@/lib/car-camera'
import { countryNameFr } from '@/lib/format'
import { liveryFor } from '@/lib/liveries'
import { readSound, subscribeSound, writeSound } from '@/lib/sound-preference'
import DriveHud from './DriveHud'
import { useCarScene } from './use-car-scene'

const NEUTRAL_TEAM = { name: 'Couleurs neutres', colour: '#9aa5b5', drivers: [] }
const FOCUS = 'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest'
// Au doigt : cibles d'au moins 44 px, pas de délai ni de voile gris, et un retour dès la pression.
const TOUCH = 'touch-manipulation select-none [-webkit-tap-highlight-color:transparent] pointer-coarse:min-h-11'
const BUTTON_CLASS = `border border-line bg-bg px-3 py-1.5 text-ink hover:border-mute active:border-ink active:bg-ink active:text-bg ${TOUCH} ${FOCUS} aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg`
// Sous deux colonnes : une rangée qui glisse au doigt, d'un bord à l'autre de l'écran, sans barre de défilement.
const SCROLL_ROW =
  'max-[1001px]:-mx-[clamp(12px,3vw,40px)] max-[1001px]:scroll-px-[clamp(12px,3vw,40px)] max-[1001px]:flex-nowrap max-[1001px]:overflow-x-auto max-[1001px]:overscroll-x-contain max-[1001px]:px-[clamp(12px,3vw,40px)] max-[1001px]:py-1.5 max-[1001px]:[scrollbar-width:none]'
const SELECT_CLASS = `max-w-full min-w-0 border border-line bg-bg px-2 py-1.5 text-[15px] text-ink normal-case pointer-coarse:min-h-11 pointer-coarse:text-[16px] ${FOCUS}`

// Requête média suivie par React : [abonnement, lecture, valeur supposée côté serveur].
function mediaStore(query, onServer) {
  const subscribe = (notify) => {
    const list = window.matchMedia(query)
    list.addEventListener('change', notify)
    return () => list.removeEventListener('change', notify)
  }
  return [subscribe, () => window.matchMedia(query).matches, () => onServer]
}
// Côté serveur on suppose « mouvement réduit » : la rotation ne démarre jamais sans que le navigateur l'ait permis.
const REDUCED_MOTION = mediaStore('(prefers-reduced-motion: reduce)', true)
// Téléphone : écran tactile dont le petit côté fait moins de 600 px, en portrait comme en paysage.
const PHONE = mediaStore('(pointer: coarse) and (max-width: 599px), (pointer: coarse) and (max-height: 599px)', false)
const readSoundOnServer = () => true

// Plein écran : l'API du navigateur quand elle existe, sinon (iPhone) un « plein cadre » qui couvre la page.
const fullscreenElement = () => document.fullscreenElement ?? document.webkitFullscreenElement ?? null
const exitNativeFullscreen = () =>
  (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document)?.catch?.(() => {})

const ASSIST_CHOICES = [
  { id: 'high', label: 'Fortes (stable)', hint: 'Voiture très stable : peu de glisse, le tour reste facile. Elle pardonne les coups de volant brusques.' },
  { id: 'normal', label: 'Normales', hint: 'Plus vive : elle exploite plus d’adhérence et peut glisser si on pousse, l’aide rattrape les petites erreurs.' },
  { id: 'off', label: 'Aucune (sportif)', hint: 'Sans aide à la stabilité ni anti-patinage : on exploite le maximum d’adhérence, elle glisse dès qu’on dépasse la limite. Pour tester.' },
]

export default function CarViewer({ teams, circuits = [] }) {
  const [teamName, setTeamName] = useState(teams[0]?.name)
  const [rotationChoice, setRotationChoice] = useState(null)
  const prefersReducedMotion = useSyncExternalStore(...REDUCED_MOTION)
  const isPhone = useSyncExternalStore(...PHONE)
  const [settingsOpen, setSettingsOpen] = useState(false) // téléphone et tablette : réglages de conduite repliés
  const team = teams.find((candidate) => candidate.name === teamName) ?? teams[0] ?? NEUTRAL_TEAM
  const autoRotate = rotationChoice ?? !prefersReducedMotion
  const livery = useMemo(() => liveryFor(team), [team])
  const soundOn = useSyncExternalStore(subscribeSound, readSound, readSoundOnServer)

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
    // `v=2` : la réponse contient le relief ; une ancienne réponse gardée par le navigateur ne doit pas resservir.
    fetch(`/api/circuit/${circuitKey}?v=2`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data) => {
        const built = buildCircuitTrack(data.points, { key: circuitKey, relief: data.relief })
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

  const frameRef = useRef(null)
  const [nativeFullscreen, setNativeFullscreen] = useState(false)
  // Plein cadre (sans API) : 'manual' (bouton) ou 'drive' (ouvert par « Conduire » sur téléphone, finit avec elle).
  const [pseudo, setPseudo] = useState(null)
  const autoFullscreenRef = useRef(false) // plein écran du navigateur ouvert par « Conduire »

  const { containerRef, status, source, driving, hud, startDriving, stopDriving, setTouch, goToView } = useCarScene({
    livery,
    team,
    autoRotate,
    road,
    assist,
    sound: soundOn,
  })
  const pseudoFullscreen = pseudo === 'manual' || (pseudo === 'drive' && driving)
  const isFullscreen = nativeFullscreen || pseudoFullscreen

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

  useEffect(() => {
    const onChange = () => {
      const active = fullscreenElement() === frameRef.current && frameRef.current !== null
      setNativeFullscreen(active)
      if (!active) {
        autoFullscreenRef.current = false
        try {
          screen.orientation?.unlock?.()
        } catch {
          // pas de verrouillage d'orientation sur cet appareil
        }
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  async function enterFullscreen(origin) {
    const frame = frameRef.current
    if (!frame) return
    const request = frame.requestFullscreen ?? frame.webkitRequestFullscreen
    if (!request) {
      setPseudo(origin)
      return
    }
    try {
      await request.call(frame)
      // Sur téléphone, le paysage est le bon sens pour conduire : on le demande, sans insister s'il est refusé.
      await screen.orientation?.lock?.('landscape')
    } catch {
      if (!fullscreenElement()) setPseudo(origin)
    }
  }

  async function toggleFullscreen() {
    if (pseudoFullscreen) setPseudo(null)
    else if (fullscreenElement()) await exitNativeFullscreen()
    else await enterFullscreen('manual')
  }

  // Conduite finie (bouton « Quitter » ou Échap) : on referme le plein écran qu'elle avait ouvert.
  useEffect(() => {
    if (driving || !autoFullscreenRef.current) return
    autoFullscreenRef.current = false
    if (fullscreenElement()) exitNativeFullscreen()
  }, [driving])

  // Pendant la conduite : F pour (dé)passer en plein écran, M pour couper ou remettre le son. Échap quitte aussi le
  // plein cadre (sans API).
  const toggleFullscreenRef = useRef(toggleFullscreen)
  useEffect(() => {
    toggleFullscreenRef.current = toggleFullscreen
  })
  useEffect(() => {
    function onKey(event) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      if (event.code === 'KeyF' && driving) {
        event.preventDefault()
        toggleFullscreenRef.current()
      } else if (driving && event.key?.toLowerCase() === 'm') {
        // `key` et non `code` : sur un clavier AZERTY, la touche M n'est pas à la place du M américain.
        event.preventDefault()
        writeSound(!readSound())
      } else if (event.code === 'Escape' && pseudoFullscreen) setPseudo(null)
    }
    // Phase de capture : Échap quitte aussi la conduite, ce qui re-rend le composant et retirerait cet écouteur avant
    // qu'il soit appelé s'il passait après celui de la conduite.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [driving, pseudoFullscreen])

  // Le plein cadre fige le défilement de la page.
  useEffect(() => {
    if (!pseudoFullscreen) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [pseudoFullscreen])

  function toggleDriving() {
    if (driving) {
      stopDriving()
      return
    }
    // La rotation automatique n'a pas de sens au volant, et reprendrait au retour au showroom.
    setRotationChoice(false)
    startDriving()
    setPseudo((current) => (current === 'drive' ? null : current))
    if (isFullscreen) return
    if (isPhone) {
      // Sur téléphone la conduite prend tout l'écran. Appel direct pendant le geste : le navigateur l'exige.
      autoFullscreenRef.current = true
      enterFullscreen('drive')
      return
    }
    // Le cadre grandit en conduite et ne défile pas au doigt : on le ramène entièrement à l'écran (sans animation).
    requestAnimationFrame(() => containerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }))
  }

  function pickView(view) {
    // Une vue choisie à la main arrête la rotation automatique : sinon elle l'emporterait aussitôt.
    setRotationChoice(false)
    goToView(view.position)
  }

  const assistChoice = ASSIST_CHOICES.find((choice) => choice.id === assist) ?? ASSIST_CHOICES[0]
  const driveDisabled = status !== 'ready' || (circuitLoading && !driving)
  // Pourquoi un tracé manque ou fait attendre le bouton « Conduire ».
  const circuitNotice = [
    circuits.length === 0 ? 'Circuits indisponibles pour le moment (calendrier injoignable) : seul le circuit fictif est proposé. ' : '',
    circuitLoading ? 'Chargement du tracé… ' : circuitFailed ? 'Tracé indisponible pour le moment : on reste sur la piste précédente. ' : '',
  ].join('')

  return (
    <div className="mt-7 grid gap-6 compact:mt-3 min-[1001px]:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Visionneuse 3D" className="min-w-0">
        <div ref={frameRef} className={`overflow-hidden bg-track ${pseudoFullscreen ? 'fixed inset-0 z-50' : 'relative'}`}>
          <div
            ref={containerRef}
            role="img"
            aria-label={
              driving
                ? `Conduite de la monoplace ${team.name} sur ${activeCircuit ? `le circuit ${activeCircuit.name}` : 'une piste fictive'}. Flèches ou Z Q S D pour piloter, M pour le son, Échap pour quitter.`
                : `Monoplace de F1 en 3D aux couleurs de ${team.name}. Glisser pour la faire tourner, molette pour s'approcher.`
            }
            // La scène ne dépasse jamais l'écran, et au garage elle laisse la place à la bande d'écuries (76 px).
            // `svh` : la hauteur ne bouge pas quand la barre d'adresse apparaît ou disparaît, le rendu n'est donc pas
            // redimensionné en roulant.
            className={
              isFullscreen
                ? 'h-dvh'
                : driving
                  ? 'h-[min(460px,100svh)] min-[700px]:h-[min(540px,100svh)]'
                  : 'h-[min(340px,calc(100svh-76px))] min-[700px]:h-[min(540px,calc(100svh-76px))]'
            }
          />
          {status === 'loading' && <Message>Chargement de la voiture…</Message>}
          {status === 'unavailable' && (
            <Message>
              Le rendu 3D n’est pas disponible sur cet appareil (WebGL est désactivé ou non pris en charge). Les
              couleurs des écuries restent consultables dans la liste.
            </Message>
          )}
          {driving && <DriveHud hud={hud} onTouch={setTouch} onQuit={stopDriving} lowPads={isPhone} />}
          {(driving || isFullscreen) && (
            // En colonne : sur téléphone, il n'y a la place que d'un bouton entre les deux panneaux du tableau de bord.
            <div className="absolute top-3 left-1/2 flex -translate-x-1/2 flex-col gap-1.5">
              <FrameButton
                label={isFullscreen ? 'Quitter le plein écran' : 'Passer en plein écran'}
                pressed={isFullscreen}
                onClick={toggleFullscreen}
                icon={isFullscreen ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'}
              />
              {driving && (
                // L'icône (haut-parleur actif ou barré) suffit à dire l'état : pas d'inversion du bouton.
                <FrameButton
                  label="Son du moteur"
                  pressed={soundOn}
                  onClick={() => writeSound(!soundOn)}
                  icon={`M4 9.5h3.5L13 5v14l-5.5-4.5H4z${soundOn ? 'M16.5 9a4.5 4.5 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11' : 'M16 9.5l5 5M21 9.5l-5 5'}`}
                />
              )}
            </div>
          )}
          {/* En conduite sur téléphone, le bandeau cède la place à la piste. */}
          <div
            className={`pointer-events-none absolute bottom-4 left-0 max-w-full items-stretch ${driving && isPhone ? 'hidden' : 'flex'}`}
          >
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

        <TeamStrip teams={teams} selected={team.name} onSelect={setTeamName} />

        <div className={`mt-3 flex flex-wrap items-center gap-2 ${SCROLL_ROW}`} role="group" aria-label="Angle de caméra">
          {CAMERA_VIEWS.map((view) => (
            <button key={view.id} type="button" className={`${BUTTON_CLASS} shrink-0 text-[14px] disabled:opacity-40`} disabled={driving} onClick={() => pickView(view)}>
              {view.label}
            </button>
          ))}
          <button
            type="button"
            className={`${BUTTON_CLASS} ml-auto shrink-0 text-[14px] disabled:opacity-40`}
            aria-pressed={autoRotate}
            disabled={driving}
            onClick={() => setRotationChoice(!autoRotate)}
          >
            Rotation automatique
          </button>
        </div>
        <DriveButton
          driving={driving}
          quitLabel="Quitter la conduite"
          disabled={driveDisabled}
          onClick={toggleDriving}
          className="mt-2 h-14 w-full text-[22px] min-[1001px]:hidden"
        />
        {/* Hors du panneau repliable : la raison doit rester visible (et annoncée) près du bouton. */}
        <p role="status" className={`text-[14px] text-mute min-[1001px]:hidden ${circuitNotice ? 'mt-2' : ''}`}>
          {circuitNotice}
        </p>
        <button
          type="button"
          aria-expanded={settingsOpen}
          aria-controls="reglages-conduite"
          onClick={() => setSettingsOpen(!settingsOpen)}
          className={`mt-2 flex min-h-14 w-full items-center justify-between gap-3 bg-panel px-3 py-2 text-left active:bg-line min-[1001px]:hidden ${TOUCH} ${FOCUS}`}
        >
          <span className="flex min-w-0 flex-col">
            <span className="font-display text-[18px] leading-tight font-bold uppercase">Réglages de conduite</span>
            <span className="truncate text-[13px] text-mute">
              {activeCircuit?.name ?? 'Circuit fictif'}, aides : {assistChoice.label}
            </span>
          </span>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0">
            <path d={settingsOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
          </svg>
        </button>
        <div
          id="reglages-conduite"
          className={`flex-wrap items-end gap-x-4 gap-y-2 bg-panel px-3 py-3 min-[1001px]:mt-3 min-[1001px]:flex ${settingsOpen ? 'mt-px flex' : 'hidden'}`}
        >
          <label className="flex min-w-0 flex-col gap-1 text-[13px] text-mute uppercase compact:w-full">
            Circuit
            <select
              value={circuitKey}
              onChange={pickCircuit}
              disabled={circuits.length === 0}
              className={SELECT_CLASS}
            >
              <option value="">Circuit fictif</option>
              {circuits.map((circuit) => (
                <option key={circuit.key} value={circuit.key}>
                  {circuit.name} · {countryNameFr(circuit.country)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-[13px] text-mute uppercase compact:w-full">
            Aides à la conduite
            <select
              value={assist}
              onChange={pickAssist}
              className={SELECT_CLASS}
            >
              {ASSIST_CHOICES.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <DriveButton
            driving={driving}
            quitLabel="Quitter (Échap)"
            disabled={driveDisabled}
            onClick={toggleDriving}
            className="px-4 py-1.5 text-[18px] max-[1001px]:hidden"
          />
          <button
            type="button"
            className={`${BUTTON_CLASS} text-[15px] disabled:opacity-40`}
            aria-pressed={isFullscreen}
            disabled={status !== 'ready'}
            onClick={toggleFullscreen}
          >
            Plein écran{driving ? ' (F)' : ''}
          </button>
          <button type="button" className={`${BUTTON_CLASS} text-[14px]`} aria-pressed={soundOn} onClick={() => writeSound(!soundOn)}>
            Son du moteur{driving ? ' (M)' : ''}
          </button>
          <p role="status" className="basis-full text-[14px] text-mute">
            <span className="max-[1001px]:hidden">{circuitNotice}</span>
            {assistChoice.hint}
          </p>
        </div>
        <p className="mt-3 max-w-[70ch] text-[14px] text-mute max-[1001px]:max-w-[56ch]">
          {driving
            ? 'Flèches ou Z Q S D pour piloter (sur écran tactile : joystick à gauche pour tourner, frein et gaz à droite), R pour revenir sur la piste, F pour le plein écran, M pour le son, Échap pour quitter. Tour supprimé si les quatre roues sortent de la piste. Vibreurs, gravier (il freine fort), murs de pneus (ils te remettent sur la piste), tribunes, bâtiment des stands, panneaux de freinage et arbres sont placés d’après la forme du tracé, pas d’après le vrai circuit. Secteurs : trois tiers égaux du tour, pas les secteurs officiels. Départ approximatif. Relief : altitude mesurée par OpenF1 sur les vrais circuits, inventée sur le circuit fictif ; lissée et sans dévers. Son du moteur synthétisé (sur iPhone, le mode silencieux le coupe sans doute aussi). Le braquage des roues avant est amplifié à l’écran pour rester visible.'
            : source === 'fallback'
              ? 'Le modèle 3D n’a pas pu être chargé : voici une monoplace stylisée construite en code, aux proportions d’une F1 de 2025. Ce n’est pas la reproduction d’une voiture précise.'
              : source === 'code'
                ? 'Monoplace stylisée construite en code aux cotes d’une F1 (2022-2025), pas une voiture réelle. Couleurs approchées ; logos et noms sont des marques de leurs propriétaires (projet étudiant non officiel). Numéro : premier pilote de l’écurie.'
                : 'Modèle 3D généré par IA à partir d’une image de F1 générique : ce n’est pas la reproduction d’une voiture précise. Les roues sont construites en code. Couleurs approchées ; logos et noms sont des marques de leurs propriétaires (projet étudiant non officiel). Numéro : premier pilote de l’écurie.'}
        </p>
      </section>

      <aside aria-labelledby="teams-title" className="min-w-0 bg-panel px-4 pt-3 pb-4 max-[1001px]:hidden">
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
                  className={`flex w-full items-stretch bg-bg text-left hover:bg-line active:bg-line ${TOUCH} ${FOCUS} aria-pressed:bg-line`}
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

// Téléphone et tablette : les écuries défilent sous la voiture, on la voit changer de couleurs en touchant.
function TeamStrip({ teams, selected, onSelect }) {
  if (teams.length === 0) {
    return (
      <p className="mt-2 text-[14px] text-mute min-[1001px]:hidden">
        Liste des écuries indisponible pour le moment : la voiture reste aux couleurs neutres.
      </p>
    )
  }
  return (
    <div role="group" aria-label="Écuries" className={`mt-1 flex gap-1.5 min-[1001px]:hidden ${SCROLL_ROW}`}>
      {teams.map((candidate) => (
        <button
          key={candidate.name}
          type="button"
          aria-pressed={candidate.name === selected}
          onClick={(event) => {
            onSelect(candidate.name)
            // Une écurie touchée au bord de l'écran est ramenée en entier (sans animation).
            event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
          }}
          className={`flex min-h-12 shrink-0 items-stretch bg-panel active:bg-line ${TOUCH} ${FOCUS} aria-pressed:bg-ink aria-pressed:text-bg`}
        >
          <span className="w-1.5 shrink-0" style={{ backgroundColor: candidate.colour }} aria-hidden="true" />
          <span className="flex items-center px-3 font-display text-[19px] font-bold whitespace-nowrap">{candidate.name}</span>
        </button>
      ))}
    </div>
  )
}

function DriveButton({ driving, quitLabel, disabled, onClick, className }) {
  const colours = driving ? 'bg-ink text-bg active:opacity-70' : 'bg-bg text-ink hover:bg-ink hover:text-bg active:bg-ink active:text-bg'
  return (
    <button
      type="button"
      className={`border border-ink font-display font-bold uppercase disabled:opacity-40 ${TOUCH} ${FOCUS} ${colours} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {driving ? quitLabel : 'Conduire'}
    </button>
  )
}

// Bouton-icône posé sur la scène 3D.
function FrameButton({ label, pressed, onClick, icon }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex size-10 touch-manipulation items-center justify-center bg-panel/90 text-ink select-none [-webkit-tap-highlight-color:transparent] hover:bg-ink hover:text-bg active:bg-ink active:text-bg pointer-coarse:size-11 ${FOCUS}`}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d={icon} />
      </svg>
    </button>
  )
}

function Message({ children }) {
  return (
    <p role="status" className="absolute inset-0 flex items-center justify-center px-6 text-center text-mute">
      {children}
    </p>
  )
}
