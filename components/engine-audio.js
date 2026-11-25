// Son du moteur avec l'API audio du navigateur (Web Audio). Le contexte audio n'est créé qu'au premier `start`,
// appelé depuis le clic sur « Conduire » : les navigateurs refusent tout son avant un geste. Sans Web Audio, tout
// reste muet sans erreur. Les valeurs jouées viennent de lib/engine-sound.js.

import { ENGINE_SOUND, engineSound } from '@/lib/engine-sound'

// Voix du moteur : forme d'onde, multiple de la fréquence d'explosion, désaccord (centièmes de demi-ton), volume.
const VOICES = [
  { type: 'sawtooth', ratio: 1, detune: 0, gain: 0.45 },
  { type: 'sawtooth', ratio: 0.5, detune: 7, gain: 0.35 }, // le grondement
  { type: 'square', ratio: 2, detune: -9, gain: 0.1 },
]
const SMOOTH = 0.03 // s : constante de temps des variations, assez courte pour entendre les passages de rapport
const FADE = 0.05 // s : ouverture et fermeture du volume général

// Construit les sources dans `context` et les relie à `destination`. Utilisable avec un contexte hors ligne (tests).
export function createEngineVoice(context, destination) {
  const sources = []
  const start = (node) => {
    node.start()
    sources.push(node)
    return node
  }
  const gainNode = (value, target) => {
    const node = context.createGain()
    node.gain.value = value
    node.connect(target)
    return node
  }

  const engine = gainNode(0, destination)
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.9
  filter.connect(engine)
  // Écrêtage doux : un peu de grain, comme un échappement.
  const shaper = context.createWaveShaper()
  shaper.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(2.2 * (i / 511.5 - 1)))
  shaper.connect(filter)
  const oscillators = VOICES.map((voice) => {
    const oscillator = context.createOscillator()
    oscillator.type = voice.type
    oscillator.detune.value = voice.detune
    oscillator.connect(gainNode(voice.gain, shaper))
    return { node: start(oscillator), ratio: voice.ratio }
  })

  const turboGain = gainNode(0, destination)
  const turbo = context.createOscillator()
  turbo.type = 'sine'
  turbo.connect(turboGain)
  start(turbo)

  // Vent et roulement : bruit blanc filtré, en boucle.
  const windGain = gainNode(0, destination)
  const band = context.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 600
  band.Q.value = 0.6
  band.connect(windGain)
  const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const samples = noise.getChannelData(0)
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1
  const wind = context.createBufferSource()
  wind.buffer = noise
  wind.loop = true
  wind.connect(band)
  start(wind)

  const glide = (param, value, time) => param.setTargetAtTime(value, time, SMOOTH)

  return {
    apply(values, time = context.currentTime) {
      for (const { node, ratio } of oscillators) glide(node.frequency, values.frequency * ratio, time)
      glide(engine.gain, values.gain, time)
      glide(filter.frequency, values.cutoff, time)
      glide(turbo.frequency, values.turboFrequency, time)
      glide(turboGain.gain, values.turboGain, time)
      glide(windGain.gain, values.windGain, time)
    },
    stop() {
      for (const source of sources) source.stop()
    },
  }
}

export function createEngineAudio() {
  let context = null
  let master = null
  let voice = null
  let running = false // la conduite est en cours
  let paused = false // onglet caché ou scène hors écran : la simulation est arrêtée
  let muted = false
  let suspendTimer = 0

  const audible = () => running && !paused && !muted

  // Ouvre ou ferme le volume selon l'état, et suspend le contexte une fois le silence atteint.
  function sync() {
    if (!context) return
    clearTimeout(suspendTimer)
    master.gain.setTargetAtTime(audible() ? ENGINE_SOUND.volume : 0, context.currentTime, FADE)
    if (audible()) {
      context.resume().catch(() => {}) // refusé sans geste : on reste muet
    } else {
      suspendTimer = setTimeout(() => context?.suspend().catch(() => {}), FADE * 6000)
    }
  }

  function create() {
    const Context = window.AudioContext ?? window.webkitAudioContext
    if (!Context) return
    try {
      context = new Context()
      master = context.createGain()
      master.gain.value = 0
      // Limiteur : la somme des voix ne sature jamais.
      const limiter = context.createDynamicsCompressor()
      master.connect(limiter)
      limiter.connect(context.destination)
      voice = createEngineVoice(context, master)
      voice.apply(engineSound({ rpm: ENGINE_SOUND.idleRpm, throttle: 0, speed: 0 }))
    } catch {
      context?.close().catch(() => {})
      context = master = voice = null
    }
  }

  return {
    // À appeler pendant un geste de la personne (clic, touche).
    start() {
      if (!context) create()
      running = true
      sync()
    },
    stop() {
      running = false
      sync()
    },
    // Appelé à chaque image par la boucle d'affichage : sans changement, on ne touche à rien (sinon la suspension
    // programmée serait repoussée sans fin).
    setPaused(next) {
      if (next === paused) return
      paused = next
      sync()
    },
    setMuted(next) {
      if (next === muted) return
      muted = next
      sync()
    },
    update(values) {
      if (context && audible()) voice.apply(values)
    },
    dispose() {
      clearTimeout(suspendTimer)
      if (!context) return
      voice.stop()
      context.close().catch(() => {})
      context = master = voice = null
    },
  }
}
