import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { KERB_WIDTH, getFeatures } from '../lib/circuit-features.js'
import { DRIVE, buildCircuitTrack, buildDriveTrack, createDriveState, stepDrive, surfaceAt } from '../lib/car-drive.js'
import { offsetPoint, pointAt, signedOffset } from '../lib/drive-track.js'
import { SURFACES } from '../lib/car-physics.js'
import { buildTrack } from '../lib/track.js'

const circuits = JSON.parse(readFileSync(new URL('./fixtures/circuits.json', import.meta.url), 'utf8'))
const circuit = (name) => buildCircuitTrack(buildTrack(circuits[name]).points, { key: circuits[name].circuitKey })
const fictive = buildDriveTrack()
const IDLE = { throttle: 0, brake: 0, steer: 0 }
const sOf = (track, index) => track.cumulative[index]

// Premier échantillon où `array[side]` est actif.
const firstWith = (array, side) => array[side].findIndex((value) => value > 0)
// Échantillon où `array[side]` est maximal : au cœur d'un équipement, loin de ses extrémités raccordées.
const peakOf = (array, side) => array[side].reduce((best, value, index) => (value > array[side][best] ? index : best), 0)

test('le circuit fictif a des virages, avec vibreurs à l’intérieur et gravier à l’extérieur', () => {
  const features = getFeatures(fictive)
  assert.ok(features.corners >= 3, `${features.corners} virages`)
  // Le circuit fictif tourne à gauche : l'intérieur est à gauche, l'extérieur à droite.
  assert.ok(firstWith(features.kerb, 'left') >= 0, 'vibreur intérieur')
  assert.ok(firstWith(features.gravel, 'right') >= 0, 'gravier extérieur')
  const index = firstWith(features.gravel, 'right')
  assert.equal(features.gravel.left[index], 0, 'pas de gravier à l’intérieur')
  assert.ok(features.wall.right[index] > KERB_WIDTH + features.gravel.right[index] + fictive.width / 2, 'le mur est derrière le gravier')
})

test('aucune portion de mur ou de gravier de moins de 3 échantillons (jamais de mur invisible)', () => {
  for (const road of [fictive, circuit('monaco'), circuit('suzuka'), circuit('interlagos')]) {
    const features = getFeatures(road)
    const count = road.points.length
    for (const kind of ['gravel', 'wall']) {
      for (const side of ['left', 'right']) {
        const values = features[kind][side]
        for (let index = 0; index < count; index += 1) {
          if (!(values[index] > 0)) continue
          const neighbours = (values[(index + 1) % count] > 0 ? 1 : 0) + (values[(index - 1 + count) % count] > 0 ? 1 : 0)
          assert.ok(neighbours >= 1, `${road.key} ${kind} ${side} : échantillon isolé ${index}`)
        }
      }
    }
  }
})

test('les équipements sont calculés une seule fois par piste', () => {
  assert.equal(getFeatures(fictive), getFeatures(fictive))
})

test('sur les vrais circuits, aucun mur ni gravier ne passe sur un autre tronçon de la piste', () => {
  for (const name of ['monaco', 'suzuka', 'interlagos']) {
    const road = circuit(name)
    const features = getFeatures(road)
    const count = road.points.length
    const clear = Math.ceil(80 / road.spacing)
    let checked = 0
    for (const side of ['left', 'right']) {
      const sign = side === 'right' ? 1 : -1
      for (let index = 0; index < count; index += 7) {
        if (features.wall[side][index] <= 0) continue
        checked += 1
        const spot = offsetPoint(road, index, sign * features.wall[side][index])
        for (let other = 0; other < count; other += 1) {
          const gap = Math.abs(other - index)
          if (Math.min(gap, count - gap) <= clear) continue
          const distance = Math.hypot(road.points[other].x - spot.x, road.points[other].z - spot.z)
          assert.ok(distance >= road.width / 2 + 3, `${name} : mur à ${distance.toFixed(1)} m d'un autre tronçon (échantillon ${index})`)
        }
      }
    }
    assert.ok(checked > 20, `${name} : trop peu de murs (${checked})`)
  }
})

