import { readFileSync } from 'node:fs'

// Lit les sommets et les triangles de la première maille d'un fichier glTF binaire.
export function readModel(path) {
  const file = readFileSync(path)
  const jsonLength = file.readUInt32LE(12)
  const gltf = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8'))
  const binary = file.subarray(28 + jsonLength)
  const { attributes, indices } = gltf.meshes[0].primitives[0]
  const read = (index, Type, size) => {
    const accessor = gltf.accessors[index]
    const view = gltf.bufferViews[accessor.bufferView]
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const bytes = binary.subarray(start, start + accessor.count * size * Type.BYTES_PER_ELEMENT)
    return new Type(Uint8Array.from(bytes).buffer)
  }
  const wide = gltf.accessors[indices].componentType === 5125
  return { positions: read(attributes.POSITION, Float32Array, 3), indices: read(indices, wide ? Uint32Array : Uint16Array, 1) }
}
