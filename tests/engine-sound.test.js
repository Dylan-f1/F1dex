import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ENGINE_SOUND, engineSound, soundRevs } from '../lib/engine-sound.js'

const sound = (values) => engineSound({ rpm: 9000, throttle: 1, speed: 40, ...values })

test('la hauteur suit le régime : trois explosions par tour pour un V6', () => {
  assert.equal(sound({ rpm: 6000 }).frequency, 300)
  assert.equal(sound({ rpm: 12000 }).frequency, 600)
})

test('le régime est borné entre le ralenti et le rupteur', () => {
  assert.equal(sound({ rpm: 0 }).frequency, sound({ rpm: ENGINE_SOUND.idleRpm }).frequency)
  assert.equal(sound({ rpm: 20000 }).frequency, sound({ rpm: ENGINE_SOUND.revLimit }).frequency)
})

test('accélérer rend le moteur plus fort et plus clair', () => {
  const off = sound({ throttle: 0 })
  const on = sound({ throttle: 1 })
  assert.ok(on.gain > off.gain)
  assert.ok(on.cutoff > off.cutoff)
  assert.ok(on.turboGain > off.turboGain)
  assert.ok(off.gain > 0, 'le ralenti s’entend')
})

test('le changement de rapport coupe brièvement le son', () => {
  assert.ok(sound({ shifting: true }).gain < sound({ shifting: false }).gain / 2)
})

test('le vent monte avec la vitesse, en avant comme en arrière', () => {
  assert.equal(sound({ speed: 0 }).windGain, 0)
  assert.ok(sound({ speed: 80 }).windGain > sound({ speed: 30 }).windGain)
  assert.equal(sound({ speed: -10 }).windGain, sound({ speed: 10 }).windGain)
})

test('les volumes restent entre 0 et 1', () => {
  for (const rpm of [0, 5000, 9000, 13000, 30000]) {
    for (const throttle of [-1, 0, 0.5, 1, 4]) {
      const values = engineSound({ rpm, throttle, speed: 400 })
      for (const key of ['gain', 'turboGain', 'windGain']) {
        assert.ok(values[key] >= 0 && values[key] <= 1, `${key} ${values[key]}`)
      }
    }
  }
})

const run = (start, state, seconds) => {
  let revs = start
  for (let frame = 0; frame < seconds * 60; frame += 1) revs = soundRevs(revs, state, 1 / 60)
  return revs
}

test('sous les feux, un coup de gaz fait monter le moteur, qui redescend au relâchement', () => {
  const grid = { phase: 'lights', rpm: 5000, gear: 1, throttle: 1 }
  const high = run(5000, grid, 1)
  assert.ok(high > 11000)
  assert.ok(run(high, { ...grid, throttle: 0 }, 1.5) < 5100)
})

test('au départ, le moteur reste dans les tours puis rejoint le régime de la voiture', () => {
  const launch = run(11500, { phase: 'racing', rpm: 5000, gear: 1, throttle: 1 }, 1)
  assert.ok(launch > 9000 && launch < 10000)
  assert.equal(soundRevs(launch, { phase: 'racing', rpm: 8400, gear: 2, throttle: 1 }, 1 / 60), 8400)
})
