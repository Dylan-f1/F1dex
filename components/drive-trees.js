// Arbres en volume : un tronc et un feuillage fait de dizaines de petits plans orientés dans toutes les directions
// (bouquets de feuilles ou rameaux). Instanciés par case de terrain, avec une version allégée au loin.

import { seededRandom } from '@/lib/noise'
import { groveTrees } from '@/lib/scenery-layout'
import { byCell } from './drive-batch'
import { leafTexture, needleTexture } from './drive-textures'

const CELL = 240 // m
const DETAIL_REACH = 70 // m : au-delà du bord d'une case, version allégée
const SOLID_UV = [0.025, 0.025] // coin opaque des textures, pour le tronc

// Le coin en bas à gauche des textures de feuillage est rempli : le tronc s'y réfère (une seule matière par essence).
function withSolidCorner(THREE, texture) {
  const context = texture.image.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, texture.image.height - 14, 14, 14)
  texture.needsUpdate = true
  return texture
}

function builder(THREE) {
  const positions = []
  const normals = []
  const uvs = []
  const colours = []
  const indices = []
  const bark = new THREE.Color('#5a4231')
  return {
    // Quadrilatère visible des deux côtés. `corners` : bas gauche, bas droit, haut gauche, haut droit.
    card(corners, normalOf, shadeOf) {
      const first = positions.length / 3
      const inset = [[0.07, 0.07], [1, 0.07], [0.07, 1], [1, 1]]
      corners.forEach((corner, at) => {
        positions.push(corner.x, corner.y, corner.z)
        const normal = normalOf(corner)
        normals.push(normal.x, normal.y, normal.z)
        uvs.push(...inset[at])
        const shade = shadeOf(corner)
        colours.push(shade, shade, shade)
      })
      indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3)
      indices.push(first, first + 2, first + 1, first + 2, first + 3, first + 1)
    },
    trunk(height, foot, top) {
      const cylinder = new THREE.CylinderGeometry(top, foot, height, 6, 1, true)
      cylinder.translate(0, height / 2, 0)
      const first = positions.length / 3
      const { position, normal } = cylinder.attributes
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex))
        normals.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex))
        uvs.push(...SOLID_UV)
        colours.push(bark.r, bark.g, bark.b)
      }
      for (const index of cylinder.index.array) indices.push(first + index)
      cylinder.dispose()
    },
    geometry() {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
      geometry.setIndex(indices)
      return geometry
    },
  }
}

function broadleaf(THREE, cards, size) {
  const random = seededRandom('feuillu')
  const mesh = builder(THREE)
  mesh.trunk(3.6, 0.34, 0.14)
  const centre = new THREE.Vector3(0, 5, 0)
  const radius = { across: 2.5, up: 2.2 }
  for (let card = 0; card < cards; card += 1) {
    // Directions réparties régulièrement sur la sphère (suite de Fibonacci).
    const up = 1 - (2 * (card + 0.5)) / cards
    const around = card * 2.39996
    const flat = Math.sqrt(1 - up * up)
    const out = new THREE.Vector3(Math.cos(around) * flat, up, Math.sin(around) * flat)
    const depth = 0.45 + random() * 0.55
    const spot = new THREE.Vector3(out.x * radius.across * depth, out.y * radius.up * depth, out.z * radius.across * depth).add(centre)
    const facing = out.clone().add(new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(1.6)).normalize()
    const side = new THREE.Vector3().crossVectors(facing, new THREE.Vector3(0, 1, 0.001)).normalize()
    const rise = new THREE.Vector3().crossVectors(side, facing).normalize()
    const half = (size * (0.85 + random() * 0.3)) / 2
    const corner = (a, b) => spot.clone().addScaledVector(side, a * half).addScaledVector(rise, b * half)
    mesh.card(
      [corner(-1, -1), corner(1, -1), corner(-1, 1), corner(1, 1)],
      (point) => point.clone().sub(centre).normalize().add(new THREE.Vector3(0, 0.35, 0)).normalize(),
      (point) => 0.55 + 0.6 * Math.max(0, Math.min(1, (point.y - centre.y + radius.up) / (radius.up * 2))),
    )
  }
  return mesh.geometry()
}

