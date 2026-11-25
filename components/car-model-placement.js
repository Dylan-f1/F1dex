// Pose le modèle 3D dans son groupe voiture : à l'échelle, centré, posé au sol, nez vers +x (comme les voitures
// construites en code). Imports relatifs : ce module est aussi testé avec `node --test`.

import { MODEL_FIT } from '../lib/car-wheels.js'

// `root` : la scène chargée, dont l'axe z est la longueur. `fitted` : ses roues ont été reconnues
// (components/car-wheel-rig.js) ; sinon c'est un autre fichier, seulement mis à `fallbackLength` mètres.
export function placeModel(THREE, root, { fitted, fallbackLength }) {
  if (fitted) root.scale.setScalar(MODEL_FIT.scale)
  else {
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
    root.scale.setScalar(fallbackLength / size.z)
  }
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const centre = box.getCenter(new THREE.Vector3())
  root.position.set(-centre.x, -box.min.y, -centre.z)
  const car = new THREE.Group()
  car.add(root)
  car.rotation.y = Math.PI / 2
  return car
}
