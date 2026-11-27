// Matières du décor de conduite, dessinées sur des canevas au moment de construire la piste (aucun fichier à
// télécharger). Les textures répétées se raccordent sans couture.

import { createNoise, fbm, seededRandom } from '@/lib/noise'

const ANISOTROPY = 8 // netteté du sol vu en rasant (plafonné par la carte graphique)
const SLICE_ROWS = 8 // lignes peintes par tranche
// Les dessins sont gardés d'un circuit à l'autre : les recalculer prendrait plusieurs dixièmes de seconde.
const drawings = new Map()

// Canevas et suite des tranches de son dessin. `draw` peut être un générateur : chaque `yield` rend la main, ce qui
// permet de préparer le dessin au repos sans figer la page.
function drawing(name, width, height, draw) {
  if (!drawings.has(name)) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const steps = (function* () {
      const slices = draw(canvas.getContext('2d'), width, height)
      if (slices) yield* slices
    })()
    drawings.set(name, { canvas, steps })
  }
  return drawings.get(name)
}

function toTexture(THREE, { canvas, steps }, { repeat = true } = {}) {
  while (!steps.next().done) continue // termine ce qui n'a pas été préparé
  const texture = new THREE.CanvasTexture(canvas)
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
  }
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = ANISOTROPY
  return texture
}

const canvasTexture = (THREE, name, width, height, draw, options) => toTexture(THREE, drawing(name, width, height, draw), options)

// Remplit le canevas pixel par pixel : `colourAt(u, v)` (u, v dans [0, 1[) renvoie [r, g, b].
function* paintPixels(context, width, height, colourAt) {
  const image = context.createImageData(width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colour = colourAt(x / width, y / height)
      const at = (y * width + x) * 4
      image.data[at] = colour[0]
      image.data[at + 1] = colour[1]
      image.data[at + 2] = colour[2]
      image.data[at + 3] = 255
    }
    if (y % SLICE_ROWS === SLICE_ROWS - 1) yield
  }
  context.putImageData(image, 0, 0)
}

// Dessine un élément aux neuf positions voisines : ce qui dépasse d'un bord revient de l'autre.
function tiled(size, draw) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(dx, dy)
}

function asphalt() {
  const noise = createNoise('asphalte')
  const random = seededRandom('granulats')
  return drawing('asphalte', 512, 512, function* (context, width, height) {
    yield* paintPixels(context, width, height, (u, v) => {
      const patch = fbm(noise, u * 6, v * 6, 4, 6)
      const grain = noise(u * 256, v * 256, 256)
      const value = 66 + (patch - 0.5) * 22 + (grain - 0.5) * 30
      return [value, value + 1, value + 4]
    })
    for (let stone = 0; stone < 5200; stone += 1) {
      const light = 55 + random() * 90
      context.fillStyle = `rgb(${light},${light},${light + 3})`
      context.fillRect(random() * width, random() * height, 1 + random() * 1.6, 1 + random() * 1.6)
      if (stone % 1000 === 999) yield
    }
  })
}

function grass() {
  const noise = createNoise('herbe')
  const random = seededRandom('brins')
  return drawing('herbe', 512, 512, function* (context, width, height) {
    yield* paintPixels(context, width, height, (u, v) => {
      const patch = fbm(noise, u * 5, v * 5, 4, 5)
      const grain = noise(u * 160, v * 160, 160)
      const shade = 0.78 + patch * 0.32 + (grain - 0.5) * 0.28
      return [78 * shade, 112 * shade, 46 * shade]
    })
    context.lineWidth = 1.4
    for (let blade = 0; blade < 5000; blade += 1) {
      const x = random() * width
      const y = random() * height
      const dx = (random() - 0.5) * 5
      const dy = -3 - random() * 6
      const tone = random()
      context.strokeStyle = tone > 0.82 ? 'rgba(168,168,92,0.55)' : tone > 0.4 ? 'rgba(112,150,62,0.6)' : 'rgba(46,76,30,0.6)'
      tiled(width, (ox, oy) => {
        context.beginPath()
        context.moveTo(x + ox, y + oy)
        context.lineTo(x + ox + dx, y + oy + dy)
        context.stroke()
      })
      if (blade % 200 === 199) yield
    }
  })
}

