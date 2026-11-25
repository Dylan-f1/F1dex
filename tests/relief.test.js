import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FICTIVE_RELIEF, bendAt, buildRelief, gradeAt, heightAt } from '../lib/relief.js'
import { RELIEF } from '../lib/relief-data.js'
import { TERRAIN, floorAt, getTerrain, pavedEdge, skirtFoot } from '../lib/terrain.js'
import { FLAT_GROUND, createCarState, stepCar, SURFACES } from '../lib/car-physics.js'
import { LOAD_LIMITS, createDriveState, groundUnder, stepDrive } from '../lib/car-drive.js'
import { buildCircuitTrack, buildDriveTrack, offsetPoint, pointAt } from '../lib/drive-track.js'
import { buildTrack } from '../lib/track.js'
import { makePilot } from './pilot.js'

const circuits = JSON.parse(readFileSync(new URL('./fixtures/circuits.json', import.meta.url), 'utf8'))
const fictive = buildDriveTrack({ relief: FICTIVE_RELIEF })
const STEP = 1 / 60

const drive = (state, input, seconds, ground) => {
  let car = state
  for (let time = 0; time < seconds; time += 1 / 240) car = stepCar(car, input, SURFACES.asphalt, 1 / 240, ground)
  return car
}

test('une piste sans profil reste plate partout', () => {
  const flat = buildDriveTrack()
  assert.equal(flat.relief, null)
  assert.equal(heightAt(flat, 120), 0)
  assert.equal(gradeAt(flat, 120), 0)
  assert.equal(getTerrain(flat), null)
  assert.equal(groundUnder(flat, createDriveState(flat)), undefined)
})

test('un profil inutilisable est ignoré', () => {
  for (const profile of [null, [], [1, 2, 3], [0, 1, NaN, 2], [0, 1, 2, null]]) assert.equal(buildRelief(buildDriveTrack(), profile), null)
})

test('le relief suit le profil, sans cassure à la ligne', () => {
  const { relief, length } = fictive
  assert.ok(relief.max - relief.min > 10)
  assert.ok(heightAt(fictive, 0) < 1, 'départ en bas')
  assert.ok(heightAt(fictive, length / 2) > 10, 'sommet à mi-tour')
  assert.ok(Math.abs(heightAt(fictive, length - 0.01) - heightAt(fictive, 0)) < 0.05)
  assert.ok(Math.max(...relief.grade.map(Math.abs)) < 0.12)
})

test('la pente est la variation d’altitude, la courbure celle de la pente', () => {
  for (const s of [50, 200, 400, 700]) {
    const measured = (heightAt(fictive, s + 5) - heightAt(fictive, s - 5)) / 10
    assert.ok(Math.abs(gradeAt(fictive, s) - measured) < 0.01, `pente à ${s}`)
  }
  assert.ok(bendAt(fictive, 1) > 0, 'creux au départ')
  assert.ok(bendAt(fictive, fictive.length / 2) < 0, 'bosse au sommet')
})

test('les 24 circuits de la saison ont un profil plausible', () => {
  const entries = Object.entries(RELIEF)
  assert.equal(entries.length, 24)
  for (const [key, heights] of entries) {
    assert.ok(heights.length > 100 && heights.every(Number.isFinite), key)
    assert.equal(Math.min(...heights), 0, key)
    assert.ok(Math.max(...heights) < 120, key)
    const steepest = Math.max(...heights.map((value, index) => Math.abs(heights[(index + 1) % heights.length] - value)))
    assert.ok(steepest / 19 < 0.2, `${key} : pente ${steepest}`)
  }
  // Repères connus : Spa est le plus vallonné, Mexico presque plat.
  assert.ok(Math.max(...RELIEF['7']) > 90)
  assert.ok(Math.max(...RELIEF['65']) < 6)
})

