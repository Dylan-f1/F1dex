import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DRIVE,
  buildCircuitTrack,
  buildDriveTrack,
  closestOnTrack,
  createDriveState,
  formatDelta,
  formatLapTime,
  pointAt,
  resetToTrack,
  stepDrive,
} from '../lib/car-drive.js'
import { buildTrack } from '../lib/track.js'
import { makePilot } from './pilot.js'

const track = buildDriveTrack()
const STEP = 1 / 60
const IDLE = { throttle: 0, brake: 0, steer: 0 }
const circuits = JSON.parse(readFileSync(new URL('./fixtures/circuits.json', import.meta.url), 'utf8'))
const circuit = (name) => buildCircuitTrack(buildTrack(circuits[name]).points, { key: circuits[name].circuitKey })

function run(road, state, input, seconds) {
  let current = state
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    current = stepDrive(road, current, typeof input === 'function' ? input(current) : input, STEP)
  }
  return current
}

const racing = (road = track, extra = {}) => createDriveState(road, { lights: false, ...extra })

test('feux de départ : cinq feux, la voiture reste immobile, le chrono démarre à l’extinction', () => {
  const full = { throttle: 1, brake: 0, steer: 0 }
  let state = createDriveState(track, { hold: 1 })
  state = run(track, state, full, 2)
  assert.equal(state.phase, 'lights')
  assert.equal(state.lightsLit, 2)
  assert.equal(state.speed, 0)
  assert.equal(state.running, false)
  state = run(track, state, full, 2.5) // 4,5 s : 5 feux allumés, attente de 1 s
  assert.equal(state.lightsLit, 5)
  assert.equal(state.phase, 'lights')
  state = run(track, state, full, 1)
  assert.equal(state.phase, 'racing')
  assert.equal(state.lightsLit, 0, 'les feux s’éteignent au départ')
  assert.equal(state.running, true)
  assert.ok(state.lapTime < 0.6, 'le chrono repart à zéro à l’extinction')
  state = run(track, state, full, 1)
  assert.ok(state.speed > 10, 'la voiture part après l’extinction')
})

test('départ : la voiture est sur la grille, sur la piste, et les ordres de volant sont ignorés', () => {
  const state = run(track, createDriveState(track), { throttle: 0, brake: 0, steer: 1 }, 1)
  assert.equal(state.heading, pointAt(track, 4).heading)
  assert.equal(state.onTrack, true)
})

test('un pas de temps énorme est borné : pas de téléportation après un onglet caché', () => {
  const start = { ...racing(), u: 40, gear: 5 }
  const after = stepDrive(track, start, IDLE, 5)
  assert.ok(Math.hypot(after.x - start.x, after.z - start.z) < 40 * DRIVE.maxStep + 0.05)
})

test('limites de piste : quatre roues dehors supprime le tour, rester sur le bord non', () => {
  const edge = track.width / 2
  const spot = pointAt(track, 100)
  // Perpendiculaire à la piste, du côté droit (z vers le bas pour un cap +x).
  const at = (offset) => ({ ...racing(), s: 100, x: spot.x, z: spot.z + offset, heading: spot.heading })
  const onTheLine = stepDrive(track, at(edge - 0.2), IDLE, STEP)
  assert.equal(onTheLine.lapValid, true)
  const outside = stepDrive(track, at(edge + 1.5), IDLE, STEP)
  assert.equal(outside.lapValid, false)
  assert.equal(outside.onTrack, false)
})

test('très loin de la piste, les commissaires remettent la voiture sur la ligne centrale, à l’arrêt', () => {
  const spot = pointAt(track, 100) // ligne droite de départ : le côté droit est vers l'extérieur de la boucle
  const lost = { ...racing(), s: 100, x: spot.x, z: spot.z + track.width / 2 + DRIVE.recoverDistance + 5, heading: spot.heading, u: 30 }
  const back = stepDrive(track, lost, IDLE, STEP)
  assert.equal(back.recoveries, 1)
  assert.equal(back.speed, 0)
  assert.equal(back.lapValid, false)
  assert.ok(back.distance < 1)
})

