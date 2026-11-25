// Affichage du sol : la grille de hauteurs de lib/terrain.js (relief) et un tour plat jusqu'à l'horizon, couverts
// d'herbe. La teinte varie par plages (et un peu avec l'altitude) pour casser la répétition de la texture.

import { createNoise, fbm } from '@/lib/noise'

export const GRASS_TILE = 7 // m par répétition de la texture
const FLAT_CELL = 24 // m, maille du sol d'un circuit sans relief

// Multiplicateur de couleur de l'herbe en (x, z) ; `rise` : 0 au point bas, 1 au point haut.
function makeTint(THREE) {
  const noise = createNoise('prairie')
  const dry = new THREE.Color('#e6d9a8')
  const lush = new THREE.Color('#d2f0c4')
  const colour = new THREE.Color()
  return (x, z, rise) => {
    const patch = fbm(noise, x / 90, z / 90, 4)
    const wide = fbm(noise, x / 310 + 40, z / 310 + 40, 3)
    colour.copy(lush).lerp(dry, Math.max(0, Math.min(1, (wide - 0.42) * 3)))
    // Bandes de tonte, larges et discrètes.
    const stripe = Math.floor((x + z * 0.35) / 11) % 2 ? 1.05 : 0.95
    return colour.multiplyScalar((0.72 + patch * 0.5 + rise * 0.12) * stripe)
  }
}

// Grille de `columns` × `rows` sommets à partir d'une fonction de hauteur.
function addGrid(mesh, minX, minZ, cellX, cellZ, columns, rows, heightOf) {
  const first = mesh.positions.length / 3
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) mesh.add(minX + column * cellX, heightOf(column, row), minZ + row * cellZ)
  }
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = first + row * columns + column
      mesh.indices.push(a, a + columns, a + 1, a + 1, a + columns, a + columns + 1)
    }
  }
}

// `terrain` : résultat de getTerrain, ou null pour un circuit plat (`bounds` sert alors d'emprise). `margin` : m de
// sol au-delà. Renvoie { mesh, level } où `level` est l'altitude du sol au loin.
export function buildTerrainMesh(THREE, terrain, relief, bounds, margin, material, resources) {
  const tint = makeTint(THREE)
  const low = relief?.min ?? 0
  const span = Math.max(1, (relief?.max ?? 0) - low)
  const mesh = {
    positions: [],
    colours: [],
    uvs: [],
    indices: [],
    add(x, y, z) {
      this.positions.push(x, y, z)
      this.uvs.push(x / GRASS_TILE, z / GRASS_TILE)
      const colour = tint(x, z, Math.max(0, Math.min(1, (y - low) / span)))
      this.colours.push(colour.r, colour.g, colour.b)
    },
  }
  const level = terrain ? terrain.heights[0] : 0 // les bords de la grille sont tous au niveau de fond
  const minX = terrain ? terrain.minX : bounds.minX - 200
  const minZ = terrain ? terrain.minZ : bounds.minZ - 200
  const maxX = terrain ? minX + (terrain.columns - 1) * terrain.cell : bounds.maxX + 200
  const maxZ = terrain ? minZ + (terrain.rows - 1) * terrain.cell : bounds.maxZ + 200
  if (terrain) addGrid(mesh, minX, minZ, terrain.cell, terrain.cell, terrain.columns, terrain.rows, (column, row) => terrain.heights[row * terrain.columns + column])
  else {
    const columns = Math.ceil((maxX - minX) / FLAT_CELL) + 1
    const rows = Math.ceil((maxZ - minZ) / FLAT_CELL) + 1
    addGrid(mesh, minX, minZ, (maxX - minX) / (columns - 1), (maxZ - minZ) / (rows - 1), columns, rows, () => 0)
  }

  // Quatre bandes plates autour de la grille.
  const bands = [
    [minX - margin, maxX + margin, minZ - margin, minZ],
    [minX - margin, maxX + margin, maxZ, maxZ + margin],
    [minX - margin, minX, minZ, maxZ],
    [maxX, maxX + margin, minZ, maxZ],
  ]
  for (const [x0, x1, z0, z1] of bands) {
    const columns = Math.ceil((x1 - x0) / (FLAT_CELL * 3)) + 1
    const rows = Math.ceil((z1 - z0) / (FLAT_CELL * 3)) + 1
    addGrid(mesh, x0, z0, (x1 - x0) / (columns - 1), (z1 - z0) / (rows - 1), columns, rows, () => level)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(mesh.colours, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs, 2))
  geometry.setIndex(mesh.indices)
  geometry.computeVertexNormals()
  resources.push(geometry)
  const result = new THREE.Mesh(geometry, material)
  result.receiveShadow = true
  return { mesh: result, level }
}
