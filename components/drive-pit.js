// Voie des stands à l'écran : revêtement, lignes, muret, panneaux, emplacement du box avec son feu et ses mécaniciens.
// La géométrie vient de lib/pit-lane.js : on touche le muret là où on le voit.

import { offsetPoint, pointAt, indexAt } from '@/lib/drive-track'
import { PIT_LANE, getPitLane, laneOuter, relOf } from '@/lib/pit-lane'
import { PIT_RULES } from '@/lib/pit-stop'
import { heightAt } from '@/lib/relief'
import { createBatch } from './drive-batch'
import { asphaltTexture, concreteTexture, pitSignTexture } from './drive-textures'

const ASPHALT_TILE = 6 // m
const APRON = PIT_LANE.wall + PIT_LANE.wallHalf // m au-delà du bord : fin du dégagement en béton, début de la voie
const BOX_LANE = 5.2 // m au-delà du bord : ligne entre la voie de circulation et les emplacements
const SIGN_AHEAD = 70 // m avant l'entrée : panneau « STANDS »
// Mécaniciens : à l'attente au bord des garages, puis aux quatre roues ([avant, droite] en mètres autour de la voiture).
const CREW_WHEELS = [
  [1.9, 1.75],
  [1.9, -1.75],
  [-1.7, 1.75],
  [-1.7, -1.75],
]
const CREW_RUN = 5 // par seconde : rapidité avec laquelle ils rejoignent la voiture
const LAMP = { off: '#2a1210', busy: '#ff2a1c', go: '#36d44a' }
const GO_SECONDS = 2.5 // feu vert après l'arrêt

