import test from 'node:test'
import assert from 'node:assert/strict'
import { CAR, GEARS, SURFACES, createCarState, maxLateralAccel, maxSteerAngle, rpmAt, stepCar } from '../lib/car-physics.js'

const DT = 1 / 240
const FULL = { throttle: 1, brake: 0, steer: 0 }
const COAST = { throttle: 0, brake: 0, steer: 0 }

function run(car, input, seconds, surface = SURFACES.asphalt) {
  let current = car
  for (let elapsed = 0; elapsed < seconds; elapsed += DT) {
    current = stepCar(current, typeof input === 'function' ? input(current) : input, surface, DT)
  }
  return current
}

test('0 à 100 km/h en 2 à 3,5 s, pointe entre 300 et 345 km/h', () => {
  let car = createCarState()
  let time = 0
  let to100 = null
  while (time < 40) {
    car = stepCar(car, FULL, SURFACES.asphalt, DT)
    time += DT
    if (to100 === null && car.u * 3.6 >= 100) to100 = time
  }
  assert.ok(to100 > 2 && to100 < 3.5, `0–100 en ${to100} s`)
  assert.ok(car.u * 3.6 > 300 && car.u * 3.6 < 345, `pointe ${car.u * 3.6} km/h`)
  assert.equal(car.gear, GEARS.length)
})

test('freinage : de 300 km/h à l’arrêt entre 80 et 160 m', () => {
  let car = { ...createCarState(), u: 300 / 3.6, gear: 8 }
  const from = car.x
  for (let time = 0; car.u > 0.5 && time < 20; time += DT) car = stepCar(car, { throttle: 0, brake: 1, steer: 0 }, SURFACES.asphalt, DT)
  assert.ok(car.x - from > 80 && car.x - from < 160, `${car.x - from} m`)
})

test('l’appui aérodynamique augmente l’adhérence avec la vitesse', () => {
  assert.ok(maxLateralAccel(80) > 2 * maxLateralAccel(20))
  assert.ok(maxLateralAccel(50, SURFACES.grass.grip) < maxLateralAccel(50))
})

test('le braquage maximal diminue avec la vitesse et reste borné', () => {
  assert.ok(maxSteerAngle(10) > maxSteerAngle(40))
  assert.ok(maxSteerAngle(40) > maxSteerAngle(80))
  assert.ok(maxSteerAngle(0) <= 0.45 && maxSteerAngle(100) >= 0.04)
})

test('à l’arrêt la voiture ne pivote pas ; en marche arrière le braquage est inversé', () => {
  const still = run(createCarState(), { throttle: 0, brake: 0, steer: 1 }, 2)
  assert.equal(still.heading, 0)
  const backing = run({ ...createCarState(), u: -6 }, { throttle: 0, brake: 0, steer: 1 }, 0.4)
  assert.ok(backing.heading < 0, `cap ${backing.heading}`)
})

test('braquer à gauche fait tourner la voiture à gauche (cap qui augmente, la voiture part vers −z)', () => {
  const start = { ...createCarState(), u: 25, gear: 3 }
  const left = run(start, { throttle: 0, brake: 0, steer: 1 }, 0.8)
  assert.ok(left.heading > 0.1 && left.z < -0.1, `cap ${left.heading}, z ${left.z}`)
  const right = run(start, { throttle: 0, brake: 0, steer: -1 }, 0.8)
  assert.ok(right.heading < -0.1 && right.z > 0.1)
})

test('S : freine, puis recule quand la voiture est arrêtée, avec un plafond de marche arrière', () => {
  const braking = run({ ...createCarState(), u: 20, gear: 3 }, { throttle: 0, brake: 1, steer: 0 }, 1.5)
  assert.ok(braking.u < 0.5, `vitesse ${braking.u}`)
  const reversing = run(braking, { throttle: 0, brake: 1, steer: 0 }, 8)
  assert.ok(reversing.u < -3 && reversing.u >= -CAR.reverseMax - 0.5, `vitesse ${reversing.u}`)
})

test('lâcher l’accélérateur ralentit sans jamais inverser le sens', () => {
  const slowed = run({ ...createCarState(), u: 20, gear: 3 }, COAST, 30)
  assert.ok(slowed.u >= 0 && slowed.u < 20)
})

test('plein gaz + volant à fond : la voiture ne fait pas de toupie (l’aide à la stabilité et l’anti-patinage tiennent)', () => {
  for (const speed of [15, 30, 50, 80]) {
    const car = run({ ...createCarState(), u: speed, gear: Math.min(8, 1 + Math.floor(speed / 12)) }, { throttle: 1, brake: 0, steer: 1 }, 5)
    assert.ok(car.u > 5, `à ${speed} m/s la voiture finit à ${car.u} m/s`)
    assert.ok(Math.abs(Math.atan2(car.v, car.u)) < 0.6, `angle de dérive ${Math.atan2(car.v, car.u)} à ${speed} m/s`)
  }
})

test('le volant relâché, la voiture se redresse sans osciller', () => {
  let car = run({ ...createCarState(), u: 60, gear: 6 }, { throttle: 0, brake: 0, steer: 1 }, 0.5)
  car = run(car, COAST, 4)
  assert.ok(Math.abs(car.r) < 0.02 && Math.abs(car.v) < 0.5, `lacet ${car.r}, dérive ${car.v}`)
})

test('l’herbe ralentit fortement et fait perdre de l’adhérence', () => {
  const onGrass = run({ ...createCarState(), u: 60, gear: 6 }, FULL, 4, SURFACES.grass)
  assert.ok(onGrass.u < 30, `${onGrass.u} m/s`)
})