function gravel() {
  const random = seededRandom('gravier')
  return drawing('gravier', 256, 256, function* (context, width) {
    context.fillStyle = '#9c8d72'
    context.fillRect(0, 0, width, width)
    for (let stone = 0; stone < 2600; stone += 1) {
      const x = random() * width
      const y = random() * width
      const radius = 1.2 + random() * 3.2
      const tone = 0.62 + random() * 0.62
      tiled(width, (ox, oy) => {
        context.fillStyle = 'rgba(52,44,32,0.45)'
        context.beginPath()
        context.arc(x + ox + 1.2, y + oy + 1.4, radius, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = `rgb(${172 * tone},${156 * tone},${126 * tone})`
        context.beginPath()
        context.arc(x + ox, y + oy, radius, 0, Math.PI * 2)
        context.fill()
      })
      if (stone % 100 === 99) yield
    }
  })
}

function concrete() {
  const noise = createNoise('beton')
  return drawing('beton', 256, 256, function* (context, width, height) {
    yield* paintPixels(context, width, height, (u, v) => {
      const patch = fbm(noise, u * 4, v * 4, 5, 4)
      const grain = noise(u * 128, v * 128, 128)
      const value = 214 + (patch - 0.5) * 60 + (grain - 0.5) * 24
      return [value, value - 2, value - 7]
    })
    context.fillStyle = 'rgba(60,60,60,0.28)'
    context.fillRect(0, 0, width, 2)
    context.fillRect(0, 0, 2, height)
  })
}

// Bouquet de feuilles sur fond transparent : plusieurs de ces plans, orientés au hasard, font un feuillage.
function leaves() {
  const random = seededRandom('feuilles')
  return drawing(
    'feuilles',
    256,
    256,
    (context, size) => {
      for (let leaf = 0; leaf < 330; leaf += 1) {
        const angle = random() * Math.PI * 2
        const distance = Math.sqrt(random()) * size * 0.42
        const light = random()
        context.fillStyle = `rgb(${44 + light * 74},${74 + light * 86},${24 + light * 40})`
        context.beginPath()
        context.ellipse(size / 2 + Math.cos(angle) * distance, size / 2 + Math.sin(angle) * distance, 7 + random() * 8, 3.5 + random() * 4, random() * Math.PI, 0, Math.PI * 2)
        context.fill()
      }
    },
  )
}

// Rameau de résineux : une tige et ses aiguilles, pointe vers la droite.
function needles() {
  const random = seededRandom('aiguilles')
  return drawing(
    'aiguilles',
    256,
    256,
    (context, size) => {
      context.lineCap = 'round'
      for (let needle = 0; needle < 620; needle += 1) {
        const along = random()
        const x = 6 + along * (size - 30)
        const spread = (1 - along * 0.75) * size * 0.34
        const y = size / 2 + (random() - 0.5) * spread
        const side = y < size / 2 ? -1 : 1
        const reach = 10 + (1 - along) * 34 * random() + 8
        const light = random()
        context.strokeStyle = `rgb(${24 + light * 46},${54 + light * 64},${30 + light * 36})`
        context.lineWidth = 2.2 + random() * 2
        context.beginPath()
        context.moveTo(x, y)
        context.lineTo(x + reach * 0.7, y + side * reach * (0.4 + random() * 0.55))
        context.stroke()
      }
      context.strokeStyle = '#3a2a1c'
      context.lineWidth = 5
      context.beginPath()
      context.moveTo(0, size / 2)
      context.lineTo(size - 24, size / 2)
      context.stroke()
    },
  )
}

// Grillage : fils en losanges sur fond transparent.
function fence() {
  return drawing('grillage', 128, 128, (context, size) => {
    context.strokeStyle = '#c4ccd4'
    context.lineWidth = 3.2
    for (let offset = -size; offset <= size * 2; offset += 32) {
      context.beginPath()
      context.moveTo(offset, 0)
      context.lineTo(offset + size, size)
      context.moveTo(offset, 0)
      context.lineTo(offset - size, size)
      context.stroke()
    }
  })
}

// Flanc d'une pile de trois pneus.
function tyres() {
  return drawing('pneus', 64, 128, (context, width, height) => {
    for (let tyre = 0; tyre < 3; tyre += 1) {
      const top = (tyre * height) / 3
      const shade = context.createLinearGradient(0, top, 0, top + height / 3)
      shade.addColorStop(0, '#0b0c0e')
      shade.addColorStop(0.28, '#30343a')
      shade.addColorStop(0.55, '#1c1f23')
      shade.addColorStop(1, '#08090a')
      context.fillStyle = shade
      context.fillRect(0, top, width, height / 3)
      context.fillStyle = 'rgba(255,255,255,0.06)'
      for (let groove = 0; groove < width; groove += 8) context.fillRect(groove, top + 14, 3, 16)
    }
  })
}

// Panneau de la voie des stands : une ou deux lignes en gros, blanc sur fond sombre.
export function pitSignTexture(THREE, name, lines) {
  return canvasTexture(
    THREE,
    `stands-${name}-${lines.join('')}`,
    384,
    256,
    (context, width, height) => {
      context.fillStyle = '#111317'
      context.fillRect(0, 0, width, height)
      context.strokeStyle = '#f4f5f6'
      context.lineWidth = 12
      context.strokeRect(10, 10, width - 20, height - 20)
      context.fillStyle = '#f4f5f6'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      lines.forEach((text, line) => {
        context.font = `bold ${line === 0 ? 108 : 92}px "Arial Narrow", Arial, sans-serif`
        context.fillText(text, width / 2, (height * (line + 0.5 + (line ? -0.08 : 0.08))) / lines.length)
      })
    },
    { repeat: false },
  )
}

// Panneau de freinage : la distance en gros chiffres, barres rouges au-dessus.
export function boardTexture(THREE, bars, distance) {
  return canvasTexture(
    THREE,
    `panneau-${bars}`,
    256,
    224,
    (context, width, height) => {
      context.fillStyle = '#f4f5f6'
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#da291c'
      for (let bar = 0; bar < bars; bar += 1) context.fillRect(width / 2 + (bar - (bars - 1) / 2) * 46 - 13, 18, 26, 70)
      context.fillStyle = '#111317'
      context.font = 'bold 104px "Arial Narrow", Arial, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(String(distance), width / 2, 156)
      context.strokeStyle = '#111317'
      context.lineWidth = 8
      context.strokeRect(4, 4, width - 8, height - 8)
    },
    { repeat: false },
  )
}

// Damier de la ligne d'arrivée : `columns` cases en travers, deux rangées.
export function checkerTexture(THREE, columns) {
  const texture = canvasTexture(
    THREE,
    `damier-${columns}`,
    columns * 16,
    32,
    (context) => {
      for (let column = 0; column < columns; column += 1) {
        for (let row = 0; row < 2; row += 1) {
          context.fillStyle = (column + row) % 2 ? '#16181c' : '#e9ebee'
          context.fillRect(column * 16, row * 16, 16, 16)
        }
      }
    },
    { repeat: false },
  )
  texture.magFilter = THREE.NearestFilter
  return texture
}

// Assombrissement doux sous la voiture : sans lui, elle semble flotter quand le soleil est devant elle.
function contact() {
  return drawing(
    'contact',
    256,
    128,
    (context, width, height) => {
      // Noir dont l’opacité s’efface vers les bords, plus vite en travers qu’en long.
      const image = context.createImageData(width, height)
      const fade = (value, soft) => {
        const t = Math.max(0, Math.min(1, (1 - Math.abs(value * 2 - 1)) / soft))
        return t * t * (3 - 2 * t)
      }
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) image.data[(y * width + x) * 4 + 3] = 255 * fade((x + 0.5) / width, 0.34) * fade((y + 0.5) / height, 0.55)
      }
      context.putImageData(image, 0, 0)
    },
  )
}

const once = { repeat: false }
export const asphaltTexture = (THREE) => toTexture(THREE, asphalt())
export const grassTexture = (THREE) => toTexture(THREE, grass())
export const gravelTexture = (THREE) => toTexture(THREE, gravel())
export const concreteTexture = (THREE) => toTexture(THREE, concrete())
export const leafTexture = (THREE) => toTexture(THREE, leaves(), once)
export const needleTexture = (THREE) => toTexture(THREE, needles(), once)
export const fenceTexture = (THREE) => toTexture(THREE, fence())
export const tyreStackTexture = (THREE) => toTexture(THREE, tyres())
export const contactTexture = (THREE) => toTexture(THREE, contact(), once)

// Préparation au repos de ces dessins, tranche par tranche : le premier « Conduire » n'a plus à les peindre.
export function* textureWarmUps() {
  for (const make of [asphalt, grass, gravel, concrete, leaves, needles, fence, tyres, contact]) {
    yield* make().steps
    yield
  }
}
