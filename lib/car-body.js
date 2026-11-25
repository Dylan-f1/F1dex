// Monoplace construite en code, à comparer au modèle IA (adresse /garage?voiture=code) : carrosserie en surfaces
// lissées (sections successives), ailerons au profil d'aile, bras et halo en tubes. Module pur (aucun three.js),
// testé avec `node --test` ; components/car-body-mesh.js en fait des maillages. Les roues sont à part
// (components/car-wheel-geometry.js).
//
// Repère : mètres, x vers l'avant, y vers le haut, z vers la droite. Cotes du règlement 2022-2025 : 2 m de large,
// 3,6 m d'empattement, pneus de 0,72 m (305 mm devant, 405 mm derrière).
//
// Matières : livery (couleur principale), wing (ailerons), trim (bout du nez, liserés), spine (arête du capot),
// carbon, helmet.

const FRONT = { x: 1.8, radius: 0.36, width: 0.305, z: 0.8475 }
const REAR = { x: -1.8, radius: 0.36, width: 0.405, z: 0.7975 }

export const CODE_CAR_WHEELS = [
  { id: 'avant-droite', front: true, side: 1 },
  { id: 'avant-gauche', front: true, side: -1 },
  { id: 'arriere-droite', front: false, side: 1 },
  { id: 'arriere-gauche', front: false, side: -1 },
].map(({ id, front, side }) => {
  const axle = front ? FRONT : REAR
  return { id, front, radius: axle.radius, width: axle.width, position: [axle.x, axle.radius, side * axle.z] }
})

const SIDES = [-1, 1]

const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a) => {
  const length = Math.hypot(...a)
  return length < 1e-12 ? [0, 1, 0] : [a[0] / length, a[1] / length, a[2] / length]
}
const mean = (points) => [0, 1, 2].map((axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length)

// Interpolation lisse (Catmull-Rom) entre `b` et `c`.
const spline = (a, b, c, d, t) =>
  0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)

// Ajoute `steps` points entre chaque paire d'une liste de vecteurs.
function refine(rows, steps) {
  const result = []
  for (let index = 0; index < rows.length - 1; index += 1) {
    const [a, b, c, d] = [index - 1, index, index + 1, index + 2].map((at) => rows[Math.max(0, Math.min(rows.length - 1, at))])
    for (let step = 0; step < steps; step += 1) result.push(b.map((_, axis) => spline(a[axis], b[axis], c[axis], d[axis], step / steps)))
  }
  result.push(rows[rows.length - 1])
  return result
}

// Découpe un polygone simple [[u, v], …] en triangles (méthode des oreilles).
export function triangulate(outline) {
  const area = outline.reduce((sum, [u, v], index) => {
    const [nu, nv] = outline[(index + 1) % outline.length]
    return sum + u * nv - nu * v
  }, 0)
  const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const remaining = outline.map((_, index) => index)
  if (area < 0) remaining.reverse()
  const triangles = []
  while (remaining.length > 3) {
    const ear = remaining.findIndex((current, at) => {
      const before = remaining[(at - 1 + remaining.length) % remaining.length]
      const after = remaining[(at + 1) % remaining.length]
      const [a, b, c] = [outline[before], outline[current], outline[after]]
      if (turn(a, b, c) <= 0) return false
      return !remaining.some((other) => {
        if (other === before || other === current || other === after) return false
        const point = outline[other]
        return turn(a, b, point) >= 0 && turn(b, c, point) >= 0 && turn(c, a, point) >= 0
      })
    })
    if (ear === -1) break
    triangles.push([remaining[(ear - 1 + remaining.length) % remaining.length], remaining[ear], remaining[(ear + 1) % remaining.length]])
    remaining.splice(ear, 1)
  }
  if (remaining.length === 3) triangles.push([...remaining])
  return triangles
}

