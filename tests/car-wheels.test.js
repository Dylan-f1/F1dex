import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createWheelRig } from '../components/car-wheel-rig.js'
import { CODE_CAR_WHEELS } from '../lib/car-body.js'
import { buildCarParts } from '../lib/car-model.js'
import {
  MODEL_FIT,
  MODEL_WHEELS,
  WHEEL_VISUAL,
  advanceSpin,
  connectedPieces,
  removeWheels,
  shownSteerAngle,
  tyreProfile,
  wheelCentre,
} from '../lib/car-wheels.js'

// Lit les sommets et les triangles de la première maille d'un fichier glTF binaire.
function readModel(path) {
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

const model = readModel(new URL('../public/models/f1.glb', import.meta.url))
const cut = removeWheels(model.positions, model.indices)

test('les quatre pneus du modèle sont retirés', () => {
  cut.removed.forEach((count, index) => assert.ok(count > 600, `${MODEL_WHEELS[index].id} : ${count} triangles`))
})

test('rien ne reste à l’intérieur des pneus retirés', () => {
  for (const wheel of MODEL_WHEELS) {
    for (let triangle = 0; triangle < cut.body.length; triangle += 3) {
      const corners = cut.body.slice(triangle, triangle + 3)
      const [x, y, z] = [0, 1, 2].map((axis) => corners.reduce((sum, corner) => sum + model.positions[corner * 3 + axis], 0) / 3)
      const outer = corners.every((corner) => model.positions[corner * 3] * wheel.side >= wheel.innerX)
      const inside = x * wheel.side >= wheel.innerX && Math.hypot(y - wheel.y, z - wheel.z) <= wheel.radius
      assert.ok(!(outer && inside), `${wheel.id} : triangle oublié`)
    }
  }
})

test('aucun morceau ne flotte près des roues, et la voiture reste entière', () => {
  const pieces = connectedPieces(model.positions, cut.body).sort((a, b) => b.length - a.length)
  // La carrosserie, plus deux petites pièces déjà détachées dans le fichier d'origine, près de l'axe de la voiture.
  assert.equal(pieces.length, 3)
  assert.ok(pieces[0].length / 3 > 14000, `carrosserie : ${pieces[0].length / 3} triangles`)
  for (const piece of pieces.slice(1)) {
    for (const vertex of piece) assert.ok(Math.abs(model.positions[vertex * 3]) < 0.155)
  }
})

test('à l’arrière, rien de l’ancien pneu ne dépasse autour de la roue', () => {
  for (const wheel of MODEL_WHEELS.filter((candidate) => !candidate.front)) {
    for (let triangle = 0; triangle < cut.body.length; triangle += 3) {
      const corners = cut.body.slice(triangle, triangle + 3)
      const [x, y, z] = [0, 1, 2].map((axis) => corners.reduce((sum, corner) => sum + model.positions[corner * 3 + axis], 0) / 3)
      const beside = x * wheel.side >= wheel.innerX + 0.01 && y > -0.15
      assert.ok(!(beside && Math.hypot(y - wheel.y, z - wheel.z) <= wheel.radius + 0.03), `${wheel.id} : reste à ${x}, ${y}, ${z}`)
    }
  }
})

test('une fois corrigée, la voiture a les cotes d’une F1', () => {
  const [front, , rear] = MODEL_WHEELS
  const extent = (axis) => {
    let min = Infinity
    let max = -Infinity
    for (let index = axis; index < model.positions.length; index += 3) {
      min = Math.min(min, model.positions[index])
      max = Math.max(max, model.positions[index])
    }
    return max - min
  }
  const { scale, stretch } = MODEL_FIT
  const within = (value, low, high, what) => assert.ok(value >= low && value <= high, `${what} : ${value.toFixed(3)} m`)
  within(extent(0) * scale, 1.9, 2.05, 'largeur')
  within(extent(2) * scale * stretch, 5.4, 5.9, 'longueur')
  within((front.z - rear.z) * scale * stretch, 3.59, 3.61, 'empattement')
  within(front.radius * 2 * scale, 0.69, 0.74, 'diamètre des pneus')
})

test('le profil du pneu tient dans le rayon et la largeur mesurés', () => {
  const profile = tyreProfile(0.1, 0.12)
  const radials = profile.map(([r]) => r)
  const axials = profile.map(([, a]) => a)
  assert.equal(Math.max(...radials), 0.1)
  assert.ok(Math.abs(Math.min(...axials) + 0.06) < 1e-12 && Math.abs(Math.max(...axials) - 0.06) < 1e-12)
  // Le rayon monte jusqu'à la bande de roulement puis redescend, d'une face à l'autre.
  const top = radials.lastIndexOf(0.1)
  radials.slice(1).forEach((radial, index) => {
    assert.ok(index < top ? radial >= radials[index] : radial <= radials[index], `point ${index + 1}`)
  })
  assert.deepEqual(radials, radials.toReversed())
})

test('les roues avant braquent du côté demandé, moins à haute vitesse', () => {
  assert.equal(shownSteerAngle(0, 50), 0)
  assert.equal(shownSteerAngle(1, 0), WHEEL_VISUAL.steerSlow)
  assert.equal(shownSteerAngle(-1, 0), -WHEEL_VISUAL.steerSlow)
  assert.ok(Math.abs(shownSteerAngle(1, 200) - WHEEL_VISUAL.steerFast) < 1e-12)
  assert.equal(shownSteerAngle(5, 0), WHEEL_VISUAL.steerSlow)
})

test('la roue tourne avec la vitesse, dans les deux sens', () => {
  assert.ok(Math.abs(advanceSpin(0, 5, 0.5, 1 / 60) - 10 / 60) < 1e-9)
  assert.ok(advanceSpin(0, -5, 0.5, 1 / 60) < 0)
  assert.equal(advanceSpin(1, 0, 0.5, 1 / 60), 1)
})

test('à haute vitesse la rotation montrée est plafonnée, sans paraître reculer', () => {
  assert.ok(WHEEL_VISUAL.maxSpinStep < Math.PI / WHEEL_VISUAL.spokes)
  assert.equal(advanceSpin(0, 90, 0.5, 1 / 60), WHEEL_VISUAL.maxSpinStep)
  let angle = 0
  for (let frame = 0; frame < 1000; frame += 1) angle = advanceSpin(angle, 90, 0.5, 1 / 60)
  assert.ok(angle >= 0 && angle < 2 * Math.PI)
})

test('un rayon ou un pas de temps nul ne produit pas d’angle invalide', () => {
  assert.equal(advanceSpin(1, 30, 0, 1 / 60), 1)
  assert.equal(advanceSpin(1, 30, 0.5, 0), 1)
})

// Position, dans le repère de la voiture, d'un point posé sur le dessus d'une roue (repère tournant).
function topOfTyre(car, name) {
  car.updateMatrixWorld(true)
  return car.getObjectByName(`pivot-${name}`).getObjectByName('rotation').localToWorld(new THREE.Vector3(0, 0.1, 0))
}

function checkRig(car, rig, forward) {
  const names = MODEL_WHEELS.map((wheel) => wheel.id)
  const before = names.map((name) => topOfTyre(car, name))
  rig.update({ steer: 0, u: 2 }, 1 / 60)
  names.forEach((name, index) => {
    const moved = topOfTyre(car, name).sub(before[index])
    assert.ok(moved.dot(forward) > 0, `${name} : le haut de la roue doit partir vers l’avant`)
  })
  rig.update({ steer: 1, u: 0 }, 1 / 60)
  for (const name of names) {
    const angle = car.getObjectByName(`pivot-${name}`).rotation.y
    if (name.startsWith('avant')) assert.ok(angle > 0, `${name} : braquage ${angle}`)
    else assert.equal(angle, 0, `${name} : une roue arrière ne braque pas`)
  }
  rig.reset()
  names.forEach((name, index) => assert.ok(topOfTyre(car, name).distanceTo(before[index]) < 1e-9, name))
}

test('sur le modèle, les roues roulent vers l’avant et seules celles de devant braquent', () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(model.positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(model.indices.slice(), 1))
  const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
  const car = new THREE.Group()
  car.add(body)
  const rig = createWheelRig(THREE, mergeGeometries)
  assert.ok(rig.attachModel(body).length > 0)
  assert.equal(geometry.index.count, cut.body.length)
  // La carrosserie est allongée, les roues suivent sur la longueur sans être déformées.
  assert.equal(body.scale.z, MODEL_FIT.stretch)
  for (const wheel of MODEL_WHEELS) {
    const [x, y, z] = wheelCentre(wheel)
    const pivot = car.getObjectByName(`pivot-${wheel.id}`)
    assert.deepEqual(pivot.position.toArray(), [x, y, z * MODEL_FIT.stretch])
    assert.deepEqual(pivot.scale.toArray(), [1, 1, 1])
  }
  checkRig(car, rig, new THREE.Vector3(0, 0, 1))
})

