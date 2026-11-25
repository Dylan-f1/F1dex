// Bruit déterministe pour le décor de la conduite (textures, nuages, montagnes). Module pur, testé.

// Générateur pseudo-aléatoire : la même graine (texte ou nombre) donne toujours la même suite dans [0, 1[.
export function seededRandom(seed) {
  let hash = 2166136261
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  let state = hash >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const ease = (t) => t * t * (3 - 2 * t)
const wrap = (value, period) => (period ? ((value % period) + period) % period : value)

// Bruit « de valeurs » à deux dimensions, dans [0, 1]. Avec `period` (entier), il se répète sans couture tous les
// `period` en x et en y : c'est ce qu'il faut pour une texture répétée.
export function createNoise(seed) {
  const salt = Math.floor(seededRandom(seed)() * 0x7fffffff)
  const corner = (x, y) => {
    let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ salt
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295
  }
  return (x, y, period = 0) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const tx = ease(x - x0)
    const ty = ease(y - y0)
    const left = wrap(x0, period)
    const right = wrap(x0 + 1, period)
    const top = wrap(y0, period)
    const bottom = wrap(y0 + 1, period)
    const upper = corner(left, top) + (corner(right, top) - corner(left, top)) * tx
    const lower = corner(left, bottom) + (corner(right, bottom) - corner(left, bottom)) * tx
    return upper + (lower - upper) * ty
  }
}

// Somme d'octaves (détails de plus en plus fins), ramenée dans [0, 1]. La période double avec la fréquence.
export function fbm(noise, x, y, octaves = 4, period = 0) {
  let total = 0
  let weight = 0
  let amplitude = 1
  let frequency = 1
  for (let octave = 0; octave < octaves; octave += 1) {
    total += noise(x * frequency, y * frequency, period * frequency) * amplitude
    weight += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return total / weight
}
