// Roue de F1 construite en code : pneu au profil arrondi, bande jaune et marquages sur le flanc, repères sur la
// bande de roulement, jante à cinq branches. Repère de la roue (celui du modèle) : essieu selon x, face extérieure
// vers +x, avant vers +z. Toutes les cotes sont en parts du rayon. Réglages de goût : couleurs et marquages ici.

import { WHEEL_VISUAL, tyreProfile } from '../lib/car-wheels.js'

const MATERIALS = {
  tyre: { color: '#17191d', roughness: 0.85, metalness: 0 },
  band: { color: '#c9a417', roughness: 0.7, metalness: 0 }, // le jaune des pneus du modèle d'origine
  lettering: { color: '#9aa5b5', roughness: 0.8, metalness: 0 }, // jeton `mute`
  tread: { color: '#3a4048', roughness: 0.9, metalness: 0 },
  dark: { color: '#0b0c0e', roughness: 0.8, metalness: 0 },
  rim: { color: '#3a4048', roughness: 0.5, metalness: 0.3 },
  hub: { color: '#6b7480', roughness: 0.5, metalness: 0.3 },
}
// Marquage du flanc : [début, longueur] en radians. Deux groupes différents, pour que la rotation se lise.
const LETTERING = [
  [-0.34, 0.26],
  [-0.02, 0.1],
  [0.14, 0.2],
  [Math.PI - 0.18, 0.36],
]
// Proportions (largeur / hauteur) de l'inscription du pneu, public/logos/pirelli.png.
const BRAND_ASPECT = 409 / 91
// Rayons de la bande qui la porte, en parts du rayon : sur la partie plate du flanc.
const BRAND_RADII = [0.755, 0.855]

// Repères en travers de la bande de roulement, seuls visibles depuis la caméra de poursuite : [angle, largeur].
// Répartis inégalement pour ne pas paraître immobiles à haute vitesse.
const TREAD_MARKS = [
  [0.4, 0.13],
  [2.3, 0.07],
  [3.9, 0.1],
]

// `mergeGeometries` : three/examples/jsm/utils/BufferGeometryUtils.js (chargé à la demande avec three.js).
export function createWheelFactory(THREE, mergeGeometries) {
  const materials = {}
  const resources = []
  const templates = new Map()

  const material = (name) => {
    if (!materials[name]) {
      materials[name] = new THREE.MeshStandardMaterial(MATERIALS[name])
      resources.push(materials[name])
    }
    return materials[name]
  }

  // Morceau d'anneau sur lequel l'image est courbée : lue de l'extérieur, de gauche à droite en haut du pneu.
  function brandArc(radius, centre) {
    const [inner, outer] = BRAND_RADII.map((part) => part * radius)
    const length = ((outer - inner) * BRAND_ASPECT) / ((inner + outer) / 2)
    const ring = new THREE.RingGeometry(inner, outer, 24, 1, centre - length / 2, length)
    const { position, uv } = ring.attributes
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index)
      const y = position.getY(index)
      const delta = Math.atan2(Math.sin(Math.atan2(y, x) - centre), Math.cos(Math.atan2(y, x) - centre))
      uv.setXY(index, 0.5 - delta / length, (Math.hypot(x, y) - inner) / (outer - inner))
    }
    return ring
  }

  // `brand` : matière portant la marque du manufacturier ; sans elle, de simples traits sur le flanc.
  function build(radius, width, brand) {
    const face = width / 2
    const lift = radius * 0.006 // les marquages sont posés juste au-dessus de la gomme
    const names = Object.keys(MATERIALS).filter((name) => !(brand && name === 'lettering'))
    if (brand) names.push('brand')
    const parts = Object.fromEntries(names.map((name) => [name, []]))

    const profile = tyreProfile(radius, width).map(([r, a]) => new THREE.Vector2(r, a))
    // La coupe est tournée autour de y, puis l'axe est couché sur x.
    parts.tyre.push(new THREE.LatheGeometry(profile, 48).rotateZ(-Math.PI / 2))

    // Pièces plates tournées vers l'extérieur (+x), à la position `x` le long de l'essieu.
    const facing = (geometry, x) => geometry.rotateY(Math.PI / 2).translate(x, 0, 0)
    parts.band.push(facing(new THREE.RingGeometry(radius * 0.67, radius * 0.73, 48), face + lift))
    if (brand) {
      for (const centre of [Math.PI / 2, -Math.PI / 2]) parts.brand.push(facing(brandArc(radius, centre), face + lift))
    } else {
      for (const [start, length] of LETTERING) {
        parts.lettering.push(facing(new THREE.RingGeometry(radius * 0.76, radius * 0.84, 8, 1, start, length), face + lift))
      }
    }

    const treadWidth = width - radius * 0.46
    for (const [angle, size] of TREAD_MARKS) {
      const mark = new THREE.CylinderGeometry(radius + lift, radius + lift, treadWidth, 4, 1, true, angle, size)
      parts.tread.push(mark.rotateZ(-Math.PI / 2))
    }

    // Fond de la jante, plus large que l'ouverture du pneu pour qu'on ne voie pas au travers de biais.
    parts.dark.push(facing(new THREE.CircleGeometry(radius * 0.9, 48), face - radius * 0.11))
    // Face intérieure, tournée vers la voiture : on la découvre en braquant.
    parts.dark.push(new THREE.CircleGeometry(radius * 0.63, 48).rotateY(-Math.PI / 2).translate(-face + radius * 0.035, 0, 0))

    parts.rim.push(facing(new THREE.TorusGeometry(radius * 0.6, radius * 0.035, 8, 48), face - radius * 0.05))
    for (let spoke = 0; spoke < WHEEL_VISUAL.spokes; spoke += 1) {
      const bar = new THREE.BoxGeometry(radius * 0.05, radius * 0.5, radius * 0.11)
      bar.translate(face - radius * 0.07, radius * 0.34, 0).rotateX((spoke / WHEEL_VISUAL.spokes) * 2 * Math.PI)
      parts.rim.push(bar)
    }
    const hub = new THREE.CylinderGeometry(radius * 0.13, radius * 0.15, radius * 0.12, 20)
    parts.hub.push(hub.rotateZ(-Math.PI / 2).translate(face - radius * 0.06, 0, 0))

    // Une seule maille par matière.
    const wheel = new THREE.Group()
    for (const [name, geometries] of Object.entries(parts)) {
      const merged = mergeGeometries(geometries)
      for (const geometry of geometries) geometry.dispose()
      resources.push(merged)
      const mesh = new THREE.Mesh(merged, name === 'brand' ? brand : material(name))
      mesh.name = `roue-${name}`
      mesh.castShadow = name === 'tyre'
      wheel.add(mesh)
    }
    return wheel
  }

  return {
    // Une roue de ces dimensions ; les géométries sont partagées entre roues identiques.
    wheel(radius, width, brand) {
      const key = `${radius}×${width}×${brand?.uuid ?? ''}`
      if (!templates.has(key)) templates.set(key, build(radius, width, brand))
      return templates.get(key).clone()
    },
    // Géométries et matières créées, à libérer avec la scène.
    resources: () => [...resources],
  }
}
