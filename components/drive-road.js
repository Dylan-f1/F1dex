// Surfaces de la piste (sol, asphalte, traits, vibreurs, gravier, damier de départ) et barrières (bande de
// protection, piles de pneus, grillage, soutènements). Les équipements viennent de lib/circuit-features.js : on les
// touche là où on les voit.

import { KERB_WIDTH, WALL_HEIGHT, getFeatures } from '@/lib/circuit-features'
import { offsetPoint, pointAt } from '@/lib/drive-track'
import { gradeAt, heightAt } from '@/lib/relief'
import { FENCE_SETBACK, TYRE_STACK, barrierLayout, racingLine } from '@/lib/scenery-layout'
import { getTerrain, pavedEdge, skirtFoot } from '@/lib/terrain'
import { byCell, createBatch } from './drive-batch'
import { buildTerrainMesh } from './drive-terrain'
import { asphaltTexture, checkerTexture, concreteTexture, fenceTexture, grassTexture, gravelTexture, tyreStackTexture } from './drive-textures'

const CHUNK = 96 // échantillons (environ 240 m) par morceau de bande : les morceaux hors champ ne sont pas dessinés
const GROUND_MARGIN = 2600 // m de sol autour du circuit : la brume le recouvre avant son bord
const ASPHALT_TILE = 6 // m
const ASPHALT_COLUMNS = 15
const BELT_HEIGHT = 0.82 // m
const FENCE_HEIGHT = 3.2 // m
const BARRIER_REACH = 650 // m : au-delà, piles de pneus et poteaux ne sont plus dessinés