test('la touche R remet la voiture sur la piste et supprime le tour, sauf pendant les feux', () => {
  const lost = { ...racing(), x: -500, z: 0, s: 50, u: 20 }
  const back = resetToTrack(track, lost)
  assert.equal(back.recoveries, 1)
  assert.equal(back.u, 0)
  const viaInput = stepDrive(track, { ...racing(), u: 20 }, { ...IDLE, reset: true }, STEP)
  assert.equal(viaInput.recoveries, 1)
  const duringLights = stepDrive(track, createDriveState(track), { ...IDLE, reset: true }, STEP)
  assert.equal(duringLights.recoveries, 0)
})

test('loin de la piste sur un vrai circuit, la remise en piste ne tombe pas sur un autre tronçon', () => {
  // Cas dangereux : la voiture est à plus de recoverDistance de son tronçon, mais à moins d'un tronçon voisin. Si la
  // recherche locale cédait la place à la recherche globale, elle croirait la voiture proche de l'autre tronçon : aucune
  // remise en piste, et l'abscisse sauterait.
  for (const name of ['monaco', 'suzuka']) {
    const road = circuit(name)
    const limit = road.width / 2 + DRIVE.recoverDistance
    let tested = 0
    for (let s = 0; s < road.length; s += 5) {
      const spot = pointAt(road, s)
      for (const side of [1, -1]) {
        for (let offset = limit + 1; offset <= limit + 12; offset += 1) {
          const x = spot.x + Math.sin(spot.heading) * offset * side
          const z = spot.z + Math.cos(spot.heading) * offset * side
          const local = closestOnTrack(road, x, z, s)
          const global = closestOnTrack(road, x, z)
          const gap = Math.abs(global.s - s)
          if (Math.min(gap, road.length - gap) < 100 || global.distance > limit || local.distance <= limit + 2) continue
          tested += 1
          const lost = { ...racing(road), s, x, z, heading: spot.heading, u: 20, distance: local.distance }
          const back = stepDrive(road, lost, IDLE, STEP)
          assert.equal(back.recoveries, 1, `${name} s=${s} : pas de remise en piste`)
          const moved = Math.abs(back.s - s)
          assert.ok(Math.min(moved, road.length - moved) < 95, `${name} s=${s} : remise sur un autre tronçon (s=${back.s})`)
        }
      }
    }
    assert.ok(tested > 0, `${name} : aucun cas de tronçons voisins (la distance de repli de la recherche locale est-elle trop basse ?)`)
  }
})

// Conduit la ligne centrale en téléportant la voiture à chaque pas : on teste ici le comptage des tours, pas la physique.
function followCentreLine(road, state, fromS, toS, metresPerStep = 2) {
  let current = state
  const direction = Math.sign(toS - fromS)
  for (let s = fromS; direction > 0 ? s <= toS : s >= toS; s += direction * metresPerStep) {
    const point = pointAt(road, s)
    current = stepDrive(
      road,
      { ...current, x: point.x, z: point.z, heading: point.heading, u: 20 },
      { throttle: 1, brake: 0, steer: 0 },
      STEP,
    )
  }
  return current
}

test('un tour complet est compté, avec ses trois secteurs et le meilleur tour', () => {
  const state = followCentreLine(track, racing(), 4, track.length + 10)
  assert.equal(state.laps, 1)
  assert.ok(state.lastLap > 0)
  assert.equal(state.lastLapValid, true)
  assert.equal(state.bestLap, state.lastLap)
  assert.equal(state.bestSerial, 1)
  assert.equal(state.lastSectors.length, 3)
  assert.ok(state.lastSectors.every((time) => time > 0))
  assert.ok(Math.abs(state.lastSectors.reduce((sum, time) => sum + time, 0) - state.lastLap) < 1e-6)
  assert.ok(state.lapTime < state.lastLap, 'le chrono repart à zéro après la ligne')
  assert.deepEqual(state.sectors, [null, null, null])
})

test('osciller de part et d’autre de la ligne ne compte aucun tour', () => {
  let state = racing()
  for (let round = 0; round < 4; round += 1) {
    state = followCentreLine(track, state, 4, 30)
    state = followCentreLine(track, state, 30, -15)
    state = followCentreLine(track, state, -15, 30)
  }
  assert.equal(state.laps, 0, `tours comptés à tort : ${state.laps}`)
})

