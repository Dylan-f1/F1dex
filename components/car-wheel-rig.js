// Montage three.js des roues : retire les pneus du modèle (lib/car-wheels.js) ou les cylindres de la voiture de
// repli, pose à leur place les roues construites en code (car-wheel-geometry.js), puis les fait tourner et braquer.
// Imports relatifs : ce module est aussi testé avec `node --test`.

import { MODEL_WHEELS, advanceSpin, removeWheels, shownSteerAngle, wheelCentre, wheelWidth } from '../lib/car-wheels.js'
import { createWheelFactory } from './car-wheel-geometry.js'

export function createWheelRig(THREE, mergeGeometries) {
  const factory = createWheelFactory(THREE, mergeGeometries)
  const wheels = [] // { pivot, spin, front, radius (unités du parent), angle }
  let scale = 1

  // Pivot de braquage (axe vertical) > orientation > rotation sur l'essieu > roue.
  // `yaw` aligne le repère de la roue sur celui de la voiture ; `outward` < 0 retourne la face extérieure.
  function mount(parent, { name, position, front, radius, width, outward, yaw = 0 }) {
    const pivot = new THREE.Group()
    pivot.name = `pivot-${name}`
    pivot.position.set(...position)
    const frame = new THREE.Group()
    frame.rotation.y = yaw
    const spin = new THREE.Group()
    spin.name = 'rotation'
    const wheel = factory.wheel(radius, width)
    if (outward < 0) wheel.rotation.y = Math.PI
    spin.add(wheel)
    frame.add(spin)
    pivot.add(frame)
    parent.add(pivot)
    wheels.push({ pivot, spin, front, radius, angle: 0 })
  }

  return {
    // `body` : le maillage du modèle, auquel on retire ses pneus. Renvoie les ressources créées, à libérer avec la
    // scène.
    attachModel(body) {
      const { geometry, parent } = body
      if (!geometry.index) return []
      const cut = removeWheels(geometry.attributes.position.array, geometry.index.array)
      // Un autre fichier de modèle que celui mesuré : on laisse la voiture entière plutôt que de la découper de travers.
      if (cut.removed.some((count) => count === 0)) return []
      geometry.setIndex(cut.body)
      for (const wheel of MODEL_WHEELS) {
        const centre = wheelCentre(wheel)
        mount(parent, {
          name: wheel.id,
          position: [centre[0] + body.position.x, centre[1] + body.position.y, centre[2] + body.position.z],
          front: wheel.front,
          radius: wheel.radius,
          width: wheelWidth(wheel),
          outward: wheel.side,
        })
      }
      return factory.resources()
    },
    // Voiture de repli (lib/car-model.js) : x vers l'avant, un pneu et une jante (cylindres) par roue, remplacés.
    // Renvoie les ressources créées.
    attachFallback(car, meshes) {
      for (const axle of ['avant', 'arriere']) {
        for (const side of ['gauche', 'droite']) {
          const tyre = meshes.get(`${axle}-pneu-${side}`)
          const rim = meshes.get(`${axle}-jante-${side}`)
          if (!tyre || !rim) continue
          const { radiusTop: radius, height: width } = tyre.geometry.parameters
          car.remove(tyre, rim)
          mount(car, {
            name: `${axle}-${side}`,
            position: tyre.position.toArray(),
            front: axle === 'avant',
            radius,
            width,
            yaw: Math.PI / 2,
            outward: tyre.position.z > 0 ? -1 : 1,
          })
        }
      }
      return factory.resources()
    },
    // Échelle appliquée au modèle, pour convertir les rayons en mètres.
    setScale(next) {
      scale = next
    },
    // `steer` : position du volant −1..1 (1 = gauche) ; `u` : vitesse vers l'avant en m/s.
    update({ steer, u }, dt) {
      const angle = shownSteerAngle(steer, u)
      for (const wheel of wheels) {
        wheel.angle = advanceSpin(wheel.angle, u, wheel.radius * scale, dt)
        wheel.spin.rotation.x = wheel.angle
        if (wheel.front) wheel.pivot.rotation.y = angle
      }
    },
    // Retour au showroom : roues droites, à leur position d'origine.
    reset() {
      for (const wheel of wheels) {
        wheel.angle = 0
        wheel.spin.rotation.x = 0
        wheel.pivot.rotation.y = 0
      }
    },
  }
}
