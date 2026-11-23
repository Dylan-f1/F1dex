import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bestLapOf, positionAt, sectorIndexAt, toReplaySamples } from '../lib/replay.js'

const samples = [
  [0, 0, 0],
  [1000, 100, 0],
  [3000, 100, 200],
]

test('positionAt interpole entre deux échantillons', () => {
  assert.deepEqual(positionAt(samples, 500), { x: 50, y: 0 })
  assert.deepEqual(positionAt(samples, 2000), { x: 100, y: 100 })
})

test('positionAt tombe pile sur un échantillon et se cale aux extrémités', () => {
  assert.deepEqual(positionAt(samples, 1000), { x: 100, y: 0 })
  assert.deepEqual(positionAt(samples, -50), { x: 0, y: 0 })
  assert.deepEqual(positionAt(samples, 99999), { x: 100, y: 200 })
})

test('positionAt renvoie null sans échantillon et gère un seul échantillon', () => {
  assert.equal(positionAt([], 10), null)
  assert.deepEqual(positionAt([[5, 7, 9]], 1000), { x: 7, y: 9 })
})

test('toReplaySamples trie, recale sur le début du tour et écarte les valeurs invalides', () => {
  const start = Date.parse('2025-04-06T05:00:00Z')
  const raw = [
    { date: '2025-04-06T05:00:02.000+00:00', x: 20, y: 2 },
    { date: '2025-04-06T05:00:00.500+00:00', x: 5, y: 1 },
    { date: 'pas une date', x: 1, y: 1 },
    { date: '2025-04-06T05:00:01.000+00:00', x: null, y: 1 },
  ]
  assert.deepEqual(toReplaySamples(raw, start), [
    [500, 5, 1],
    [2000, 20, 2],
  ])
})

test('sectorIndexAt suit les temps de secteur', () => {
  const sectors = [28.5, 18.5, 35]
  assert.equal(sectorIndexAt(sectors, 0), 0)
  assert.equal(sectorIndexAt(sectors, 28_499), 0)
  assert.equal(sectorIndexAt(sectors, 28_500), 1)
  assert.equal(sectorIndexAt(sectors, 47_000), 2)
  assert.equal(sectorIndexAt(null, 1000), null)
})

test('bestLapOf préfère un tour propre, puis retombe sur n’importe quel tour', () => {
  const laps = [
    { lap: 1, seconds: 100, excluded: true },
    { lap: 2, seconds: 90, excluded: true },
    { lap: 3, seconds: 95, excluded: false },
    { lap: 4, seconds: 93, excluded: false },
  ]
  assert.equal(bestLapOf(laps).lap, 4)
  assert.equal(bestLapOf(laps.slice(0, 2)).lap, 2)
  assert.equal(bestLapOf([]), null)
})
