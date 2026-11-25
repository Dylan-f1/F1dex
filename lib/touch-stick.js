// Joystick de direction au doigt : un seul axe (gauche-droite). Logique pure, sans DOM.

export const STICK = {
  travel: 48, // px de glissement pour braquer à fond
  deadZone: 0.12, // part de la course sans effet : un pouce posé ne fait pas dévier la voiture
  curve: 1.5, // > 1 : corrections plus fines près du centre
}

// `ratio` : glissement rapporté à la course (−1..1, négatif vers la gauche). Renvoie le volant (1 = gauche).
export function stickSteer(ratio) {
  const amount = Math.min(1, Math.abs(ratio))
  if (!(amount > STICK.deadZone)) return 0
  return -Math.sign(ratio) * ((amount - STICK.deadZone) / (1 - STICK.deadZone)) ** STICK.curve
}

// Position du doigt `x` par rapport au point d'appui `origin`. Au-delà de la course, le point d'appui suit le doigt :
// repartir dans l'autre sens agit tout de suite, sans devoir revenir jusqu'au départ.
export function dragStick(origin, x, travel = STICK.travel) {
  const offset = Math.max(-travel, Math.min(travel, x - origin))
  return { origin: x - offset, offset, steer: stickSteer(offset / travel) }
}
