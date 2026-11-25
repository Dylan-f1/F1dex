'use client'

import { useEffect, useRef, useState } from 'react'
import { CAMERA_TARGET, DEFAULT_VIEW, VIEW_TRANSITION_MS, easeOutCubic, lerpPoint, showroomFov } from '@/lib/car-camera'
import { accentFor, buildCarParts } from '@/lib/car-model'
import { createWheelRig } from './car-wheel-rig'
import { DRIVE_FOV, createDriveMode } from './drive-mode'

// Matières satinées (pas de reflets d'environnement, pas de lueur) : le rendu reste « retransmission »,
// pas « rendu 3D brillant ».
const MATERIAL_SETTINGS = {
  livery: { roughness: 0.55, metalness: 0.05 },
  accent: { roughness: 0.6, metalness: 0.05 },
  carbon: { color: '#191c21', roughness: 0.55, metalness: 0.1 },
  tyre: { color: '#15171b', roughness: 0.9, metalness: 0 },
  rim: { color: '#3a4048', roughness: 0.5, metalness: 0.3 },
  metal: { color: '#6b7480', roughness: 0.5, metalness: 0.3 },
  helmet: { color: '#eef1f5', roughness: 0.5, metalness: 0 },
}
// Modèle 3D de la voiture (voir docs/DECISIONS.md : image FLUX.1-schnell puis reconstruction TRELLIS, deux
// modèles sous licence libre). Longueur visée : celle d'une F1 (environ 5,6 m).
const CAR_MODEL_URL = '/models/f1.glb'
const CAR_MODEL_LENGTH = 4.7

// Livrée d'écurie : la texture du modèle est grise et blanche (carrosserie), noire (pneus, carbone) et jaune
// (bandes de gomme). Les zones de carrosserie (luminance moyenne, peu saturée) sont repeintes ; les autres ne
// bougent pas. La couleur dépend de la position sur la voiture, normalisée dans la boîte du modèle :
// x = latéral, y = hauteur, z = longueur de l'arrière (0) vers l'avant (1). Les zones (ailerons, bout du nez,
// bande des pontons, arête du capot) sont réglées à l'œil sur ce modèle précis (voir docs/DECISIONS.md).
const LIVERY_VERTEX_GLSL = /* glsl */ `
  vCarPosition = position;
`
const LIVERY_FRAGMENT_GLSL = /* glsl */ `
  float tintLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float tintMax = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
  float tintMin = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
  float tintSat = tintMax > 0.0001 ? (tintMax - tintMin) / tintMax : 0.0;
  float tintMask = smoothstep(0.07, 0.16, tintLum) * (1.0 - smoothstep(0.35, 0.6, tintSat));

  vec3 carN = (vCarPosition - uBoxMin) / uBoxSize;
  float lat = abs(carN.x - 0.5) * 2.0;
  // Transitions courtes : une livrée a des limites nettes, pas des dégradés.
  float frontWing = smoothstep(0.80, 0.82, carN.z) * (1.0 - smoothstep(0.30, 0.32, carN.y));
  float rearWing = (1.0 - smoothstep(0.14, 0.16, carN.z)) * smoothstep(0.42, 0.44, carN.y);
  // Roues (positions mesurées sur le modèle via les bandes jaunes de la texture) : jamais repeintes.
  vec2 frontWheel = vec2((carN.z - 0.77) / 0.11, (carN.y - 0.31) / 0.23);
  vec2 rearWheel = vec2((carN.z - 0.135) / 0.12, (carN.y - 0.31) / 0.23);
  float wheel = (1.0 - smoothstep(0.85, 1.0, min(length(frontWheel), length(rearWheel)))) * smoothstep(0.45, 0.55, lat);
  float wing = max(frontWing, rearWing) * (1.0 - wheel);
  float noseTip = smoothstep(0.93, 0.94, carN.z) * (1.0 - smoothstep(0.26, 0.28, carN.y)) * (1.0 - smoothstep(0.14, 0.16, lat));
  float sideBand = smoothstep(0.38, 0.40, lat) * (1.0 - smoothstep(0.17, 0.19, carN.y)) * smoothstep(0.25, 0.27, carN.z) * (1.0 - smoothstep(0.64, 0.66, carN.z));
  float spine = (1.0 - smoothstep(0.05, 0.07, lat)) * smoothstep(0.50, 0.52, carN.y) * smoothstep(0.28, 0.30, carN.z) * (1.0 - smoothstep(0.60, 0.62, carN.z));

  vec3 zone = uLiveryBase;
  zone = mix(zone, uLiveryWing, wing);
  zone = mix(zone, uLiveryTrim, max(noseTip, sideBand));
  zone = mix(zone, uLiverySpine, spine);
  // Les ailerons ont une texture sombre : on les repeint aussi, sans toucher aux pneus (luminance plus basse).
  float paintMask = max(tintMask * (1.0 - wheel), wing * smoothstep(0.025, 0.05, tintLum));
  diffuseColor.rgb = mix(diffuseColor.rgb, zone * (0.5 + 1.0 * tintLum), paintMask);
`