function createBuilder() {
  const parts = {}
  const bucket = (role) => (parts[role] ??= { positions: [], normals: [], indices: [] })
  const roleOf = (role, point) => (typeof role === 'function' ? role(point) : role)

  // Triangle à normales données (une par sommet).
  function triangle(role, corners, normals) {
    const target = bucket(role)
    const first = target.positions.length / 3
    for (let index = 0; index < 3; index += 1) {
      target.positions.push(...corners[index])
      target.normals.push(...normals[index])
    }
    target.indices.push(first, first + 1, first + 2)
  }

  // Face plane tournée du côté `outward`.
  function flat(role, corners, outward) {
    let normal = unit(cross(subtract(corners[1], corners[0]), subtract(corners[2], corners[0])))
    let ordered = corners
    if (dot(normal, outward) < 0) {
      ordered = [corners[0], corners[2], corners[1]]
      normal = normal.map((value) => -value)
    }
    triangle(role, ordered, [normal, normal, normal])
  }

  // Surface tendue entre des contours fermés successifs (même nombre de points), aux normales lissées. `role` : nom,
  // ou fonction du centre de chaque facette. `caps` : matières des deux bouts.
  function skin(rings, role, caps = []) {
    const count = rings[0].length
    const centres = rings.map(mean)
    const normals = rings.map((ring) => ring.map(() => [0, 0, 0]))
    const quads = []
    let outward = 0
    for (let row = 0; row < rings.length - 1; row += 1) {
      for (let k = 0; k < count; k += 1) {
        const next = (k + 1) % count
        const corners = [rings[row][k], rings[row + 1][k], rings[row + 1][next], rings[row][next]]
        // Normale du quadrilatère par ses diagonales : elle reste définie si deux sommets se confondent.
        const normal = cross(subtract(corners[2], corners[0]), subtract(corners[3], corners[1]))
        const centre = mean(corners)
        outward += dot(normal, subtract(centre, mean([centres[row], centres[row + 1]])))
        for (const [r, at] of [[row, k], [row + 1, k], [row + 1, next], [row, next]]) {
          normals[r][at] = normals[r][at].map((value, axis) => value + normal[axis])
        }
        quads.push({ row, k, next, centre })
      }
    }
    const sign = outward < 0 ? -1 : 1
    const smooth = normals.map((ring) => ring.map((normal) => unit(normal.map((value) => value * sign))))
    for (const { row, k, next, centre } of quads) {
      const name = roleOf(role, centre)
      let corners = [[row, k], [row + 1, k], [row + 1, next], [row, next]]
      if (sign < 0) corners = [corners[0], corners[3], corners[2], corners[1]]
      for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
        const chosen = [corners[a], corners[b], corners[c]]
        triangle(name, chosen.map(([r, at]) => rings[r][at]), chosen.map(([r, at]) => smooth[r][at]))
      }
    }
    const ends = [
      [0, 1, caps[0]],
      [rings.length - 1, rings.length - 2, caps[1]],
    ]
    for (const [end, inner, name] of ends) {
      if (!name) continue
      const away = subtract(centres[end], centres[inner])
      for (let k = 0; k < count; k += 1) flat(name, [centres[end], rings[end][k], rings[end][(k + 1) % count]], away)
    }
  }

  // Carrosserie : sections successives [x, zMin, zMax, bas, haut, galbe] (galbe 2 = ellipse, plus = plus carré),
  // reliées par des courbes lisses.
  function body(sections, role, { caps, segments = 36, steps = 6 } = {}) {
    const rings = refine(sections, steps).map(([x, zMin, zMax, bottom, top, shape]) =>
      Array.from({ length: segments }, (_, index) => {
        const angle = (2 * Math.PI * index) / segments
        const bend = (value) => Math.sign(value) * Math.abs(value) ** (2 / shape)
        return [
          x,
          (bottom + top) / 2 + ((top - bottom) / 2) * bend(Math.sin(angle)),
          (zMin + zMax) / 2 + ((zMax - zMin) / 2) * bend(Math.cos(angle)),
        ]
      }),
    )
    skin(rings, role, caps)
  }

  // Tube le long d'une courbe passant par `points`.
  function tube(points, radius, role, { segments = 8, steps = 6, caps = true } = {}) {
    const path = points.length > 2 ? refine(points, steps) : points
    const rings = path.map((point, index) => {
      const along = unit(subtract(path[Math.min(path.length - 1, index + 1)], path[Math.max(0, index - 1)]))
      const side = unit(cross(along, Math.abs(along[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
      const up = cross(side, along)
      return Array.from({ length: segments }, (_, k) => {
        const angle = (2 * Math.PI * k) / segments
        return point.map((value, axis) => value + radius * (Math.cos(angle) * side[axis] + Math.sin(angle) * up[axis]))
      })
    })
    const end = caps && (typeof role === 'string' ? role : 'carbon')
    skin(rings, role, end ? [end, end] : [])
  }

  // Plaque d'épaisseur constante. `axis` 'z' : contour de profil [x, y], épaisseur selon z ; `axis` 'y' : contour en
  // plan [x, z], épaisseur selon y.
  function plate(outline, axis, from, to, role) {
    const place = ([u, v], depth) => (axis === 'z' ? [u, v, depth] : [u, depth, v])
    const out = (sign) => (axis === 'z' ? [0, 0, sign] : [0, sign, 0])
    for (const triangleIndices of triangulate(outline)) {
      flat(role, triangleIndices.map((index) => place(outline[index], from)), out(-1))
      flat(role, triangleIndices.map((index) => place(outline[index], to)), out(1))
    }
    const area = outline.reduce((sum, [u, v], index) => {
      const [nu, nv] = outline[(index + 1) % outline.length]
      return sum + u * nv - nu * v
    }, 0)
    outline.forEach((point, index) => {
      const after = outline[(index + 1) % outline.length]
      // Normale du chant dans le plan du contour, vers l'extérieur.
      const edge = [(after[1] - point[1]) * Math.sign(area), -(after[0] - point[0]) * Math.sign(area)]
      const outward = place(edge, 0)
      const corners = [place(point, from), place(after, from), place(after, to), place(point, to)]
      flat(role, [corners[0], corners[1], corners[2]], outward)
      flat(role, [corners[0], corners[2], corners[3]], outward)
    })
  }

  // Élément d'aileron : profil d'aile tendu entre les écarts `from` et `to`. `lead` : x du bord d'attaque au centre ;
  // `angle` relève le bord de fuite ; `sweep` recule les extrémités (à `span` du centre).
  function wing({ lead, chord, y, angle, thickness, from, to, span, sweep = 0, role }) {
    const UPPER = [0, 0.04, 0.14, 0.32, 0.55, 0.78, 1]
    const half = (u) => thickness * 1.6 * Math.sqrt(u) * (1 - u) + 0.0015
    const profile = [
      ...UPPER.map((u) => [u, half(u)]),
      ...UPPER.toReversed().map((u) => [u, -half(u)]),
    ]
    const steps = 18
    const rings = Array.from({ length: steps + 1 }, (_, index) => {
      const z = from + ((to - from) * index) / steps
      const back = sweep * (z / span) ** 2
      return profile.map(([u, v]) => [
        lead - back - u * chord * Math.cos(angle) + v * Math.sin(angle),
        y + u * chord * Math.sin(angle) + v * Math.cos(angle),
        z,
      ])
    })
    skin(rings, role, [role, role])
  }

  return { parts, body, tube, plate, wing }
}

// Arête du capot : bande étroite sur le dessus.
const engineCover = ([x, y, z]) => (Math.abs(z) < 0.055 && x > -1.7 && y > 0.45 ? 'spine' : 'livery')
const nose = ([x, y, z]) => {
  if (x > 2.45) return 'trim'
  const cockpit = x > 0.06 && x < 0.86 && y > 0.54 && Math.abs(z) < 0.2
  return cockpit ? 'carbon' : 'livery'
}

export function buildCodeCarBody() {
  const car = createBuilder()
  const { body, tube, plate, wing, parts } = car

  // Nez et coque : [x, zMin, zMax, bas, haut, galbe]
  const section = (x, halfWidth, bottom, top, shape = 3) => [x, -halfWidth, halfWidth, bottom, top, shape]
  body(
    [
      section(2.82, 0.03, 0.2, 0.24, 2),
      section(2.7, 0.08, 0.185, 0.285, 2.4),
      section(2.4, 0.115, 0.195, 0.35),
      section(1.8, 0.16, 0.23, 0.47),
      section(1.35, 0.21, 0.19, 0.56),
      section(0.95, 0.265, 0.13, 0.62, 3.4),
      section(0.55, 0.3, 0.09, 0.6, 3.6),
      section(0.1, 0.31, 0.09, 0.6, 3.6),
      section(-0.3, 0.27, 0.09, 0.6, 3.4),
    ],
    nose,
    { caps: ['trim', 'livery'], segments: 44, steps: 8 },
  )

  // Capot moteur, de la prise d'air à la boîte.
  body(
    [
      section(0.02, 0.115, 0.66, 0.955, 2.3),
      section(-0.25, 0.16, 0.45, 0.945, 2.5),
      section(-0.62, 0.215, 0.3, 0.82, 2.8),
      section(-1.05, 0.2, 0.2, 0.65),
      section(-1.5, 0.145, 0.16, 0.5),
      section(-1.95, 0.085, 0.18, 0.39, 2.6),
      section(-2.2, 0.05, 0.21, 0.33, 2.4),
    ],
    engineCover,
    { caps: ['carbon', 'carbon'], segments: 44 },
  )

  // Pontons : entrée d'air à l'avant, flancs creusés, descente vers l'arrière.
  for (const side of SIDES) {
    const pod = (x, inner, outer, bottom, top, shape = 3.4) =>
      [x, Math.min(side * inner, side * outer), Math.max(side * inner, side * outer), bottom, top, shape]
    body(
      [
        pod(0.78, 0.31, 0.72, 0.37, 0.605, 5),
        pod(0.6, 0.27, 0.77, 0.31, 0.615, 4.6),
        pod(0.12, 0.21, 0.775, 0.19, 0.6, 4),
        pod(-0.42, 0.16, 0.69, 0.115, 0.52, 3.6),
        pod(-0.92, 0.1, 0.5, 0.095, 0.41),
        pod(-1.4, 0.06, 0.33, 0.095, 0.29, 3),
        pod(-1.72, 0.03, 0.2, 0.1, 0.22, 2.6),
      ],
      'livery',
      { caps: ['carbon', 'livery'] },
    )
  }

  // Arête dorsale, caméra embarquée.
  plate([[-0.5, 0.8], [-0.95, 0.77], [-1.85, 0.6], [-2.02, 0.4], [-1.45, 0.47], [-0.85, 0.66]], 'z', -0.008, 0.008, 'spine')
  body([section(0.04, 0.012, 0.975, 0.99, 2), section(-0.05, 0.095, 0.985, 1.015, 3), section(-0.2, 0.012, 0.99, 1.0, 2)], 'carbon', { segments: 20 })
  tube([[-0.08, 0.93, 0], [-0.08, 0.995, 0]], 0.022, 'carbon')

  // Halo, casque, rétroviseurs.
  tube([[1.04, 0.57, 0], [0.95, 0.73, 0], [0.82, 0.845, 0]], 0.028, 'carbon')
  for (const side of SIDES) {
    tube(
      [[0.86, 0.835, 0], [0.7, 0.87, side * 0.15], [0.42, 0.86, side * 0.265], [0.12, 0.8, side * 0.295], [-0.08, 0.62, side * 0.27]],
      0.028,
      'carbon',
    )
    tube([[0.82, 0.56, side * 0.27], [0.84, 0.64, side * 0.52]], 0.01, 'carbon')
    plate([[0.8, 0.625], [0.88, 0.63], [0.87, 0.685], [0.81, 0.69]], 'z', Math.min(side * 0.51, side * 0.66), Math.max(side * 0.51, side * 0.66), 'livery')
  }
  body(
    [
      section(0.455, 0.012, 0.69, 0.72, 2),
      section(0.42, 0.095, 0.62, 0.795, 2),
      section(0.31, 0.135, 0.58, 0.84, 2),
      section(0.2, 0.11, 0.6, 0.81, 2),
      section(0.155, 0.012, 0.69, 0.72, 2),
    ],
    'helmet',
    { segments: 28 },
  )
  tube(
    [[0.345, 0.735, -0.134], [0.428, 0.732, -0.09], [0.456, 0.73, 0], [0.428, 0.732, 0.09], [0.345, 0.735, 0.134]],
    0.026,
    'carbon',
  )

  // Fond plat, liserés, déflecteurs, diffuseur.
  const floor = [[1.15, 0.2], [0.75, 0.46], [0.55, 0.8], [-1.18, 0.8], [-1.42, 0.6], [-2.12, 0.54]]
  plate([...floor, ...floor.toReversed().map(([x, z]) => [x, -z])], 'y', 0.055, 0.085, 'carbon')
  for (const side of SIDES) {
    plate([[0.52, side * 0.765], [-1.16, side * 0.765], [-1.16, side * 0.805], [0.52, side * 0.805]], 'y', 0.084, 0.108, 'trim')
    for (const [at, length] of [[0.34, 0.42], [0.48, 0.34], [0.62, 0.22]]) {
      plate([[1.06, 0.085], [1.06 - length, 0.085], [1.06 - length, 0.2], [0.98, 0.13]], 'z', side * at - 0.007, side * at + 0.007, 'carbon')
    }
  }
  plate([[-2.1, 0.056], [-2.54, 0.235], [-2.54, 0.262], [-2.1, 0.086]], 'z', -0.5, 0.5, 'carbon')
  for (const at of [-0.49, -0.33, -0.16, 0.16, 0.33, 0.49]) {
    plate([[-2.1, 0.056], [-2.54, 0.056], [-2.54, 0.25], [-2.1, 0.08]], 'z', at - 0.006, at + 0.006, 'carbon')
  }

  // Structure arrière et feu de pluie.
  body([section(-2.0, 0.08, 0.2, 0.34), section(-2.35, 0.065, 0.24, 0.35), section(-2.56, 0.045, 0.27, 0.33)], 'carbon', {
    caps: ['carbon', 'spine'],
    segments: 20,
  })

  // Aileron avant : un plan principal et trois volets de chaque côté du nez, dérives.
  wing({ lead: 2.93, chord: 0.33, y: 0.085, angle: 0.07, thickness: 0.016, from: -0.985, to: 0.985, span: 0.985, sweep: 0.09, role: 'carbon' })
  const flaps = [
    { lead: 2.72, chord: 0.23, y: 0.128, angle: 0.26, role: 'wing' },
    { lead: 2.58, chord: 0.18, y: 0.178, angle: 0.42, role: 'wing' },
    { lead: 2.47, chord: 0.14, y: 0.228, angle: 0.58, role: 'trim' },
  ]
  for (const flap of flaps) {
    for (const side of SIDES) {
      wing({ ...flap, thickness: 0.01, from: Math.min(side * 0.12, side * 0.98), to: Math.max(side * 0.12, side * 0.98), span: 0.985, sweep: 0.09 })
    }
  }
  for (const side of SIDES) {
    plate([[2.86, 0.045], [2.83, 0.16], [2.56, 0.29], [2.24, 0.315], [2.22, 0.045]], 'z', Math.min(side * 0.975, side * 1), Math.max(side * 0.975, side * 1), 'wing')
    plate([[2.74, 0.1], [2.56, 0.1], [2.56, 0.22], [2.7, 0.22]], 'z', side * 0.075 - 0.008, side * 0.075 + 0.008, 'carbon')
  }

  // Aileron arrière : plan principal, volet mobile, aileron bas, pylône et grandes dérives.
  wing({ lead: -2.37, chord: 0.33, y: 0.815, angle: 0.14, thickness: 0.026, from: -0.505, to: 0.505, span: 0.505, role: 'wing' })
  wing({ lead: -2.6, chord: 0.19, y: 0.905, angle: 0.5, thickness: 0.012, from: -0.505, to: 0.505, span: 0.505, role: 'trim' })
  wing({ lead: -2.38, chord: 0.2, y: 0.43, angle: 0.28, thickness: 0.012, from: -0.48, to: 0.48, span: 0.48, role: 'carbon' })
  plate([[-2.3, 0.3], [-2.44, 0.3], [-2.57, 0.83], [-2.48, 0.84]], 'z', -0.014, 0.014, 'carbon')
  for (const side of SIDES) {
    plate(
      [[-2.3, 0.82], [-2.42, 1.01], [-2.76, 1.02], [-2.8, 0.8], [-2.64, 0.36], [-2.42, 0.36], [-2.5, 0.68]],
      'z',
      Math.min(side * 0.5, side * 0.525),
      Math.max(side * 0.5, side * 0.525),
      'wing',
    )
  }

  // Trains roulants : triangles, biellettes, écopes de frein ; ailettes au-dessus des roues avant.
  for (const axle of [FRONT, REAR]) {
    const front = axle === FRONT
    const inner = axle.z - axle.width / 2
    const chassis = front ? 0.15 : 0.08
    for (const side of SIDES) {
      for (const [height, anchor] of [[0.49, 0.47], [0.23, 0.24]]) {
        for (const reach of [0.3, -0.24]) {
          tube([[axle.x + reach, anchor, side * chassis], [axle.x, height, side * (inner - 0.02)]], 0.017, 'carbon', { segments: 6 })
        }
      }
      tube([[axle.x - 0.03, 0.26, side * (inner - 0.05)], [axle.x - 0.08, 0.45, side * chassis]], 0.015, 'carbon', { segments: 6 })
      const drum = [side * (inner - 0.075), side * (inner + 0.03)]
      tube(drum.map((z) => [axle.x, axle.radius, z]), 0.165, 'carbon', { segments: 24 })
    }
  }
  for (const side of SIDES) {
    const angles = [48, 62, 76, 90, 104, 118, 132].map((degrees) => (degrees * Math.PI) / 180)
    const arc = (radius) => angles.map((angle) => [FRONT.x + radius * Math.cos(angle), FRONT.radius + radius * Math.sin(angle)])
    plate([...arc(0.385), ...arc(0.403).toReversed()], 'z', Math.min(side * 0.62, side * 0.76), Math.max(side * 0.62, side * 0.76), 'carbon')
    tube([[FRONT.x, FRONT.radius + 0.13, side * 0.65], [FRONT.x, FRONT.radius + 0.39, side * 0.65]], 0.013, 'carbon', { segments: 6 })
  }

  return parts
}
