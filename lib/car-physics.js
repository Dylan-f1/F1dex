// Dynamique de la monoplace : modèle « bicyclette » à deux essieux, adhérence limitée par un cercle de
// frottement, appui aérodynamique, boîte de vitesses automatique. Module pur, testé avec `node --test`.
//
// Repère de la voiture : u = vitesse vers l'avant, v = vitesse latérale (positive vers la gauche), r = vitesse de
// lacet (positive = la voiture tourne à gauche). Cap et position : voir lib/drive-track.js.
//
// C'est un modèle « arcade réaliste » : les ordres de grandeur sont ceux d'une F1 (0–100 km/h en ~2,6 s,
// ~330 km/h en pointe, ~6 g de freinage et de virage à haute vitesse grâce à l'appui) mais on néglige le
// transfert de charge latéral, les suspensions et le moteur détaillé. Une aide à la stabilité (voir
// `STABILITY_ASSIST`) rend la voiture pilotable au clavier, où le volant n'a que deux positions.

const G = 9.81

export const CAR = {
  mass: 800, // kg, pilote compris
  wheelbase: 3.6, // m
  frontAxle: 2.0, // m, centre de gravité → essieu avant
  rearAxle: 1.6, // m, centre de gravité → essieu arrière
  cgHeight: 0.3, // m, pour le transfert de charge au freinage et à l'accélération
  yawInertia: 1100, // kg·m²
  tyreGrip: 1.9, // coefficient d'adhérence de base
  frontStiffness: 12, // pente de la courbe force/dérive à l'origine, par radian (pneu avant)
  rearStiffness: 16, // plus raide à l'arrière : l'arrière tient avant l'avant (sous-virage, jamais toupie)
  downforce: 2.7, // N par (m/s)² : 2,4 fois le poids à 300 km/h
  frontDownforceShare: 0.45,
  drag: 0.72, // N par (m/s)²
  rolling: 120, // N
  power: 560e3, // W
  engineTorque: 520, // N·m
  wheelRadius: 0.34, // m
  reverseForce: 3500, // N
  reverseMax: 10, // m/s
  engineBraking: 110, // N·m au régime maximal : le frein moteur ralentit la voiture quand on lâche le gaz
  brakeBias: 0.7, // part avant de la demande de freinage : l'avant décroche le premier (sous-virage), jamais l'arrière. À 0,62, l'arrière déchargé bloquait au freinage en virage et la voiture partait en toupie sans aides
}

// Rapports totaux (boîte × pont) : 1re ≈ 80 km/h, 8e ≈ 330 km/h au régime maximal.
export const GEARS = [21, 14.5, 11.2, 9.0, 7.5, 6.4, 5.65, 5.03]
const IDLE_RPM = 5000
const REV_LIMIT = 13000
const UPSHIFT_RPM = 12200
const DOWNSHIFT_RPM = 7000
const SHIFT_TIME = 0.08 // s sans couple pendant un changement de rapport

// Surfaces : multiplicateur d'adhérence, résistance proportionnelle à la vitesse (par seconde) et résistance
// constante (m/s²). Proportionnelle plutôt que constante : l'herbe freine fort à haute vitesse mais laisse
// repartir une voiture arrêtée.
export const SURFACES = {
  asphalt: { grip: 1, drag: 0, rolling: 0 },
  grass: { grip: 0.4, drag: 0.35, rolling: 1.5 },
  // Vibreur : presque autant d'adhérence que l'asphalte, mais la voiture secoue (effet visuel côté affichage).
  kerb: { grip: 0.9, drag: 0, rolling: 0.6 },
  // Gravier : peu d'adhérence et un fort freinage, comme les bacs de dégagement (ils servent à arrêter les voitures).
  gravel: { grip: 0.45, drag: 0.9, rolling: 2.5 },
}

// Aide à la stabilité : la rotation de la voiture est freinée quand elle dépasse celle que demande le volant
// (survirage, toupie). Désactivable pour comparer.
export const STABILITY_ASSIST = { gain: 12, maxTorque: 7000, fullEffectSpeed: 12 }