test('en montée la voiture accélère moins, en descente davantage', () => {
  const start = { ...createCarState(), u: 40, gear: 4 }
  const input = { throttle: 1, brake: 0, steer: 0 }
  const speed = (forward) => drive(start, input, 2, { ...FLAT_GROUND, forward }).u
  assert.ok(speed(0.12) < speed(0) - 1.5)
  assert.ok(speed(-0.12) > speed(0) + 1.5)
})

test('à l’arrêt sans gaz ni frein, la voiture ne roule pas dans la pente', () => {
  for (const ground of [{ forward: 0.14, left: 0.05, load: 1 }, { forward: -0.14, left: -0.05, load: 1 }]) {
    const car = drive(createCarState(), { throttle: 0, brake: 0, steer: 0 }, 3, ground)
    assert.equal(car.u, 0)
    assert.ok(Math.abs(car.x) < 1e-9 && Math.abs(car.z) < 1e-9)
  }
})

test('la voiture repart en côte', () => {
  const car = drive(createCarState(), { throttle: 1, brake: 0, steer: 0 }, 2, { forward: 0.145, left: 0, load: 1 })
  assert.ok(car.u > 10, String(car.u))
})

test('un creux augmente l’adhérence au freinage, une bosse la diminue', () => {
  const start = { ...createCarState(), u: 50, gear: 5 }
  const input = { throttle: 0, brake: 1, steer: 0 }
  const speed = (load) => drive(start, input, 1, { ...FLAT_GROUND, load }).u
  assert.ok(speed(1.6) < speed(1))
  assert.ok(speed(0.6) > speed(1))
})

test('le sol sous la voiture suit son cap : montée de face, dévers de travers, charge bornée', () => {
  const s = fictive.length * 0.2 // en montée
  const spot = pointAt(fictive, s)
  const facing = (turn, u = 0) => groundUnder(fictive, { s, heading: spot.heading + turn, u, v: 0 })
  assert.ok(facing(0).forward > 0.02)
  assert.ok(facing(Math.PI).forward < -0.02)
  // Tourné à gauche (+90°), la montée est à sa droite : la pente vers la gauche est négative.
  assert.ok(facing(Math.PI / 2).left < -0.02 && Math.abs(facing(Math.PI / 2).forward) < 1e-9)
  const fast = (track, at) => groundUnder(track, { s: at, heading: pointAt(track, at).heading, u: 90, v: 0 }).load
  assert.ok(fast(fictive, fictive.length / 2) < 1, 'bosse')
  assert.ok(fast(fictive, 1) > 1, 'creux')
  // Un relief en dents de scie : la charge reste bornée.
  const jagged = buildDriveTrack({ relief: Array.from({ length: 40 }, (_, index) => (index % 4 < 2 ? 0 : 25)) })
  const loads = jagged.points.map((_, index) => fast(jagged, jagged.cumulative[index]))
  assert.equal(Math.min(...loads), LOAD_LIMITS.min)
  assert.equal(Math.max(...loads), LOAD_LIMITS.max)
})

test('le terrain passe juste sous la piste et ses abords', () => {
  const terrain = getTerrain(fictive)
  for (let index = 0; index < fictive.points.length; index += 3) {
    for (const offset of [-fictive.width / 2, 0, fictive.width / 2]) {
      const spot = offsetPoint(fictive, index, offset)
      const gap = fictive.relief.heights[index] - terrain.surface(spot.x, spot.z)
      assert.ok(gap > 0.02 && gap < 0.9, `point ${index}, écart latéral ${offset} : ${gap.toFixed(2)}`)
    }
  }
})

test('le terrain rejoint un niveau plat loin du circuit', () => {
  const terrain = getTerrain(fictive)
  assert.ok(Math.abs(terrain.surface(1e6, 1e6) - (terrain.base - TERRAIN.drop)) < 1e-9)
  assert.ok(Math.abs(terrain.heights[0] - (terrain.base - TERRAIN.drop)) < 1e-5)
  assert.ok(terrain.heights.every(Number.isFinite))
})

