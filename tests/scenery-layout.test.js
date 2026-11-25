import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AMBIANCES, DEFAULT_AMBIANCE, pickAmbiance, sunVector } from '../lib/ambiance.js'
import { buildCircuitTrack, buildDriveTrack } from '../lib/car-drive.js'
import { getFeatures } from '../lib/circuit-features.js'
import { getScenery } from '../lib/circuit-scenery.js'
import { offsetPoint } from '../lib/drive-track.js'
import { createNoise, fbm, seededRandom } from '../lib/noise.js'
import { TYRE_STACK, barrierLayout, groveTrees, racingLine } from '../lib/scenery-layout.js'
import { buildTrack } from '../lib/track.js'

const circuits = JSON.parse(readFileSync(new URL('./fixtures/circuits.json', import.meta.url), 'utf8'))
const circuit = (name) => buildCircuitTrack(buildTrack(circuits[name]).points, { key: circuits[name].circuitKey })
const roads = [
  ['fictif', buildDriveTrack()],
  ['monaco', circuit('monaco')],
  ['suzuka', circuit('suzuka')],
  ['interlagos', circuit('interlagos')],
]
// Distance minimale de (x, z) à un point de la ligne centrale (force brute : le test ne partage pas la grille du module).
const gap = (road, x, z) => Math.min(...road.points.map((point) => Math.hypot(point.x - x, point.z - z)))

test('le bruit est déterministe, reste dans [0, 1] et se raccorde sans couture', () => {
  const noise = createNoise('essai')
  const again = createNoise('essai')
  for (let step = 0; step < 200; step += 1) {
    const x = step * 0.37
    const y = step * 0.19
    const value = fbm(noise, x, y, 4, 6)
    assert.ok(value >= 0 && value <= 1)
    assert.equal(value, fbm(again, x, y, 4, 6))
    assert.ok(Math.abs(value - fbm(noise, x + 6, y, 4, 6)) < 1e-9, 'période en x')
    assert.ok(Math.abs(value - fbm(noise, x, y + 6, 4, 6)) < 1e-9, 'période en y')
  }
  assert.equal(seededRandom('graine')(), seededRandom('graine')())
  assert.notEqual(seededRandom('graine')(), seededRandom('autre')())
})

test('l’ambiance vient de l’adresse, avec repli sur celle par défaut', () => {
  assert.equal(pickAmbiance('?ciel=soir'), 'soir')
  assert.equal(pickAmbiance('?voiture=code&ciel=couvert'), 'couvert')
  for (const search of ['', undefined, '?ciel=', '?ciel=nuit', '?ciel=toString']) assert.equal(pickAmbiance(search), DEFAULT_AMBIANCE, String(search))
})

test('le soleil est un vecteur unitaire au-dessus de l’horizon, qui tourne avec le cap de départ', () => {
  for (const { sun } of Object.values(AMBIANCES)) {
    const ahead = sunVector(sun, 0)
    assert.ok(Math.abs(Math.hypot(ahead.x, ahead.y, ahead.z) - 1) < 1e-9)
    assert.ok(ahead.y > 0)
    // Même rotation autour de la verticale que `rotation.y` de three.js (le dôme du ciel est tourné ainsi).
    const heading = 1.2
    const turned = sunVector(sun, heading)
    assert.ok(Math.abs(turned.x - (ahead.x * Math.cos(heading) + ahead.z * Math.sin(heading))) < 1e-9)
    assert.ok(Math.abs(turned.z - (-ahead.x * Math.sin(heading) + ahead.z * Math.cos(heading))) < 1e-9)
  }
})

test('la trajectoire reste sur la piste et passe à l’intérieur des virages', () => {
  for (const [name, road] of roads) {
    const line = racingLine(road)
    assert.equal(line.length, road.points.length)
    for (const offset of line) assert.ok(Math.abs(offset) < road.width / 2, `${name} : trajectoire hors piste`)
    // Sur l'ensemble du circuit, le décalage et la courbure sont de signes opposés (positif = droite, courbure positive = gauche).
    const agreement = line.reduce((sum, offset, index) => sum + offset * road.curvature[index], 0)
    assert.ok(agreement < 0, `${name} : trajectoire à l'extérieur des virages`)
  }
})

test('les piles de pneus sont juste derrière les murs : jamais un obstacle visible sans mur, ni devant lui', () => {
  for (const [name, road] of roads) {
    const { wall } = getFeatures(road)
    const { stacks } = barrierLayout(road)
    assert.ok(stacks.length > 20, `${name} : ${stacks.length} piles`)
    const count = road.points.length
    for (const stack of stacks) {
      const next = (stack.index + 1) % count
      assert.ok(wall[stack.side][stack.index] > 0 && wall[stack.side][next] > 0, `${name} : pile hors d'un mur`)
      const sign = stack.side === 'right' ? 1 : -1
      const a = offsetPoint(road, stack.index, sign * (wall[stack.side][stack.index] + TYRE_STACK.radius))
      const b = offsetPoint(road, next, sign * (wall[stack.side][next] + TYRE_STACK.radius))
      const expected = { x: a.x + (b.x - a.x) * stack.t, z: a.z + (b.z - a.z) * stack.t }
      assert.ok(Math.hypot(stack.x - expected.x, stack.z - expected.z) < 1e-9, `${name} : pile déplacée`)
    }
  }
})

test('les grillages ne longent que des murs et n’empiètent sur aucun tronçon', () => {
  for (const [name, road] of roads) {
    const { wall } = getFeatures(road)
    const { fence } = barrierLayout(road)
    for (const side of ['left', 'right']) {
      fence[side].forEach((present, index) => {
        if (!present) return
        assert.ok(wall[side][index] > 0, `${name} : grillage sans mur`)
        const spot = offsetPoint(road, index, (side === 'right' ? 1 : -1) * (wall[side][index] + 1.5))
        assert.ok(gap(road, spot.x, spot.z) >= road.width / 2 + 1, `${name} : grillage sur la piste`)
      })
    }
  }
})

test('les bosquets complètent les arbres sans s’approcher de la piste ni entrer dans les bâtiments', () => {
  for (const [name, road] of roads) {
    const { trees, stands, pit } = getScenery(road)
    const grove = groveTrees(road)
    assert.equal(groveTrees(road), grove, `${name} : bosquets recalculés`)
    assert.deepEqual(groveTrees({ ...road }), grove, `${name} : bosquets non déterministes`)
    assert.ok(grove.length > trees.length && grove.length <= 1400, `${name} : ${grove.length} arbres pour ${trees.length}`)
    for (const tree of grove) {
      assert.ok([0, 1].includes(tree.kind))
      assert.ok(gap(road, tree.x, tree.z) >= road.width / 2 + 20, `${name} : arbre trop près`)
    }
    for (const tree of grove.slice(trees.length)) {
      for (const building of pit ? [...stands, pit] : stands) {
        assert.ok(Math.hypot(building.x - tree.x, building.z - tree.z) >= building.length / 2, `${name} : arbre dans un bâtiment`)
      }
    }
  }
})