// Niveaux d'aides, au choix du pilote. `steer` : part de l'angle de braquage qui sature les pneus que le volant
// peut atteindre (en dessous de 1, la direction seule ne fait jamais glisser). `stability` : multiplicateur de
// l'aide à la stabilité. `traction` : anti-patinage actif. `brakeSteer` : part du freinage retirée quand le volant est braqué à fond
// (freinage dégressif en virage : la voiture ralentit tout en continuant de tourner, au lieu de partir tout droit).
export const ASSISTS = {
  high: { steer: 1.0, stability: 1.6, traction: true, brakeSteer: 0.6 },
  normal: { steer: 1.15, stability: 1, traction: true, brakeSteer: 0.4 },
  off: { steer: 1.3, stability: 0, traction: false, brakeSteer: 0.15 },
}
export const DEFAULT_ASSIST = 'high'
// Anti-patinage : la poussée ne peut pas consommer l'adhérence que l'essieu arrière utilise déjà pour tenir la
// trajectoire (force latérale du pas précédent), ni dépasser cette part de l'adhérence totale. Sans lui, un
// clavier (gaz à fond + volant braqué) fait toupiller la voiture.
export const TRACTION_CONTROL = { maxShare: 0.92, lateralMargin: 1.15 }

// Part de l'adhérence latérale qui reste quand la poussée ou le freinage saturent le pneu. Choix d'arcade réglé à
// l'oreille (0,75 : à 0,65 la voiture partait encore en toupie sous les gaz) : il dépasse le cercle de frottement,
// l'arrière saturé donne ici environ 125 % de son adhérence en tout. L'avant garde le plancher bas (0,2) : sinon
// le freinage en virage ferait survirer la voiture.
const LATERAL_FLOOR = 0.75
const FRONT_FLOOR = 0.2
const BRAKE_RATE_PRESS = 5 // par seconde : la pédale s'enfonce en 0,2 s (une touche est tout ou rien)
const BRAKE_RATE_RELEASE = 15
const STEER_RATE_PRESS = 6 // par seconde : le volant suit le clavier avec un léger retard
const STEER_RATE_RELEASE = 10
const MIN_SLIP_SPEED = 4 // m/s : sous cette vitesse, la dérive est calculée avec une vitesse de référence
const MAX_STEER_ANGLE = 0.45 // rad à basse vitesse

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function downforceAt(speed) {
  return CAR.downforce * speed * speed
}

// Accélération latérale maximale (m/s²) à une vitesse donnée : l'appui aérodynamique augmente l'adhérence.
export function maxLateralAccel(speed, surfaceGrip = 1) {
  return (CAR.tyreGrip * surfaceGrip * (CAR.mass * G + downforceAt(speed))) / CAR.mass
}

// Angle de braquage maximal : celui qui suffit à saturer les pneus, avec une marge. À haute vitesse quelques
// degrés suffisent, un volant plus ouvert ne ferait que glisser.
export function maxSteerAngle(speed) {
  const needed = (1.15 * CAR.wheelbase * maxLateralAccel(speed)) / Math.max(speed * speed, 4)
  return clamp(needed, 0.04, MAX_STEER_ANGLE)
}

export function rpmAt(speed, gear) {
  const rpm = ((Math.abs(speed) / CAR.wheelRadius) * GEARS[gear - 1] * 60) / (2 * Math.PI)
  return clamp(rpm, IDLE_RPM, REV_LIMIT)
}

// Poussée à l'arrière à pleine charge, au rapport donné : limitée par le couple en bas, par la puissance en haut.
export function engineForce(speed, gear) {
  const byTorque = (CAR.engineTorque * GEARS[gear - 1]) / CAR.wheelRadius
  const byPower = CAR.power / Math.max(Math.abs(speed), 5)
  return Math.min(byTorque, byPower)
}

// Force de frein moteur à l'arrière, au régime et au rapport donnés : proportionnelle au régime, avec un plancher.
export function engineBrakeForce(rpm, gear) {
  const torque = CAR.engineBraking * clamp(rpm / REV_LIMIT, 0.35, 1)
  return (torque * GEARS[gear - 1]) / CAR.wheelRadius
}

// Sol plat. `forward` et `left` : pente (montée par mètre) vers l'avant et vers la gauche de la voiture ; `load` :
// part du poids qui pèse sur les pneus (plus de 1 dans un creux, moins sur une bosse).
export const FLAT_GROUND = { forward: 0, left: 0, load: 1 }
const HOLD_SPEED = 0.5 // m/s : sous cette vitesse, sans gaz ni frein, la voiture est tenue dans une pente