test('chaque surface est reconnue selon l’écart latéral : asphalte, vibreur, gravier, herbe', () => {
  const features = getFeatures(fictive)
  const i = peakOf(features.gravel, 'right')
  const s = sOf(fictive, i)
  const edge = fictive.width / 2
  assert.equal(surfaceAt(fictive, s, 0).kind, 'asphalt')
  assert.equal(surfaceAt(fictive, s, edge - 2).kind, 'asphalt')
  // Côté droit : gravier juste après le bord (vibreur seulement s'il y en a ici)
  const kerbHere = features.kerb.right[i] > 0
  assert.equal(surfaceAt(fictive, s, edge + 0.5 + 0.8).kind, kerbHere ? 'kerb' : 'gravel')
  assert.equal(surfaceAt(fictive, s, edge + KERB_WIDTH + features.gravel.right[i] * 0.5).kind, 'gravel')
  assert.equal(surfaceAt(fictive, s, edge + KERB_WIDTH + features.gravel.right[i] + 0.5).kind, 'grass')
  // Côté gauche (intérieur du virage) : jamais de gravier
  assert.notEqual(surfaceAt(fictive, s, -(edge + KERB_WIDTH + 3)).kind, 'gravel')
  // Transition progressive au bord, pas de saut d'adhérence
  const atEdge = surfaceAt(fictive, s, edge)
  assert.ok(atEdge.grip < SURFACES.asphalt.grip && atEdge.grip > SURFACES.gravel.grip)
})

test('le gravier freine davantage que l’herbe', () => {
  const features = getFeatures(fictive)
  assert.ok(SURFACES.gravel.drag > SURFACES.grass.drag)
  assert.ok(SURFACES.gravel.rolling > SURFACES.grass.rolling)
  assert.ok(features.corners > 0)
})

test('contre le mur, les commissaires remettent la voiture sur la piste, tour supprimé', () => {
  const features = getFeatures(fictive)
  const index = peakOf(features.wall, 'right')
  const s = sOf(fictive, index)
  const spot = pointAt(fictive, s)
  const offset = features.wall.right[index] + 0.3
  const at = { x: spot.x + Math.sin(spot.heading) * offset, z: spot.z + Math.cos(spot.heading) * offset }
  assert.ok(Math.abs(signedOffset(fictive, at.x, at.z, s) - offset) < 0.05, 'le décalage signé est cohérent avec la normale')
  const state = { ...createDriveState(fictive, { lights: false }), s, ...at, heading: spot.heading, u: 25, offset }
  const next = stepDrive(fictive, state, IDLE, 1 / 60)
  assert.equal(next.crashes, 1)
  assert.equal(next.recoveries, 1)
  assert.equal(next.speed, 0)
  assert.equal(next.lapValid, false)
  assert.ok(next.distance < 1)
})

test('un vibreur ne supprime pas le tour, quatre roues dehors si', () => {
  const features = getFeatures(fictive)
  const index = features.kerb.left.findIndex((value, at) => value > 0 && features.kerb.left[at + 3] > 0) + 2
  const s = sOf(fictive, index)
  const spot = pointAt(fictive, s)
  const edge = fictive.width / 2
  const place = (offset) => ({
    ...createDriveState(fictive, { lights: false }),
    s,
    x: spot.x - Math.sin(spot.heading) * offset,
    z: spot.z - Math.cos(spot.heading) * offset,
    heading: spot.heading,
    offset: -offset,
  })
  assert.equal(stepDrive(fictive, place(edge + DRIVE.trackLimitMargin - 0.3), IDLE, 1 / 60).lapValid, true)
  assert.equal(stepDrive(fictive, place(edge + DRIVE.trackLimitMargin + 0.4), IDLE, 1 / 60).lapValid, false)
})
