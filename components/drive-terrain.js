// Affichage du sol en relief (lib/terrain.js) : la grille de hauteurs, éclaircie sur les hauteurs pour que le relief
// se lise, et un tour plat jusqu'à l'horizon.

const LOW_COLOUR = '#0d1d16'
const HIGH_COLOUR = '#1f3f2c'

// `margin` : m de sol plat au-delà de la grille.
export function buildTerrainMesh(THREE, terrain, relief, margin, resources) {
  const { minX, minZ, cell, columns, rows, heights } = terrain
  const low = new THREE.Color(LOW_COLOUR)
  const high = new THREE.Color(HIGH_COLOUR)
  const tint = new THREE.Color()
  const span = Math.max(1, relief.max - relief.min)
  const positions = []
  const colours = []
  const indices = []
  const addVertex = (x, y, z) => {
    positions.push(x, y, z)
    tint.copy(low).lerp(high, Math.max(0, Math.min(1, (y - relief.min) / span)))
    colours.push(tint.r, tint.g, tint.b)
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) addVertex(minX + column * cell, heights[row * columns + column], minZ + row * cell)
  }
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column
      indices.push(a, a + columns, a + 1, a + 1, a + columns, a + columns + 1)
    }
  }

  // Quatre bandes plates autour de la grille, dont le bord est au niveau de fond.
  const maxX = minX + (columns - 1) * cell
  const maxZ = minZ + (rows - 1) * cell
  const level = heights[0] // les bords de la grille sont tous au niveau de fond
  const bands = [
    [minX - margin, maxX + margin, minZ - margin, minZ],
    [minX - margin, maxX + margin, maxZ, maxZ + margin],
    [minX - margin, minX, minZ, maxZ],
    [maxX, maxX + margin, minZ, maxZ],
  ]
  for (const [x0, x1, z0, z1] of bands) {
    const first = positions.length / 3
    addVertex(x0, level, z0)
    addVertex(x0, level, z1)
    addVertex(x1, level, z0)
    addVertex(x1, level, z1)
    indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
  resources.push(geometry, material)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  return mesh
}
