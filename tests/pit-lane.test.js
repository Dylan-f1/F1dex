import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildCircuitTrack, buildDriveTrack, createDriveState, pointAt, stepDrive, surfaceAt } from '../lib/car-drive.js'
import { getFeatures } from '../lib/circuit-features.js'
import { getScenery, hitsScenery } from '../lib/circuit-scenery.js'
import { indexAt, offsetPoint } from '../lib/drive-track.js'
import { PIT_LANE, getPitLane, laneOuter, nearPitLane, relOf } from '../lib/pit-lane.js'
import { PIT_RULES } from '../lib/pit-stop.js'
import { FICTIVE_RELIEF, heightAt } from '../lib/relief.js'
import { barrierLayout, groveTrees } from '../lib/scenery-layout.js'
import { floorAt, getTerrain } from '../lib/terrain.js'
import { buildTrack } from '../lib/track.js'
import { followCentreLine, makePitPilot, run, STEP } from './pit-pilot.js'

const circuits = JSON.parse(readFileSync(new URL('./fixtures/circuits.json', import.meta.url), 'utf8'))
const circuit = (name) => buildCircuitTrack(buildTrack(circuits[name]).points, { key: circuits[name].circuitKey })
const roads = [
  ['fictif', buildDriveTrack()],
  ['monaco', circuit('monaco')],
  ['suzuka', circuit('suzuka')],
  ['interlagos', circuit('interlagos')],
]
const IDLE = { throttle: 0, brake: 0, steer: 0 }
const FULL = { throttle: 1, brake: 0, steer: 0 }

// Voiture posée dans la voie : à l'abscisse `rel`, à `p` mètres de l'axe côté stands, dans l'axe de la piste.
function inLane(road, rel, p, extra = {}) {
  const lane = getPitLane(road)
  const spot = pointAt(road, rel)
  const offset = p * lane.sign
  return {
    ...createDriveState(road, { lights: false }),
    x: spot.x + Math.sin(spot.heading) * offset,
    z: spot.z + Math.cos(spot.heading) * offset,
    heading: spot.heading,
    s: ((rel % road.length) + road.length) % road.length,
    offset,
    ...extra,
  }
}

test('chaque piste a une voie des stands, dans l’ordre entrée, muret, box, sortie', () => {
  for (const [name, road] of roads) {
    const lane = getPitLane(road)
    assert.ok(lane, `${name} : pas de voie des stands`)
    assert.equal(getPitLane(road), lane, 'calculée une fois')
    assert.ok(lane.entry < lane.wallStart && lane.wallStart < lane.box && lane.box < lane.wallEnd && lane.wallEnd < lane.exit, name)
    // La ligne de départ est entre les deux bouts du muret, ou hors de la voie : jamais sur une route d'entrée ou de sortie.
    const walled = lane.wallStart < -5 && lane.wallEnd > 5
    const outside = lane.entry > 5 || lane.exit < -5
    assert.ok(walled || outside, `${name} : ligne de départ sur une route d’accès`)
  }
})

test('la voie des stands ne passe sur aucun autre tronçon du circuit', () => {
  for (const [name, road] of roads) {
    const lane = getPitLane(road)
    const edge = road.width / 2
    for (let rel = lane.entry; rel <= lane.exit; rel += 5) {
      const index = indexAt(road, rel)
      const outer = laneOuter(road, lane, rel)
      const spot = offsetPoint(road, index, lane.sign * outer)
      road.points.forEach((point, other) => {
        const gap = Math.abs(road.cumulative[other] - road.cumulative[index])
        if (Math.min(gap, road.length - gap) <= outer + 60) return
        assert.ok(Math.hypot(point.x - spot.x, point.z - spot.z) >= edge, `${name} : voie sur la piste à rel=${rel.toFixed(0)}`)
      })
    }
  }
})

test('rien ne traîne sur la voie : ni vibreur, ni gravier, ni mur, ni tribune, ni panneau, ni arbre, ni pneus', () => {
  for (const [name, road] of roads) {
    const lane = getPitLane(road)
    const features = getFeatures(road)
    road.points.forEach((_, index) => {
      const rel = relOf(road, road.cumulative[index])
      if (rel < lane.entry || rel > lane.exit) return
      for (const kind of ['kerb', 'gravel', 'wall']) assert.equal(features[kind][lane.side][index], 0, `${name} : ${kind} dans la voie`)
    })
    const clear = (thing, label) => assert.ok(!nearPitLane(road, thing.x, thing.z, 0), `${name} : ${label} sur la voie des stands`)
    const scenery = getScenery(road)
    scenery.boards.forEach((board) => clear(board, 'panneau'))
    scenery.trees.forEach((tree) => clear(tree, 'arbre'))
    groveTrees(road).forEach((tree) => clear(tree, 'arbre de bosquet'))
    barrierLayout(road).stacks.forEach((stack) => clear(stack, 'pile de pneus'))
  }
})

