// Relief d'une piste : altitude, pente et courbure verticale le long de la ligne centrale. Module pur, testé avec
// `node --test`. Une piste sans relief vaut 0 partout.
//
// `profile` : altitudes en mètres à intervalles réguliers le long du tracé, depuis son premier point
// (lib/relief-data.js, mesurées par OpenF1).

const SMOOTHING_PASSES = 12 // lisse les cassures entre deux relevés espacés d'environ 20 m
const BEND_REACH = 10 // m de part et d'autre pour mesurer la courbure verticale

// Circuit fictif : relief inventé (environ 14 m), plat au départ.
export const FICTIVE_RELIEF = Array.from({ length: 48 }, (_, index) => {
  const turn = (2 * Math.PI * (index + 0.5)) / 48
  return Math.round((14 * ((1 - Math.cos(turn)) / 2) + 2.5 * ((1 - Math.cos(2 * turn)) / 2)) * 100) / 100
})

const at = (values, index) => values[((index % values.length) + values.length) % values.length]

// Relief aux points de la piste : { heights, grade (montée par mètre), bend (variation de pente par mètre, positive
// dans un creux, négative sur une bosse), min, max }. Renvoie null si le profil est inutilisable.
export function buildRelief({ cumulative, length, points }, profile) {
  if (!Array.isArray(profile) || profile.length < 4 || profile.some((value) => !Number.isFinite(value))) return null
  const count = points.length
  const spacing = length / count
  // Chaque relevé représente le milieu de son intervalle.
  let heights = points.map((_, index) => {
    const position = (cumulative[index] / length) * profile.length - 0.5
    const first = Math.floor(position)
    const share = position - first
    return at(profile, first) * (1 - share) + at(profile, first + 1) * share
  })
  for (let pass = 0; pass < SMOOTHING_PASSES; pass += 1) {
    const current = heights
    heights = current.map((value, index) => (at(current, index - 1) + 2 * value + at(current, index + 1)) / 4)
  }
  const grade = heights.map((_, index) => (at(heights, index + 1) - at(heights, index - 1)) / (2 * spacing))
  const reach = Math.max(1, Math.round(BEND_REACH / spacing))
  const bend = grade.map((_, index) => (at(grade, index + reach) - at(grade, index - reach)) / (2 * reach * spacing))
  return { heights, grade, bend, min: Math.min(...heights), max: Math.max(...heights) }
}

// Valeur interpolée à l'abscisse `s` d'un des tableaux du relief.
function sample(track, values, s) {
  const { cumulative, length, points } = track
  const wrapped = ((s % length) + length) % length
  let index = Math.min(points.length - 1, Math.floor((wrapped / length) * points.length))
  while (index > 0 && cumulative[index] > wrapped) index -= 1
  while (index < points.length - 1 && cumulative[index + 1] <= wrapped) index += 1
  const span = cumulative[index + 1] - cumulative[index]
  const share = span === 0 ? 0 : (wrapped - cumulative[index]) / span
  return values[index] * (1 - share) + at(values, index + 1) * share
}

export const heightAt = (track, s) => (track.relief ? sample(track, track.relief.heights, s) : 0)
export const gradeAt = (track, s) => (track.relief ? sample(track, track.relief.grade, s) : 0)
export const bendAt = (track, s) => (track.relief ? sample(track, track.relief.bend, s) : 0)