test('un tour hors limites est compté mais ne devient jamais le meilleur', () => {
  let state = followCentreLine(track, racing(), 4, 200)
  state = { ...state, lapValid: false }
  state = followCentreLine(track, state, 200, track.length + 10)
  assert.equal(state.laps, 1)
  assert.equal(state.lastLapValid, false)
  assert.equal(state.bestLap, null)
  assert.equal(state.bestSerial, 0)
  state = followCentreLine(track, state, track.length + 10, track.length * 2 + 10)
  assert.equal(state.laps, 2)
  assert.equal(state.lastLapValid, true, 'la ligne remet la validité à zéro')
  assert.equal(state.bestLap, state.lastLap)
})

test('couper à travers l’herbe ne rapporte rien : la distance gagnée par une téléportation n’est pas comptée', () => {
  const state = racing(track)
  const far = pointAt(track, track.length * 0.6)
  const jumped = stepDrive(track, { ...state, x: far.x, z: far.z, s: state.s }, IDLE, STEP)
  assert.ok(jumped.travelled < 50, `distance comptée ${jumped.travelled}`)
  assert.equal(jumped.lapValid, false)
})

test('l’écart au meilleur tour apparaît au deuxième tour, et un meilleur tour enregistré sert de référence', () => {
  let state = followCentreLine(track, racing(), 4, 300)
  assert.equal(state.delta, null, 'aucun écart au premier tour')
  state = followCentreLine(track, state, 300, track.length + 300)
  assert.ok(Number.isFinite(state.delta), `écart ${state.delta}`)
  // Référence venue du stockage : plus lente que le tour réel (profil gonflé de 20 %).
  const slow = {
    time: state.bestLap * 1.2,
    sectors: state.lastSectors.map((time) => time * 1.2),
    profile: state.bestProfile.map((time) => (time === null ? null : time * 1.2)),
  }
  const fresh = followCentreLine(track, racing(track, { best: slow }), 4, 600)
  assert.ok(fresh.delta < 0, `devant la référence : ${fresh.delta}`)
})

// Boucle un tour avec le pilote automatique ; renvoie l'état final et quelques mesures.
function driveOneLap(road) {
  const pilot = makePilot(road)
  let state = racing(road)
  let time = 0
  let worstDistance = 0
  let previousS = state.s
  let jumps = 0
  while (state.laps < 1 && time < 300) {
    state = stepDrive(road, state, pilot(state), STEP)
    time += STEP
    worstDistance = Math.max(worstDistance, state.distance)
    // L'abscisse ne doit jamais sauter (croisement de Suzuka) : à 100 m/s on avance de 2 m par image au plus.
    const change = Math.abs(state.s - previousS)
    if (Math.min(change, road.length - change) > 6) jumps += 1
    previousS = state.s
  }
  return { state, time, worstDistance, jumps }
}

test('un pilote automatique boucle un tour du circuit fictif, en restant sur la piste', () => {
  const { state, time } = driveOneLap(track)
  assert.equal(state.laps, 1, `pas de tour en ${time} s`)
  assert.equal(state.lastLapValid, true)
  assert.equal(state.recoveries, 0)
})

for (const [name, [fastest, slowest]] of [['monaco', [60, 130]], ['suzuka', [90, 190]], ['interlagos', [70, 150]]]) {
  test(`un pilote automatique boucle un tour de ${name} en ${fastest} à ${slowest} s, sans sortir de la piste`, () => {
    const road = circuit(name)
    const { state, time, worstDistance, jumps } = driveOneLap(road)
    assert.equal(state.laps, 1, `pas de tour en ${time} s (abscisse ${state.s} / ${road.length})`)
    assert.ok(state.lastLap > fastest && state.lastLap < slowest, `tour en ${state.lastLap} s`)
    assert.equal(state.lastLapValid, true, `écart maximal à l'axe ${worstDistance} m, bord à ${road.width / 2} m`)
    assert.equal(jumps, 0, `${jumps} sauts d'abscisse`)
    assert.equal(state.recoveries, 0)
    assert.ok(state.lastSectors.every((sector) => sector > 5))
  })
}

test('formatLapTime et formatDelta', () => {
  assert.equal(formatLapTime(83.4567), '1:23.457')
  assert.equal(formatLapTime(5.1), '5.100')
  assert.equal(formatLapTime(60), '1:00.000')
  assert.equal(formatLapTime(null), '–')
  assert.equal(formatDelta(0.3124), '+0.312')
  assert.equal(formatDelta(-1.5), '−1.500')
  assert.equal(formatDelta(null), '–')
})