test('la boîte change de rapport sans sortir de la plage de régime', () => {
  let car = createCarState()
  let lowest = Infinity
  for (let time = 0; time < 20; time += DT) {
    car = stepCar(car, FULL, SURFACES.asphalt, DT)
    if (time > 1) lowest = Math.min(lowest, car.rpm)
  }
  assert.ok(lowest >= 5000 && car.rpm <= 13000)
  assert.ok(rpmAt(50, 3) > rpmAt(50, 6))
})

// Plus grand angle de dérive du châssis (degrés) pendant `seconds`, volant à fond à gauche.
function worstSlide(kmh, throttle, assist, seconds = 2.5) {
  let car = { ...createCarState(), u: kmh / 3.6, gear: 6 }
  let worst = 0
  for (let elapsed = 0; elapsed < seconds; elapsed += DT) {
    car = stepCar(car, { throttle, brake: 0, steer: 1, assist }, SURFACES.asphalt, DT)
    worst = Math.max(worst, (Math.abs(Math.atan2(car.v, Math.max(car.u, 1))) * 180) / Math.PI)
  }
  return worst
}

test('aides fortes : volant à fond, la voiture ne glisse presque pas, à toute vitesse et à tout régime', () => {
  // (en dessous, l'angle de dérive est de la géométrie pure : les roues avant très braquées, pas une glisse)
  for (const kmh of [120, 200, 280]) {
    for (const throttle of [0, 0.4, 1]) {
      const slide = worstSlide(kmh, throttle, 'high')
      assert.ok(slide < 5, `${kmh} km/h, gaz ${throttle} : ${slide.toFixed(1)}° de dérive`)
    }
  }
})

test('chaque niveau d’aides glisse au moins autant que le précédent (plein gaz, volant à fond)', () => {
  const slide = (assist) => worstSlide(120, 1, assist)
  assert.ok(slide('high') <= slide('normal') + 0.5, 'fortes ≤ normales')
  assert.ok(slide('normal') <= slide('off') + 0.5, 'normales ≤ aucune')
})

// Régression : sans aides, le freinage en virage et un coup de volant faisaient partir la voiture en toupie
// (arrière déchargé qui bloquait), et plein gaz à basse vitesse l'arrière décrochait seul.
test('quel que soit le niveau d’aides, un coup de volant au freinage ou à l’accélération ne fait jamais partir en toupie', () => {
  for (const assist of ['high', 'normal', 'off']) {
    for (const [kmh, gear] of [[80, 4], [120, 5], [200, 7], [280, 8]]) {
      for (const [label, throttle, brake] of [['freinage', 0, 1], ['plein gaz', 1, 0]]) {
        let car = { ...createCarState(), u: kmh / 3.6, gear }
        let worst = 0
        for (let elapsed = 0; elapsed < 2; elapsed += DT) {
          car = stepCar(car, { throttle, brake, steer: elapsed < 0.3 ? 1 : 0, assist }, SURFACES.asphalt, DT)
          if (car.u > 3) worst = Math.max(worst, (Math.abs(Math.atan2(car.v, car.u)) * 180) / Math.PI)
        }
        assert.ok(worst < 12, `${assist}, ${kmh} km/h, ${label} : ${worst.toFixed(0)}° de dérive`)
      }
    }
  }
})

test('un niveau d’aides inconnu retombe sur les aides fortes', () => {
  assert.equal(worstSlide(120, 1, 'inconnu'), worstSlide(120, 1, 'high'))
})

test('lâcher le gaz ralentit la voiture (frein moteur) au lieu de la laisser rouler', () => {
  for (const [kmh, gear] of [[100, 4], [200, 6]]) {
    let car = { ...createCarState(), u: kmh / 3.6, gear }
    for (let elapsed = 0; elapsed < 2; elapsed += DT) car = stepCar(car, { throttle: 0, brake: 0, steer: 0, assist: 'high' }, SURFACES.asphalt, DT)
    assert.ok(car.u * 3.6 < kmh - 15, `${kmh} km/h : encore ${(car.u * 3.6).toFixed(0)} km/h après 2 s sans gaz`)
  }
})

test('freiner volant braqué ne fait pas partir tout droit : la voiture continue de tourner (aides fortes et normales)', () => {
  const turned = (kmh, gear, brake, assist) => {
    let car = { ...createCarState(), u: kmh / 3.6, gear }
    for (let elapsed = 0; elapsed < 1; elapsed += DT) car = stepCar(car, { throttle: 0, brake, steer: 1, assist }, SURFACES.asphalt, DT)
    return Math.abs(car.heading)
  }
  for (const assist of ['high', 'normal']) {
    for (const [kmh, gear] of [[100, 4], [200, 6], [280, 8]]) {
      assert.ok(turned(kmh, gear, 1, assist) >= 0.8 * turned(kmh, gear, 0, assist), `${assist}, ${kmh} km/h : le freinage supprime le virage`)
    }
  }
})

test('lâcher le gaz en virage, volant tenu, ne fait jamais partir en toupie (frein moteur coupé volant braqué)', () => {
  for (const assist of ['high', 'normal', 'off']) {
    for (const [kmh, gear] of [[120, 5], [200, 6], [260, 7]]) {
      for (const hold of [0.6, 1, 2]) {
        let car = { ...createCarState(), u: kmh / 3.6, gear }
        let worst = 0
        for (let elapsed = 0; elapsed < 6; elapsed += DT) {
          car = stepCar(car, { throttle: 0, brake: 0, steer: elapsed < hold ? 1 : 0, assist }, SURFACES.asphalt, DT)
          if (car.u > 3) worst = Math.max(worst, (Math.abs(Math.atan2(car.v, car.u)) * 180) / Math.PI)
        }
        assert.ok(worst < 20, `${assist}, ${kmh} km/h, volant tenu ${hold} s : ${worst.toFixed(0)}° de dérive`)
      }
    }
  }
})
