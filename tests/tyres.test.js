import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDriveTrack, chooseNextTyre, createDriveState, raceStints, resetToTrack, tyreAge } from '../lib/car-drive.js'
import { SURFACES, createCarState, stepCar } from '../lib/car-physics.js'
import { COMPOUND_IDS, addWear, suggestedNext, tyreGrip, tyreLife, wearStress } from '../lib/tyres.js'
import { followCentreLine, run } from './pit-pilot.js'
import { makePilot } from './pilot.js'

const road = buildDriveTrack()

test('à neuf : le medium vaut exactement la voiture sans usure, le tendre accroche plus, le dur moins', () => {
  assert.deepEqual(COMPOUND_IDS, ['SOFT', 'MEDIUM', 'HARD'])
  assert.equal(tyreGrip('MEDIUM', 0), 1)
  assert.ok(tyreGrip('SOFT', 0) > 1)
  assert.ok(tyreGrip('HARD', 0) < 1)
  assert.equal(tyreGrip('INCONNU', 0), 1, 'gomme inconnue : le medium')
})

test('l’adhérence ne fait que baisser avec l’usure, sans jamais s’effondrer sous 75 %', () => {
  for (const compound of COMPOUND_IDS) {
    let previous = tyreGrip(compound, 0)
    for (let wear = 0.05; wear <= 1.0001; wear += 0.05) {
      const grip = tyreGrip(compound, wear)
      assert.ok(grip < previous, `${compound} à ${wear.toFixed(2)}`)
      previous = grip
    }
    assert.ok(previous > 0.75, compound)
    assert.equal(tyreGrip(compound, 4), previous, 'usure bornée')
    // La fin de vie coûte bien plus que le début.
    assert.ok(tyreGrip(compound, 0.7) - tyreGrip(compound, 1) > 2 * (tyreGrip(compound, 0) - tyreGrip(compound, 0.7)))
  }
})

test('le tendre dure moins que le medium, qui dure moins que le dur ; la durée suit la distance de course', () => {
  for (const race of [{ laps: 3, length: 5000 }, { laps: 10, length: 873 }, { laps: null, length: 5800 }]) {
    const [soft, medium, hard] = COMPOUND_IDS.map((compound) => tyreLife(compound, race))
    assert.ok(soft < medium && medium < hard)
    assert.ok(soft < (race.laps ?? 5) * race.length || race.laps === 3, 'un tendre ne fait pas la course')
    assert.ok(hard > (race.laps ?? 5) * race.length * 0.99, 'un dur peut la finir')
  }
  assert.ok(tyreLife('SOFT', { laps: 10, length: 5000 }) > tyreLife('SOFT', { laps: 5, length: 5000 }))
  assert.ok(tyreLife('SOFT', { laps: 1, length: 873 }) >= 1500, 'course très courte : le train ne meurt pas en un tour')
})

test('l’usure grimpe plus vite en virage et en glissade, et plafonne à 100 %', () => {
  const straight = wearStress({ u: 60, v: 0, r: 0 })
  const corner = wearStress({ u: 60, v: 0, r: 0.5 })
  const slide = wearStress({ u: 30, v: 6, r: 0.5 })
  assert.ok(straight >= 0.7 && straight < corner && corner < slide)
  assert.equal(addWear(0.99, 5000, 1000, 2), 1)
  assert.equal(addWear(0.2, 0, 1000), 0.2)
})

test('des pneus usés tournent moins fort et freinent plus long', () => {
  const car = (wear, input, seconds, start) => {
    let state = { ...createCarState(), ...start }
    const surface = { ...SURFACES.asphalt, tyre: tyreGrip('MEDIUM', wear) }
    for (let time = 0; time < seconds; time += 1 / 240) state = stepCar(state, input, surface, 1 / 240)
    return state
  }
  const turn = (wear) => Math.abs(car(wear, { throttle: 0.5, steer: 1 }, 2, { u: 55, gear: 5 }).heading)
  assert.ok(turn(1) < turn(0) * 0.93, `${turn(1).toFixed(2)} contre ${turn(0).toFixed(2)}`)
  const stop = (wear) => car(wear, { brake: 1 }, 1.5, { u: 70, gear: 6 }).u
  assert.ok(stop(1) > stop(0) + 3)
})

