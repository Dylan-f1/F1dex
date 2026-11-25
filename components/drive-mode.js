// Mode « conduite » du garage : une piste (le circuit fictif ou un vrai circuit), la voiture pilotable au clavier
// ou au toucher, une caméra qui la suit. Les calculs (physique, tours) sont dans lib/car-drive.js ; ici :
// l'affichage de la piste, les entrées, la caméra, les roues, le son et l'enregistrement du meilleur tour.
// Rien n'est ajouté à la scène tant que la conduite n'a pas été lancée une première fois : seuls les calculs et les
// dessins sont préparés au repos.

import { AMBIANCES, pickAmbiance, sunVector } from '@/lib/ambiance'
import { DEFAULT_VIEW } from '@/lib/car-camera'
import { loadBest, saveBest } from '@/lib/best-laps'
import { ASSISTS, DEFAULT_ASSIST } from '@/lib/car-physics'
import { DRIVE, buildDriveTrack, createDriveState, groundUnder, pointAt, stepDrive } from '@/lib/car-drive'
import { getFeatures } from '@/lib/circuit-features'
import { getScenery } from '@/lib/circuit-scenery'
import { ENGINE_SOUND, engineSound, soundRevs } from '@/lib/engine-sound'
import { FICTIVE_RELIEF } from '@/lib/relief'
import { barrierLayout, groveTrees, racingLine } from '@/lib/scenery-layout'
import { TERRAIN, floorAt, getTerrain } from '@/lib/terrain'
import { buildRoad } from './drive-road'
import { buildScenery } from './drive-scenery'
import { buildSky, warmSky } from './drive-sky'
import { contactTexture, textureWarmUps } from './drive-textures'
import { buildTrees } from './drive-trees'
import { createEngineAudio } from './engine-audio'

const CHASE_DISTANCE = { still: 8, fast: 12 } // m derrière la voiture, à l'arrêt et à pleine vitesse
const CHASE_HEIGHT = 2.8
const LOOK_HEIGHT = 0.8 // m au-dessus du sol : hauteur du point visé
// Appoint venant de la caméra : sans lui, l'arrière de la voiture reste noir selon le cap (force : lib/ambiance.js).
const FILL_LIGHT = { colour: '#dfe7f5', lift: 3 }
// Ombres du soleil en conduite : un carré de `half` m de demi-côté, centré en avant de la voiture. Plus petit et
// moins fin sur écran tactile.
const WARM_SPARE = 8 // ms de temps libre en dessous duquel la préparation au repos rend la main
const SHADOWS = { fine: { half: 80, map: 2048 }, touch: { half: 50, map: 1024 }, distance: 180, lead: 0.6 }
// Point visé devant la voiture : plus il est proche, plus la voiture remonte vers le centre du cadre (les boutons
// tactiles occupent le bas de l'image).
const LOOK_AHEAD = 1.5
const CAMERA_TURN_RATE = 7 // par seconde : la caméra suit le cap de la voiture avec un léger retard (on voit la glisse)
const CAMERA_TILT_RATE = 4 // par seconde : et sa pente, adoucie
const CAMERA_TILT_SHARE = 0.7 // part de la pente que la caméra suit : le reste se voit à l'image
const CAMERA_CLEARANCE = 1.4 // m : hauteur minimale au-dessus du sol
const DRIVE_CLIP = { near: 0.5, far: 4000 } // plus loin qu'au showroom : les circuits font plusieurs kilomètres
const HUD_INTERVAL_MS = 100
const NOTICE_MS = 2800 // durée du message « mur »
const KERB_SHAKE = 0.06 // m d'amplitude de la secousse sur vibreur, à pleine vitesse
const LIGHTS_OUT_VISIBLE = 1.2 // s pendant lesquelles les feux restent affichés (éteints) après le départ
const REV_LIMIT = 13000
export const DRIVE_FOV = { wide: 50, narrow: 64 }

// Touches lues par `event.code` (position physique) : KeyW/KeyA/KeyS/KeyD sont Z/Q/S/D sur un clavier AZERTY.
const KEY_ACTIONS = {
  ArrowUp: 'throttle',
  KeyW: 'throttle',
  ArrowDown: 'brake',
  KeyS: 'brake',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))

