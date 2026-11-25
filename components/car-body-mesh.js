// Maillages three.js de la monoplace construite en code (lib/car-body.js) : un par matière.

import { buildCodeCarBody } from '../lib/car-body.js'

// `materials` : une matière par rôle. Renvoie le groupe et les géométries créées, à libérer avec la scène.
export function buildCodeCar(THREE, materials) {
  const group = new THREE.Group()
  const resources = []
  for (const [role, part] of Object.entries(buildCodeCarBody())) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals, 3))
    geometry.setIndex(part.indices)
    resources.push(geometry)
    const mesh = new THREE.Mesh(geometry, materials[role])
    mesh.name = `caisse-${role}`
    mesh.castShadow = true
    mesh.receiveShadow = false
    group.add(mesh)
  }
  return { group, resources }
}