// Couleurs de la scène, reprises des jetons de la DA (voir app/globals.css).
const GROUND_COLOUR = '#141922'
const GROUND_LINE_COLOUR = '#262f3d'
const GROUND_MARK_COLOUR = '#eef1f5'

function buildGeometry(THREE, RoundedBoxGeometry, part) {
  const { shape, size, points } = part
  if (shape === 'box') return new THREE.BoxGeometry(size[0], size[1], size[2])
  if (shape === 'roundedBox') return new RoundedBoxGeometry(size[0], size[1], size[2], 3, size[3])
  if (shape === 'cylinder') return new THREE.CylinderGeometry(size[0], size[1], size[2], size[3])
  if (shape === 'sphere') return new THREE.SphereGeometry(size[0], 24, 16)
  const vectors = points.map((point) => new THREE.Vector3(...point))
  const curve = vectors.length === 2 ? new THREE.LineCurve3(vectors[0], vectors[1]) : new THREE.CatmullRomCurve3(vectors)
  return new THREE.TubeGeometry(curve, 16, size[0], 8)
}

// Construit la scène dans `container` et renvoie un objet de contrôle (`setLivery`, `goToView`,
// `setAutoRotate`, `dispose`). Tout ce qui est créé ici est libéré par `dispose`.
function createScene({
  THREE,
  OrbitControls,
  RoundedBoxGeometry,
  GLTFLoader,
  mergeGeometries,
  container,
  livery,
  autoRotate,
  road,
  assist,
  sound,
  onStatus,
  onSource,
  onHud,
  onDriveExit,
}) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  } catch {
    onStatus('unavailable')
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  const canvas = renderer.domElement
  canvas.className = 'block h-full w-full'
  container.appendChild(canvas)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 900)
  camera.position.set(...DEFAULT_VIEW.position)
  const target = new THREE.Vector3(...CAMERA_TARGET)
  camera.lookAt(target)

  const controls = new OrbitControls(camera, canvas)
  controls.target.copy(target)
  controls.enablePan = false
  controls.enableDamping = true
  controls.minDistance = 6
  controls.maxDistance = 16
  controls.maxPolarAngle = Math.PI / 2 - 0.03
  controls.autoRotate = autoRotate
  controls.autoRotateSpeed = 1.4
  // OrbitControls bloque tout geste tactile ; on rend le défilement vertical à la page (la rotation reste
  // horizontale, le pincement zoome).
  canvas.style.touchAction = 'pan-y'

  // Lumières : une principale avec ombre, un ciel doux. Pas de carte d'environnement.
  scene.add(new THREE.HemisphereLight('#c9d3e3', '#1a1f29', 1.1))
  const sun = new THREE.DirectionalLight('#ffffff', 2.2)
  sun.position.set(4, 9, 5)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 24 })
  sun.shadow.bias = -0.0005
  scene.add(sun)
  scene.add(sun.target)

  const disposables = []
  const track = (resource) => {
    disposables.push(resource)
    return resource
  }

  // Sol : le vocabulaire de la carte du circuit (asphalte, bordure, trait blanc).
  const groundParts = [
    { geometry: new THREE.CircleGeometry(6.8, 96), colour: GROUND_COLOUR, y: 0 },
    { geometry: new THREE.RingGeometry(4.9, 5.7, 96), colour: GROUND_LINE_COLOUR, y: 0.002 },
    { geometry: new THREE.RingGeometry(5.26, 5.34, 96), colour: GROUND_MARK_COLOUR, y: 0.004 },
  ]
  const showroom = []
  for (const { geometry, colour: groundColour, y } of groundParts) {
    const mesh = new THREE.Mesh(geometry, track(new THREE.MeshStandardMaterial({ color: groundColour, roughness: 1 })))
    track(geometry)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = y
    mesh.receiveShadow = true
    scene.add(mesh)
    showroom.push(mesh)
  }

  // La voiture (modèle ou repli) vit dans `rig` : c'est lui que la conduite déplace et fait tourner.
  const rig = new THREE.Group()
  scene.add(rig)
  const wheels = createWheelRig(THREE, mergeGeometries)

  // Matières : une par rôle. Changer d'écurie ne modifie que la couleur de deux d'entre elles.
  const materials = {}
  for (const [role, settings] of Object.entries(MATERIAL_SETTINGS)) {
    materials[role] = track(new THREE.MeshStandardMaterial(settings))
  }
  const liveryUniforms = {
    uLiveryBase: { value: new THREE.Color() },
    uLiveryWing: { value: new THREE.Color() },
    uLiveryTrim: { value: new THREE.Color() },
    uLiverySpine: { value: new THREE.Color() },
    uBoxMin: { value: new THREE.Vector3() },
    uBoxSize: { value: new THREE.Vector3(1, 1, 1) },
  }
  function setLivery(next) {
    materials.livery.color.set(next.base)
    materials.accent.color.set(accentFor(next.base))
    liveryUniforms.uLiveryBase.value.set(next.base)
    liveryUniforms.uLiveryWing.value.set(next.wing)
    liveryUniforms.uLiveryTrim.value.set(next.trim)
    liveryUniforms.uLiverySpine.value.set(next.spine)
  }
  setLivery(livery)

  // Voiture de repli, faite de formes simples : affichée seulement si le modèle 3D ne se charge pas.
  function addFallbackCar() {
    const car = new THREE.Group()
    const meshes = new Map()
    for (const part of buildCarParts()) {
      const geometry = track(buildGeometry(THREE, RoundedBoxGeometry, part))
      const mesh = new THREE.Mesh(geometry, materials[part.material])
      mesh.position.set(...part.position)
      if (part.rotation) mesh.rotation.set(...part.rotation)
      if (part.scale) mesh.scale.set(...part.scale)
      mesh.castShadow = true
      car.add(mesh)
      meshes.set(part.name, mesh)
    }
    for (const resource of wheels.attachFallback(car, meshes)) track(resource)
    rig.add(car)
  }

  // Modèle 3D : posé au sol, centré, mis à l'échelle, nez vers +x (comme la voiture de repli).
  function addModelCar(gltf) {
    const root = gltf.scene
    // Liste établie avant la découpe des roues, qui ajoute des maillages à la scène.
    const bodies = []
    root.traverse((object) => {
      if (object.isMesh) bodies.push(object)
    })
    for (const object of bodies) {
      object.castShadow = true
      const material = object.material
      // glTF sans valeur de métallicité = métal intégral, qui paraît noir sans carte d'environnement.
      material.metalness = 0
      material.roughness = 0.7
      object.geometry.computeBoundingBox()
      const { min, max } = object.geometry.boundingBox
      liveryUniforms.uBoxMin.value.copy(min)
      liveryUniforms.uBoxSize.value.subVectors(max, min)
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, liveryUniforms)
        shader.vertexShader = `varying vec3 vCarPosition;
${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
${LIVERY_VERTEX_GLSL}`,
        )
        shader.fragmentShader = `varying vec3 vCarPosition;
uniform vec3 uLiveryBase;
uniform vec3 uLiveryWing;
uniform vec3 uLiveryTrim;
uniform vec3 uLiverySpine;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
${shader.fragmentShader}`.replace('#include <map_fragment>', `#include <map_fragment>
${LIVERY_FRAGMENT_GLSL}`)
      }
      track(object.geometry)
      track(material)
      if (material.map) track(material.map)
      // Après la mesure de la boîte (la livrée est repérée sur la voiture entière).
      for (const resource of wheels.attachModel(object)) track(resource)
    }
    const initialBox = new THREE.Box3().setFromObject(root)
    root.scale.setScalar(CAR_MODEL_LENGTH / initialBox.getSize(new THREE.Vector3()).z)
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const centre = box.getCenter(new THREE.Vector3())
    root.position.set(-centre.x, -box.min.y, -centre.z)
    const car = new THREE.Group()
    car.add(root)
    car.rotation.y = Math.PI / 2
    rig.add(car)
    wheels.setScale(root.scale.x)
  }

  let disposed = false
  new GLTFLoader().load(
    CAR_MODEL_URL,
    (gltf) => {
      if (disposed) {
        // Démontage pendant le chargement : rien n'a été suivi par `track`, on libère ici ce qui vient d'être chargé.
        gltf.scene.traverse((object) => {
          if (!object.isMesh) return
          object.geometry.dispose()
          object.material.map?.dispose()
          object.material.dispose()
        })
        return
      }
      addModelCar(gltf)
      onSource('model')
      onStatus('ready')
    },
    undefined,
    () => {
      if (disposed) return
      addFallbackCar()
      onSource('fallback')
      onStatus('ready')
    },
  )

  const drive = createDriveMode({
    THREE,
    scene,
    camera,
    controls,
    canvas,
    sun,
    rig,
    wheels,
    showroom,
    onHud,
    onExit: () => {
      drive.stop()
      onDriveExit()
    },
  })

  drive.setAssist(assist)
  drive.setSound(sound)
  drive.setRoad(road)

  // Taille : suit le conteneur.
  function resize() {
    const { clientWidth, clientHeight } = container
    if (!clientWidth || !clientHeight) return
    renderer.setSize(clientWidth, clientHeight, false)
    camera.aspect = clientWidth / clientHeight
    camera.fov = drive.active ? (camera.aspect < 1 ? DRIVE_FOV.narrow : DRIVE_FOV.wide) : showroomFov(camera.aspect)
    camera.updateProjectionMatrix()
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()

  // Transition de caméra, interrompue dès que la personne attrape la vue.
  let transition = null
  controls.addEventListener('start', () => {
    transition = null
  })
  function goToView(position) {
    transition = { from: camera.position.toArray(), to: position, startedAt: performance.now() }
  }

  // Boucle : suspendue quand l'onglet est caché ou que la scène est hors écran.
  let frame = 0
  let isVisible = true
  let isTabShown = !document.hidden
  function render(now) {
    frame = 0
    if (drive.active) {
      drive.update(now)
    } else {
      if (transition) {
        const progress = Math.min(1, (now - transition.startedAt) / VIEW_TRANSITION_MS)
        camera.position.set(...lerpPoint(transition.from, transition.to, easeOutCubic(progress)))
        if (progress === 1) transition = null
      }
      controls.update()
    }
    renderer.render(scene, camera)
    schedule()
  }
  function schedule() {
    drive.setPaused(!(isVisible && isTabShown))
    if (!frame && isVisible && isTabShown) frame = requestAnimationFrame(render)
  }
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    isVisible = entry.isIntersecting
    schedule()
  })
  intersectionObserver.observe(container)
  const onVisibilityChange = () => {
    isTabShown = !document.hidden
    schedule()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  schedule()

  return {
    setLivery,
    goToView,
    setAutoRotate(enabled) {
      controls.autoRotate = enabled
    },
    startDriving() {
      transition = null
      drive.start()
      resize() // le champ de vision change en conduite
    },
    stopDriving() {
      drive.stop()
      resize()
    },
    setRoad: drive.setRoad,
    setAssist: drive.setAssist,
    setSound: drive.setSound,
    setTouch: drive.setTouch,
    dispose() {
      disposed = true
      drive.dispose()
      cancelAnimationFrame(frame)
      frame = 0
      isVisible = false
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      controls.dispose()
      for (const resource of disposables) resource.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}

// Monte la scène three.js dans le conteneur renvoyé (ref) et expose des commandes. three.js est chargé
// à la demande : la page garage seule paie son poids, pas le reste du site.
export function useCarScene({ livery, autoRotate, road, assist, sound }) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  // Valeurs courantes lues au moment où la scène se monte (le chargement est asynchrone).
  const latest = useRef({ livery, autoRotate, road, assist, sound })
  const [status, setStatus] = useState('loading')
  // 'model' (modèle 3D reconstruit) ou 'fallback' (voiture en formes simples) : sert à la légende sous la visionneuse.
  const [source, setSource] = useState('model')
  // Conduite : actif ou non, et dernières valeurs du tableau de bord (rafraîchies environ 10 fois par seconde).
  const [driving, setDriving] = useState(false)
  const [hud, setHud] = useState(null)

  useEffect(() => {
    latest.current = { livery, autoRotate, road, assist, sound }
    sceneRef.current?.setLivery(livery)
    sceneRef.current?.setAutoRotate(autoRotate)
    sceneRef.current?.setRoad(road)
    sceneRef.current?.setAssist(assist)
    sceneRef.current?.setSound(sound)
  }, [livery, autoRotate, road, assist, sound])

  useEffect(() => {
    let cancelled = false
    async function mount() {
      try {
        const [THREE, controlsModule, boxModule, loaderModule, geometryModule] = await Promise.all([
          import('three'),
          import('three/examples/jsm/controls/OrbitControls.js'),
          import('three/examples/jsm/geometries/RoundedBoxGeometry.js'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/utils/BufferGeometryUtils.js'),
        ])
        // Le montage a été annulé pendant le chargement (Strict Mode, navigation) : on ne crée rien.
        if (cancelled || !containerRef.current) return
        sceneRef.current = createScene({
          THREE,
          OrbitControls: controlsModule.OrbitControls,
          RoundedBoxGeometry: boxModule.RoundedBoxGeometry,
          GLTFLoader: loaderModule.GLTFLoader,
          mergeGeometries: geometryModule.mergeGeometries,
          container: containerRef.current,
          livery: latest.current.livery,
          autoRotate: latest.current.autoRotate,
          road: latest.current.road,
          assist: latest.current.assist,
          sound: latest.current.sound,
          onStatus: setStatus,
          onSource: setSource,
          onHud: setHud,
          onDriveExit: () => {
            setDriving(false)
            setHud(null)
          },
        })
      } catch {
        if (!cancelled) setStatus('unavailable')
      }
    }
    mount()
    return () => {
      cancelled = true
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [])

  return {
    containerRef,
    status,
    source,
    driving,
    hud,
    startDriving: () => {
      if (!sceneRef.current) return
      sceneRef.current.startDriving()
      setDriving(true)
    },
    stopDriving: () => {
      sceneRef.current?.stopDriving()
      setDriving(false)
      setHud(null)
    },
    setTouch: (next) => sceneRef.current?.setTouch(next),
    goToView: (position) => sceneRef.current?.goToView(position),
  }
}
