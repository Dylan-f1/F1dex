import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SHOWROOM_FOV, showroomFov } from '../lib/car-camera.js'

// Largeur visible à un mètre, pour un champ de vision vertical et des proportions de cadre.
const visibleWidth = (aspect) => Math.tan((showroomFov(aspect) * Math.PI) / 360) * aspect

test('un cadre large garde le champ de vision du showroom', () => {
  assert.equal(showroomFov(1.5), SHOWROOM_FOV)
  assert.equal(showroomFov(2.4), SHOWROOM_FOV)
})

test('un cadre de téléphone en portrait montre la même largeur : la voiture reste entière', () => {
  for (const aspect of [1.4, 1.07, 0.9]) assert.ok(Math.abs(visibleWidth(aspect) - visibleWidth(1.5)) < 1e-9, String(aspect))
})

test('un cadre très haut est plafonné pour ne pas déformer la voiture', () => {
  assert.equal(showroomFov(0.4), 66)
})

test('des proportions invalides ne produisent pas d’angle invalide', () => {
  for (const aspect of [0, -1, NaN]) assert.equal(showroomFov(aspect), SHOWROOM_FOV)
})