// Le stockage peut être indisponible (navigation privée, politique du navigateur) : jamais d'erreur.
function browserStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function createDriveMode({ THREE, scene, camera, controls, canvas, sun, rig, wheels, showroom, onHud, onExit }) {
  const fictive = buildDriveTrack({ relief: FICTIVE_RELIEF })
  let road = fictive
  let visuals = null // { group, resources } : la piste affichée, libérée quand on change de circuit
  let state = createDriveState(road)
  let active = false
  let disposed = false
  let lastTime = null
  let lastHud = 0
  let savedBest = 0
  let cameraHeading = 0
  let cameraTilt = 0
  let resetRequested = false
  let noticeUntil = 0
  let noticeText = ''
  let seenCrashes = 0
  let assist = DEFAULT_ASSIST
  const audio = createEngineAudio()
  let revs = ENGINE_SOUND.idleRpm // régime entendu
  const keys = { throttle: false, brake: false, left: false, right: false }
  const touch = { throttle: 0, brake: 0, steer: 0 }
  // Réglages du showroom, à restaurer en sortant (on ne copie que ces champs : le reste de la caméra est en lecture seule).
  const { left, right, top, bottom, near, far } = sun.shadow.camera
  const showroomShadow = { left, right, top, bottom, near, far }
  const showroomClip = { near: camera.near, far: camera.far }
  const forward = new THREE.Vector3()
  const lookAt = new THREE.Vector3()
  // Ambiance choisie par l'adresse (?ciel=jour, soir ou couvert) : voir lib/ambiance.js.
  const ambiance = AMBIANCES[pickAmbiance(window.location.search)]
  const fill = new THREE.DirectionalLight(FILL_LIGHT.colour, ambiance.fill)
  const skylight = new THREE.HemisphereLight(ambiance.ambient.sky, ambiance.ambient.ground, ambiance.ambient.intensity)
  const shadows = window.matchMedia?.('(pointer: coarse)').matches ? SHADOWS.touch : SHADOWS.fine
  const sunDirection = new THREE.Vector3(0, 1, 0)
  const lightRight = new THREE.Vector3()
  const lightUp = new THREE.Vector3()
  const focus = new THREE.Vector3()
  let showroomLook = null // ce que la conduite a changé dans la scène du garage, à restaurer en sortant
  let contact = null // ombre de contact sous la voiture, créée à la première conduite

  function buildVisuals() {
    const resources = []
    const group = new THREE.Group()
    const terrain = getTerrain(road)
    const groundY = (x, z) => terrain?.surface(x, z) ?? 0
    const heading = pointAt(road, 0).heading
    const surfaces = buildRoad(THREE, road, resources)
    const buildings = buildScenery(THREE, road, resources)
    const trees = buildTrees(THREE, road, groundY, ambiance.fog.far, resources)
    const sky = buildSky(THREE, ambiance, heading, resources)
    group.add(sky.group, surfaces.group, buildings.group, trees.group)
    group.visible = active
    scene.add(group)
    return {
      group,
      resources,
      sun: sunVector(ambiance.sun, heading),
      // À chaque image : le ciel suit la caméra, les détails lointains sont retirés.
      update(view) {
        sky.follow(view, surfaces.level)
        surfaces.update(view)
        buildings.update(view)
        trees.update(view)
      },
    }
  }

  // Ciel, brume, soleil et ombres de la conduite, posés sur la scène du garage puis retirés.
  function enterAtmosphere() {
    showroomLook = {
      background: scene.background,
      fog: scene.fog,
      colour: sun.color.clone(),
      intensity: sun.intensity,
      bias: sun.shadow.bias,
      normalBias: sun.shadow.normalBias,
      mapSize: sun.shadow.mapSize.clone(),
    }
    scene.background = new THREE.Color(ambiance.fog.colour)
    scene.fog = new THREE.Fog(ambiance.fog.colour, ambiance.fog.near, ambiance.fog.far)
    scene.add(fill, skylight)
    contact ??= buildContact()
    rig.add(contact.mesh)
    sun.color.set(ambiance.sun.colour)
    sun.intensity = ambiance.sun.intensity
    sun.shadow.bias = -0.00005
    sun.shadow.normalBias = 0.04
    setShadowMap(shadows.map, shadows.map)
    const { half } = shadows
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: SHADOWS.distance * 2 })
    sun.shadow.camera.updateProjectionMatrix()
  }

  function leaveAtmosphere() {
    scene.background = showroomLook.background
    scene.fog = showroomLook.fog
    scene.remove(fill, skylight)
    rig.remove(contact.mesh)
    sun.color.copy(showroomLook.colour)
    sun.intensity = showroomLook.intensity
    sun.shadow.bias = showroomLook.bias
    sun.shadow.normalBias = showroomLook.normalBias
    setShadowMap(showroomLook.mapSize.x, showroomLook.mapSize.y)
    Object.assign(sun.shadow.camera, showroomShadow)
    sun.shadow.camera.updateProjectionMatrix()
  }

  function buildContact() {
    const texture = contactTexture(THREE)
    const geometry = new THREE.PlaneGeometry(7.4, 3.5).rotateX(-Math.PI / 2)
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.y = 0.04
    return { mesh, resources: [texture, geometry, material] }
  }

  // La carte d'ombre doit être recréée quand sa taille change.
  function setShadowMap(width, height) {
    sun.shadow.mapSize.set(width, height)
    sun.shadow.map?.dispose()
    sun.shadow.map = null
  }

  // Les équipements, le décor et ses dessins se préparent au repos, par petites tranches (quelques millisecondes
  // chacune), pour que ni la page ni le premier « Conduire » ne se figent. Ce qui reste est terminé au clic.
  function warmUp(target) {
    const steps = (function* () {
      for (const compute of [getFeatures, getScenery, getTerrain, barrierLayout, groveTrees, racingLine]) {
        compute(target)
        yield
      }
      yield* textureWarmUps()
      yield* warmSky(ambiance)
    })()
    const later = (run) => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 100 })
      else setTimeout(run, 40) // Safari
    }
    const run = (deadline) => {
      if (disposed) return
      const from = performance.now()
      const free = () => (deadline ? deadline.timeRemaining() > WARM_SPARE : performance.now() - from < WARM_SPARE)
      do {
        if (steps.next().done) return
      } while (free())
      later(run)
    }
    later(run)
  }

  function disposeVisuals() {
    if (!visuals) return
    scene.remove(visuals.group)
    for (const resource of visuals.resources) resource.dispose()
    visuals = null
  }

  // Un meilleur tour n'est comparable qu'au même niveau d'aides.
  const bestKey = () => `${road.key}.${assist}`

  function newRun() {
    const best = loadBest(browserStorage(), bestKey())
    // Attente variable après le 5e feu, comme en course : on ne peut pas anticiper l'extinction.
    state = createDriveState(road, { hold: 0.6 + Math.random() * 1.6, best })
    savedBest = state.bestSerial
    seenCrashes = 0
    noticeUntil = 0
    resetRequested = false
    lastTime = null
    cameraHeading = state.heading
    revs = ENGINE_SOUND.idleRpm
    wheels.reset()
  }

  function currentInput() {
    const steerKeys = (keys.left ? 1 : 0) - (keys.right ? 1 : 0)
    const input = {
      throttle: Math.max(keys.throttle ? 1 : 0, touch.throttle),
      brake: Math.max(keys.brake ? 1 : 0, touch.brake),
      steer: Math.max(-1, Math.min(1, steerKeys + touch.steer)),
      reset: resetRequested,
      assist,
    }
    resetRequested = false
    return input
  }

  function releaseInputs() {
    keys.throttle = keys.brake = keys.left = keys.right = false
    touch.throttle = touch.brake = touch.steer = 0
    resetRequested = false
  }

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.code === 'Escape') {
      event.preventDefault()
      onExit()
      return
    }
    if (event.code === 'KeyR') {
      if (!event.repeat) resetRequested = true
      return
    }
    const action = KEY_ACTIONS[event.code]
    if (!action) return
    // Sinon les flèches font défiler la page pendant qu'on conduit.
    event.preventDefault()
    keys[action] = true
  }
  function onKeyUp(event) {
    const action = KEY_ACTIONS[event.code]
    if (action) keys[action] = false
  }
  // Une touche relâchée pendant que la fenêtre n'a plus le focus n'enverrait pas d'événement : on lâche tout.
  const onBlur = () => releaseInputs()
  const onVisibility = () => {
    if (document.hidden) releaseInputs()
  }

  function listen(on) {
    const method = on ? 'addEventListener' : 'removeEventListener'
    window[method]('keydown', onKeyDown)
    window[method]('keyup', onKeyUp)
    window[method]('blur', onBlur)
    document[method]('visibilitychange', onVisibility)
  }

  // La caméra reste à distance fixe derrière la voiture (aucun retard à 300 km/h) ; seul son cap suit celui de la
  // voiture avec un délai, ce qui laisse voir les glissades.
  function placeCamera(instant, dt, shake = 0) {
    const slope = groundUnder(road, state)?.forward ?? 0
    if (instant) {
      cameraHeading = state.heading
      cameraTilt = slope
    } else {
      cameraHeading += wrapAngle(state.heading - cameraHeading) * (1 - Math.exp(-CAMERA_TURN_RATE * dt))
      cameraTilt += (slope - cameraTilt) * (1 - Math.exp(-CAMERA_TILT_RATE * dt))
    }
    forward.set(Math.cos(cameraHeading), 0, -Math.sin(cameraHeading))
    const distance = CHASE_DISTANCE.still + (CHASE_DISTANCE.fast - CHASE_DISTANCE.still) * Math.min(1, state.speed / 80)
    const floor = floorAt(road, state)
    const height = floor + CHASE_HEIGHT - distance * cameraTilt * CAMERA_TILT_SHARE + shake
    camera.position.set(state.x, height, state.z).addScaledVector(forward, -distance)
    const terrain = getTerrain(road)
    if (terrain) {
      camera.position.y = Math.max(camera.position.y, terrain.surface(camera.position.x, camera.position.z) + TERRAIN.drop + CAMERA_CLEARANCE)
    }
    lookAt.set(state.x, floor + LOOK_HEIGHT + LOOK_AHEAD * cameraTilt, state.z).addScaledVector(forward, LOOK_AHEAD)
    camera.lookAt(lookAt)
    fill.position.copy(camera.position).y += FILL_LIGHT.lift
    fill.target.position.set(state.x, floor, state.z)
    fill.target.updateMatrixWorld()
    visuals?.update(camera)
  }

  // Secousse sur vibreur : la voiture et la caméra tressautent, d'autant plus que la voiture va vite.
  function bump(now) {
    if (state.surface !== 'kerb' || state.speed < 8) return 0
    return KERB_SHAKE * Math.min(1, state.speed / 70) * (Math.sin(now * 0.09) + 0.6 * Math.sin(now * 0.173))
  }

  function placeCarAndSun(shake = 0) {
    const floor = floorAt(road, state)
    const ground = groundUnder(road, state)
    rig.position.set(state.x, floor + Math.abs(shake) * 0.5, state.z)
    // Cap, puis tangage (nez vers +x), puis roulis dans la pente.
    rig.rotation.set(Math.atan(ground?.left ?? 0), state.heading, Math.atan(ground?.forward ?? 0), 'YZX')
    placeSun(floor)
  }

  // La zone ombrée suit la voiture, un peu en avant. Elle se déplace par pas d'un point de la carte d'ombre : sans
  // cela, les bords des ombres scintillent en roulant.
  function placeSun(floor) {
    sunDirection.set(visuals.sun.x, visuals.sun.y, visuals.sun.z)
    const lead = shadows.half * SHADOWS.lead
    focus.set(state.x + Math.cos(state.heading) * lead, floor, state.z - Math.sin(state.heading) * lead)
    lightRight.set(sunDirection.z, 0, -sunDirection.x).normalize()
    lightUp.crossVectors(sunDirection, lightRight)
    const texel = (shadows.half * 2) / shadows.map
    for (const axis of [lightRight, lightUp]) {
      const along = focus.dot(axis)
      focus.addScaledVector(axis, Math.round(along / texel) * texel - along)
    }
    sun.target.position.copy(focus)
    sun.target.updateMatrixWorld()
    sun.position.copy(focus).addScaledVector(sunDirection, SHADOWS.distance)
  }

  function sectorsView() {
    return [0, 1, 2].map((index) => {
      const current = state.sectors[index]
      const time = current ?? state.lastSectors?.[index] ?? null
      return {
        time,
        fresh: current !== null, // temps du tour en cours (sinon : celui du tour précédent)
        best: time !== null && state.bestSectors[index] !== null && time <= state.bestSectors[index],
      }
    })
  }

  function emitHud(now, force) {
    if (!force && now - lastHud < HUD_INTERVAL_MS) return
    lastHud = now
    if (state.crashes > seenCrashes) {
      seenCrashes = state.crashes
      noticeText = 'Contre un obstacle : remise en piste'
      noticeUntil = now + NOTICE_MS
    }
    const lightsOutAt = DRIVE.lightsCount * DRIVE.lightsInterval + state.hold
    onHud({
      speed: Math.round(state.speed * 3.6),
      gear: state.u < -0.5 ? 'R' : state.phase === 'lights' ? 'N' : state.gear,
      rpm: Math.min(1, state.rpm / REV_LIMIT),
      reversing: state.u < -0.5,
      onTrack: state.onTrack,
      surface: state.surface,
      notice: now < noticeUntil ? noticeText : '',
      lapValid: state.lapValid,
      phase: state.phase,
      lights: state.phase === 'lights' || state.t < lightsOutAt + LIGHTS_OUT_VISIBLE ? state.lightsLit : null,
      running: state.running,
      lapTime: state.lapTime,
      laps: state.laps,
      lastLap: state.lastLap,
      lastLapValid: state.lastLapValid,
      bestLap: state.bestLap,
      delta: state.delta,
      sectors: sectorsView(),
      recoveries: state.recoveries,
    })
  }

  function saveNewBest() {
    if (state.bestSerial === savedBest) return
    savedBest = state.bestSerial
    saveBest(browserStorage(), bestKey(), { time: state.bestLap, sectors: state.bestSectors, profile: state.bestProfile })
  }

  warmUp(road) // la piste affichée par défaut

  return {
    get active() {
      return active
    },
    // Change de circuit : `next` = piste de lib/drive-track.js, ou null pour le circuit fictif. En pleine conduite,
    // la course recommence sur la nouvelle piste.
    setRoad(next) {
      const target = next ?? fictive
      if (target === road) return
      road = target
      disposeVisuals()
      if (!active) {
        warmUp(target)
        return
      }
      visuals = buildVisuals()
      newRun()
      placeCarAndSun()
      placeCamera(true, 0)
      emitHud(0, true)
    },
    // Niveau d'aides ('high' | 'normal' | 'off') : en pleine conduite, la course recommence (les temps ne seraient pas comparables).
    setAssist(next) {
      const level = next in ASSISTS ? next : DEFAULT_ASSIST
      if (level === assist) return
      assist = level
      if (!active) return
      newRun()
      placeCarAndSun()
      placeCamera(true, 0)
      emitHud(0, true)
    },
    start() {
      if (active) return
      active = true
      visuals ??= buildVisuals()
      newRun()
      releaseInputs()
      for (const object of showroom) object.visible = false
      visuals.group.visible = true
      controls.enabled = false
      canvas.style.touchAction = 'none'
      enterAtmosphere()
      Object.assign(camera, DRIVE_CLIP)
      camera.updateProjectionMatrix()
      placeCarAndSun()
      placeCamera(true, 0)
      listen(true)
      audio.start() // appelé depuis le clic « Conduire » : le navigateur autorise le son
      emitHud(0, true)
    },
    stop() {
      if (!active) return
      active = false
      listen(false)
      releaseInputs()
      audio.stop()
      wheels.reset()
      visuals.group.visible = false
      for (const object of showroom) object.visible = true
      // Retour au showroom : voiture à l'origine, vue par défaut, rotation à la souris de nouveau possible.
      rig.position.set(0, 0, 0)
      rig.rotation.set(0, 0, 0)
      leaveAtmosphere()
      Object.assign(camera, showroomClip)
      camera.updateProjectionMatrix()
      sun.target.position.set(0, 0, 0)
      sun.target.updateMatrixWorld()
      sun.position.set(4, 9, 5)
      controls.enabled = true
      canvas.style.touchAction = 'pan-y'
      camera.position.set(...DEFAULT_VIEW.position)
      controls.update()
    },
    // Appelé à chaque image tant que la conduite est active.
    update(now) {
      const dt = lastTime === null ? 0 : (now - lastTime) / 1000
      lastTime = now
      const input = currentInput()
      state = stepDrive(road, state, input, dt)
      saveNewBest()
      const frameTime = Math.min(dt, DRIVE.maxStep)
      wheels.update(state, frameTime)
      revs = soundRevs(revs, { phase: state.phase, rpm: state.rpm, gear: state.gear, throttle: input.throttle }, frameTime)
      audio.update(engineSound({ rpm: revs, throttle: input.throttle, speed: state.speed, shifting: state.shift > 0 }))
      const shake = bump(now)
      placeCarAndSun(shake)
      placeCamera(false, frameTime, shake)
      emitHud(now, false)
    },
    setTouch(next) {
      Object.assign(touch, next)
    },
    setSound(on) {
      audio.setMuted(!on)
    },
    // La boucle d'affichage s'arrête (onglet caché, scène hors écran) : le moteur se tait avec elle.
    setPaused: audio.setPaused,
    dispose() {
      disposed = true
      if (active) listen(false)
      active = false
      audio.dispose()
      disposeVisuals()
      for (const resource of contact?.resources ?? []) resource.dispose()
    },
  }
}