test('une voiture qui suit la voie ne touche rien du décor, de l’entrée à la sortie', () => {
  for (const [name, road] of roads) {
    const lane = getPitLane(road)
    const edge = road.width / 2
    for (let rel = lane.wallStart; rel <= lane.wallEnd; rel += 2) {
      // Du muret à la façade : toute la largeur utile.
      for (const p of [edge + PIT_LANE.wall + 1.3, edge + PIT_LANE.box, edge + PIT_LANE.width]) {
        const state = inLane(road, rel, p)
        assert.equal(hitsScenery(road, state.x, state.z), false, `${name} : obstacle à rel=${rel.toFixed(0)}, p=${p.toFixed(1)}`)
      }
    }
  }
})

test('la voie est en asphalte et y rouler ne supprime pas le tour', () => {
  for (const [name, road] of roads) {
    const lane = getPitLane(road)
    const state = inLane(road, lane.box - 30, road.width / 2 + PIT_LANE.box, { u: 15 })
    assert.equal(surfaceAt(road, state.s, state.offset).kind, 'asphalt', name)
    const next = stepDrive(road, state, IDLE, STEP)
    assert.equal(next.lapValid, true, name)
    assert.equal(next.onTrack, true, name)
    assert.equal(next.pit.inLane, true, name)
    assert.equal(next.crashes, 0, name)
  }
})

test('le limiteur ramène à 80 km/h une voiture arrivée trop vite, et la tient même plein gaz', () => {
  const road = circuit('suzuka')
  const lane = getPitLane(road)
  let state = inLane(road, lane.wallStart + 3, road.width / 2 + PIT_LANE.box, { u: 70, gear: 6 })
  state = { ...state, pit: { inLane: true, served: true, service: 0 } } // arrêt déjà fait : seul le limiteur joue
  state = run(road, state, { ...FULL, assist: 'high' }, 1.5)
  assert.ok(state.speed <= PIT_RULES.limit + 0.05, `${(state.speed * 3.6).toFixed(0)} km/h`)
  const later = run(road, state, FULL, 1)
  assert.ok(later.speed <= PIT_RULES.limit + 0.05)
  assert.ok(later.speed > PIT_RULES.limit - 3, 'la voiture roule toujours')
})

test('plein gaz dans la voie : arrêt automatique au box, immobile, puis train neuf et départ', () => {
  for (const [name, road] of roads) {
    const lane = getPitLane(road)
    let state = inLane(road, lane.box - 24, road.width / 2 + PIT_LANE.box, { u: 20, gear: 2 })
    state = { ...state, tyre: { compound: 'MEDIUM', wear: 0.8 }, nextCompound: 'SOFT' }
    let waited = 0
    while (state.pit.service === 0 && waited < 8) {
      state = stepDrive(road, state, FULL, STEP)
      waited += STEP
    }
    assert.ok(state.pit.service > 0, `${name} : pas d’arrêt au box`)
    assert.ok(Math.abs(relOf(road, state.s) - lane.box) <= PIT_RULES.boxHalf, `${name} : arrêt à ${(relOf(road, state.s) - lane.box).toFixed(1)} m du box`)
    const held = run(road, state, { ...FULL, steer: 1 }, PIT_RULES.service - 0.3)
    assert.equal(held.speed, 0, `${name} : immobile pendant l’arrêt`)
    assert.ok(Math.hypot(held.x - state.x, held.z - state.z) < 1e-9)
    assert.equal(held.tyre.compound, 'MEDIUM', 'le train n’est changé qu’à la fin')
    let gone = run(road, held, IDLE, 0.4)
    assert.equal(gone.tyre.compound, 'SOFT', name)
    assert.ok(gone.tyre.wear < 0.01, name)
    assert.equal(gone.stints.length, 2, name)
    assert.equal(gone.pit.served, true)
    gone = run(road, gone, FULL, 1.5)
    assert.ok(gone.speed > 5, `${name} : la voiture repart`)
    assert.equal(gone.stints.length, 2, `${name} : un seul arrêt par passage`)
  }
})