// Bande qui suit la piste. `vertex(i, c)` : { x, y, z, u, v, colour } à l'échantillon `i` (jusqu'à `count`, qui
// referme la boucle) et à la colonne `c`. Avec `flat`, chaque tronçon a ses propres sommets (couleurs franches).
function band(THREE, group, resources, { count, columns, material, include = () => true, vertex, flat = false }) {
  for (let start = 0; start < count; start += CHUNK) {
    const positions = []
    const uvs = []
    const colours = []
    const indices = []
    const end = Math.min(count, start + CHUNK)
    const rows = new Map() // sommets partagés entre deux tronçons consécutifs
    const addRow = (index, segment) => {
      if (!flat && rows.has(index)) return rows.get(index)
      const first = positions.length / 3
      for (let column = 0; column < columns; column += 1) {
        const spot = vertex(index, column, segment)
        positions.push(spot.x, spot.y, spot.z)
        uvs.push(spot.u ?? 0, spot.v ?? 0)
        colours.push(spot.colour.r, spot.colour.g, spot.colour.b)
      }
      rows.set(index, first)
      return first
    }
    for (let index = start; index < end; index += 1) {
      if (!include(index)) continue
      const near = addRow(index, index)
      const far = addRow(index + 1, index)
      for (let column = 0; column < columns - 1; column += 1) {
        const a = near + column
        const c = far + column
        indices.push(a, a + 1, c, a + 1, c + 1, c)
      }
    }
    if (indices.length === 0) continue
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    resources.push(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    group.add(mesh)
  }
}

// Trace de gomme : assombrissement selon l'écart à la trajectoire, plus marqué aux freinages.
function rubberShade(road) {
  const line = racingLine(road)
  const count = road.points.length
  const near = Math.round(15 / road.spacing)
  const far = Math.round(110 / road.spacing)
  // 1 à l'entrée d'un virage serré, 0 loin avant.
  const braking = road.points.map((_, index) => {
    if (Math.abs(road.curvature[index]) > 1 / 220) return 0
    for (let ahead = near; ahead <= far; ahead += 2) {
      if (Math.abs(road.curvature[(index + ahead) % count]) > 1 / 100) return 1 - (ahead - near) / (far - near)
    }
    return 0
  })
  return (index, offset) => {
    const apart = offset - line[index]
    const main = Math.exp(-(apart * apart) / 3.4)
    // Deux traces de pneus plus sombres au freinage.
    const tracks = Math.exp(-((Math.abs(apart) - 0.85) ** 2) / 0.09)
    return 1 - 0.3 * main - 0.34 * braking[index] * tracks
  }
}

export function buildRoad(THREE, road, resources) {
  const group = new THREE.Group()
  const terrain = getTerrain(road)
  const features = getFeatures(road)
  const count = road.points.length
  const half = road.width / 2
  const wrap = (index) => index % count
  const level = (index) => road.relief?.heights[wrap(index)] ?? 0

  const texture = (make, ...args) => {
    const made = make(THREE, ...args)
    resources.push(made)
    return made
  }
  const material = (settings) => {
    const made = new THREE.MeshStandardMaterial(settings)
    resources.push(made)
    return made
  }
  const surface = (settings, offset) =>
    material({
      vertexColors: true,
      roughness: 0.95,
      side: THREE.DoubleSide,
      polygonOffset: offset !== 0,
      polygonOffsetFactor: -offset,
      polygonOffsetUnits: -offset,
      ...settings,
    })
  const colour = (hex) => new THREE.Color(hex)
  const white = colour('#ffffff')
  const concrete = texture(concreteTexture)

  // Sol.
  const ground = buildTerrainMesh(THREE, terrain, road.relief, road.bounds, GROUND_MARGIN, material({ map: texture(grassTexture), vertexColors: true, roughness: 1 }), resources)
  group.add(ground.mesh)

  // Asphalte et trace de gomme.
  const shade = rubberShade(road)
  const tint = new THREE.Color()
  band(THREE, group, resources, {
    count,
    columns: ASPHALT_COLUMNS,
    material: surface({ map: texture(asphaltTexture), roughness: 0.9 }, 2),
    vertex(index, column) {
      const offset = -half + (road.width * column) / (ASPHALT_COLUMNS - 1)
      const spot = offsetPoint(road, wrap(index), offset)
      const value = shade(wrap(index), offset)
      return {
        x: spot.x,
        y: level(index) + 0.02,
        z: spot.z,
        u: offset / ASPHALT_TILE,
        v: road.cumulative[index] / ASPHALT_TILE,
        colour: tint.setRGB(value, value, value * 1.01),
      }
    },
  })

  // Bords de piste.
  const paint = surface({ roughness: 0.75 }, 4)
  const lineColour = colour('#dfe3e3')
  for (const [from, to] of [[half - 1.1, half - 0.6], [-half + 0.6, -half + 1.1]]) {
    band(THREE, group, resources, {
      count,
      columns: 2,
      material: paint,
      vertex(index, column) {
        const spot = offsetPoint(road, wrap(index), column ? to : from)
        return { x: spot.x, y: level(index) + 0.04, z: spot.z, colour: lineColour }
      },
    })
  }

  const gravelMaterial = surface({ map: texture(gravelTexture), roughness: 1 }, 1)
  const kerbMaterial = surface({ map: concrete, roughness: 0.7 }, 6)
  const beltMaterial = surface({ roughness: 0.65 }, 0)
  const wallMaterial = surface({ map: concrete }, 0)
  const fenceMaterial = surface({ map: texture(fenceTexture), alphaTest: 0.3, roughness: 0.5, metalness: 0.2 }, 0)
  const red = colour('#d8271c')
  const belt = [colour('#e8eaec'), colour('#1f4f9c'), colour('#e8eaec'), colour('#c8241b')]
  const retaining = colour('#a9aaa6')
  const steel = colour('#8c949d')
  const { stacks, fence } = barrierLayout(road)
  const sink = terrain ? 0.3 : 0 // la barrière s'enfonce un peu sous le sol en relief
  const poles = createBatch(THREE)
  const feet = {} // hauteur du pied de barrière au-dessus de la piste, par côté

  for (const side of ['left', 'right']) {
    const sign = side === 'right' ? 1 : -1
    const walled = (i) => features.wall[side][wrap(i)] > 0
    const wallAt = (i) => features.wall[side][wrap(i)]
    const both = (test) => (i) => test(i) && test(i + 1)
    // En relief, la barrière dépasse toujours du talus (aucun obstacle invisible), avec du béton uni entre elle et la
    // piste quand le sol s'en écarte, au-dessus comme au-dessous.
    const drop = road.points.map((_, i) => {
      if (!terrain || !walled(i)) return 0
      const spot = offsetPoint(road, i, sign * wallAt(i))
      return terrain.surface(spot.x, spot.z) - level(i)
    })
    const barrierFoot = (i) => Math.max(0, drop[wrap(i)]) - sink
    const faceFoot = (i) => Math.min(0, drop[wrap(i)]) - sink
    feet[side] = barrierFoot
    // Bande verticale à l'écart `offsetOf(i)` de l'axe.
    const upright = ({ include, offsetOf, from, to, surfaceMaterial, colourOf, tile, flat }) =>
      band(THREE, group, resources, {
        count,
        columns: 2,
        material: surfaceMaterial,
        include,
        flat,
        vertex(index, column, segment) {
          const i = wrap(index)
          const spot = offsetPoint(road, i, sign * offsetOf(i))
          const height = column ? to(i) : from(i)
          return { x: spot.x, y: level(i) + height, z: spot.z, u: road.cumulative[index] / tile, v: height / tile, colour: colourOf(segment) }
        },
      })

    band(THREE, group, resources, {
      count,
      columns: 2,
      material: gravelMaterial,
      include: both((i) => features.gravel[side][wrap(i)] > 0),
      vertex(index, column) {
        const i = wrap(index)
        const offset = column ? half + KERB_WIDTH + features.gravel[side][i] : half
        const spot = offsetPoint(road, i, sign * offset)
        return { x: spot.x, y: level(i) + 0.012, z: spot.z, u: spot.x / 3, v: spot.z / 3, colour: white }
      },
    })

    // Vibreur bombé : il monte vers l'extérieur puis retombe.
    const kerbProfile = [
      [0, 0.03],
      [KERB_WIDTH * 0.78, 0.1],
      [KERB_WIDTH, 0.015],
    ]
    band(THREE, group, resources, {
      count,
      columns: kerbProfile.length,
      material: kerbMaterial,
      flat: true,
      include: both((i) => features.kerb[side][wrap(i)] > 0),
      vertex(index, column, segment) {
        const [across, height] = kerbProfile[column]
        const spot = offsetPoint(road, wrap(index), sign * (half + across))
        return { x: spot.x, y: level(index) + height, z: spot.z, u: road.cumulative[index] / 2, v: across / 2, colour: segment % 2 ? red : white }
      },
    })

    upright({
      include: both(walled),
      offsetOf: (i) => wallAt(i) - 0.02,
      from: barrierFoot,
      to: (i) => barrierFoot(i) + sink + BELT_HEIGHT,
      surfaceMaterial: beltMaterial,
      colourOf: (segment) => belt[Math.floor(segment / 4) % belt.length],
      tile: 2,
      flat: true,
    })
    upright({
      include: both((i) => fence[side][wrap(i)] === 1),
      offsetOf: (i) => wallAt(i) + FENCE_SETBACK,
      from: barrierFoot,
      to: (i) => barrierFoot(i) + FENCE_HEIGHT,
      surfaceMaterial: fenceMaterial,
      colourOf: () => white,
      tile: 1.1,
    })
    for (let i = 0; i < count; i += 2) {
      if (!fence[side][i]) continue
      const spot = offsetPoint(road, i, sign * (wallAt(i) + FENCE_SETBACK + 0.06))
      const origin = { x: spot.x, y: level(i) + barrierFoot(i), z: spot.z, rotation: pointAt(road, road.cumulative[i]).heading }
      poles.box('pole', origin, { w: 0.12, h: FENCE_HEIGHT + 0.15, d: 0.12, y: (FENCE_HEIGHT + 0.15) / 2 }, steel)
    }
    if (!terrain) continue
    upright({ include: both(walled), offsetOf: wallAt, from: faceFoot, to: barrierFoot, surfaceMaterial: wallMaterial, colourOf: () => retaining, tile: 3 })
    const outer = (i) => pavedEdge(road, i, side)
    const skirt = road.points.map((_, i) => skirtFoot(road, i, sign * outer(i)))
    upright({
      include: both((i) => skirt[wrap(i)] !== null),
      offsetOf: outer,
      from: () => 0.012,
      to: (i) => skirt[i] - level(i),
      surfaceMaterial: wallMaterial,
      colourOf: () => retaining,
      tile: 3,
    })
  }

  const poleMaterial = material({ vertexColors: true, roughness: 0.5, metalness: 0.25 })
  const poleGroup = new THREE.Group()
  poles.build(poleGroup, { pole: { material: poleMaterial } }, resources)
  group.add(poleGroup)

  // Piles de pneus : une géométrie instanciée par case. Les couvercles reprennent un point sombre de la texture.
  const distant = [...poleGroup.children]
  if (stacks.length > 0) {
    const stack = new THREE.CylinderGeometry(TYRE_STACK.radius, TYRE_STACK.radius, WALL_HEIGHT, 10)
    const { uv, normal } = stack.attributes
    for (let vertex = 0; vertex < uv.count; vertex += 1) if (Math.abs(normal.getY(vertex)) > 0.5) uv.setXY(vertex, 0.5, 0.01)
    const rubber = material({ map: texture(tyreStackTexture), roughness: 0.85 })
    resources.push(stack)
    const matrix = new THREE.Matrix4()
    for (const cell of byCell(stacks)) {
      const mesh = new THREE.InstancedMesh(stack, rubber, cell.length)
      cell.forEach((tyre, at) => {
        const foot = feet[tyre.side]
        const low = level(tyre.index) + foot(tyre.index)
        const high = level(tyre.index + 1) + foot(tyre.index + 1)
        matrix.makeTranslation(tyre.x, low + (high - low) * tyre.t + sink + WALL_HEIGHT / 2, tyre.z)
        mesh.setMatrixAt(at, matrix)
      })
      mesh.castShadow = true
      mesh.receiveShadow = true
      resources.push(mesh)
      group.add(mesh)
      distant.push(mesh)
    }
  }

  // Ligne de départ : un damier en travers de la piste, à l'abscisse 0.
  const start = pointAt(road, 0)
  const across = road.width - 1.2
  const lineGeometry = new THREE.PlaneGeometry(across, 0.72).rotateX(-Math.PI / 2).rotateY(Math.PI / 2)
  const lineMaterial = surface({ vertexColors: false, map: texture(checkerTexture, Math.round(across / 0.36)), roughness: 0.75 }, 5)
  resources.push(lineGeometry)
  const line = new THREE.Mesh(lineGeometry, lineMaterial)
  line.rotation.set(0, start.heading, Math.atan(gradeAt(road, 0)), 'YZX')
  line.position.set(start.x, heightAt(road, 0) + 0.045, start.z)
  line.receiveShadow = true
  group.add(line)

  for (const mesh of distant) {
    if (mesh.isInstancedMesh) mesh.computeBoundingSphere()
    else mesh.geometry.computeBoundingSphere()
  }
  const spheres = distant.map((mesh) => ({ mesh, sphere: mesh.isInstancedMesh ? mesh.boundingSphere : mesh.geometry.boundingSphere }))

  return {
    group,
    level: ground.level,
    update(camera) {
      for (const { mesh, sphere } of spheres) mesh.visible = camera.position.distanceTo(sphere.center) < BARRIER_REACH + sphere.radius
    },
  }
}
