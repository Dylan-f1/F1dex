// Pilote automatique pour les tests : suit la ligne centrale (poursuite de point) à la vitesse que permettent
// la courbure et l'adhérence, en freinant à l'avance. Il n'est pas un bon pilote, juste un pilote prudent : s'il
// ne boucle pas un tour, c'est que la physique ou la piste ont un défaut.
import { CAR, maxSteerAngle } from '../lib/car-physics.js'
import { pointAt } from '../lib/drive-track.js'

const BRAKE_DECEL = 20 // m/s², prudent par rapport aux ~50 possibles (le freinage réparti plus à l'avant fait sous-virer si on freine tard en virage)
const SPEED_CAP = 100

export function makePilot(track, { grip = 0.7 } = {}) {
  const count = track.points.length
  const downforcePerMass = CAR.downforce / CAR.mass
  const mu = CAR.tyreGrip * grip
  const limit = track.curvature.map((curvature) => {
    const denominator = Math.abs(curvature) - mu * downforcePerMass
    return denominator <= 1e-6 ? SPEED_CAP : Math.min(SPEED_CAP, Math.sqrt((mu * 9.81) / denominator))
  })
  // Le plus lent des voisins immédiats (le lissage de la courbure ne doit pas masquer un virage serré).
  const guarded = limit.map((_, index) =>
    Math.min(...[-3, -2, -1, 0, 1, 2, 3].map((offset) => limit[(index + offset + count) % count])),
  )
  // Freinage anticipé : on remonte la piste en limitant la vitesse à ce dont on peut ralentir (deux passes pour boucler).
  for (let pass = 0; pass < 2; pass += 1) {
    for (let index = count - 1; index >= 0; index -= 1) {
      const ahead = guarded[(index + 1) % count]
      guarded[index] = Math.min(guarded[index], Math.sqrt(ahead * ahead + 2 * BRAKE_DECEL * track.spacing))
    }
  }

  return function pilot(state) {
    const speed = Math.hypot(state.u, state.v)
    const lookAhead = 8 + 0.45 * speed
    const target = pointAt(track, state.s + lookAhead)
    const wanted = Math.atan2(-(target.z - state.z), target.x - state.x)
    const error = Math.atan2(Math.sin(wanted - state.heading), Math.cos(wanted - state.heading))
    const angle = Math.atan2(2 * CAR.wheelbase * Math.sin(error), lookAhead)
    const steer = Math.max(-1, Math.min(1, angle / maxSteerAngle(speed)))
    const wrapped = ((state.s % track.length) + track.length) % track.length
    const cap = guarded[Math.floor(wrapped / track.spacing) % count]
    return {
      throttle: speed < cap ? 1 : 0,
      brake: speed > cap + 1 ? Math.min(1, (speed - cap) / 4) : 0,
      steer,
    }
  }
}