test('pneus morts : freinage ou plein gaz avec un coup de volant ne font pas partir en toupie', () => {
  for (const assist of ['high', 'normal', 'off']) {
    for (const speed of [25, 55, 75]) {
      for (const pedals of [{ brake: 1 }, { throttle: 1 }]) {
        let state = { ...createCarState(), u: speed, gear: 4 }
        const surface = { ...SURFACES.asphalt, tyre: tyreGrip('HARD', 1) }
        let worst = 0
        for (let time = 0; time < 2; time += 1 / 240) {
          state = stepCar(state, { ...pedals, steer: time > 0.3 && time < 0.9 ? 1 : 0, assist }, surface, 1 / 240)
          if (Math.abs(state.u) > 8) worst = Math.max(worst, Math.abs(Math.atan2(state.v, state.u)))
        }
        assert.ok(worst < 0.35, `${assist} à ${speed} m/s : dérive de ${((worst * 180) / Math.PI).toFixed(0)}°`)
      }
    }
  }
})

test('le train s’use en roulant, davantage sur un tendre que sur un dur', () => {
  const driven = (compound) => run(road, createDriveState(road, { lights: false, raceLaps: 5, compound }), makePilot(road), 30).tyre.wear
  const [soft, hard] = [driven('SOFT'), driven('HARD')]
  assert.ok(hard > 0.05, `${hard}`)
  assert.ok(soft > hard * 1.8, `${soft} contre ${hard}`)
  const still = run(road, createDriveState(road, { lights: false }), { throttle: 0, brake: 0, steer: 0 }, 3)
  assert.equal(still.tyre.wear, 0, 'à l’arrêt, pas d’usure')
})

test('course : au dernier tour le drapeau tombe, le chrono, les tours et l’usure s’arrêtent', () => {
  let state = createDriveState(road, { lights: false, raceLaps: 2 })
  state = followCentreLine(road, state, 4, road.length + 40)
  assert.equal(state.laps, 1)
  assert.equal(state.finished, false)
  const firstLap = state.lastLap
  state = followCentreLine(road, state, road.length + 42, 2 * road.length + 40)
  assert.equal(state.laps, 2)
  assert.equal(state.finished, true)
  assert.equal(state.running, false)
  assert.ok(Math.abs(state.raceTime - firstLap - state.lastLap) < 0.05, 'temps total = somme des tours')
  const { raceTime, tyre } = state
  state = followCentreLine(road, state, 2 * road.length + 42, 3 * road.length + 40)
  assert.equal(state.laps, 2, 'plus aucun tour compté')
  assert.equal(state.raceTime, raceTime)
  assert.equal(state.tyre.wear, tyre.wear)
  assert.equal(raceStints(road, state)[0].to, 2)
  assert.equal(tyreAge(road, state), 2)
})

test('roulage libre : aucun drapeau, les tours continuent de compter', () => {
  let state = createDriveState(road, { lights: false })
  assert.equal(state.raceLaps, null)
  state = followCentreLine(road, state, 4, 3 * road.length + 40)
  assert.equal(state.laps, 3)
  assert.equal(state.finished, false)
  assert.equal(tyreAge(road, state), 3)
})

test('gomme du prochain arrêt : proposée d’office, choisie par le pilote, jamais inconnue', () => {
  assert.equal(suggestedNext('MEDIUM'), 'HARD')
  assert.equal(suggestedNext('SOFT'), 'MEDIUM')
  const state = createDriveState(road, { compound: 'SOFT' })
  assert.equal(state.tyre.compound, 'SOFT')
  assert.equal(state.nextCompound, 'MEDIUM')
  assert.equal(chooseNextTyre(state, 'HARD').nextCompound, 'HARD')
  assert.equal(chooseNextTyre(state, 'PLUIE'), state)
  assert.equal(createDriveState(road, { compound: 'PLUIE' }).tyre.compound, 'MEDIUM')
})

test('une remise en piste annule l’arrêt en cours sans toucher aux pneus', () => {
  const state = { ...createDriveState(road, { lights: false }), pit: { inLane: true, served: false, service: 1 }, tyre: { compound: 'SOFT', wear: 0.4 } }
  const back = resetToTrack(road, state)
  assert.equal(back.pit.service, 0)
  assert.deepEqual(back.tyre, state.tyre)
})
