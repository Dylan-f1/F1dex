// Affichage du décor de bord de piste (tribunes, bâtiment des stands, portique de départ, panneaux de freinage,
// arbres) calculé par lib/circuit-scenery.js. Tout est assemblé en peu d'objets : une dizaine d'appels de rendu pour
// un circuit entier, pour rester fluide sur un téléphone.

import { GANTRY, STAND_DEPTH, getScenery } from '@/lib/circuit-scenery'
import { heightAt } from '@/lib/relief'
import { getTerrain } from '@/lib/terrain'

// Couleurs de scène (pas des jetons d'interface). Les rouges et blancs reprennent `tyre-soft` et `ink`.
const CONCRETE = '#2a3240'
const STEEL = '#1b2230'
const WHITE = '#eef1f5'
const RED = '#da291c'
const GREY = '#6b7585'
const CROWD_PALETTE = ['#da291c', '#eef1f5', '#ffd100', '#9aa5b5', '#3a5bd9', '#ff8700', '#2b3442']
const RISER = 0.8 // m de hauteur par rang de gradins
// En relief : les longues constructions sont découpées en tronçons posés chacun à son altitude, avec des fondations.
const CHUNK = { stand: 15, pit: 20 } // m
const FOOTING = 2.5 // m sous le sol

// Boîtes assemblées en une seule géométrie. Chaque élément : { w, h, d, x, y, z (centre, repère local), colour,
// origin: { x, y (altitude, 0 par défaut), z, rotation } }. Avec `tileMetres`, les coordonnées de texture suivent les dimensions réelles (la
// texture se répète tous les `tileMetres` mètres, sans étirement).
function mergedBoxes(THREE, items, tileMetres = 0) {
  const positions = []
  const normals = []
  const uvs = []
  const colours = []
  const indices = []
  for (const item of items) {
    const box = new THREE.BoxGeometry(item.w, item.h, item.d)
    const { x: ox, y: oy = 0, z: oz, rotation } = item.origin
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const base = positions.length / 3
    const position = box.attributes.position
    const normal = box.attributes.normal
    const uv = box.attributes.uv
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const lx = position.getX(vertex) + item.x
      const ly = position.getY(vertex) + item.y
      const lz = position.getZ(vertex) + item.z
      positions.push(ox + lx * cos + lz * sin, oy + ly, oz - lx * sin + lz * cos)
      const nx = normal.getX(vertex)
      const nz = normal.getZ(vertex)
      normals.push(nx * cos + nz * sin, normal.getY(vertex), -nx * sin + nz * cos)
      if (tileMetres > 0) {
        // Face dominante : dessus/dessous (largeur × profondeur), avant/arrière (largeur × hauteur), côtés.
        const topFace = Math.abs(normal.getY(vertex)) > 0.5
        const sideFace = Math.abs(normal.getX(vertex)) > 0.5
        const across = sideFace ? item.d : item.w
        const up = topFace ? item.d : item.h
        uvs.push((uv.getX(vertex) * across) / tileMetres, (uv.getY(vertex) * up) / tileMetres)
      } else uvs.push(uv.getX(vertex), uv.getY(vertex))
      colours.push(item.colour.r, item.colour.g, item.colour.b)
    }
    for (const index of box.index.array) indices.push(base + index)
    box.dispose()
  }
  if (positions.length === 0) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  geometry.setIndex(indices)
  return geometry
}

