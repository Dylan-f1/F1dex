import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildCircuitTrack, buildDriveTrack, closestOnTrack, minCurvatureRadius, offsetLine, pointAt } from '../lib/drive-track.js'
import { buildTrack } from '../lib/track.js'

const circuits = JSON.parse(readFileSync(new URL('./fixtures/circuits.json', import.meta.url), 'utf8'))

// Un vrai circuit tel que le site le fabrique : données MultiViewer → buildTrack → piste de conduite.
function circuit(name) {
  const raw = circuits[name]
  const shown = buildTrack(raw)
  return { raw, shown, road: buildCircuitTrack(shown.points, { key: raw.circuitKey }) }
}

const gaps = (road) => road.points.map((point, index) => {
  const next = road.points[(index + 1) % road.points.length]
  return Math.hypot(next.x - point.x, next.z - point.z)
})

test('le circuit fictif est une boucle fermée dont la courbure laisse passer la largeur', () => {
  const track = buildDriveTrack()
  assert.ok(track.length > 600 && track.length < 2000, `longueur ${track.length}`)
  assert.ok(minCurvatureRadius(track) > track.width / 2 + 3, `rayon minimal ${minCurvatureRadius(track)}`)
})

test('le circuit fictif ne repasse jamais près de lui-même', () => {
  const { points, cumulative, length, width } = buildDriveTrack()
  for (let i = 0; i < points.length; i += 4) {
    for (let j = i + 1; j < points.length; j += 4) {
      const along = Math.min(cumulative[j] - cumulative[i], length - (cumulative[j] - cumulative[i]))
      if (along < width * 3) continue
      const apart = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z)
      assert.ok(apart > width + 4, `points ${i} et ${j} à ${apart.toFixed(1)} m`)
    }
  }
})

for (const name of ['monaco', 'suzuka', 'interlagos']) {
  test(`${name} : ligne centrale régulière, de la bonne longueur, recentrée`, () => {
    const { raw, road } = circuit(name)
    const step = gaps(road)
    assert.ok(Math.min(...step) > 1.8 && Math.max(...step) < 3.2, `pas entre ${Math.min(...step)} et ${Math.max(...step)}`)
    // Longueur du tracé brut (dixièmes de mètre, fermé).
    let rawLength = 0
    raw.x.forEach((x, index) => {
      const next = (index + 1) % raw.x.length
      rawLength += Math.hypot(raw.x[next] - x, raw.y[next] - raw.y[index])
    })
    assert.ok(Math.abs(road.length - rawLength / 10) / (rawLength / 10) < 0.03, `${road.length} m contre ${rawLength / 10} m`)
    assert.ok(Math.abs(road.bounds.minX + road.bounds.maxX) < 3 && Math.abs(road.bounds.minZ + road.bounds.maxZ) < 3)
    assert.ok(minCurvatureRadius(road) > 5, `rayon minimal ${minCurvatureRadius(road)}`)
  })

  test(`${name} : le sens des points est le sens de la course (les virages se suivent dans l'ordre)`, () => {
    const { shown, road } = circuit(name)
    const along = shown.corners.map((corner) => {
      const spot = { x: corner.on.x / 10 - road.origin.x, z: corner.on.y / 10 - road.origin.z }
      return closestOnTrack(road, spot.x, spot.z).s
    })
    // Le tour peut commencer au milieu d'une série de virages : on vérifie une seule rupture, au passage de la ligne.
    const breaks = along.filter((s, index) => index > 0 && s < along[index - 1]).length
    assert.ok(breaks <= 1, `virages dans le désordre : ${along.map((s) => Math.round(s)).join(' ')}`)
  })
}

test('le sens horaire ou antihoraire des circuits est conservé (Monaco, Suzuka horaires ; Interlagos antihoraire)', () => {
  assert.equal(circuit('monaco').road.clockwise, true)
  assert.equal(circuit('suzuka').road.clockwise, true)
  assert.equal(circuit('interlagos').road.clockwise, false)
})

test('une piste trop pauvre en points est refusée', () => {
  assert.equal(buildCircuitTrack([[0, 0], [10, 0], [10, 10]], { key: 1 }), null)
  assert.equal(buildCircuitTrack(null, { key: 1 }), null)
  assert.equal(buildCircuitTrack(Array.from({ length: 20 }, () => [Number.NaN, 0]), { key: 1 }), null)
})

test('pointAt et closestOnTrack se répondent', () => {
  const { road } = circuit('monaco')
  for (const ratio of [0.02, 0.3, 0.55, 0.9]) {
    const s = road.length * ratio
    const spot = pointAt(road, s)
    const found = closestOnTrack(road, spot.x, spot.z)
    assert.ok(found.distance < 0.01 && Math.abs(found.s - s) < 0.5, `s=${s} retrouvé ${found.s}`)
  }
})

test('Suzuka se croise : la recherche globale se trompe de branche, la recherche locale suit la bonne', () => {
  const { road } = circuit('suzuka')
  let globalMistakes = 0
  let previous = 0
  let worstLocal = 0
  for (let s = 0; s < road.length; s += 1) {
    const spot = pointAt(road, s)
    // Voiture décalée de 3 m sur le côté : près du croisement, l'autre branche peut être plus proche.
    const side = { x: spot.x + Math.sin(spot.heading) * 3, z: spot.z + Math.cos(spot.heading) * 3 }
    const local = closestOnTrack(road, side.x, side.z, previous)
    previous = local.s
    const error = Math.abs(local.s - s)
    worstLocal = Math.max(worstLocal, Math.min(error, road.length - error)) // l'abscisse boucle à la ligne
    const global = closestOnTrack(road, side.x, side.z)
    const globalError = Math.abs(global.s - s)
    if (Math.min(globalError, road.length - globalError) > 100) globalMistakes += 1
  }
  assert.ok(worstLocal < 6, `la recherche locale s'écarte de ${worstLocal} m`)
  assert.ok(globalMistakes > 0, 'aucun cas où la recherche globale se trompe : le test ne démontre rien')
})

test('les bords de piste ne se replient pas, même dans les épingles (le bord intérieur avance toujours)', () => {
  for (const road of [buildDriveTrack(), circuit('monaco').road, circuit('suzuka').road, circuit('interlagos').road]) {
    for (const offset of [-road.width / 2, -road.width / 2 + 1.1, road.width / 2 - 0.6, road.width / 2]) {
      const edge = offsetLine(road, offset)
      edge.forEach((point, index) => {
        const next = edge[(index + 1) % edge.length]
        const here = road.points[index]
        const ahead = road.points[(index + 1) % road.points.length]
        const along = (next.x - point.x) * (ahead.x - here.x) + (next.z - point.z) * (ahead.z - here.z)
        assert.ok(along > 0, `${road.key} : bord à ${offset} m replié au point ${index}`)
      })
    }
  }
})
