// Ciel et lointains de la conduite : un dôme peint (dégradé, soleil, nuages en perspective) et deux chaînes de
// montagnes en relief. Tout suit la caméra : on ne s'en approche jamais.

import { sunVector } from '@/lib/ambiance'
import { createNoise, fbm } from '@/lib/noise'

const SKY = { width: 1024, height: 512, radius: 3600 }
const BELOW_HORIZON = 0.04 // part du ciel peinte sous l'horizon, couleur de brume
const SLICE_ROWS = 4 // lignes peintes par tranche de préparation
const RIDGES = [
  // Chaîne lointaine puis chaîne proche : rayon (m), hauteur maximale, part de brume.
  { radius: 3300, depth: 280, height: 330, haze: 0.66, seed: 'lointain' },
  { radius: 2700, depth: 320, height: 170, haze: 0.4, seed: 'proche' },
]

const clamp01 = (value) => Math.max(0, Math.min(1, value))
const smoothstep = (from, to, value) => {
  const t = clamp01((value - from) / (to - from))
  return t * t * (3 - 2 * t)
}
// Couleur '#rrggbb' en composantes 0-255, telles qu'elles seront peintes (sans conversion d'espace colorimétrique).
const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

// Image du ciel vue dans toutes les directions, avec la même correspondance pixel → direction que SphereGeometry.
// Elle est peinte pour un départ au cap 0 (le dôme est ensuite tourné), donc une seule fois par ambiance.
const paintings = new Map()

function* paintSky(canvas, ambiance) {
  const sun = sunVector(ambiance.sun, 0)
  const { width, height } = canvas
  const context = canvas.getContext('2d')
  const image = context.createImageData(width, height)
  const { sky } = ambiance
  const zenith = rgb(sky.zenith)
  const horizon = rgb(sky.horizon)
  const fog = rgb(ambiance.fog.colour)
  const cloud = rgb(sky.cloud)
  const shade = rgb(sky.shade)
  const light = rgb(ambiance.sun.colour)
  const noise = createNoise('nuages')
  const cosines = new Float32Array(width)
  const sines = new Float32Array(width)
  for (let x = 0; x < width; x += 1) {
    const phi = ((x + 0.5) / width) * Math.PI * 2
    cosines[x] = Math.cos(phi)
    sines[x] = Math.sin(phi)
  }
  for (let y = 0; y < height; y += 1) {
    const theta = ((y + 0.5) / height) * Math.PI
    const up = Math.cos(theta)
    const flat = Math.sin(theta)
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4
      let colour = fog
      if (up > -BELOW_HORIZON) {
        const dx = -cosines[x] * flat
        const dz = sines[x] * flat
        const elevation = Math.max(0, up)
        colour = mix(horizon, zenith, Math.pow(elevation, 0.55))
        const facing = Math.max(0, dx * sun.x + up * sun.y + dz * sun.z)
        if (sky.glow > 0) colour = mix(colour, light, clamp01((Math.pow(facing, 12) * 0.55 + Math.pow(facing, 90) * 0.5) * sky.glow))
        // Nuages posés sur un plafond plat : plus petits et plus serrés vers l'horizon.
        const reach = 1 / (elevation + 0.12)
        const px = dx * reach * 1.5
        const pz = dz * reach * 1.5
        const density = fbm(noise, px + 11.3, pz + 4.7, 4)
        const cover = smoothstep(1 - sky.coverage - 0.04, 1 - sky.coverage + 0.2, density + (fbm(noise, px * 0.35, pz * 0.35, 2) - 0.5) * 0.35)
        if (cover > 0) {
          // Plus épais au centre : ombré ; les bords du côté du soleil restent clairs.
          const thickness = smoothstep(1 - sky.coverage + 0.04, 1 - sky.coverage + 0.34, density)
          const body = mix(cloud, shade, clamp01(thickness * 0.85 - Math.pow(facing, 6) * 0.35))
          colour = mix(colour, body, cover * smoothstep(0.015, 0.16, elevation))
        }
        if (sky.disc > 0) colour = mix(colour, [255, 250, 232], smoothstep(0.99955, 0.9998, facing) * sky.disc * (1 - cover * 0.85))
        colour = mix(fog, colour, smoothstep(0, 0.11, up))
      }
      image.data[at] = colour[0]
      image.data[at + 1] = colour[1]
      image.data[at + 2] = colour[2]
      image.data[at + 3] = 255
    }
    if (y % SLICE_ROWS === SLICE_ROWS - 1) yield
  }
  context.putImageData(image, 0, 0)
}

