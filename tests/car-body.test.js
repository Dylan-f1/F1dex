import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CODE_CAR_WHEELS, buildCodeCarBody, triangulate } from '../lib/car-body.js'
import { buildCodeCar } from '../components/car-body-mesh.js'

const parts = buildCodeCarBody()
const ROLES = ['carbon', 'helmet', 'livery', 'spine', 'trim', 'wing']
const vertices = (roles = ROLES) =>
  roles.flatMap((role) => {
    const { positions } = parts[role]
    return Array.from({ length: positions.length / 3 }, (_, index) => positions.slice(index * 3, index * 3 + 3))
  })
const extent = (points, axis) => [Math.min(...points.map((p) => p[axis])), Math.max(...points.map((p) => p[axis]))]

test('chaque matière attendue a une géométrie valide', () => {
  assert.deepEqual(Object.keys(parts).sort(), ROLES)
  for (const [role, { positions, normals, indices }] of Object.entries(parts)) {
    assert.ok(positions.length > 0 && positions.every(Number.isFinite), role)
    assert.equal(normals.length, positions.length, role)
    assert.ok(indices.every((index) => index >= 0 && index < positions.length / 3), role)
    for (let at = 0; at < normals.length; at += 3) {
      assert.ok(Math.abs(Math.hypot(normals[at], normals[at + 1], normals[at + 2]) - 1) < 1e-6, `${role} : normale ${at / 3}`)
    }
  }
})

test('la voiture a les cotes d’une F1 et reste au-dessus du sol', () => {
  const all = vertices()
  const [back, front] = extent(all, 0)
  const [low, high] = extent(all, 1)
  const [left, right] = extent(all, 2)
  assert.ok(front - back > 5.4 && front - back < 5.9, `longueur ${front - back}`)
  assert.ok(right <= 1.001 && right > 0.97 && Math.abs(left + right) < 1e-6, `largeur ${left} à ${right}`)
  assert.ok(low >= 0.04 && high < 1.05, `hauteur ${low} à ${high}`)
})

test('chaque matière est symétrique', () => {
  for (const role of ROLES) {
    const [left, right] = extent(vertices([role]), 2)
    assert.ok(Math.abs(left + right) < 1e-6, `${role} : ${left} à ${right}`)
  }
})

test('les roues ont l’empattement et la largeur du règlement', () => {
  const front = CODE_CAR_WHEELS.filter((wheel) => wheel.front)
  const rear = CODE_CAR_WHEELS.filter((wheel) => !wheel.front)
  assert.equal(front.length, 2)
  assert.ok(Math.abs(front[0].position[0] - rear[0].position[0] - 3.6) < 1e-9)
  for (const wheel of CODE_CAR_WHEELS) {
    assert.ok(Math.abs(Math.abs(wheel.position[2]) + wheel.width / 2 - 1) < 1e-9, wheel.id)
    assert.equal(wheel.position[1], wheel.radius, 'posée au sol')
    assert.equal(Math.sign(wheel.position[2]), wheel.id.endsWith('droite') ? 1 : -1, wheel.id)
  }
})

test('aucune pièce peinte ne traverse un pneu', () => {
  for (const point of vertices(['livery', 'wing', 'trim', 'spine'])) {
    for (const wheel of CODE_CAR_WHEELS) {
      const [x, y, z] = wheel.position
      const across = Math.abs(point[2] - z) < wheel.width / 2 && Math.sign(point[2]) === Math.sign(z)
      assert.ok(!(across && Math.hypot(point[0] - x, point[1] - y) < wheel.radius), `${wheel.id} : ${point.map((v) => v.toFixed(2))}`)
    }
  }
})

test('la carrosserie reste légère pour un téléphone', () => {
  const triangles = Object.values(parts).reduce((sum, part) => sum + part.indices.length / 3, 0)
  assert.ok(triangles > 4000 && triangles < 30000, String(triangles))
})

test('les normales du dessus du capot regardent vers le haut', () => {
  const { positions, normals } = parts.spine
  let up = 0
  let down = 0
  for (let at = 0; at < positions.length; at += 3) {
    if (Math.abs(positions[at + 2]) > 0.03 || positions[at] < -0.45 || positions[at] > -0.1 || positions[at + 1] < 0.8) continue
    if (normals[at + 1] > 0.5) up += 1
    if (normals[at + 1] < -0.5) down += 1
  }
  assert.ok(up > 0 && down === 0, `${up} vers le haut, ${down} vers le bas`)
})

test('un polygone creux est découpé sans perdre ni ajouter de surface', () => {
  const area = (points) =>
    Math.abs(points.reduce((sum, [u, v], i) => sum + u * points[(i + 1) % points.length][1] - points[(i + 1) % points.length][0] * v, 0)) / 2
  const shape = [[0, 0], [4, 0], [4, 3], [3, 3], [3, 1], [1, 1], [1, 3], [0, 3]]
  for (const outline of [shape, shape.toReversed()]) {
    const triangles = triangulate(outline)
    assert.equal(triangles.length, outline.length - 2)
    const total = triangles.reduce((sum, triangle) => sum + area(triangle.map((index) => outline[index])), 0)
    assert.ok(Math.abs(total - area(outline)) < 1e-9)
  }
})

test('les maillages reprennent la matière de chaque pièce', () => {
  const materials = Object.fromEntries(ROLES.map((role) => [role, new THREE.MeshStandardMaterial()]))
  const { group, resources } = buildCodeCar(THREE, materials)
  assert.equal(group.children.length, ROLES.length)
  assert.equal(resources.length, ROLES.length)
  for (const mesh of group.children) assert.equal(mesh.material, materials[mesh.name.replace('caisse-', '')])
})
