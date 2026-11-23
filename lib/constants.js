export const SEASON_YEAR = 2025
export const OPENF1_BASE_URL = 'https://api.openf1.org/v1'
// Tracés de circuit (API non officielle de MultiViewer, sans limite de débit connue).
export const MULTIVIEWER_CIRCUITS_URL = 'https://api.multiviewer.app/api/v1/circuits'
export const TRACK_FETCH_TIMEOUT_MS = 8000

// OpenF1 limite le débit : on réessaie quelques fois avant d'abandonner.
export const MAX_FETCH_ATTEMPTS = 5
export const RETRY_BASE_DELAY_MS = 1500
export const MIN_REQUEST_INTERVAL_MS = 500

export const FIRST_LAP_NUMBER = 1

export const TYRES = {
  SOFT: { label: 'Tendre', letter: 'S', className: 'bg-tyre-soft text-white' },
  MEDIUM: { label: 'Medium', letter: 'M', className: 'bg-tyre-medium text-bg' },
  HARD: { label: 'Dur', letter: 'H', className: 'bg-tyre-hard text-bg' },
  INTERMEDIATE: { label: 'Intermédiaire', letter: 'I', className: 'bg-tyre-intermediate text-bg' },
  WET: { label: 'Pluie', letter: 'P', className: 'bg-tyre-wet text-white' },
  UNKNOWN: { label: 'Inconnu', letter: '?', className: 'bg-tyre-unknown text-bg' },
}

export const LEGEND_COMPOUNDS = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET']

// Largeur minimale d'un relais pour y afficher la lettre du pneu (en % de la course).
export const MIN_STINT_WIDTH_FOR_LETTER_PERCENT = 7

export const COUNTRY_NAMES_FR = {
  'United States': 'États-Unis',
  Australia: 'Australie',
  China: 'Chine',
  Japan: 'Japon',
  'Saudi Arabia': 'Arabie saoudite',
  Italy: 'Italie',
  Spain: 'Espagne',
  Austria: 'Autriche',
  'United Kingdom': 'Royaume-Uni',
  Belgium: 'Belgique',
  Hungary: 'Hongrie',
  Netherlands: 'Pays-Bas',
  Azerbaijan: 'Azerbaïdjan',
  Mexico: 'Mexique',
  Brazil: 'Brésil',
  Qatar: 'Qatar',
  'United Arab Emirates': 'Émirats arabes unis',
  Canada: 'Canada',
  Monaco: 'Monaco',
  Bahrain: 'Bahreïn',
  Singapore: 'Singapour',
}
