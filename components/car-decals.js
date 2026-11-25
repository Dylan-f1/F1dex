// Pose les logos et inscriptions (lib/decals.js) sur la voiture construite en code : chacun est une fine surface
// qui épouse la pièce visée. Les textures ne sont chargées que pour l'écurie affichée.
// Imports relatifs : ce module est aussi testé avec `node --test`.

const LOGO_PATH = '/logos'
// Part minimale d'une facette tournée vers le côté d'où on lit : évite d'imprimer le dessous ou l'envers d'une pièce.
const MIN_FACING = 0.3

// Peint une inscription { content: { logo } | { text }, colour } dans un canevas (navigateur seulement). Renvoie
// { texture, aspect }.
export function createPainter(THREE) {
  const images = new Map()
  function loadImage(url) {
    if (!images.has(url)) {
      images.set(
        url,
        new Promise((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => {
            images.delete(url) // pour réessayer au prochain changement d'écurie
            reject(new Error(url))
          }
          image.src = url
        }),
      )
    }
    return images.get(url)
  }
  function finish(canvas) {
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return { texture, aspect: canvas.width / canvas.height }
  }
  return async function paint({ content, colour }) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (content.logo) {
      const image = await loadImage(`${LOGO_PATH}/${content.logo}.png`)
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      context.drawImage(image, 0, 0)
      if (colour) {
        // Logo d'une seule couleur : on garde sa découpe.
        context.globalCompositeOperation = 'source-in'
        context.fillStyle = colour
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      return finish(canvas)
    }
    const family = getComputedStyle(document.documentElement).getPropertyValue('--font-saira-condensed') || 'sans-serif'
    const font = `italic 800 128px ${family}`
    await document.fonts.load(font, content.text).catch(() => {})
    context.font = font
    canvas.width = Math.ceil(context.measureText(content.text).width) + 40
    canvas.height = 124
    Object.assign(context, { font, fillStyle: colour, textAlign: 'center', textBaseline: 'middle' })
    context.fillText(content.text, canvas.width / 2, canvas.height / 2 + 6)
    return finish(canvas)
  }
}

// Garde les seules facettes tournées vers `normal`.
function facingOnly(THREE, geometry, normal) {
  const { position, normal: normals, uv } = geometry.attributes
  const kept = { position: [], normal: [], uv: [] }
  for (let first = 0; first < position.count; first += 3) {
    let facing = 0
    for (let at = first; at < first + 3; at += 1) {
      facing += (normals.getX(at) * normal.x + normals.getY(at) * normal.y + normals.getZ(at) * normal.z) / 3
    }
    if (facing < MIN_FACING) continue
    for (let at = first; at < first + 3; at += 1) {
      kept.position.push(position.getX(at), position.getY(at), position.getZ(at))
      kept.normal.push(normals.getX(at), normals.getY(at), normals.getZ(at))
      kept.uv.push(uv.getX(at), uv.getY(at))
    }
  }
  const result = new THREE.BufferGeometry()
  for (const [name, values] of Object.entries(kept)) {
    result.setAttribute(name, new THREE.Float32BufferAttribute(values, name === 'uv' ? 2 : 3))
  }
  return result
}

// `car` : le groupe de components/car-body-mesh.js ; `paint` : voir createPainter.
export function createDecals({ THREE, DecalGeometry, car, paint }) {
  let generation = 0
  let meshes = []
  let textures = []

  function clear() {
    for (const mesh of meshes) {
      car.remove(mesh)
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
    for (const texture of textures) texture.dispose()
    meshes = []
    textures = []
  }

  function place(item, { texture, aspect }) {
    const target = car.getObjectByName(`caisse-${item.part}`)
    if (!target) return null
    const normal = new THREE.Vector3(...item.normal).normalize()
    const up = new THREE.Vector3(...item.up).normalize()
    const right = new THREE.Vector3().crossVectors(up, normal)
    const orientation = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal))
    const width = Math.min(item.size[0], item.size[1] * aspect)
    const size = new THREE.Vector3(width, width / aspect, item.depth)
    // Maillage neutre : la projection se fait dans le repère de la voiture, même quand elle roule.
    const raw = new DecalGeometry(new THREE.Mesh(target.geometry), new THREE.Vector3(...item.position), orientation, size)
    const geometry = facingOnly(THREE, raw, normal)
    raw.dispose()
    if (geometry.attributes.position.count === 0) {
      geometry.dispose()
      return null
    }
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.55,
      metalness: 0.05,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `decal-${item.id}`
    return mesh
  }

  return {
    // Remplace les inscriptions par celles de `plan` (decalPlan). Les anciennes partent tout de suite, les nouvelles
    // arrivent quand leurs images sont prêtes ; une demande dépassée par la suivante est abandonnée.
    async show(plan) {
      generation += 1
      const mine = generation
      clear()
      const painted = new Map() // une texture par inscription et couleur, partagée entre les deux flancs
      const results = await Promise.all(
        plan.map((item) => {
          const key = JSON.stringify([item.content, item.colour])
          // Une image manquante ne prive pas la voiture des autres.
          if (!painted.has(key)) painted.set(key, paint(item).catch(() => null))
          return painted.get(key)
        }),
      )
      const ready = (await Promise.all(painted.values())).filter(Boolean).map((result) => result.texture)
      if (mine !== generation) {
        for (const texture of ready) texture.dispose()
        return
      }
      textures = ready
      plan.forEach((item, index) => {
        const mesh = results[index] && place(item, results[index])
        if (!mesh) return
        car.add(mesh)
        meshes.push(mesh)
      })
    },
    dispose() {
      generation += 1
      clear()
    },
  }
}