export function createCarState({ x = 0, z = 0, heading = 0 } = {}) {
  return { x, z, heading, u: 0, v: 0, r: 0, steer: 0, gear: 1, rpm: IDLE_RPM, shift: 0, fx: 0, side: 0, brakePedal: 0 }
}

// Fait avancer la voiture de `dt` secondes (petit : ≤ 1/120 s, l'intégration est explicite).
// `input` : { throttle 0..1, brake 0..1, steer −1..1 (1 = gauche) } ; `surface` : un élément de SURFACES,
// ou une valeur intermédiaire { grip, drag, rolling } quand la voiture est à cheval sur le bord. `surface.tyre` :
// adhérence des pneus montés (gomme et usure, lib/tyres.js), 1 par défaut.
export function stepCar(car, input, surface, dt, ground = FLAT_GROUND) {
  const { mass, wheelbase, frontAxle: a, rearAxle: b } = CAR
  const throttle = clamp(input.throttle ?? 0, 0, 1)
  const brake = clamp(input.brake ?? 0, 0, 1)
  const steerTarget = clamp(input.steer ?? 0, -1, 1)
  const previousPedal = car.brakePedal ?? 0
  const brakeRate = brake > previousPedal ? BRAKE_RATE_PRESS : BRAKE_RATE_RELEASE
  const brakePedal = previousPedal + (brake - previousPedal) * (1 - Math.exp(-brakeRate * dt))
  let { u, v, r, gear, shift } = car
  const tune = ASSISTS[input.assist] ?? ASSISTS[DEFAULT_ASSIST]

  // Volant : suit la consigne avec un retard, se recentre plus vite qu'il ne se braque.
  const rate = Math.abs(steerTarget) > Math.abs(car.steer) ? STEER_RATE_PRESS : STEER_RATE_RELEASE
  const steer = car.steer + (steerTarget - car.steer) * (1 - Math.exp(-rate * dt))
  const speed = Math.abs(u)
  const tyre = surface.tyre ?? 1
  // Des pneus usés réduisent aussi le braquage utile : à volant égal, la voiture sous-vire au lieu de partir en toupie
  // (mesuré sans aides avec des pneus morts : 52° de dérive plein gaz à 200 km/h, 5° ainsi).
  const delta = steer * maxSteerAngle(speed) * tune.steer * Math.min(1, tyre)

  // Boîte automatique.
  let rpm = rpmAt(u, gear)
  if (shift <= 0 && u > 0) {
    if (rpm > UPSHIFT_RPM && gear < GEARS.length) {
      gear += 1
      shift = SHIFT_TIME
    } else if (rpm < DOWNSHIFT_RPM && gear > 1) {
      gear -= 1
      shift = SHIFT_TIME
    }
    rpm = rpmAt(u, gear)
  }
  shift = Math.max(0, shift - dt)

  // Charges verticales : poids, appui aérodynamique, transfert longitudinal (retardé d'un pas).
  const down = downforceAt(speed)
  const transfer = (car.fx * CAR.cgHeight) / wheelbase
  const weight = mass * G * ground.load
  const loadFront = Math.max(300, (weight * b) / wheelbase + CAR.frontDownforceShare * down - transfer)
  const loadRear = Math.max(300, (weight * a) / wheelbase + (1 - CAR.frontDownforceShare) * down + transfer)
  const mu = CAR.tyreGrip * surface.grip * tyre
  const capFront = mu * loadFront
  const capRear = mu * loadRear

  // Demandes longitudinales : poussée à l'arrière, freinage réparti ; S marche arrière quand on est à l'arrêt.
  let drive = 0
  if (throttle > 0 && shift <= 0 && rpm < REV_LIMIT) drive = throttle * engineForce(speed, gear)
  else if (throttle === 0 && brake > 0 && u <= 0.5 && u > -CAR.reverseMax) drive = -CAR.reverseForce * brake
  // Frein moteur : en ligne droite seulement. Volant braqué, il chargerait l'arrière déjà sollicité et ferait partir la
  // voiture en toupie quand on lâche le gaz en virage (mesuré sans aides à 120, 200 et 260 km/h).
  else if (throttle === 0 && u > 0.5) drive = -engineBrakeForce(rpm, gear) * (1 - Math.min(1, Math.abs(steer) * 4))
  // Freinage : pédale progressive, et moins de force quand le volant est braqué (il ne reste sinon pas d'adhérence
  // pour freiner ET tourner).
  const brakeForce = brakePedal * (1 - tune.brakeSteer * Math.abs(steer))
  const brakeTotal = brake > 0 && u > 0.5 ? brakeForce * mu * (weight + down) : 0
  const forceFront = clamp(-brakeTotal * CAR.brakeBias, -capFront, capFront)
  const lateralUsed = Math.min(Math.abs(car.side) * TRACTION_CONTROL.lateralMargin, capRear)
  const driveRoom = tune.traction
    ? Math.min(TRACTION_CONTROL.maxShare * capRear, Math.sqrt(capRear ** 2 - lateralUsed ** 2))
    : capRear
  const driveLimited = clamp(drive, -driveRoom, driveRoom)
  const forceRear = clamp(driveLimited - brakeTotal * (1 - CAR.brakeBias), -capRear, capRear)

  // Cercle de frottement : la force longitudinale demandée réduit l'adhérence latérale restante.
  const lateralFront = Math.sqrt(Math.max(capFront ** 2 - forceFront ** 2, (FRONT_FLOOR * capFront) ** 2))
  const lateralRear = Math.sqrt(Math.max(capRear ** 2 - forceRear ** 2, (LATERAL_FLOOR * capRear) ** 2))

  // Dérives (angle entre la direction des roues et celle où elles roulent). À l'arrêt le braquage ne crée
  // aucune dérive : la voiture ne pivote pas sur place.
  const slipSpeed = Math.max(speed, MIN_SLIP_SPEED)
  const direction = u >= 0 ? 1 : -1
  const slipFront = Math.atan2(v + a * r, slipSpeed) - delta * direction * (speed / slipSpeed)
  const slipRear = Math.atan2(v - b * r, slipSpeed)
  const sideFront = -lateralFront * Math.tanh(CAR.frontStiffness * slipFront)
  const sideRear = -lateralRear * Math.tanh(CAR.rearStiffness * slipRear)

  // Aide à la stabilité : freine l'excès de lacet par rapport à ce que demande le volant.
  const wantedYaw = (u * Math.tan(delta)) / wheelbase
  const excess = r - wantedYaw
  const speedFactor = clamp(speed / STABILITY_ASSIST.fullEffectSpeed, 0, 1)
  const maxAssist = STABILITY_ASSIST.maxTorque * Math.max(1, tune.stability)
  const assist =
    excess * r > 0
      ? clamp(-CAR.yawInertia * STABILITY_ASSIST.gain * tune.stability * excess * speedFactor, -maxAssist, maxAssist)
      : 0

  // Pesanteur dans la pente : elle retient en montée, entraîne en descente et tire sur le côté en dévers.
  const held = speed < HOLD_SPEED && throttle === 0 && brake === 0
  const incline = held ? 0 : G / Math.sqrt(1 + ground.forward ** 2 + ground.left ** 2)

  const forceX = forceFront + forceRear - sideFront * Math.sin(delta)
  u += (forceX / mass + r * v - incline * ground.forward) * dt
  v += ((sideFront * Math.cos(delta) + sideRear) / mass - r * u - incline * ground.left) * dt
  r += ((a * sideFront * Math.cos(delta) - b * sideRear + assist) / CAR.yawInertia) * dt

  // Résistances (roulement, traînée, herbe) : elles ralentissent mais ne font jamais changer de sens.
  const resist = ((CAR.rolling + CAR.drag * u * u) / mass + surface.rolling + surface.drag * Math.abs(u)) * dt
  u = Math.abs(u) <= resist ? 0 : u - Math.sign(u) * resist
  // Latéralement, l'herbe freine aussi.
  if (surface.drag > 0) v -= v * Math.min(1, surface.drag * dt)

  const heading = car.heading + r * dt
  const x = car.x + (u * Math.cos(heading) - v * Math.sin(heading)) * dt
  const z = car.z - (u * Math.sin(heading) + v * Math.cos(heading)) * dt
  return { x, z, heading, u, v, r, steer, gear, rpm, shift, fx: forceFront + forceRear, side: sideRear, brakePedal }
}
