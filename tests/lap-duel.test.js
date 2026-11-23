import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bestLapSeconds, buildChartRange, compareDrivers, findFastestPoint } from '../lib/lap-duel.js'

const driver = (code, laps) => ({
  code,
  laps: laps.map(([lap, seconds, excluded = false]) => ({ lap, seconds, excluded })),
})

test('bestLapSeconds ignore les tours exclus', () => {
  const d = driver('AAA', [[2, 95], [3, 90, true], [4, 96]])
  assert.equal(bestLapSeconds(d), 95)
})

test('bestLapSeconds renvoie null sans tour propre', () => {
  assert.equal(bestLapSeconds(driver('AAA', [[1, 100, true]])), null)
})

test('compareDrivers : positif quand le premier pilote est plus rapide', () => {
  const first = driver('AAA', [[2, 90], [3, 90], [4, 90], [5, 90], [6, 90]])
  const second = driver('BBB', [[2, 91], [3, 91], [4, 91], [5, 91], [6, 91]])
  const result = compareDrivers(first, second)
  assert.equal(result.comparedLaps, 5)
  assert.ok(Math.abs(result.meanGapSeconds - 1) < 1e-9)
  assert.equal(result.isReliable, true)
})

test('compareDrivers : pas fiable sous 5 tours comparables', () => {
  const first = driver('AAA', [[2, 90], [3, 90]])
  const second = driver('BBB', [[2, 91], [3, 91]])
  assert.equal(compareDrivers(first, second).isReliable, false)
})

test('compareDrivers ne compare que les tours propres communs', () => {
  const first = driver('AAA', [[2, 90], [3, 90, true], [4, 90]])
  const second = driver('BBB', [[2, 91], [3, 91], [5, 91]])
  assert.equal(compareDrivers(first, second).comparedLaps, 1)
})

test('buildChartRange écrête les tours très lents et les compte', () => {
  const laps = [90, 90, 90, 90, 90, 90, 90, 90, 90, 150].map((seconds) => ({ seconds }))
  const range = buildChartRange(laps)
  assert.equal(range.clippedCount, 1)
  assert.ok(range.max < 150)
})

test('buildChartRange renvoie null sans tour', () => {
  assert.equal(buildChartRange([]), null)
})

test('findFastestPoint trouve le tour signé par un des deux pilotes', () => {
  const first = driver('AAA', [[2, 95]])
  const second = driver('BBB', [[7, 90]])
  assert.equal(findFastestPoint(first, second, { code: 'BBB', lap: 7, seconds: 90 }).lap, 7)
})

test('findFastestPoint renvoie null si aucun des deux n’a signé le meilleur tour', () => {
  const first = driver('AAA', [[2, 95]])
  const second = driver('BBB', [[7, 90]])
  assert.equal(findFastestPoint(first, second, { code: 'CCC', lap: 7, seconds: 80 }), null)
})
