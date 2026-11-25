// Réglages du son moteur (module pur, testé avec `node --test`) : de l'état de la voiture aux fréquences et volumes
// joués par components/engine-audio.js. Son synthétisé, aucun enregistrement. Tout le timbre se règle ici et dans
// la liste des voix de engine-audio.js.

export const ENGINE_SOUND = {
  cylinders: 6, // V6 quatre temps : trois explosions par tour de vilebrequin
  idleRpm: 5000,
  revLimit: 13000,
  gridRpm: 11500, // plein gaz à l'arrêt, pendant les feux
  launchRpm: 9500, // plein gaz en 1re : le moteur monte avant la voiture (patinage d'embrayage)
  shiftCut: 0.35, // volume restant pendant un changement de rapport
  volume: 0.22, // volume général (1 = maximum sans saturation)
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// Régime entendu : celui de la physique, sauf à l'arrêt sous les feux (le pilote peut donner des coups de gaz) et
// au démarrage en 1re. `previous` : régime entendu à l'image précédente.
export function soundRevs(previous, { phase, rpm, gear, throttle }, dt) {
  const { idleRpm, gridRpm, launchRpm } = ENGINE_SOUND
  const load = clamp(throttle, 0, 1)
  let target = rpm
  if (phase === 'lights') target = idleRpm + load * (gridRpm - idleRpm)
  else if (gear === 1) target = Math.max(rpm, idleRpm + load * (launchRpm - idleRpm))
  else return rpm
  const rate = target > previous ? 9 : 5 // par seconde : le moteur monte plus vite qu'il ne redescend
  return previous + (target - previous) * (1 - Math.exp(-rate * Math.max(0, dt)))
}

// `speed` en m/s ; `shifting` pendant la coupure d'un changement de rapport.
export function engineSound({ rpm, throttle, speed, shifting = false }) {
  const { cylinders, idleRpm, revLimit, shiftCut } = ENGINE_SOUND
  const revs = clamp((rpm - idleRpm) / (revLimit - idleRpm), 0, 1)
  const load = clamp(throttle, 0, 1)
  return {
    frequency: (clamp(rpm, idleRpm, revLimit) / 60) * (cylinders / 2), // Hz
    gain: (0.4 + 0.6 * load) * (0.75 + 0.25 * revs) * (shifting ? shiftCut : 1),
    cutoff: 700 + 1300 * revs + 3200 * load, // Hz : le son s'ouvre quand on accélère
    turboFrequency: 1800 + 3400 * revs,
    turboGain: 0.05 * load * revs,
    windGain: 0.3 * clamp(Math.abs(speed) / 90, 0, 1) ** 2,
  }
}
