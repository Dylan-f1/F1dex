import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import * as THREE from 'three'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildCodeCar } from '../components/car-body-mesh.js'
import { createDecals } from '../components/car-decals.js'
import { createWheelRig } from '../components/car-wheel-rig.js'
import { CODE_CAR_WHEELS } from '../lib/car-body.js'
import { LOGOS, SLOTS, TEAM_MARKS, contrast, decalPlan, markColour } from '../lib/decals.js'
import { LIVERIES } from '../lib/liveries.js'

const team = (name, number = 4) => ({ name, drivers: number === null ? [] : [{ code: 'XXX', number }] })
const plan = (name, number) => decalPlan(team(name, number), LIVERIES[name])
const folder = new URL('../public/logos/', import.meta.url)

test('chaque écurie a ses inscriptions sur chaque emplacement', () => {
  assert.deepEqual(Object.keys(TEAM_MARKS).sort(), Object.keys(LIVERIES).sort())
  for (const name of Object.keys(LIVERIES)) {
    const items = plan(name)
    assert.deepEqual(items.map((item) => item.id), SLOTS.map((slot) => slot.id), name)
    for (const item of items) assert.ok(item.content.logo || item.content.text, `${name} ${item.id}`)
    assert.deepEqual(items.find((item) => item.id === 'nez').content, { text: '4' }, name)
  }
})

test('chaque logo utilisé existe, avec sa source ; aucun fichier ne reste sans usage', () => {
  const used = [...new Set([...Object.values(TEAM_MARKS).flat().filter((mark) => mark.logo).map((mark) => mark.logo), 'pirelli'])]
  const sources = readFileSync(new URL('SOURCES.md', folder), 'utf8')
  for (const id of used) {
    assert.ok(existsSync(new URL(`${id}.png`, folder)), id)
    assert.ok(sources.includes(`\`${id}.png\``), `source de ${id}`)
    if (id !== 'pirelli') assert.ok(LOGOS[id], `réglage de ${id}`)
  }
  assert.deepEqual(readdirSync(folder).filter((file) => file !== 'SOURCES.md').sort(), used.map((id) => `${id}.png`).sort())
  assert.ok(!/CC BY/i.test(sources), 'une licence à attribution demande un crédit explicite')
})

test('une écurie inconnue ou sans pilote ne casse rien', () => {
  const livery = { base: '#9aa5b5', wing: '#9aa5b5', trim: '#9aa5b5', spine: '#9aa5b5' }
  assert.deepEqual(decalPlan({ name: 'Couleurs neutres', drivers: [] }, livery), [])
  assert.deepEqual(decalPlan(undefined, livery), [])
  assert.deepEqual(decalPlan(team('Cadillac', 11), livery).map((item) => item.id), ['nez'])
  assert.ok(!plan('McLaren', null).some((item) => item.id === 'nez'))
})

test('les inscriptions se détachent du fond', () => {
  // Un logo garde ses couleurs quand elles ressortent, sinon il est repeint en clair ou en sombre.
  assert.equal(markColour({ logo: 'red-bull' }, '#f4c20d'), null)
  assert.equal(markColour({ logo: 'red-bull' }, '#1b2a5e'), '#f4f6f8') // rouge sur bleu nuit : illisible
  assert.equal(markColour({ logo: 'red-bull' }, '#d6202c'), '#f4f6f8')
  assert.equal(markColour({ logo: 'haas' }, '#eceef0'), null)
  assert.equal(markColour({ logo: 'chrome' }, '#ff8000'), null)
  assert.equal(markColour({ logo: 'mclaren' }, '#ff8000'), '#14171a')
  assert.equal(markColour({ text: 'FERRARI' }, '#dc0000'), '#f4f6f8')
  assert.equal(markColour({ text: 'RACING BULLS' }, '#eef1f6'), '#14171a')
  for (const name of Object.keys(LIVERIES)) {
    for (const item of plan(name)) {
      if (!item.colour) continue
      const background = LIVERIES[name][{ livery: 'base', wing: 'wing', trim: 'trim' }[item.part]]
      assert.ok(contrast(item.colour, background) >= 2.2, `${name} ${item.id} : ${item.colour} sur ${background}`)
    }
  }
})

const fakePainter = (textures, aspect = 4) => async () => {
  const texture = new THREE.Texture()
  texture.dispose = () => {
    texture.disposed = true
  }
  textures.push(texture)
  return { texture, aspect }
}
function codeCar() {
  const materials = Object.fromEntries(['livery', 'wing', 'trim', 'spine', 'carbon', 'helmet'].map((role) => [role, new THREE.MeshStandardMaterial()]))
  return buildCodeCar(THREE, materials).group
}
const decalsOf = (car) => car.children.filter((child) => child.name.startsWith('decal-'))