function skyDrawing(ambiance) {
  if (!paintings.has(ambiance)) {
    const canvas = document.createElement('canvas')
    canvas.width = SKY.width
    canvas.height = SKY.height
    paintings.set(ambiance, { canvas, steps: paintSky(canvas, ambiance) })
  }
  return paintings.get(ambiance)
}

// Préparation du ciel au repos, tranche par tranche.
export function warmSky(ambiance) {
  return skyDrawing(ambiance).steps
}

function skyCanvas(ambiance) {
  const { canvas, steps } = skyDrawing(ambiance)
  while (!steps.next().done) continue // termine ce qui n'a pas été préparé
  return canvas
}

function skyTexture(THREE, ambiance) {
  const texture = new THREE.CanvasTexture(skyCanvas(ambiance))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  return texture
}

// Anneau de relief : quatre rangées du pied avant au pied arrière, couleurs calculées une fois (éclairage et brume).
function ridgeGeometry(THREE, ridge, ambiance, sun) {
  const segments = 220
  const noise = createNoise(ridge.seed)
  // Rangées, de l'arrière vers l'avant : ce qui est loin est dessiné en premier.
  const rows = [
    { out: ridge.depth, rise: 0 },
    { out: ridge.depth * 0.45, rise: 0.78 },
    { out: 0, rise: 1 },
    { out: -ridge.depth * 0.45, rise: 0.46 },
    { out: -ridge.depth, rise: -0.08 },
  ]
  const positions = []
  for (const row of rows) {
    for (let step = 0; step <= segments; step += 1) {
      const angle = ((step % segments) / segments) * Math.PI * 2
      const cx = Math.cos(angle)
      const cz = Math.sin(angle)
      const crest = Math.pow(fbm(noise, cx * 4.5 + 9, cz * 4.5 + 9, 5), 1.7)
      const rough = fbm(noise, cx * 17 + row.out * 0.02, cz * 17, 3) - 0.5
      const radius = ridge.radius + row.out + rough * ridge.depth * 0.35
      const y = row.rise <= 0 ? row.rise * ridge.height : ridge.height * Math.max(0.05, crest * 1.5 + rough * 0.18) * row.rise
      positions.push(cx * radius, y, cz * radius)
    }
  }
  const indices = []
  const stride = segments + 1
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let step = 0; step < segments; step += 1) {
      const a = row * stride + step
      indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const base = new THREE.Color(ambiance.mountains)
  const haze = new THREE.Color(ambiance.fog.colour)
  const tint = new THREE.Color()
  const normal = geometry.attributes.normal
  const colours = []
  for (let vertex = 0; vertex < normal.count; vertex += 1) {
    const lit = Math.abs(normal.getX(vertex) * sun.x + normal.getY(vertex) * sun.y + normal.getZ(vertex) * sun.z)
    const low = 1 - clamp01(positions[vertex * 3 + 1] / (ridge.height * 0.7)) // la brume s'accumule au pied
    tint.copy(base).multiplyScalar(0.78 + 0.45 * lit)
    tint.lerp(haze, clamp01(ridge.haze + low * low * (1 - ridge.haze)))
    colours.push(tint.r, tint.g, tint.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  return geometry
}

// Ciel et montagnes : `follow(camera, level)` les recentre à chaque image (`level` : altitude du pied des
// montagnes). `heading` : cap de départ de la piste, qui oriente le soleil.
export function buildSky(THREE, ambiance, heading, resources) {
  const sun = sunVector(ambiance.sun, heading)
  const group = new THREE.Group()
  const add = (geometry, material, order) => {
    resources.push(geometry, material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = order
    mesh.frustumCulled = false
    group.add(mesh)
    return mesh
  }
  const texture = skyTexture(THREE, ambiance)
  resources.push(texture)
  const backdrop = { fog: false, depthWrite: false, side: THREE.DoubleSide }
  const dome = add(new THREE.SphereGeometry(SKY.radius, 48, 32), new THREE.MeshBasicMaterial({ ...backdrop, map: texture }), -3)
  dome.rotation.y = heading
  const ridges = RIDGES.map((ridge, index) => add(ridgeGeometry(THREE, ridge, ambiance, sun), new THREE.MeshBasicMaterial({ ...backdrop, vertexColors: true }), -2 + index))
  return {
    group,
    follow(camera, level) {
      dome.position.copy(camera.position)
      for (const ridge of ridges) ridge.position.set(camera.position.x, level, camera.position.z)
    },
  }
}