function pine(THREE, tiers, perTier, width) {
  const random = seededRandom('resineux')
  const mesh = builder(THREE)
  mesh.trunk(7.6, 0.28, 0.06)
  const bottom = 1.7
  const top = 8.4
  for (let tier = 0; tier < tiers; tier += 1) {
    const share = tier / tiers
    const height = bottom + (top - bottom) * share
    const reach = 2.7 * (1 - share) + 0.5
    for (let branch = 0; branch < perTier; branch += 1) {
      const angle = (branch / perTier) * Math.PI * 2 + tier * 0.83 + (random() - 0.5) * 0.35
      const along = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
      const roll = (random() - 0.5) * 1.5
      const across = new THREE.Vector3(-along.z * Math.cos(roll), Math.sin(roll), along.x * Math.cos(roll))
      const inner = new THREE.Vector3(0, height + 0.45, 0)
      const outer = along.clone().multiplyScalar(reach).setY(height - reach * 0.22)
      const half = (reach * width) / 2
      mesh.card(
        [
          inner.clone().addScaledVector(across, -half),
          outer.clone().addScaledVector(across, -half),
          inner.clone().addScaledVector(across, half),
          outer.clone().addScaledVector(across, half),
        ],
        () => along.clone().setY(0.75).normalize(),
        (point) => 0.62 + 0.3 * share + 0.22 * Math.min(1, Math.hypot(point.x, point.z) / reach),
      )
    }
  }
  // Pointe : deux plans croisés.
  for (const angle of [0, Math.PI / 2]) {
    const across = new THREE.Vector3(Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5)
    const low = new THREE.Vector3(0, top - 0.7, 0)
    const high = new THREE.Vector3(0, top + 1.2, 0)
    mesh.card(
      [low.clone().add(across), high.clone().add(across), low.clone().sub(across), high.clone().sub(across)],
      () => new THREE.Vector3(across.z, 0.8, -across.x).normalize(),
      () => 0.9,
    )
  }
  return mesh.geometry()
}

// `groundY(x, z)` : altitude du sol. `reach` : m au-delà desquels la brume cache tout. Renvoie { group, update }.
export function buildTrees(THREE, road, groundY, reach, resources) {
  const group = new THREE.Group()
  const trees = groveTrees(road)
  const kinds = [
    { detailed: broadleaf(THREE, 58, 1.75), light: broadleaf(THREE, 20, 2.7), texture: leafTexture(THREE), glow: '#14210c' },
    { detailed: pine(THREE, 10, 6, 0.95), light: pine(THREE, 6, 4, 1.35), texture: needleTexture(THREE), glow: '#0a160d' },
  ]
  for (const kind of kinds) {
    withSolidCorner(THREE, kind.texture)
    kind.material = new THREE.MeshStandardMaterial({
      map: kind.texture,
      alphaTest: 0.4,
      vertexColors: true,
      roughness: 0.95,
      emissive: kind.glow, // un peu de jour au travers du feuillage
    })
    resources.push(kind.detailed, kind.light, kind.texture, kind.material)
  }
  const cells = []
  const matrix = new THREE.Matrix4()
  const turn = new THREE.Quaternion()
  const upAxis = new THREE.Vector3(0, 1, 0)
  const place = new THREE.Vector3()
  const size = new THREE.Vector3()
  const tint = new THREE.Color()
  for (const cell of byCell(trees, CELL)) {
    kinds.forEach((kind, index) => {
      const members = cell.filter((tree) => tree.kind === index)
      if (members.length === 0) return
      const pair = [kind.detailed, kind.light].map((geometry) => new THREE.InstancedMesh(geometry, kind.material, members.length))
      members.forEach((tree, at) => {
        const scale = tree.scale * 1.05
        matrix.compose(place.set(tree.x, groundY(tree.x, tree.z) - 0.15, tree.z), turn.setFromAxisAngle(upAxis, tree.turn), size.set(scale, scale * (0.9 + (tree.turn % 1) * 0.3), scale))
        // Teinte : du vert franc au vert jauni, propre à chaque arbre.
        const warm = (Math.sin(tree.x * 12.9 + tree.z * 78.2) + 1) / 2
        tint.setRGB(0.82 + warm * 0.38, 0.9 + warm * 0.16, 0.82)
        for (const mesh of pair) {
          mesh.setMatrixAt(at, matrix)
          mesh.setColorAt(at, tint)
        }
      })
      for (const mesh of pair) {
        mesh.computeBoundingSphere()
        mesh.castShadow = true
        mesh.visible = false
        resources.push(mesh)
        group.add(mesh)
      }
      cells.push({ detailed: pair[0], light: pair[1], sphere: pair[0].boundingSphere })
    })
  }
  return {
    group,
    update(camera) {
      for (const { detailed, light, sphere } of cells) {
        const gap = camera.position.distanceTo(sphere.center) - sphere.radius
        detailed.visible = gap < DETAIL_REACH
        light.visible = !detailed.visible && gap < reach
      }
    },
  }
}