test('chaque inscription épouse sa pièce, du bon côté', async () => {
  const car = codeCar()
  for (const aspect of [0.8, 4, 14]) {
    const decals = createDecals({ THREE, DecalGeometry, car, paint: fakePainter([], aspect) })
    await decals.show(plan('McLaren'))
    assert.deepEqual(decalsOf(car).map((mesh) => mesh.name), SLOTS.map((slot) => `decal-${slot.id}`), `proportions ${aspect}`)
    for (const mesh of decalsOf(car)) {
      const slot = SLOTS.find((candidate) => `decal-${candidate.id}` === mesh.name)
      const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position)
      const centre = box.getCenter(new THREE.Vector3())
      assert.ok(centre.distanceTo(new THREE.Vector3(...slot.position)) < 0.2, `${slot.id} : ${centre.toArray()}`)
      const { uv, normal } = mesh.geometry.attributes
      for (let at = 0; at < uv.count; at += 1) {
        assert.ok(uv.getX(at) >= -1e-6 && uv.getX(at) <= 1 + 1e-6 && uv.getY(at) >= -1e-6 && uv.getY(at) <= 1 + 1e-6)
        if (slot.normal[2] !== 0) assert.ok(normal.getZ(at) * slot.normal[2] > -0.3, `${slot.id} : envers`)
      }
    }
    const triangles = decalsOf(car).reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count / 3, 0)
    assert.ok(triangles < 6000, `${triangles} triangles`)
    decals.dispose()
    assert.equal(decalsOf(car).length, 0)
  }
})

test('sur les flancs, l’inscription couvre sa largeur sans trou', async () => {
  const car = codeCar()
  const decals = createDecals({ THREE, DecalGeometry, car, paint: fakePainter([], 4) })
  await decals.show(plan('Williams'))
  for (const mesh of decalsOf(car)) {
    if (!/ponton|capot|derive/.test(mesh.name)) continue
    const { uv } = mesh.geometry.attributes
    const u = Array.from({ length: uv.count }, (_, at) => uv.getX(at))
    assert.ok(Math.min(...u) < 0.05 && Math.max(...u) > 0.95, `${mesh.name} : ${Math.min(...u)} à ${Math.max(...u)}`)
  }
})

test('changer d’écurie libère les anciennes textures, et une demande dépassée est abandonnée', async () => {
  const car = codeCar()
  const textures = []
  const decals = createDecals({ THREE, DecalGeometry, car, paint: fakePainter(textures) })
  await decals.show(plan('Ferrari'))
  const first = [...textures]
  assert.ok(first.length > 0 && first.length < SLOTS.length, 'les deux flancs partagent leur texture')
  const stale = decals.show(plan('Mercedes'))
  const fresh = decals.show(plan('Alpine'))
  await Promise.all([stale, fresh])
  assert.equal(decalsOf(car).length, SLOTS.length)
  const alive = new Set(decalsOf(car).map((mesh) => mesh.material.map))
  for (const texture of textures) assert.equal(Boolean(texture.disposed), !alive.has(texture))
  decals.dispose()
  for (const texture of textures) assert.ok(texture.disposed)
})

test('une image manquante ne prive pas la voiture des autres', async () => {
  const car = codeCar()
  const working = fakePainter([])
  const decals = createDecals({
    THREE, DecalGeometry, car,
    paint: (item) => (item.content.logo === 'chrome' ? Promise.reject(new Error('absent')) : working(item)),
  })
  await decals.show(plan('McLaren'))
  assert.equal(decalsOf(car).length, SLOTS.length - SLOTS.filter((slot) => slot.mark === 1).length)
})

test('les pneus de la voiture en code portent la marque à la place des traits', () => {
  const car = new THREE.Group()
  const brand = new THREE.MeshStandardMaterial()
  createWheelRig(THREE, mergeGeometries).attachCodeCar(car, CODE_CAR_WHEELS, brand)
  for (const wheel of CODE_CAR_WHEELS) {
    const pivot = car.getObjectByName(`pivot-${wheel.id}`)
    const mark = pivot.getObjectByName('roue-brand')
    assert.equal(mark.material, brand, wheel.id)
    assert.equal(pivot.getObjectByName('roue-lettering'), undefined, wheel.id)
    const { uv, position } = mark.geometry.attributes
    for (let at = 0; at < uv.count; at += 1) {
      assert.ok(uv.getX(at) >= -1e-5 && uv.getX(at) <= 1 + 1e-5 && uv.getY(at) >= -1e-5 && uv.getY(at) <= 1 + 1e-5)
      // En haut du pneu, l'image se lit de gauche à droite vue de l'extérieur (+x) : u croît quand z décroît.
      if (position.getY(at) > 0 && Math.abs(position.getZ(at)) < 1e-6) assert.ok(Math.abs(uv.getX(at) - 0.5) < 1e-5)
      if (position.getY(at) > 0 && position.getZ(at) > wheel.radius * 0.1) assert.ok(uv.getX(at) < 0.5)
    }
  }
})
