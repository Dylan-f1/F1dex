// Constructions de bord de piste (tribunes et leur public, bâtiment des stands, portique de départ, panneaux de
// freinage), aux emplacements calculés par lib/circuit-scenery.js. Au sol, rien ne dépasse de ces emprises : ce sont
// elles qui arrêtent la voiture.

import { BOARD_DISTANCES, GANTRY, STAND_DEPTH, getScenery } from '@/lib/circuit-scenery'
import { seededRandom } from '@/lib/noise'
import { heightAt } from '@/lib/relief'
import { getTerrain } from '@/lib/terrain'
import { createBatch } from './drive-batch'
import { boardTexture, concreteTexture } from './drive-textures'

const RISER = 0.8 // m de hauteur par rang de gradins
// En relief : les longues constructions sont découpées en tronçons posés chacun à son altitude, avec des fondations.
const CHUNK = { stand: 15, pit: 20 } // m
const FOOTING = 2.5 // m sous le sol
const SEAT_SPACING = 0.64 // m entre deux places
const SEAT_FILL = 0.8 // part des places occupées
const AISLE = { every: 11, width: 1.2 } // m : escaliers entre les blocs de places
const PEOPLE_REACH = 330 // m : au-delà, le public n'est plus dessiné
const BAY = 5 // m par garage

const CLOTHES = ['#a8453d', '#d4d6d9', '#c2a14a', '#737b8a', '#3f5784', '#b56f3f', '#27304a', '#46705c', '#e6e4df', '#2c2e33', '#5d4a43', '#8f9298']
const SKIN = ['#e8bb93', '#c98f67', '#9b6a47', '#f1cba9', '#6d4a33']
const SEATS = ['#1f4f9c', '#1f4f9c', '#b9232c', '#d9dde2']
// Bandeaux au-dessus des garages : des teintes d'écuries, sans logo ni nom.
const TEAM_BANDS = ['#3671c6', '#e8002d', '#27f4d2', '#ff8000', '#229971', '#ff87bc', '#64c4ff', '#6692ff', '#b6babd', '#52e252']