// Texture de public : des points de couleur sur fond sombre (une tribune pleine, vue de loin).
function crowdTexture(THREE) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  context.fillStyle = '#1b2230'
  context.fillRect(0, 0, size, size)
  let seed = 12345
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let spot = 0; spot < 420; spot += 1) {
    context.fillStyle = CROWD_PALETTE[Math.floor(random() * CROWD_PALETTE.length)]
    context.fillRect(Math.floor(random() * size), Math.floor(random() * size), 4, 5)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Façade du bâtiment des stands : des portes de garage régulières.
function pitTexture(THREE) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const context = canvas.getContext('2d')
  context.fillStyle = '#3d4859'
  context.fillRect(0, 0, 128, 64)
  context.fillStyle = '#161c26'
  context.fillRect(12, 18, 104, 46)
  context.fillStyle = '#c9ced6'
  context.fillRect(0, 4, 128, 5)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function buildScenery(THREE, road, resources) {
  const group = new THREE.Group()
  const scenery = getScenery(road)
  const colour = (hex) => new THREE.Color(hex)
  const terrain = getTerrain(road)
  const groundY = (x, z) => terrain?.surface(x, z) ?? 0
  const footing = terrain ? FOOTING : 0
  // Point à `along` mètres du centre d'une construction, dans le sens de sa longueur, posé au sol.
  const placed = (spot, along = 0) => {
    const x = spot.x + along * Math.cos(spot.rotation)
    const z = spot.z - along * Math.sin(spot.rotation)
    return { x, y: groundY(x, z), z }
  }
  const chunksOf = (length, most) => {
    const count = terrain ? Math.ceil(length / most) : 1
    const size = length / count
    return Array.from({ length: count }, (_, index) => ({ along: -length / 2 + (index + 0.5) * size, size }))
  }
  const flatMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
  resources.push(flatMaterial)
  const addMesh = (geometry, material) => {
    if (!geometry) return
    resources.push(geometry)
    group.add(new THREE.Mesh(geometry, material))
  }

  // Tribunes : gradins couverts de public (texture), toit et poteaux (couleurs unies).
  const seats = []
  const frames = []
  for (const stand of scenery.stands) {
    const rowDepth = STAND_DEPTH / stand.rows
    const top = stand.rows * RISER
    for (const { along, size } of chunksOf(stand.length, CHUNK.stand)) {
      const origin = { ...placed(stand, along), rotation: stand.rotation }
      for (let row = 0; row < stand.rows; row += 1) {
        const height = (row + 1) * RISER
        const z = -STAND_DEPTH / 2 + (row + 0.5) * rowDepth
        seats.push({ w: size, h: height + footing, d: rowDepth, x: 0, y: (height - footing) / 2, z, colour: colour(WHITE), origin })
      }
      if (stand.roof) {
        frames.push({ w: size + (terrain ? 0.1 : 1), h: 0.35, d: STAND_DEPTH * 0.8, x: 0, y: top + 3.4, z: STAND_DEPTH * 0.15, colour: colour(STEEL), origin })
      }
    }
    if (stand.roof) {
      const posts = Math.max(2, Math.ceil(stand.length / 20) + 1)
      for (let post = 0; post < posts; post += 1) {
        const along = -stand.length / 2 + (stand.length * post) / (posts - 1)
        const origin = { ...placed(stand, along), rotation: stand.rotation }
        frames.push({ w: 0.4, h: top + 3.4 + footing, d: 0.4, x: 0, y: (top + 3.4 - footing) / 2, z: STAND_DEPTH / 2 - 0.4, colour: colour(CONCRETE), origin })
      }
    }
  }
  const crowd = crowdTexture(THREE)
  const crowdMaterial = new THREE.MeshStandardMaterial({ map: crowd, roughness: 1 })
  resources.push(crowd, crowdMaterial)
  addMesh(mergedBoxes(THREE, seats, 4), crowdMaterial)
  addMesh(mergedBoxes(THREE, frames), flatMaterial)

  // Portique de départ, au-dessus de la ligne.
  const gantryOrigin = { x: scenery.gantry.x, y: heightAt(road, 0), z: scenery.gantry.z, rotation: scenery.gantry.heading }
  const half = scenery.gantry.span / 2
  const gantry = [
    { w: 0.8, h: GANTRY.height + footing, d: 0.8, x: 0, y: (GANTRY.height - footing) / 2, z: -half, colour: colour(STEEL), origin: gantryOrigin },
    { w: 0.8, h: GANTRY.height + footing, d: 0.8, x: 0, y: (GANTRY.height - footing) / 2, z: half, colour: colour(STEEL), origin: gantryOrigin },
    { w: 1.4, h: 1.4, d: scenery.gantry.span + 1.6, x: 0, y: GANTRY.height, z: 0, colour: colour(STEEL), origin: gantryOrigin },
  ]
  for (let lamp = -2; lamp <= 2; lamp += 1) {
    gantry.push({ w: 0.1, h: 0.5, d: 0.5, x: -0.75, y: GANTRY.height - 0.1, z: lamp * 1.4, colour: colour('#3a4250'), origin: gantryOrigin })
  }
  addMesh(mergedBoxes(THREE, gantry), flatMaterial)

  // Panneaux de freinage : 3, 2 ou 1 barre rouge sur fond blanc.
  const boards = []
  for (const board of scenery.boards) {
    const origin = { x: board.x, y: groundY(board.x, board.z), z: board.z, rotation: board.rotation }
    boards.push({ w: 0.1, h: 1.1, d: 0.1, x: 0, y: 0.55, z: 0, colour: colour(GREY), origin })
    boards.push({ w: 0.08, h: 1.4, d: 1.6, x: 0, y: 1.8, z: 0, colour: colour(WHITE), origin })
    for (let bar = 0; bar < board.bars; bar += 1) {
      boards.push({ w: 0.04, h: 1.15, d: 0.16, x: -0.06, y: 1.8, z: (bar - (board.bars - 1) / 2) * 0.42, colour: colour(RED), origin })
    }
  }
  addMesh(mergedBoxes(THREE, boards), flatMaterial)

  // Bâtiment des stands : un long bloc bas, façade à portes de garage côté piste.
  if (scenery.pit) {
    const { pit } = scenery
    const chunks = chunksOf(pit.length, CHUNK.pit)
    const door = pitTexture(THREE)
    door.repeat.set(Math.max(1, Math.round(chunks[0].size / 12)), 1)
    const wall = new THREE.MeshStandardMaterial({ color: '#3d4859', roughness: 1 })
    const front = new THREE.MeshStandardMaterial({ map: door, roughness: 1 })
    const geometry = new THREE.BoxGeometry(chunks[0].size, pit.height + footing, pit.depth)
    resources.push(door, wall, front, geometry)
    for (const { along } of chunks) {
      const spot = placed(pit, along)
      const mesh = new THREE.Mesh(geometry, [wall, wall, wall, wall, wall, front]) // l'avant (z local négatif) donne sur la piste
      mesh.position.set(spot.x, spot.y + (pit.height - footing) / 2, spot.z)
      mesh.rotation.y = pit.rotation
      group.add(mesh)
    }
  }

  // Arbres : cônes sur un tronc, instanciés (un seul appel de rendu chacun).
  if (scenery.trees.length > 0) {
    const crownGeometry = new THREE.ConeGeometry(2.1, 7, 7)
    const trunkGeometry = new THREE.CylinderGeometry(0.28, 0.35, 1.7, 6)
    const crownMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 })
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#2a1f17', roughness: 1 })
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, scenery.trees.length)
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, scenery.trees.length)
    const matrix = new THREE.Matrix4()
    const identity = new THREE.Quaternion()
    const tint = new THREE.Color()
    scenery.trees.forEach((tree, index) => {
      const foot = groundY(tree.x, tree.z)
      matrix.compose(new THREE.Vector3(tree.x, foot + 0.85 * tree.scale, tree.z), identity, new THREE.Vector3(tree.scale, tree.scale, tree.scale))
      trunks.setMatrixAt(index, matrix)
      matrix.compose(new THREE.Vector3(tree.x, foot + (1.7 + 3.5) * tree.scale, tree.z), identity, new THREE.Vector3(tree.scale, tree.scale, tree.scale))
      crowns.setMatrixAt(index, matrix)
      crowns.setColorAt(index, tint.setHSL(0.38, 0.45, 0.1 + (tree.scale - 0.8) * 0.06))
    })
    resources.push(crownGeometry, trunkGeometry, crownMaterial, trunkMaterial, crowns, trunks)
    group.add(trunks, crowns)
  }
  return group
}
