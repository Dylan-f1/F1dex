// Assemblage du décor : des milliers de pièces réunies en peu d'objets, un par matière et par case de terrain. Les
// cases hors du champ de la caméra (ou de l'ombre) ne sont pas dessinées.

const CELL = 220 // m

export const cellKey = (x, z, size = CELL) => `${Math.floor(x / size)}:${Math.floor(z / size)}`

// Regroupe des éléments { x, z } par case : [[élément, …], …].
export function byCell(items, size = CELL) {
  const cells = new Map()
  for (const item of items) {
    const key = cellKey(item.x, item.z, size)
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(item)
  }
  return [...cells.values()]
}

export function createBatch(THREE) {
  const buckets = new Map()
  const unit = new THREE.BoxGeometry(1, 1, 1)
  const matrix = new THREE.Matrix4()
  const local = new THREE.Matrix4()
  const normalMatrix = new THREE.Matrix3()
  const point = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const euler = new THREE.Euler()
  const rotation = new THREE.Quaternion()
  const place = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const white = new THREE.Color('#ffffff')

  function bucketFor(material, x, z) {
    const key = `${material}|${cellKey(x, z)}`
    if (!buckets.has(key)) buckets.set(key, { material, positions: [], normals: [], uvs: [], colours: [], indices: [] })
    return buckets.get(key)
  }

  // `origin` : { x, y, z, rotation } du repère local de la construction ; `part` : { x, y, z } du centre dans ce
  // repère, inclinaisons `tiltX`, `tiltY`, `tiltZ` en option.
  function compose(origin, part) {
    matrix.makeRotationY(origin.rotation ?? 0).setPosition(origin.x, origin.y ?? 0, origin.z)
    rotation.setFromEuler(euler.set(part.tiltX ?? 0, part.tiltY ?? 0, part.tiltZ ?? 0))
    local.compose(place.set(part.x ?? 0, part.y ?? 0, part.z ?? 0), rotation, one)
    matrix.multiply(local)
    normalMatrix.getNormalMatrix(matrix)
  }

  function append(bucket, geometry, colour, scale, uvAt) {
    const base = bucket.positions.length / 3
    const { position, normal, uv } = geometry.attributes
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      point.set(position.getX(vertex) * scale[0], position.getY(vertex) * scale[1], position.getZ(vertex) * scale[2]).applyMatrix4(matrix)
      bucket.positions.push(point.x, point.y, point.z)
      direction.set(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)).applyMatrix3(normalMatrix).normalize()
      bucket.normals.push(direction.x, direction.y, direction.z)
      uvAt(vertex, uv, normal, bucket.uvs)
      bucket.colours.push(colour.r, colour.g, colour.b)
    }
    if (geometry.index) for (const index of geometry.index.array) bucket.indices.push(base + index)
    else for (let vertex = 0; vertex < position.count; vertex += 1) bucket.indices.push(base + vertex)
  }

  return {
    // Boîte de dimensions w (x), h (y), d (z). Avec `tile`, la texture se répète tous les `tile` mètres.
    box(material, origin, part, colour = white, tile = 0) {
      compose(origin, part)
      const bucket = bucketFor(material, origin.x, origin.z)
      append(bucket, unit, colour, [part.w, part.h, part.d], (vertex, uv, normal, out) => {
        if (!tile) {
          out.push(uv.getX(vertex), uv.getY(vertex))
          return
        }
        const across = Math.abs(normal.getX(vertex)) > 0.5 ? part.d : part.w
        const up = Math.abs(normal.getY(vertex)) > 0.5 ? part.d : part.h
        out.push((uv.getX(vertex) * across) / tile, (uv.getY(vertex) * up) / tile)
      })
    },
    // Barre entre deux points (y, z) du repère local, à l'abscisse `x` : poutres et diagonales.
    strut(material, origin, x, from, to, thickness, colour) {
      const dy = to[0] - from[0]
      const dz = to[1] - from[1]
      this.box(
        material,
        origin,
        { w: thickness, h: thickness, d: Math.hypot(dy, dz), x, y: (from[0] + to[0]) / 2, z: (from[1] + to[1]) / 2, tiltX: -Math.atan2(dy, dz) },
        colour,
      )
    },
    // Géométrie quelconque, à ses dimensions.
    add(material, geometry, origin, part, colour = white) {
      compose(origin, part)
      append(bucketFor(material, origin.x, origin.z), geometry, colour, [1, 1, 1], (vertex, uv, normal, out) => out.push(uv.getX(vertex), uv.getY(vertex)))
    },
    // Crée les maillages. `materials[nom]` : { material, cast, receive }.
    build(group, materials, resources) {
      for (const bucket of buckets.values()) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3))
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3))
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2))
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colours, 3))
        geometry.setIndex(bucket.indices)
        resources.push(geometry)
        const { material, cast = false, receive = true } = materials[bucket.material]
        const mesh = new THREE.Mesh(geometry, material)
        mesh.castShadow = cast
        mesh.receiveShadow = receive
        group.add(mesh)
      }
      buckets.clear()
      unit.dispose()
    },
  }
}
