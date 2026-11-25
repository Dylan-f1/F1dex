// Mode « conduite » du garage : une piste (le circuit fictif ou un vrai circuit), la voiture pilotable au clavier
// ou au toucher, une caméra qui la suit. Les calculs (physique, tours) sont dans lib/car-drive.js ; ici :
// l'affichage de la piste, les entrées, la caméra, les roues, le son et l'enregistrement du meilleur tour.
// Ce module ne crée rien tant que la conduite n'a pas été lancée une première fois.

import { DEFAULT_VIEW } from '@/lib/car-camera'
import { loadBest, saveBest } from '@/lib/best-laps'
import { ASSISTS, DEFAULT_ASSIST } from '@/lib/car-physics'
import { DRIVE, buildDriveTrack, createDriveState, groundUnder, pointAt, stepDrive } from '@/lib/car-drive'
import { KERB_WIDTH, WALL_HEIGHT, getFeatures } from '@/lib/circuit-features'
import { getScenery } from '@/lib/circuit-scenery'
import { offsetLine, offsetPoint } from '@/lib/drive-track'
import { ENGINE_SOUND, engineSound, soundRevs } from '@/lib/engine-sound'
import { FICTIVE_RELIEF, gradeAt, heightAt } from '@/lib/relief'
import { TERRAIN, floorAt, getTerrain, pavedEdge, skirtFoot } from '@/lib/terrain'
import { buildScenery } from './drive-scenery'
import { buildTerrainMesh } from './drive-terrain'
import { createEngineAudio } from './engine-audio'

// Couleurs : les jetons de la DA (voir app/globals.css) — asphalte `panel`, trait blanc `ink`.
const GRASS_COLOUR = '#10231a'
const ASPHALT_COLOUR = '#141922'
const LINE_COLOUR = '#eef1f5'
const KERB_RED = '#da291c' // jeton `tyre-soft`
const GRAVEL_COLOUR = '#4f4a42'
const WALL_LIGHT = '#c9ced6'
const WALL_DARK = '#2a3240'