test('freiner et s’arrêter juste avant le box déclenche aussi l’arrêt', () => {
  const road = circuit('suzuka')
  const lane = getPitLane(road)
  let state = inLane(road, lane.box - 4, road.width / 2 + PIT_LANE.box, { u: 3 })
  state = run(road, state, { throttle: 0, brake: 1, steer: 0 }, 1)
  assert.ok(state.pit.service > 0)
})

test('le muret arrête la voiture des deux côtés sans la remettre en piste', () => {
  for (const [name, road] of roads) {
    const lane = getPitLane(road)
    const edge = road.width / 2
    const axis = edge + PIT_LANE.wall
    const rel = (lane.wallStart + lane.box) / 2
    for (const [from, towards, side] of [[edge - 1, 1, 'piste'], [edge + 6, -1, 'stands']]) {
      const start = inLane(road, rel, from, { u: 15, gear: 2 })
      let state = { ...start, heading: start.heading - towards * lane.sign * 0.35 }
      let closest = Infinity
      for (let step = 0; step < 60; step += 1) {
        state = stepDrive(road, state, IDLE, STEP)
        const p = state.offset * lane.sign
        closest = Math.min(closest, Math.abs(p - axis))
        assert.ok(towards > 0 ? p < axis : p > axis, `${name} : le muret est traversé depuis la ${side}`)
      }
      assert.ok(closest < 1.6, `${name} : la voiture n’a pas atteint le muret depuis la ${side} (${closest.toFixed(1)} m)`)
      assert.equal(state.crashes, 0, name)
      assert.equal(state.recoveries, 0, name)
    }
  }
})

test('sur les circuits en relief, la voiture reste au niveau de la piste dans la voie, et le sol passe dessous', () => {
  const road = buildDriveTrack({ relief: FICTIVE_RELIEF })
  const lane = getPitLane(road)
  const terrain = getTerrain(road)
  for (let rel = lane.wallStart; rel <= lane.wallEnd; rel += 5) {
    const state = inLane(road, rel, road.width / 2 + PIT_LANE.box)
    assert.ok(Math.abs(floorAt(road, state) - heightAt(road, rel)) < 0.15, `rel=${rel.toFixed(0)}`)
    assert.ok(terrain.surface(state.x, state.z) <= heightAt(road, rel) + 0.01, `sol au-dessus de la voie à rel=${rel.toFixed(0)}`)
  }
})

test('un tour avec arrêt aux stands, piloté de l’entrée à la sortie, compte et reste valide', () => {
  for (const [name, road] of roads) {
    const lane = getPitLane(road)
    // Départ lancé bien avant l'entrée, tour presque fini : le passage de la ligne, dans la voie ou non, doit compter.
    const startRel = lane.entry - 90
    const approach = createDriveState(road, { lights: false })
    let state = followCentreLine(road, approach, 4, road.length + startRel)
    state = { ...state, u: 20, gear: 2, lapValid: true }
    const lapsBefore = state.laps
    const stops = state.stints.length
    const pilot = makePitPilot(road)
    let fastest = 0
    let elapsed = 0
    while (elapsed < 60) {
      state = stepDrive(road, state, pilot(state), STEP)
      elapsed += STEP
      if (state.pit.inLane && relOf(road, state.s) > lane.wallStart + 5) fastest = Math.max(fastest, state.speed)
      const rel = relOf(road, state.s)
      if (rel > lane.exit + 15 && rel < lane.exit + 40) break
    }
    assert.ok(elapsed < 60, `${name} : la voiture n’est pas ressortie`)
    assert.equal(state.stints.length, stops + 1, `${name} : un arrêt`)
    assert.ok(fastest > 15, `${name} : la voiture n’est pas passée dans la voie`)
    assert.ok(fastest <= PIT_RULES.limit + 0.1, `${name} : ${(fastest * 3.6).toFixed(0)} km/h dans la voie`)
    assert.equal(state.crashes, 0, name)
    assert.equal(state.recoveries, 0, name)
    // La ligne est franchie dans la voie ou après elle : le tour est compté (au plus un de plus selon sa position).
    const crossed = lane.entry - 90 < 0 && lane.exit > 0
    if (crossed) {
      assert.equal(state.laps, lapsBefore + 1, `${name} : tour non compté dans la voie`)
      assert.equal(state.lastLapValid, true, `${name} : tour supprimé par les stands`)
    } else assert.equal(state.lapValid, true, name)
  }
})
