import test from 'node:test'
import assert from 'node:assert/strict'
import { LIVERIES, liveryFor } from '../lib/liveries.js'

const ZONES = ['base', 'wing', 'trim', 'spine']

test('chaque livrée de la table a ses quatre zones en #rrggbb', () => {
  for (const [name, livery] of Object.entries(LIVERIES)) {
    assert.deepEqual(Object.keys(livery).sort(), [...ZONES].sort(), name)
    for (const zone of ZONES) assert.match(livery[zone], /^#[0-9a-f]{6}$/, `${name}.${zone}`)
  }
})

test('une écurie connue reçoit sa livrée, quelle que soit sa couleur OpenF1', () => {
  assert.equal(liveryFor({ name: 'McLaren', colour: '#123456' }), LIVERIES.McLaren)
})

test('une écurie inconnue garde sa couleur partout', () => {
  assert.deepEqual(liveryFor({ name: 'Cadillac', colour: '#909090' }), {
    base: '#909090',
    wing: '#909090',
    trim: '#909090',
    spine: '#909090',
  })
})

test('sans écurie ou avec une couleur invalide : gris neutre, jamais d’exception', () => {
  for (const team of [undefined, null, {}, { name: 'X', colour: 'rouge' }]) {
    const livery = liveryFor(team)
    for (const zone of ZONES) assert.match(livery[zone], /^#[0-9a-f]{6}$/)
  }
})