test('la voiture suit la piste sur le revêtement, puis le sol sur l’herbe', () => {
  const terrain = getTerrain(fictive)
  const index = 40
  const s = fictive.cumulative[index]
  const at = (offset) => {
    const spot = offsetPoint(fictive, index, offset)
    return { floor: floorAt(fictive, { x: spot.x, z: spot.z, s, offset }), ground: terrain.surface(spot.x, spot.z) }
  }
  assert.ok(Math.abs(at(0).floor - heightAt(fictive, s)) < 1e-9)
  for (const side of [-1, 1]) {
    const paved = pavedEdge(fictive, index, side > 0 ? 'right' : 'left')
    assert.ok(Math.abs(at(side * (paved - 0.1)).floor - heightAt(fictive, s)) < 1e-9, 'bord du revêtement')
    const grass = at(side * (paved + 3))
    assert.ok(Math.abs(grass.floor - grass.ground) < 1e-9, 'herbe')
  }
  assert.equal(floorAt(buildDriveTrack(), { x: 0, z: 0, s: 0, offset: 0 }), 0)
})

test('aucun mur de soutènement là où le sol suit la piste', () => {
  for (let index = 0; index < fictive.points.length; index += 1) {
    for (const side of [-1, 1]) assert.equal(skirtFoot(fictive, index, (side * fictive.width) / 2), null)
  }
})

for (const name of ['monaco', 'suzuka']) {
  test(`${name} : des murs de soutènement là où la piste domine le sol, jamais en travers d’un tronçon plus bas`, () => {
    const road = buildCircuitTrack(buildTrack(circuits[name]).points, { key: String(circuits[name].circuitKey), relief: RELIEF[circuits[name].circuitKey] })
    let walls = 0
    for (let index = 0; index < road.points.length; index += 1) {
      for (const side of ['left', 'right']) {
        const offset = (side === 'right' ? 1 : -1) * pavedEdge(road, index, side)
        const foot = skirtFoot(road, index, offset)
        if (foot === null) continue
        walls += 1
        const spot = offsetPoint(road, index, offset)
        assert.ok(foot < road.relief.heights[index])
        road.points.forEach((point, other) => {
          const apart = Math.abs(road.cumulative[index] - road.cumulative[other])
          if (Math.min(apart, road.length - apart) <= 80) return
          if (Math.hypot(point.x - spot.x, point.z - spot.z) >= road.width / 2) return
          assert.ok(road.relief.heights[other] >= road.relief.heights[index] - 0.5, `mur ${index} en travers du point ${other}`)
        })
      }
    }
    assert.ok(walls > 0)
  })
}

// Les circuits des données de test (Monaco, Suzuka, Interlagos), avec leur vrai relief.
for (const [name, circuit] of Object.entries(circuits)) {
  const key = String(circuit.circuitKey)
  const relief = RELIEF[key]
  test(`${name} : le sol ne recouvre jamais la piste, et le pilote automatique boucle un tour avec le relief`, () => {
    const road = buildCircuitTrack(buildTrack(circuit).points, { key, relief })
    assert.ok(road.relief.max > 30)
    const terrain = getTerrain(road)
    let covered = 0
    for (let index = 0; index < road.points.length; index += 1) {
      for (const offset of [-road.width / 2 + 0.5, 0, road.width / 2 - 0.5]) {
        const spot = offsetPoint(road, index, offset)
        if (terrain.surface(spot.x, spot.z) > road.relief.heights[index]) covered += 1
      }
    }
    assert.equal(covered, 0)
    // Pilote un peu plus prudent qu'à plat (0,7) : avec les aides fortes, l'épingle de Monaco, en descente, demande de
    // freiner plus tôt (à 0,7 il déborde de 2 m, à 0,6 il passe).
    const pilot = makePilot(road, { grip: 0.6 })
    let state = createDriveState(road, { lights: false })
    for (let time = 0; time < 240 && state.laps === 0; time += STEP) state = stepDrive(road, state, pilot(state), STEP)
    assert.equal(state.laps, 1)
    assert.equal(state.recoveries, 0)
    assert.equal(state.lastLapValid, true)
  })
}
