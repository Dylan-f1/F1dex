const MIN_COMPARED_LAPS = 5
// Les tours plus lents que cette part de la médiane sont écrêtés en haut du graphique
// (neutralisation, trafic) pour ne pas écraser l'échelle.
const SLOW_LAP_CLIP_RATIO = 1.04
const Y_PADDING_SECONDS = 0.3

export function cleanLaps(driver) {
  return driver.laps.filter((lap) => !lap.excluded)
}

export function bestLapSeconds(driver) {
  const laps = cleanLaps(driver)
  return laps.length ? Math.min(...laps.map((lap) => lap.seconds)) : null
}

// Le meilleur tour de la course n'apparaît sur le graphique que si l'un des deux pilotes l'a signé.
export function findFastestPoint(first, second, fastestLap) {
  if (!fastestLap) return null
  return (
    [first, second]
      .filter((driver) => driver.code === fastestLap.code)
      .map((driver) => cleanLaps(driver).find((lap) => lap.lap === fastestLap.lap))
      .find(Boolean) ?? null
  )
}

export function buildChartRange(laps) {
  const sortedSeconds = laps.map((lap) => lap.seconds).sort((a, b) => a - b)
  if (!sortedSeconds.length) return null

  const median = sortedSeconds[Math.floor(sortedSeconds.length / 2)]
  const slowest = sortedSeconds[sortedSeconds.length - 1]
  const min = sortedSeconds[0] - Y_PADDING_SECONDS
  const max = Math.min(slowest, median * SLOW_LAP_CLIP_RATIO) + Y_PADDING_SECONDS
  const clippedCount = sortedSeconds.filter((seconds) => seconds > max).length
  return { min, max, clippedCount }
}

// Écart moyen sur les tours propres communs aux deux pilotes (positif : `first` plus rapide).
export function compareDrivers(first, second) {
  const secondByLap = new Map(cleanLaps(second).map((lap) => [lap.lap, lap.seconds]))
  const gaps = cleanLaps(first)
    .filter((lap) => secondByLap.has(lap.lap))
    .map((lap) => secondByLap.get(lap.lap) - lap.seconds)

  const comparedLaps = gaps.length
  const meanGapSeconds = comparedLaps ? gaps.reduce((sum, gap) => sum + gap, 0) / comparedLaps : 0
  return { comparedLaps, meanGapSeconds, isReliable: comparedLaps >= MIN_COMPARED_LAPS }
}
