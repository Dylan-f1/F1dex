import { COUNTRY_NAMES_FR } from './constants'

const SECONDS_PER_MINUTE = 60

export function formatDecimal(value, digits = 1) {
  return Number(value).toFixed(digits).replace('.', ',')
}

export function formatLapTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
  const seconds = (totalSeconds - minutes * SECONDS_PER_MINUTE).toFixed(3).padStart(6, '0')
  return `${minutes}:${seconds}`
}

export function formatDateLong(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatDateShort(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`)
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace('.', '')
}

export function countryNameFr(englishName) {
  return COUNTRY_NAMES_FR[englishName] ?? englishName
}

export function formatTemperatureRange(min, max) {
  const low = Math.round(min)
  const high = Math.round(max)
  return low === high ? `${low} °C` : `${low} à ${high} °C`
}

export function positionLabel(result) {
  return result.position ?? result.status
}

export function gapLabel(result) {
  if (result.status === 'DSQ') return 'Disqualifié'
  if (result.status === 'DNF') {
    return result.lapsCompleted ? `Abandon, tour ${result.lapsCompleted}` : 'Abandon, au départ'
  }
  if (result.position === 1) return 'Leader'
  if (typeof result.gap === 'number') return `+${formatDecimal(result.gap, 3)}`
  // OpenF1 renvoie « +1 LAP » pour les pilotes pris un tour.
  return String(result.gap ?? '')
    .replace('LAPS', 'tours')
    .replace('LAP', 'tour')
}

export function stopsLabel(result) {
  if (!result.pits.length) return 'Aucun'
  return result.pits
    .map((pit) => (pit.stopSeconds != null ? `${formatDecimal(pit.stopSeconds)} s` : 'n.c.'))
    .join(', ')
}
