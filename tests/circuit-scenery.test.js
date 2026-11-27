import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BOARD_DISTANCES, STAND_DEPTH, getScenery, hitsScenery } from '../lib/circuit-scenery.js'
import { buildCircuitTrack, buildDriveTrack, createDriveState, pointAt, stepDrive } from '../lib/car-drive.js'
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
const toWorld = (rect, localX, localZ) => ({
  x: rect.x + localX * Math.cos(rect.rotation) + localZ * Math.sin(rect.rotation),
  z: rect.z - localX * Math.sin(rect.rotation) + localZ * Math.cos(rect.rotation),
})

test('le décor est déterministe et calculé une seule fois par piste', () => {
  const road = circuit('monaco')
  const first = getScenery(road)
  assert.equal(getScenery(road), first)
  const again = getScenery(circuit('monaco'))
  assert.equal(again.trees.length, first.trees.length)
  assert.deepEqual(again.stands.map((stand) => [stand.x, stand.z]), first.stands.map((stand) => [stand.x, stand.z]))
})

test('chaque circuit a des tribunes, un portique et des arbres ; les vrais circuits ont des panneaux de freinage', () => {
  for (const [name, road] of roads) {
    const scenery = getScenery(road)
    assert.ok(scenery.stands.length >= 1, `${name} : pas de tribune`)
    assert.ok(scenery.trees.length > 20, `${name} : trop peu d'arbres`)
    assert.ok(scenery.trees.length <= 1200)
    const start = pointAt(road, 0)
    assert.ok(Math.hypot(scenery.gantry.x - start.x, scenery.gantry.z - start.z) < 0.01, `${name} : portique hors de la ligne de départ`)
    if (name !== 'fictif') assert.ok(scenery.boards.length >= 3, `${name} : ${scenery.boards.length} panneaux`)
  }
})

test('aucune tribune, aucun bâtiment des stands, aucun panneau ni arbre sur la piste ou sur un autre tronçon', () => {
  for (const [name, road] of roads) {
    const scenery = getScenery(road)
    const edge = road.width / 2
    const rects = [...scenery.stands, ...(scenery.pit ? [scenery.pit] : [])]
    for (const rect of rects) {
      for (let i = 0; i <= 8; i += 1) {
        for (let j = 0; j <= 4; j += 1) {
          const point = toWorld(rect, (i / 8 - 0.5) * rect.length, (j / 4 - 0.5) * STAND_DEPTH)
          assert.ok(gap(road, point.x, point.z) >= edge + 2, `${name} : emprise à ${gap(road, point.x, point.z).toFixed(1)} m de la piste`)
        }
      }
    }
    for (const board of scenery.boards) assert.ok(gap(road, board.x, board.z) >= edge + 0.5, `${name} : panneau sur la piste`)
    for (const tree of scenery.trees) assert.ok(gap(road, tree.x, tree.z) >= edge + 20, `${name} : arbre à ${gap(road, tree.x, tree.z).toFixed(1)} m de la piste`)
  }
})

test('les tribunes et le bâtiment des stands ne se chevauchent pas', () => {
  for (const [name, road] of roads) {
    const scenery = getScenery(road)
    const rects = [...scenery.stands, ...(scenery.pit ? [scenery.pit] : [])]
    for (let a = 0; a < rects.length; a += 1) {
      for (let b = a + 1; b < rects.length; b += 1) {
        const distance = Math.hypot(rects[a].x - rects[b].x, rects[a].z - rects[b].z)
        assert.ok(distance >= (rects[a].length + rects[b].length) / 2, `${name} : emprises ${a} et ${b} à ${distance.toFixed(0)} m`)
      }
    }
  }
})

test('Suzuka a un bâtiment des stands le long de la ligne droite de départ', () => {
  const { pit } = getScenery(circuit('suzuka'))
  assert.ok(pit, 'pas de bâtiment des stands')
  assert.ok(pit.length >= 100)
})

test('les panneaux de freinage portent 3, 2 ou 1 barres, par groupes de trois avant un virage', () => {
  assert.deepEqual(BOARD_DISTANCES, [150, 100, 50])
  const { boards } = getScenery(circuit('suzuka'))
  for (const board of boards) assert.ok([1, 2, 3].includes(board.bars))
  assert.ok(boards.some((board) => board.bars === 3) && boards.some((board) => board.bars === 1))
})

test('les tribunes, le bâtiment des stands et les poteaux du portique sont solides : contact = remise en piste', () => {
  const road = circuit('suzuka')
  const scenery = getScenery(road)
  const inStand = scenery.stands[0]
  assert.equal(hitsScenery(road, inStand.x, inStand.z), true, 'au centre d’une tribune')
  const away = toWorld(inStand, 0, -STAND_DEPTH / 2 - 3)
  assert.equal(hitsScenery(road, away.x, away.z), false, 'devant la tribune, côté piste')
  assert.equal(hitsScenery(road, scenery.pit.x, scenery.pit.z), true, 'dans le bâtiment des stands')
  const post = { x: scenery.gantry.x, z: scenery.gantry.z, rotation: scenery.gantry.heading }
  // Le pied côté stands est posé sur le muret, qui arrête la voiture lui-même (tests/pit-lane.test.js) : on vise l'autre.
  const leg = scenery.gantry.legs.find((candidate) => !candidate.onPitWall)
  const postSpot = toWorld(post, 0, leg.across)
  assert.equal(hitsScenery(road, postSpot.x, postSpot.z), true, 'sur un poteau du portique')
  assert.equal(hitsScenery(road, scenery.gantry.x, scenery.gantry.z), false, 'sous le portique, sur la piste')

  // Dans la simulation : la voiture lancée dans une tribune est remise sur la piste, tour supprimé.
  const state = { ...createDriveState(road, { lights: false }), x: inStand.x, z: inStand.z, u: 30, s: 200, offset: 20 }
  const next = stepDrive(road, state, { throttle: 0, brake: 0, steer: 0 }, 1 / 60)
  assert.equal(next.crashes, 1)
  assert.equal(next.speed, 0)
  assert.equal(next.lapValid, false)
})