const CHASE_DISTANCE = { still: 9, fast: 13 } // m derrière la voiture, à l'arrêt et à pleine vitesse
const CHASE_HEIGHT = 3.4
// Point visé devant la voiture : plus il est proche, plus la voiture remonte vers le centre du cadre (les boutons
// tactiles occupent le bas de l'image).
const LOOK_AHEAD = 1.5
const CAMERA_TURN_RATE = 7 // par seconde : la caméra suit le cap de la voiture avec un léger retard (on voit la glisse)
const CAMERA_TILT_RATE = 4 // par seconde : et sa pente, adoucie
const CAMERA_TILT_SHARE = 0.7 // part de la pente que la caméra suit : le reste se voit à l'image
const CAMERA_CLEARANCE = 1.4 // m : hauteur minimale au-dessus du sol
const RETAINING_COLOUR = '#3a404a' // murs de soutènement, là où la piste domine le sol
const DRIVE_CLIP = { near: 0.5, far: 4000 } // plus loin qu'au showroom : les circuits font plusieurs kilomètres
const GROUND_MARGIN = 1200 // m de sol autour du circuit
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
  const { left, right, top, bottom, far } = sun.shadow.camera
  const showroomShadow = { left, right, top, bottom, far }
  const showroomClip = { near: camera.near, far: camera.far }
  const forward = new THREE.Vector3()
  const lookAt = new THREE.Vector3()

  const level = (index) => road.relief?.heights[index] ?? 0

  // Bande de largeur variable le long de la piste, entre deux décalages latéraux (en mètres, positifs vers la
  // droite de la marche).
  function ribbon(resources, from, to, height, colour, polygonOffset) {
    const first = offsetLine(road, from)
    const second = offsetLine(road, to)
    const positions = []
    const indices = []
    const count = first.length
    for (let index = 0; index < count; index += 1) {
      const y = level(index) + height
      positions.push(first[index].x, y, first[index].z, second[index].x, y, second[index].z)
      const next = (index + 1) % count
      indices.push(index * 2, index * 2 + 1, next * 2, index * 2 + 1, next * 2 + 1, next * 2)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const material = new THREE.MeshStandardMaterial({
      color: colour,
      roughness: 1,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -polygonOffset,
      polygonOffsetUnits: -polygonOffset,
    })
    resources.push(geometry, material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    return mesh
  }

  // Bande entre deux écarts latéraux (en mètres, valeurs positives, côté `side`), limitée aux échantillons où
  // `active(i)` est vrai. `colourAt(i)` donne la couleur de chaque morceau (vibreurs, murs rayés). `yFrom` et `yTo`
  // sont des hauteurs au-dessus de la piste : un nombre, ou une fonction de l'échantillon.
  function strip(resources, side, active, fromOffset, toOffset, yFrom, yTo, colourAt, polygonOffset) {
    const count = road.points.length
    const sign = side === 'right' ? 1 : -1
    const corner = (index, offset, y) => {
      const point = offsetPoint(road, index, sign * offset)
      return [point.x, level(index) + (typeof y === 'function' ? y(index) : y), point.z]
    }
    const positions = []
    const colours = []
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count
      if (!active(index) || !active(next)) continue
      const a = corner(index, fromOffset(index), yFrom)
      const b = corner(index, toOffset(index), yTo)
      const c = corner(next, fromOffset(next), yFrom)
      const d = corner(next, toOffset(next), yTo)
      positions.push(...a, ...b, ...c, ...b, ...d, ...c)
      const colour = colourAt(index)
      for (let vertex = 0; vertex < 6; vertex += 1) colours.push(colour.r, colour.g, colour.b)
    }
    if (positions.length === 0) return null
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
    geometry.computeVertexNormals()
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -polygonOffset,
      polygonOffsetUnits: -polygonOffset,
    })
    resources.push(geometry, material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    return mesh
  }

  // Vibreurs rouge et blanc, gravier et murs de pneus (lib/circuit-features.js).
  function addFeatures(group, resources, edge) {
    const features = getFeatures(road)
    const red = new THREE.Color(KERB_RED)
    const white = new THREE.Color(LINE_COLOUR)
    const gravel = new THREE.Color(GRAVEL_COLOUR)
    const light = new THREE.Color(WALL_LIGHT)
    const dark = new THREE.Color(WALL_DARK)
    const terrain = getTerrain(road)
    const retaining = new THREE.Color(RETAINING_COLOUR)
    for (const side of ['left', 'right']) {
      const sign = side === 'right' ? 1 : -1
      // En relief, la barrière dépasse toujours du talus (aucun obstacle invisible), avec du béton uni entre elle et la
      // piste quand le sol s'en écarte, au-dessus comme au-dessous.
      const walled = (i) => features.wall[side][i] > 0
      const wallAt = (i) => features.wall[side][i]
      const drop = road.points.map((_, i) => {
        if (!terrain || !walled(i)) return 0
        const spot = offsetPoint(road, i, sign * wallAt(i))
        return terrain.surface(spot.x, spot.z) - level(i)
      })
      const sink = terrain ? 0.3 : 0 // la barrière s'enfonce un peu sous le sol en relief
      const barrierFoot = (i) => Math.max(0, drop[i]) - sink
      const barrierTop = (i) => Math.max(0, drop[i]) + WALL_HEIGHT
      const faceFoot = (i) => Math.min(0, drop[i]) - sink
      const outer = (i) => pavedEdge(road, i, side)
      const feet = terrain ? road.points.map((_, i) => skirtFoot(road, i, sign * outer(i))) : []
      const parts = [
        strip(resources, side, (i) => features.gravel[side][i] > 0, () => edge, (i) => edge + KERB_WIDTH + features.gravel[side][i], 0.012, 0.012, () => gravel, 1),
        strip(resources, side, (i) => features.kerb[side][i] > 0, () => edge, () => edge + KERB_WIDTH, 0.05, 0.05, (i) => (i % 2 ? red : white), 6),
        strip(resources, side, walled, wallAt, wallAt, barrierFoot, barrierTop, (i) => (Math.floor(i / 2) % 2 ? light : dark), 0),
        terrain && strip(resources, side, walled, wallAt, wallAt, faceFoot, barrierFoot, () => retaining, 0),
        terrain && strip(resources, side, (i) => feet[i] !== null, outer, outer, 0.012, (i) => feet[i] - level(i), () => retaining, 0),
      ]
      for (const part of parts) if (part) group.add(part)
    }
  }

  function buildVisuals() {
    const resources = []
    const group = new THREE.Group()
    const terrain = getTerrain(road)
    if (terrain) group.add(buildTerrainMesh(THREE, terrain, road.relief, GROUND_MARGIN, resources))
    else {
      const groundGeometry = new THREE.CircleGeometry(road.bounds.radius + GROUND_MARGIN, 64)
      const groundMaterial = new THREE.MeshStandardMaterial({ color: GRASS_COLOUR, roughness: 1 })
      resources.push(groundGeometry, groundMaterial)
      const ground = new THREE.Mesh(groundGeometry, groundMaterial)
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      group.add(ground)
    }

    const half = road.width / 2
    group.add(ribbon(resources, -half, half, 0.02, ASPHALT_COLOUR, 2))
    group.add(ribbon(resources, half - 1.1, half - 0.6, 0.04, LINE_COLOUR, 4)) // bords de piste
    group.add(ribbon(resources, -half + 0.6, -half + 1.1, 0.04, LINE_COLOUR, 4))

    addFeatures(group, resources, half)
    group.add(buildScenery(THREE, road, resources))

    // Ligne de départ : un trait blanc en travers de la piste, à l'abscisse 0.
    const start = pointAt(road, 0)
    const lineGeometry = new THREE.BoxGeometry(1.4, 0.02, road.width - 1.2)
    const lineMaterial = new THREE.MeshStandardMaterial({ color: LINE_COLOUR, roughness: 1 })
    resources.push(lineGeometry, lineMaterial)
    const line = new THREE.Mesh(lineGeometry, lineMaterial)
    line.rotation.set(0, start.heading, Math.atan(gradeAt(road, 0)), 'YZX')
    line.position.set(start.x, heightAt(road, 0) + 0.05, start.z)
    line.receiveShadow = true
    group.add(line)

    group.visible = active
    scene.add(group)
    return { group, resources }
  }

  // Les équipements et le décor se calculent en quelques centaines de millisecondes sur un grand circuit : on les
  // prépare pendant que la page est au repos, pour que « Conduire » ne fige pas l'écran.
  function warmUp(target) {
    const run = () => {
      getFeatures(target)
      getScenery(target)
      getTerrain(target)
    }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 3000 })
    else setTimeout(run, 300)
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
    lookAt.set(state.x, floor + 1 + LOOK_AHEAD * cameraTilt, state.z).addScaledVector(forward, LOOK_AHEAD)
    camera.lookAt(lookAt)
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
    // L'ombre ne couvre que ±14 m autour de la lumière : elle suit la voiture.
    sun.target.position.copy(rig.position)
    sun.target.updateMatrixWorld()
    sun.position.set(state.x + 4, floor + 9, state.z + 5)
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
      Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, far: 60 })
      sun.shadow.camera.updateProjectionMatrix()
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
      Object.assign(sun.shadow.camera, showroomShadow)
      sun.shadow.camera.updateProjectionMatrix()
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
      if (active) listen(false)
      active = false
      audio.dispose()
      disposeVisuals()
    },
  }
}