test('sur la voiture construite en code, les roues roulent vers l’avant, face tournée vers l’extérieur', () => {
  const car = new THREE.Group()
  const rig = createWheelRig(THREE, mergeGeometries)
  assert.ok(rig.attachCodeCar(car, CODE_CAR_WHEELS).length > 0)
  car.updateMatrixWorld(true)
  for (const wheel of CODE_CAR_WHEELS) {
    const spin = car.getObjectByName(`pivot-${wheel.id}`).getObjectByName('rotation')
    const face = spin.children[0]
    const outward = face.localToWorld(new THREE.Vector3(1, 0, 0)).sub(face.localToWorld(new THREE.Vector3()))
    assert.ok(outward.z * wheel.position[2] > 0, wheel.id)
  }
  checkRig(car, rig, new THREE.Vector3(1, 0, 0))
})

test('la voiture de repli a les mêmes roues, qui roulent aussi vers l’avant', () => {
  const car = new THREE.Group()
  const meshes = new Map()
  for (const part of buildCarParts().filter((candidate) => /-(pneu|jante)-/.test(candidate.name))) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(...part.size), new THREE.MeshStandardMaterial())
    mesh.position.set(...part.position)
    car.add(mesh)
    meshes.set(part.name, mesh)
  }
  assert.equal(meshes.size, 8)
  const rig = createWheelRig(THREE, mergeGeometries)
  rig.attachFallback(car, meshes)
  assert.equal(car.children.length, 4, 'les cylindres sont remplacés')
  checkRig(car, rig, new THREE.Vector3(1, 0, 0))
})
