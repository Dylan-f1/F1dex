import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSectorMarks, buildTrack } from '../lib/track.js'

const square = {
  x: [0, 1000, 1000, 0],
  y: [0, 0, 1000, 1000],
  rotation: 0,
  corners: [{ number: 1, angle: 0, trackPosition: { x: 1000, y: 0 } }],
}

test('buildTrack ferme le tracé et inverse l’axe Y pour le SVG', () => {
  const track = buildTrack(square)
  assert.ok(track.path.startsWith('M0 0L1000 0'))
  assert.ok(track.path.endsWith('L0 -1000Z'))
})

test('buildTrack tourne le tracé de 90°', () => {
  const track = buildTrack({ ...square, rotation: 90 })
  // (1000, 0) tourné de 90° devient (0, 1000), puis Y inversé : (0, -1000).
  assert.ok(track.path.includes('L0 -1000'))
})

test('buildTrack place le numéro de virage à côté de la piste, pas dessus', () => {
  const [corner] = buildTrack(square).corners
  assert.equal(corner.number, 1)
  assert.ok(corner.label.x > corner.on.x)
})

test('buildTrack garde le numéro de virage dans le cadre', () => {
  const track = buildTrack(square)
  const [minX, , width] = track.viewBox.split(' ').map(Number)
  const [corner] = track.corners
  assert.ok(corner.label.x > minX && corner.label.x < minX + width)
})

test('buildTrack refuse les données inutilisables', () => {
  assert.equal(buildTrack(null), null)
  assert.equal(buildTrack({ x: [1, 2], y: [1, 2] }), null)
  assert.equal(buildTrack({ x: [1, 2, 3], y: [1, 2] }), null)
  assert.equal(buildTrack({ x: 'abc', y: 'abc' }), null)
})

test('buildTrack accepte un tracé sans virages', () => {
  const track = buildTrack({ x: square.x, y: square.y })
  assert.deepEqual(track.corners, [])
})

// Circuit circulaire de 100 points (rayon 5000), dans l'ordre de course.
const COUNT = 100
const ring = {
  x: Array.from({ length: COUNT }, (_, i) => Math.round(5000 * Math.cos((2 * Math.PI * i) / COUNT))),
  y: Array.from({ length: COUNT }, (_, i) => Math.round(5000 * Math.sin((2 * Math.PI * i) / COUNT))),
  rotation: 30,
}
const rawPoint = (index) => ({ x: ring.x[index], y: ring.y[index] })
const crossingsAt = (start, firstEnd, secondEnd) => ({
  start: rawPoint(start),
  firstEnd: rawPoint(firstEnd),
  secondEnd: rawPoint(secondEnd),
})

test('buildSectorMarks retrouve les trois secteurs, même avec la rotation du tracé', () => {
  const track = buildTrack(ring)
  const marks = buildSectorMarks(track, crossingsAt(0, 35, 70))
  assert.deepEqual(marks.labels.map((label) => label.number), [1, 2, 3])
  assert.equal(marks.boundaries.length, 3)
  assert.deepEqual([marks.boundaries[0].x, marks.boundaries[0].y], track.points[0])
  assert.deepEqual([marks.boundaries[1].x, marks.boundaries[1].y], track.points[35])
  // Le secteur 2 va du point 35 au point 70 : son repère est au milieu, au point 52.
  assert.deepEqual([marks.labels[1].x, marks.labels[1].y], track.points[52])
})

test('buildSectorMarks gère une ligne de départ au milieu du tableau de points', () => {
  const track = buildTrack(ring)
  const marks = buildSectorMarks(track, crossingsAt(80, 10, 40))
  assert.ok(marks)
  // Secteur 3 : du point 40 au point 80. Secteur 1 passe par la fin du tableau (80 -> 10, 30 points).
  assert.deepEqual([marks.labels[0].x, marks.labels[0].y], track.points[95])
  assert.deepEqual([marks.labels[2].x, marks.labels[2].y], track.points[60])
})

test('buildSectorMarks refuse un point trop loin du tracé', () => {
  const track = buildTrack(ring)
  const crossings = crossingsAt(0, 35, 70)
  crossings.firstEnd = { x: 0, y: 0 }
  assert.equal(buildSectorMarks(track, crossings), null)
})

test('buildSectorMarks refuse un ordre inversé ou des secteurs vides', () => {
  const track = buildTrack(ring)
  assert.equal(buildSectorMarks(track, crossingsAt(0, 70, 35)), null)
  assert.equal(buildSectorMarks(track, crossingsAt(0, 1, 70)), null)
  assert.equal(buildSectorMarks(track, crossingsAt(10, 10, 60)), null)
})

test('buildSectorMarks accepte l’absence de données', () => {
  const track = buildTrack(ring)
  assert.equal(buildSectorMarks(track, null), null)
  assert.equal(buildSectorMarks(track, { start: rawPoint(0), firstEnd: rawPoint(35) }), null)
  assert.equal(buildSectorMarks(track, { ...crossingsAt(0, 35, 70), start: { x: NaN, y: 0 } }), null)
})

test('buildTrack ignore les virages incomplets au lieu de tout casser', () => {
  const corners = [
    { number: 1, angle: 0, trackPosition: { x: 1000, y: 0 } },
    { number: 2, trackPosition: { x: 1000, y: 1000 } },
    { number: 3, angle: 10 },
    { number: 4, angle: 10, trackPosition: { x: Number.NaN, y: 0 } },
    null,
  ]
  const track = buildTrack({ ...square, corners })
  assert.deepEqual(track.corners.map((corner) => corner.number), [1])
  assert.ok(!track.viewBox.includes('NaN'))
})
