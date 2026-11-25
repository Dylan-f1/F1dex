import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STICK, dragStick, stickSteer } from '../lib/touch-stick.js'

test('glisser vers la gauche braque à gauche (volant positif), vers la droite à droite', () => {
  assert.equal(dragStick(100, 100 - STICK.travel).steer, 1)
  assert.equal(dragStick(100, 100 + STICK.travel).steer, -1)
})

test('un pouce posé ou presque immobile ne braque pas', () => {
  assert.equal(dragStick(100, 100).steer, 0)
  assert.equal(stickSteer(STICK.deadZone), 0)
  assert.equal(stickSteer(-STICK.deadZone), 0)
})

test('le braquage croît avec le glissement, plus finement près du centre', () => {
  const steers = [0.2, 0.4, 0.6, 0.8, 1].map((ratio) => stickSteer(-ratio))
  for (let i = 1; i < steers.length; i += 1) assert.ok(steers[i] > steers[i - 1])
  assert.ok(stickSteer(-0.5) < 0.5)
  assert.ok(stickSteer(-STICK.deadZone - 0.001) < 0.001)
})

test('gauche et droite sont symétriques', () => {
  for (const ratio of [0.3, 0.7, 1]) assert.equal(stickSteer(ratio), -stickSteer(-ratio))
})

test('au-delà de la course, le point d’appui suit le doigt', () => {
  const far = dragStick(100, 300)
  assert.equal(far.offset, STICK.travel)
  assert.equal(far.origin, 300 - STICK.travel)
  // Revenir d'une course complète suffit à repasser au centre.
  assert.equal(dragStick(far.origin, 300 - STICK.travel).steer, 0)
})

test('dans la course, le point d’appui ne bouge pas', () => {
  assert.equal(dragStick(100, 120).origin, 100)
})

test('une position invalide ne produit pas de volant invalide', () => {
  assert.equal(stickSteer(NaN), 0)
  assert.equal(stickSteer(-8), 1)
})
