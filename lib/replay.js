const MS_PER_SECOND = 1000

// Échantillons OpenF1 bruts ({ date, x, y }) vers [[ms depuis le début du tour, x, y]], triés,
// sans valeur invalide. Les valeurs restent dans le repère OpenF1 (la rotation se fait à l'affichage).
export function toReplaySamples(rawSamples, startMs) {
  return rawSamples
    .map((sample) => [Date.parse(sample.date) - startMs, sample.x, sample.y])
    .filter(([time, x, y]) => Number.isFinite(time) && Number.isFinite(x) && Number.isFinite(y))
    .sort((a, b) => a[0] - b[0])
}

// Position de la voiture à l'instant `ms` : interpolation linéaire entre les deux échantillons voisins.
// Pas d'accrochage au tracé : sur un circuit en huit (Suzuka), la voiture sauterait de branche au croisement.
export function positionAt(samples, ms) {
  if (samples.length === 0) return null
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (ms <= first[0]) return { x: first[1], y: first[2] }
  if (ms >= last[0]) return { x: last[1], y: last[2] }

  let low = 0
  let high = samples.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (samples[middle][0] <= ms) low = middle
    else high = middle
  }
  const [t0, x0, y0] = samples[low]
  const [t1, x1, y1] = samples[high]
  const ratio = (ms - t0) / (t1 - t0)
  return { x: x0 + (x1 - x0) * ratio, y: y0 + (y1 - y0) * ratio }
}

// Secteur (0, 1 ou 2) dans lequel se trouve la voiture à l'instant `ms`, d'après les temps de secteur.
// null sans temps de secteur.
export function sectorIndexAt(sectors, ms) {
  if (!Array.isArray(sectors) || sectors.length !== 3) return null
  const seconds = ms / MS_PER_SECOND
  if (seconds < sectors[0]) return 0
  if (seconds < sectors[0] + sectors[1]) return 1
  return 2
}

// Meilleur tour du pilote parmi ses tours propres, sinon parmi tous ses tours chronométrés.
export function bestLapOf(laps) {
  const fastest = (candidates) =>
    candidates.reduce((best, lap) => (!best || lap.seconds < best.seconds ? lap : best), null)
  return fastest(laps.filter((lap) => !lap.excluded)) ?? fastest(laps)
}
