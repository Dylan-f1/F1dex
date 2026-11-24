import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CAMERA_VIEWS, easeOutCubic, lerpPoint } from '../lib/car-camera.js'
import { accentFor, buildCarParts, luminance, MATERIAL_ROLES, parseTeamColour, PART_SHAPES } from '../lib/car-model.js'
import { buildTeams } from '../lib/teams.js'

const parts = buildCarParts()
const byName = (name) => parts.find((part) => part.name === name)

describe('buildCarParts', () => {
  it('donne un nom unique à chaque pièce', () => {
    const names = parts.map((part) => part.name)
    assert.equal(new Set(names).size, names.length)
  })

  it('n\'utilise que des formes et des matières connues, avec des dimensions finies', () => {
    for (const part of parts) {
      assert.ok(PART_SHAPES.includes(part.shape), `forme de ${part.name}`)
      assert.ok(MATERIAL_ROLES.includes(part.material), `matière de ${part.name}`)
      for (const value of [...part.size, ...part.position, ...(part.rotation ?? [])]) {
        assert.ok(Number.isFinite(value), `valeur de ${part.name}`)
      }
      if (part.shape === 'tube') assert.ok(part.points.length >= 2, `points de ${part.name}`)
    }
  })

  it('respecte le règlement 2022-2025 : pneus de 305 et 405 mm, diamètre 0,72 m', () => {
    const front = byName('avant-pneu-gauche')
    const rear = byName('arriere-pneu-gauche')
    assert.equal(front.size[2], 0.305)
    assert.equal(rear.size[2], 0.405)
    assert.ok(Math.abs(front.size[0] * 2 - 0.72) < 0.01)
    assert.ok(Math.abs(rear.size[0] * 2 - 0.72) < 0.01)
  })

  it('a un empattement d\'environ 3,6 m et pose les roues au sol', () => {
    const front = byName('avant-pneu-gauche')
    const rear = byName('arriere-pneu-gauche')
    assert.ok(Math.abs(front.position[0] - rear.position[0] - 3.6) < 0.01)
    assert.equal(front.position[1], front.size[0])
  })

  it('ne dépasse pas 2,0 m de large', () => {
    // Demi-largeur d'une pièce selon l'axe z (les roues sont couchées : leur largeur est la hauteur du cylindre).
    const halfWidthOf = (part) => {
      if (part.shape === 'sphere') return part.size[0]
      if (part.shape === 'cylinder') {
        const lying = (part.rotation?.[0] ?? 0) !== 0
        return lying ? part.size[2] / 2 : Math.max(part.size[0], part.size[1]) * (part.scale?.[2] ?? 1)
      }
      return part.size[2] / 2
    }
    const widest = Math.max(...parts.filter((part) => part.shape !== 'tube').map((part) => Math.abs(part.position[2]) + halfWidthOf(part)))
    assert.ok(widest * 2 <= 2.0, `largeur ${widest * 2}`)
  })

  it('est symétrique : chaque pièce de gauche a son image à droite', () => {
    const left = parts.filter((part) => part.name.endsWith('-gauche'))
    assert.ok(left.length > 10)
    for (const part of left) {
      const right = byName(part.name.replace(/-gauche$/, '-droite'))
      assert.ok(right, `image de ${part.name}`)
      assert.equal(right.position[2], -part.position[2])
      assert.deepEqual(right.size, part.size)
      assert.equal(right.material, part.material)
    }
  })

  it('utilise la couleur de l\'écurie sur la carrosserie', () => {
    for (const name of ['monocoque', 'nez', 'capot', 'ponton-gauche']) {
      assert.equal(byName(name).material, 'livery')
    }
  })
})

describe('parseTeamColour', () => {
  it('ajoute le # et passe en minuscules', () => {
    assert.equal(parseTeamColour('3671C6'), '#3671c6')
    assert.equal(parseTeamColour('#FF8000'), '#ff8000')
  })

  it('retombe sur un gris neutre si la couleur manque ou est invalide', () => {
    for (const bad of [undefined, null, '', 'xyz', '12345', 42]) {
      assert.equal(parseTeamColour(bad), '#9aa5b5')
    }
  })
})

describe('accentFor', () => {
  it('choisit un accent clair sur une teinte foncée et sombre sur une teinte claire', () => {
    assert.equal(accentFor('#3671c6'), '#f2f4f7')
    assert.equal(accentFor('#e80020'), '#f2f4f7')
    assert.equal(accentFor('#52e252'), '#14171c')
    assert.equal(accentFor('#b6babd'), '#14171c')
  })

  it('calcule la luminance de 0 (noir) à 1 (blanc)', () => {
    assert.equal(luminance('#000000'), 0)
    assert.ok(Math.abs(luminance('#ffffff') - 1) < 1e-9)
  })
})

describe('buildTeams', () => {
  it('regroupe les pilotes par écurie dans l\'ordre d\'apparition', () => {
    const teams = buildTeams([
      { team_name: 'McLaren', team_colour: 'FF8000', name_acronym: 'NOR', last_name: 'Norris' },
      { team_name: 'Ferrari', team_colour: 'E80020', name_acronym: 'LEC', last_name: 'Leclerc' },
      { team_name: 'McLaren', team_colour: 'FF8000', name_acronym: 'PIA', last_name: 'Piastri' },
    ])
    assert.deepEqual(teams.map((team) => team.name), ['McLaren', 'Ferrari'])
    assert.deepEqual(teams[0].drivers.map((driver) => driver.code), ['NOR', 'PIA'])
    assert.equal(teams[0].colour, '#ff8000')
  })

  it('ignore les pilotes sans écurie et gère une couleur absente', () => {
    const teams = buildTeams([
      { name_acronym: 'XXX', last_name: 'Sans écurie' },
      { team_name: 'Nouvelle écurie', name_acronym: 'NEW', last_name: 'Nouveau' },
    ])
    assert.equal(teams.length, 1)
    assert.equal(teams[0].colour, '#9aa5b5')
  })

  it('renvoie une liste vide sans pilote', () => {
    assert.deepEqual(buildTeams([]), [])
  })
})

describe('caméras', () => {
  it('propose des angles distincts avec un libellé', () => {
    assert.equal(new Set(CAMERA_VIEWS.map((view) => view.id)).size, CAMERA_VIEWS.length)
    for (const view of CAMERA_VIEWS) assert.ok(view.label && view.position.length === 3)
  })

  it('interpole entre deux positions', () => {
    assert.deepEqual(lerpPoint([0, 0, 0], [10, 20, -10], 0.5), [5, 10, -5])
    assert.deepEqual(lerpPoint([1, 2, 3], [4, 5, 6], 0), [1, 2, 3])
    assert.deepEqual(lerpPoint([1, 2, 3], [4, 5, 6], 1), [4, 5, 6])
  })

  it('ralentit vers la fin et reste dans [0, 1]', () => {
    assert.equal(easeOutCubic(0), 0)
    assert.equal(easeOutCubic(1), 1)
    assert.ok(easeOutCubic(0.5) > 0.5)
    assert.equal(easeOutCubic(2), 1)
    assert.equal(easeOutCubic(-1), 0)
  })
})