export function buildScenery(THREE, road, resources) {
  const group = new THREE.Group()
  const scenery = getScenery(road)
  const terrain = getTerrain(road)
  const groundY = (x, z) => terrain?.surface(x, z) ?? 0
  const footing = terrain ? FOOTING : 0.2
  const colour = (hex) => new THREE.Color(hex)
  const random = seededRandom(`public:${road.key}`)
  const pick = (list) => list[Math.floor(random() * list.length)]
  const batch = createBatch(THREE)
  // Point à `along` mètres du centre d'une construction, dans le sens de sa longueur, posé au sol.
  const placed = (spot, along = 0) => {
    const x = spot.x + along * Math.cos(spot.rotation)
    const z = spot.z - along * Math.sin(spot.rotation)
    return { x, y: groundY(x, z), z, rotation: spot.rotation }
  }
  const chunksOf = (length, most) => {
    const count = terrain ? Math.ceil(length / most) : 1
    const size = length / count
    return Array.from({ length: count }, (_, index) => ({ along: -length / 2 + (index + 0.5) * size, size }))
  }

  const concrete = concreteTexture(THREE)
  const material = (settings) => {
    const made = new THREE.MeshStandardMaterial({ vertexColors: true, ...settings })
    resources.push(made)
    return made
  }
  resources.push(concrete)
  const materials = {
    concrete: { material: material({ map: concrete, roughness: 0.92 }), cast: true },
    paint: { material: material({ roughness: 0.7 }), cast: true },
    metal: { material: material({ roughness: 0.45, metalness: 0.3 }), cast: true },
    glass: { material: material({ roughness: 0.12, metalness: 0.35 }) },
    shade: { material: material({ roughness: 1 }) }, // intérieurs : ne projettent pas d'ombre
  }
  const stone = colour('#c9c8c2')
  const stoneDark = colour('#98968f')
  const white = colour('#e9ebee')
  const steel = colour('#6f7884')
  const dark = colour('#22272f')
  const red = colour('#c8241b')

  // ---------------------------------------------------------------- Tribunes
  const crowds = [] // un groupe de spectateurs par tronçon : { torsos, heads, x, y, z }
  // Buste plus large aux épaules qu'à la taille, et tête.
  const torsoGeometry = new THREE.CylinderGeometry(0.22, 0.14, 0.56, 6).scale(1, 1, 0.72)
  const headGeometry = new THREE.IcosahedronGeometry(0.16, 0)
  const clothMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95 })
  resources.push(torsoGeometry, headGeometry, clothMaterial)
  const matrix = new THREE.Matrix4()
  const turn = new THREE.Quaternion()
  const lean = new THREE.Euler()
  const position = new THREE.Vector3()
  const stature = new THREE.Vector3()
  const tint = new THREE.Color()

  for (const stand of scenery.stands) {
    const rowDepth = STAND_DEPTH / stand.rows
    const top = stand.rows * RISER
    const front = -STAND_DEPTH / 2
    const back = STAND_DEPTH / 2
    const seatColour = colour(pick(SEATS))
    const chunks = chunksOf(stand.length, CHUNK.stand)
    chunks.forEach(({ along, size }, chunk) => {
      const origin = placed(stand, along)
      const from = -size / 2
      // Allées : positions (repère du tronçon) calculées sur la longueur entière de la tribune.
      const aisles = []
      for (let at = -stand.length / 2 + AISLE.every / 2; at < stand.length / 2; at += AISLE.every) {
        if (at >= along + from && at < along - from) aisles.push(at - along)
      }
      for (let row = 0; row < stand.rows; row += 1) {
        const height = (row + 1) * RISER
        const z = front + (row + 0.5) * rowDepth
        batch.box('concrete', origin, { w: size, h: height + footing, d: rowDepth, y: (height - footing) / 2, z }, row % 2 ? stone : stoneDark, 3)
        // Banquette et dossiers.
        batch.box('paint', origin, { w: size, h: 0.12, d: 0.34, y: height + 0.28, z: z + 0.1 }, seatColour)
        batch.box('paint', origin, { w: size, h: 0.36, d: 0.07, y: height + 0.46, z: z + 0.34 }, seatColour)
        for (const aisle of aisles) {
          batch.box('concrete', origin, { w: AISLE.width, h: 0.62, d: 0.5, x: aisle, y: height + 0.31, z: z + 0.12 }, stone, 3)
        }
      }
      // Muret de devant, mur du fond, joues aux deux extrémités.
      batch.box('paint', origin, { w: size, h: 1.1 + footing, d: 0.16, y: (1.1 - footing) / 2, z: front + 0.08 }, white)
      batch.box('paint', origin, { w: size, h: 0.24, d: 0.18, y: 0.72, z: front + 0.08 }, red)
      batch.box('concrete', origin, { w: size, h: top + 1.1 + footing, d: 0.25, y: (top + 1.1 - footing) / 2, z: back - 0.12 }, stoneDark, 3)
      for (const end of [chunk === 0 ? -1 : 0, chunk === chunks.length - 1 ? 1 : 0]) {
        if (!end) continue
        const x = end * (size / 2 - 0.09)
        for (let row = 0; row < stand.rows; row += 1) {
          const height = (row + 1) * RISER + 0.95
          batch.box('concrete', origin, { w: 0.18, h: height + footing, d: rowDepth, x, y: (height - footing) / 2, z: front + (row + 0.5) * rowDepth }, stone, 3)
        }
      }
      if (stand.roof) {
        const roofY = top + 3.5
        batch.box('metal', origin, { w: size + 0.1, h: 0.16, d: STAND_DEPTH * 0.86, y: roofY + 0.28, z: STAND_DEPTH * 0.07, tiltX: 0.07 }, white)
        batch.box('paint', origin, { w: size + 0.1, h: 0.55, d: 0.14, y: roofY - 0.1, z: front * 0.72 }, dark)
        for (let x = from + 0.4; x < -from; x += 5) {
          batch.box('metal', origin, { w: 0.14, h: 0.24, d: STAND_DEPTH * 0.84, x, y: roofY + 0.1, z: STAND_DEPTH * 0.07, tiltX: 0.07 }, steel)
          batch.box('metal', origin, { w: 0.22, h: roofY + 0.7 + footing, d: 0.22, x, y: (roofY + 0.7 - footing) / 2, z: back - 0.35 }, steel)
          batch.strut('metal', origin, x, [roofY - 2.2, back - 0.35], [roofY + 0.05, back - 3.6], 0.12, steel)
        }
      }

      // Public.
      const seats = []
      for (let row = 0; row < stand.rows; row += 1) {
        for (let x = from + SEAT_SPACING / 2; x < -from; x += SEAT_SPACING) {
          if (aisles.some((aisle) => Math.abs(x - aisle) < AISLE.width / 2 + 0.2)) continue
          if (random() > SEAT_FILL) continue
          seats.push({ x: x + (random() - 0.5) * 0.12, y: (row + 1) * RISER + 0.58 + (random() - 0.5) * 0.12, z: front + (row + 0.5) * rowDepth + 0.08 })
        }
      }
      if (seats.length === 0) return
      const torsos = new THREE.InstancedMesh(torsoGeometry, clothMaterial, seats.length)
      const heads = new THREE.InstancedMesh(headGeometry, clothMaterial, seats.length)
      const cos = Math.cos(origin.rotation)
      const sin = Math.sin(origin.rotation)
      seats.forEach((seat, at) => {
        const x = origin.x + seat.x * cos + seat.z * sin
        const z = origin.z - seat.x * sin + seat.z * cos
        turn.setFromEuler(lean.set((random() - 0.5) * 0.25, origin.rotation + (random() - 0.5) * 0.6, (random() - 0.5) * 0.18, 'YXZ'))
        // Des tailles différentes : sinon la foule ressemble à un damier.
        stature.setScalar(0.84 + random() * 0.28)
        matrix.compose(position.set(x, origin.y + seat.y, z), turn, stature)
        torsos.setMatrixAt(at, matrix)
        torsos.setColorAt(at, tint.set(pick(CLOTHES)))
        matrix.compose(position.set(x, origin.y + seat.y + 0.44 * stature.y, z), turn, stature)
        heads.setMatrixAt(at, matrix)
        heads.setColorAt(at, tint.set(random() > 0.8 ? pick(CLOTHES) : pick(SKIN))) // quelques casquettes
      })
      for (const mesh of [torsos, heads]) {
        mesh.computeBoundingSphere()
        resources.push(mesh)
        group.add(mesh)
      }
      crowds.push({ torsos, heads, sphere: torsos.boundingSphere })
    })
  }

  // ---------------------------------------------------------------- Bâtiment des stands
  // L'avant (z local négatif) donne sur la piste : garages creusés au rez-de-chaussée, loges vitrées à l'étage.
  if (scenery.pit) {
    const { pit } = scenery
    const front = -pit.depth / 2
    const back = pit.depth / 2
    const ground = pit.height
    const upper = 3.2
    const roofY = ground + upper
    let bayNumber = 0
    const chunks = chunksOf(pit.length, CHUNK.pit)
    chunks.forEach(({ along, size }, chunk) => {
      const origin = placed(pit, along)
      // Arrière plein et sol des garages.
      batch.box('concrete', origin, { w: size, h: ground + footing, d: 3.6, y: (ground - footing) / 2, z: back - 1.8 }, stone, 3)
      batch.box('shade', origin, { w: size, h: footing + 0.05, d: pit.depth - 3.6, y: (0.05 - footing) / 2, z: front + (pit.depth - 3.6) / 2 }, colour('#4a4f57'))
      batch.box('concrete', origin, { w: size, h: 0.45, d: pit.depth - 3.6, y: ground - 0.22, z: front + (pit.depth - 3.6) / 2 }, white, 3)
      const bays = Math.max(1, Math.round(size / BAY))
      const width = size / bays
      for (let bay = 0; bay < bays; bay += 1) {
        const x = -size / 2 + (bay + 0.5) * width
        const team = colour(TEAM_BANDS[Math.floor(bayNumber / 2) % TEAM_BANDS.length])
        batch.box('shade', origin, { w: width, h: ground - 0.45, d: 0.1, x, y: (ground - 0.45) / 2, z: back - 3.66 }, colour('#2b3038'))
        // Établi et caisses au fond du garage.
        batch.box('paint', origin, { w: width * 0.5, h: 0.9, d: 0.7, x: x - width * 0.12, y: 0.5, z: back - 4.1 }, team)
        batch.box('metal', origin, { w: 0.9, h: 1.5, d: 0.6, x: x + width * 0.28, y: 0.8, z: back - 4.2 }, dark)
        // Rideau relevé, plus ou moins.
        const drop = bayNumber % 3 === 2 ? 1.9 : 0.55
        batch.box('metal', origin, { w: width - 0.5, h: drop, d: 0.1, x, y: ground - 0.45 - drop / 2, z: front + 0.35 }, steel)
        batch.box('paint', origin, { w: width - 0.5, h: 0.36, d: 0.12, x, y: ground - 0.24, z: front + 0.03 }, team)
        bayNumber += 1
      }
      // Entre les garages : un poteau en façade et une cloison sombre en retrait, pour voir la profondeur.
      for (let pillar = 0; pillar <= bays; pillar += 1) {
        const x = Math.max(-size / 2 + 0.2, Math.min(size / 2 - 0.2, -size / 2 + pillar * width))
        batch.box('concrete', origin, { w: 0.4, h: ground + footing, d: 0.4, x, y: (ground - footing) / 2, z: front + 0.22 }, white, 3)
        batch.box('shade', origin, { w: 0.12, h: ground - 0.45, d: pit.depth - 5, x, y: (ground - 0.45) / 2, z: back - 3.6 - (pit.depth - 5) / 2 }, colour('#565d67'))
      }
      // Étage : balcon, baies vitrées en retrait, meneaux, toit débordant et garde-corps.
      batch.box('concrete', origin, { w: size, h: 0.18, d: 1.3, y: ground + 0.09, z: front + 0.65 }, white, 3)
      batch.box('paint', origin, { w: size, h: upper, d: pit.depth - 1.8, y: ground + upper / 2, z: back - (pit.depth - 1.8) / 2 }, white)
      batch.box('glass', origin, { w: size, h: upper - 0.9, d: 0.12, y: ground + 0.25 + (upper - 0.9) / 2, z: front + 1.72 }, colour('#4d6d86'))
      for (let x = -size / 2; x <= size / 2 + 0.01; x += size / Math.round(size / 2.5)) {
        batch.box('metal', origin, { w: 0.1, h: upper - 0.7, d: 0.14, x, y: ground + 0.15 + (upper - 0.7) / 2, z: front + 1.66 }, dark)
      }
      batch.box('metal', origin, { w: size, h: 0.07, d: 0.07, y: ground + 1.15, z: front + 0.08 }, steel)
      batch.box('paint', origin, { w: size, h: 0.32, d: pit.depth, y: roofY + 0.16, z: 0 }, white)
      batch.box('paint', origin, { w: size, h: 0.18, d: 0.08, y: roofY + 0.18, z: front - 0.01 }, red)
      batch.box('metal', origin, { w: size, h: 0.08, d: 0.08, y: roofY + 1.35, z: front + 0.15 }, steel)
      for (let x = -size / 2 + 0.3; x < size / 2; x += 1.9) {
        batch.box('metal', origin, { w: 0.06, h: 1, d: 0.06, x, y: roofY + 0.82, z: front + 0.15 }, steel)
        batch.box('metal', origin, { w: 0.05, h: 1, d: 0.05, x, y: ground + 0.65, z: front + 0.08 }, steel)
      }
      // Équipements de toiture.
      for (let x = -size / 2 + 2.5; x < size / 2 - 2; x += 6.5) {
        batch.box('metal', origin, { w: 1.4 + random() * 1.6, h: 0.5 + random() * 0.7, d: 1.6, x, y: roofY + 0.75, z: back - 2.4 }, steel)
      }
      // Tour de contrôle à une extrémité.
      if (chunk === 0) {
        const x = -size / 2 + 3.2
        batch.box('paint', origin, { w: 5.4, h: 2.8, d: 6.2, x, y: roofY + 1.7, z: 0.6 }, white)
        batch.box('glass', origin, { w: 5.8, h: 1.9, d: 6.6, x, y: roofY + 4.05, z: 0.6 }, colour('#3f6079'))
        batch.box('paint', origin, { w: 6.4, h: 0.28, d: 7.4, x, y: roofY + 5.14, z: 0.4 }, dark)
        batch.box('metal', origin, { w: 0.09, h: 3.4, d: 0.09, x, y: roofY + 6.9, z: 0.6 }, steel)
      }
    })
  }

  // ---------------------------------------------------------------- Portique de départ
  {
    const origin = { x: scenery.gantry.x, y: heightAt(road, 0), z: scenery.gantry.z, rotation: scenery.gantry.heading }
    const { legs } = scenery.gantry
    const height = GANTRY.height + footing
    for (const { across: z, onPitWall } of legs) {
      for (const dx of [-0.36, 0.36]) {
        for (const dz of [-0.36, 0.36]) {
          batch.box('metal', origin, { w: 0.14, h: height, d: 0.14, x: dx, y: GANTRY.height - height / 2, z: z + dz }, steel)
        }
        for (let y = 0.2; y < GANTRY.height - 0.9; y += 0.9) {
          batch.strut('metal', origin, dx, [y, z - 0.36], [y + 0.9, z + 0.36], 0.07, steel)
          batch.box('metal', origin, { w: 0.07, h: 0.07, d: 0.72, x: dx, y, z }, steel)
        }
      }
      // Sur le muret des stands, pas de socle : il dépasserait de part et d'autre.
      if (!onPitWall) batch.box('concrete', origin, { w: 1.15, h: 0.5, d: 1.15, y: 0.1, z }, stone, 3)
    }
    // La poutre va d'un pied à l'autre : elle n'est pas centrée quand un pied est reporté sur le muret.
    const span = scenery.gantry.span + 0.9
    const middle = (legs[0].across + legs[1].across) / 2
    for (const x of [-0.5, 0.5]) {
      for (const y of [GANTRY.height - 0.65, GANTRY.height + 0.65]) batch.box('metal', origin, { w: 0.14, h: 0.14, d: span, x, y, z: middle }, steel)
      const panels = Math.round(span / 1.3)
      for (let panel = 0; panel < panels; panel += 1) {
        const a = middle - span / 2 + (panel * span) / panels
        const b = a + span / panels
        const up = panel % 2 === 0
        batch.strut('metal', origin, x, [GANTRY.height + (up ? -0.65 : 0.65), a], [GANTRY.height + (up ? 0.65 : -0.65), b], 0.09, steel)
      }
    }
    // Rampe des feux, face aux voitures qui arrivent.
    for (let lamp = -2; lamp <= 2; lamp += 1) {
      batch.box('paint', origin, { w: 0.35, h: 1.15, d: 0.7, x: -0.72, y: GANTRY.height - 0.25, z: lamp * 1.05 }, colour('#101216'))
      for (const y of [-0.52, 0]) batch.box('shade', origin, { w: 0.06, h: 0.36, d: 0.36, x: -0.92, y: GANTRY.height + y, z: lamp * 1.05 }, colour('#571a16'))
    }
    batch.box('paint', origin, { w: 0.18, h: 0.9, d: (road.width + 3) * 0.8, x: 0.62, y: GANTRY.height, z: 0 }, dark)
  }

  // ---------------------------------------------------------------- Panneaux de freinage
  const face = new THREE.PlaneGeometry(1.6, 1.4).rotateY(-Math.PI / 2) // face visible des voitures qui arrivent
  resources.push(face)
  BOARD_DISTANCES.forEach((distance, order) => {
    const bars = BOARD_DISTANCES.length - order
    const texture = boardTexture(THREE, bars, distance)
    materials[`board${bars}`] = { material: material({ map: texture, roughness: 0.6 }) }
    resources.push(texture)
  })
  for (const board of scenery.boards) {
    const origin = { x: board.x, y: groundY(board.x, board.z), z: board.z, rotation: board.rotation }
    for (const z of [-0.55, 0.55]) batch.box('metal', origin, { w: 0.08, h: 1.15 + footing, d: 0.08, y: (1.15 - footing) / 2, z }, steel)
    batch.box('paint', origin, { w: 0.09, h: 1.44, d: 1.64, x: 0.02, y: 1.8, z: 0 }, dark)
    batch.add(`board${board.bars}`, face, origin, { x: -0.035, y: 1.8, z: 0 })
  }

  batch.build(group, materials, resources)

  return {
    group,
    update(camera) {
      for (const { torsos, heads, sphere } of crowds) {
        const near = camera.position.distanceTo(sphere.center) - sphere.radius < PEOPLE_REACH
        torsos.visible = near
        heads.visible = near
      }
    },
  }
}
