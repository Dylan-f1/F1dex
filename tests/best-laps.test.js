import test from 'node:test'
import assert from 'node:assert/strict'
import { PHYSICS_VERSION } from '../lib/car-drive.js'
import { bestLapKey, isValidBest, loadBest, saveBest } from '../lib/best-laps.js'

// Stockage factice, avec la même interface que localStorage.
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  }
}

const record = { time: 83.4567, sectors: [28.1, 27.2, 28.1567], profile: [null, 0.5, 1.1234567, 1.9] }

test('un meilleur tour enregistré est relu, arrondi à la milliseconde', () => {
  const storage = fakeStorage()
  assert.equal(saveBest(storage, 22, record), true)
  const loaded = loadBest(storage, 22)
  assert.equal(loaded.time, 83.457)
  assert.deepEqual(loaded.profile, [null, 0.5, 1.123, 1.9])
  assert.equal(loadBest(storage, 46), null, 'un autre circuit n’a pas de meilleur tour')
})

test('la clé change avec la version de la physique : les anciens temps ne sont pas comparés aux nouveaux', () => {
  assert.ok(bestLapKey(22).includes(`v${PHYSICS_VERSION}`))
  const storage = fakeStorage({ 'f1dex.drive.best.v1.22': JSON.stringify(record) })
  assert.equal(loadBest(storage, 22), null)
})

test('un contenu abîmé ou truqué est ignoré sans erreur', () => {
  for (const bad of ['', 'pas du json', '{"time":-3}', '{"time":"vite"}', 'null', '[]', JSON.stringify({ ...record, sectors: [1, 2] }), JSON.stringify({ ...record, profile: 'x' })]) {
    assert.equal(loadBest(fakeStorage({ [bestLapKey(1)]: bad }), 1), null, bad)
  }
  assert.equal(isValidBest({ ...record, profile: new Array(6000).fill(1) }), false)
})

test('un stockage en panne (navigation privée, quota plein) ne casse rien', () => {
  const broken = {
    getItem: () => {
      throw new Error('bloqué')
    },
    setItem: () => {
      throw new Error('plein')
    },
  }
  assert.equal(loadBest(broken, 1), null)
  assert.equal(saveBest(broken, 1, record), false)
  assert.equal(loadBest(undefined, 1), null)
  assert.equal(saveBest(fakeStorage(), 1, { ...record, time: Number.NaN }), false)
})