export function buildPit(THREE, road, resources) {
  const group = new THREE.Group()
  const lane = getPitLane(road)
  if (!lane) return { group, update() {} }
  const edge = road.width / 2
  const count = road.points.length
  const level = (index) => road.relief?.heights[index] ?? 0
  const keep = (thing) => {
    resources.push(thing)
    return thing
  }
  const material = (settings) => keep(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, ...settings }))
  const flat = (settings, offset) =>
    material({ roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset, ...settings })
  const colour = (hex) => new THREE.Color(hex)

  // Échantillons de la piste entre deux abscisses comptées depuis la ligne de départ.
  function samples(from, to) {
    const first = indexAt(road, from)
    const length = (indexAt(road, to) - first + count) % count
    return Array.from({ length: length + 1 }, (_, step) => (first + step) % count)
  }

  // Bande qui suit la piste de `from` à `to`. `section(rel)` : suite de points [écart à l'axe côté stands, hauteur au
  // dessus de la piste, couleur] en travers.
  function ribbon(from, to, surface, section) {
    const positions = []
    const uvs = []
    const colours = []
    const indices = []
    let columns = 0
    samples(from, to).forEach((index, row) => {
      const rel = relOf(road, road.cumulative[index])
      const across = section(rel)
      columns = across.length
      for (const [p, height, tint] of across) {
        const spot = offsetPoint(road, index, lane.sign * p)
        positions.push(spot.x, level(index) + height, spot.z)
        uvs.push((p + height) / ASPHALT_TILE, road.cumulative[index] / ASPHALT_TILE)
        colours.push(tint.r, tint.g, tint.b)
      }
      if (row === 0) return
      for (let column = 0; column < columns - 1; column += 1) {
        const a = (row - 1) * columns + column
        const c = row * columns + column
        indices.push(a, a + 1, c, a + 1, c + 1, c)
      }
    })
    if (indices.length === 0) return
    const geometry = keep(new THREE.BufferGeometry())
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, surface)
    mesh.receiveShadow = true
    group.add(mesh)
  }

  // ---------------------------------------------------------------- Revêtement et lignes
  const asphalt = flat({ map: keep(asphaltTexture(THREE)) }, 1)
  const concrete = keep(concreteTexture(THREE))
  const apron = flat({ map: concrete }, 2)
  const paint = flat({ roughness: 0.75 }, 5)
  const white = colour('#ffffff')
  const line = colour('#e4e7e8')
  const yellow = colour('#d9b21c')
  const inner = (rel) => Math.min(laneOuter(road, lane, rel), edge + APRON)
  ribbon(lane.entry, lane.exit, apron, (rel) => [
    [edge, 0.014, white],
    [inner(rel), 0.014, white],
  ])
  const grey = colour('#c9ccd2')
  ribbon(lane.entry, lane.exit, asphalt, (rel) => [
    [inner(rel), 0.016, grey],
    [laneOuter(road, lane, rel), 0.016, grey],
  ])
  const stripe = (from, to, at, width, tint) =>
    ribbon(from, to, paint, (rel) => {
      const p = typeof at === 'function' ? at(rel) : at
      return [
        [p, 0.035, tint],
        [p + width, 0.035, tint],
      ]
    })
  stripe(lane.entry, lane.exit, (rel) => Math.max(edge, laneOuter(road, lane, rel) - 0.35), 0.18, line)
  stripe(lane.wallStart, lane.wallEnd, edge + BOX_LANE, 0.15, line)
  // Bord de la route d'entrée et de sortie, côté piste.
  stripe(lane.entry, lane.wallStart, edge + 0.1, 0.18, yellow)
  stripe(lane.wallEnd, lane.exit, edge + 0.1, 0.18, yellow)

  // Emplacement du box.
  const boxFrom = lane.box - PIT_RULES.boxHalf
  const boxTo = lane.box + PIT_RULES.boxHalf
  const boxNear = edge + BOX_LANE + 0.35
  const boxFar = edge + PIT_LANE.width - 0.8
  stripe(boxFrom, boxTo, boxNear, 0.2, yellow)
  stripe(boxFrom, boxTo, boxFar, 0.2, yellow)

  // ---------------------------------------------------------------- Muret
  const wallMaterial = material({ map: concrete, roughness: 0.85 })
  const stone = colour('#d3d4d0')
  const red = colour('#c8241b')
  const axis = edge + PIT_LANE.wall
  const thickness = (rel) =>
    PIT_LANE.wallHalf * Math.max(0.05, Math.min(1, Math.min(rel - lane.wallStart, lane.wallEnd - rel) / PIT_LANE.wallEase))
  const foot = road.relief ? -0.4 : -0.05
  const top = PIT_LANE.wallHeight
  ribbon(lane.wallStart, lane.wallEnd, wallMaterial, (rel) => [
    [axis - thickness(rel), foot, stone],
    [axis - thickness(rel), top, stone],
    [axis - thickness(rel), top, red],
    [axis + thickness(rel), top, red],
    [axis + thickness(rel), top, stone],
    [axis + thickness(rel), foot, stone],
  ])

  // ---------------------------------------------------------------- Pièces posées : lignes en travers, panneaux, box
  const batch = createBatch(THREE)
  const metal = material({ roughness: 0.45, metalness: 0.3 })
  const painted = flat({ roughness: 0.7 }, 5)
  const steel = colour('#6f7884')
  const dark = colour('#22272f')
  // Repère local à l'abscisse `rel` : x dans le sens de la marche, z vers la droite.
  const at = (rel, p) => {
    const spot = pointAt(road, rel)
    const offset = p * lane.sign
    return { x: spot.x + Math.sin(spot.heading) * offset, y: heightAt(road, rel), z: spot.z + Math.cos(spot.heading) * offset, rotation: spot.heading }
  }
  const across = (rel, from, to, width, tint) =>
    batch.box('mark', at(rel, (from + to) / 2), { w: width, h: 0.01, d: to - from, y: 0.036 }, tint)
  // Début et fin de la limitation de vitesse.
  for (const rel of [lane.wallStart, lane.wallEnd]) across(rel, edge + APRON, edge + PIT_LANE.width, 0.55, line)
  for (const rel of [boxFrom, boxTo]) across(rel, boxNear, boxFar + 0.2, 0.2, yellow)
  across(lane.box, boxNear, boxFar, 0.35, line) // repère d'arrêt

  const face = keep(new THREE.PlaneGeometry(1.8, 1.2).rotateY(-Math.PI / 2)) // visible des voitures qui arrivent
  const materials = { metal: { material: metal, cast: true }, mark: { material: painted } }
  const arrow = lane.side === 'right' ? '→' : '←'
  const signs = [
    ['stands', ['STANDS', arrow], lane.entry - SIGN_AHEAD, edge + 2.6],
    ['entree', ['STANDS', arrow], lane.entry, edge + 3.2],
    ['limite', ['80', 'km/h'], lane.wallStart, edge + PIT_LANE.width + 0.8],
  ]
  for (const [name, lines, rel, p] of signs) {
    const texture = keep(pitSignTexture(THREE, name, lines))
    materials[name] = { material: material({ map: texture, roughness: 0.6 }) }
    const origin = at(rel, p)
    for (const z of [-0.6, 0.6]) batch.box('metal', origin, { w: 0.08, h: 1.5, d: 0.08, y: 0.45, z }, steel)
    batch.box('metal', origin, { w: 0.09, h: 1.26, d: 1.86, x: 0.02, y: 1.75 }, dark)
    batch.add(name, face, origin, { x: -0.035, y: 1.75 })
  }

  // Potence du feu : un mât au bord des garages, un bras au-dessus de l'emplacement.
  const mast = edge + PIT_LANE.width + 0.5
  const reach = mast - (edge + PIT_LANE.box)
  const post = at(lane.box + 3.4, mast)
  batch.box('metal', post, { w: 0.14, h: 3.9, d: 0.14, y: 1.75 }, steel)
  batch.box('metal', post, { w: 0.14, h: 0.14, d: reach, y: 3.6, z: (-lane.sign * reach) / 2 }, steel)
  batch.box('metal', post, { w: 0.3, h: 0.55, d: 1.3, y: 3.3, z: -lane.sign * reach }, dark)
  // Trains de pneus prêts, contre le mât.
  const tyre = keep(new THREE.CylinderGeometry(0.34, 0.34, 0.4, 14))
  for (const [along, height] of [[-4.2, 0.2], [-4.2, 0.62], [-3.3, 0.2], [4.6, 0.2], [4.6, 0.62]]) {
    batch.add('metal', tyre, at(lane.box + along, edge + PIT_LANE.width - 0.1), { y: height }, dark)
  }
  batch.build(group, materials, resources)

  const lampGeometry = keep(new THREE.BoxGeometry(0.1, 0.3, 1))
  const lampMaterial = keep(new THREE.MeshBasicMaterial({ color: LAMP.off }))
  const lamp = new THREE.Mesh(lampGeometry, lampMaterial)
  const head = at(lane.box + 3.4, edge + PIT_LANE.box)
  lamp.position.set(head.x - Math.cos(head.rotation) * 0.2, head.y + 3.3, head.z + Math.sin(head.rotation) * 0.2)
  lamp.rotation.y = head.rotation
  group.add(lamp)

  // ---------------------------------------------------------------- Mécaniciens
  const body = keep(new THREE.CylinderGeometry(0.24, 0.18, 0.75, 8))
  const legs = keep(new THREE.CylinderGeometry(0.17, 0.2, 0.55, 8))
  const helmet = keep(new THREE.IcosahedronGeometry(0.2, 1))
  const suit = keep(new THREE.MeshStandardMaterial({ color: '#2b303a', roughness: 0.9 }))
  const cap = keep(new THREE.MeshStandardMaterial({ color: '#d8dbe0', roughness: 0.6 }))
  const crew = CREW_WHEELS.map((_, place) => {
    const person = new THREE.Group()
    for (const [geometry, surface, y] of [[legs, suit, 0.28], [body, suit, 0.92], [helmet, cap, 1.46]]) {
      const mesh = new THREE.Mesh(geometry, surface)
      mesh.position.y = y
      mesh.castShadow = true
      person.add(mesh)
    }
    const waiting = at(lane.box - 2.4 + place * 1.6, edge + PIT_LANE.width + 0.25)
    person.position.set(waiting.x, waiting.y, waiting.z)
    group.add(person)
    return { person, waiting }
  })
  let released = -Infinity // instant (s) de la fin du dernier arrêt
  let busy = false
  let clock = 0

  return {
    group,
    // À chaque image : le feu et les mécaniciens suivent l'arrêt en cours.
    update(state, dt) {
      clock += dt
      const servicing = state.pit.service > 0
      if (busy && !servicing) released = clock
      busy = servicing
      lampMaterial.color.set(servicing ? LAMP.busy : clock - released < GO_SECONDS ? LAMP.go : LAMP.off)
      const share = 1 - Math.exp(-CREW_RUN * dt)
      const cos = Math.cos(state.heading)
      const sin = Math.sin(state.heading)
      crew.forEach(({ person, waiting }, place) => {
        const [ahead, right] = CREW_WHEELS[place]
        const x = servicing ? state.x + ahead * cos + right * sin : waiting.x
        const z = servicing ? state.z - ahead * sin + right * cos : waiting.z
        person.position.x += (x - person.position.x) * share
        person.position.z += (z - person.position.z) * share
        person.position.y = waiting.y
        person.scale.y = servicing ? 0.75 : 1 // accroupis pour changer les roues
      })
    },
  }
}
