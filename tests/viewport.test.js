import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_ZOOM, centerOn, panView, parseViewBox, zoomLevel, zoomView } from '../lib/viewport.js'

const base = { x: -1000, y: -500, w: 2000, h: 1000 }
const close = (a, b) => Math.abs(a - b) < 1e-6

test('parseViewBox lit la chaîne viewBox', () => {
  assert.deepEqual(parseViewBox('-1000 -500 2000 1000'), base)
})

test('zoomView garde le point visé immobile à l’écran', () => {
  const anchor = { x: 500, y: 100 }
  const zoomed = zoomView(base, base, 4, anchor)
  assert.ok(close(zoomLevel(zoomed, base), 4))
  assert.ok(close((anchor.x - zoomed.x) / zoomed.w, (anchor.x - base.x) / base.w))
  assert.ok(close((anchor.y - zoomed.y) / zoomed.h, (anchor.y - base.y) / base.h))
})

test('zoomView borne le niveau entre 1 et MAX_ZOOM', () => {
  const tooMuch = zoomView(base, base, 1000, { x: 0, y: 0 })
  assert.ok(close(zoomLevel(tooMuch, base), MAX_ZOOM))
  const tooLittle = zoomView(tooMuch, base, 0.0001, { x: 0, y: 0 })
  assert.ok(close(zoomLevel(tooLittle, base), 1))
})

test('panView garde le centre de la vue dans le cadre de base', () => {
  const zoomed = zoomView(base, base, 4, { x: 0, y: 0 })
  const away = panView(zoomed, base, 1e9, 1e9)
  assert.ok(close(away.x + away.w / 2, base.x + base.w))
  assert.ok(close(away.y + away.h / 2, base.y + base.h))
})

test('centerOn place le point au centre de la vue', () => {
  const zoomed = zoomView(base, base, 4, { x: 0, y: 0 })
  const centered = centerOn(zoomed, base, 300, 100)
  assert.ok(close(centered.x + centered.w / 2, 300))
  assert.ok(close(centered.y + centered.h / 2, 100))
})
