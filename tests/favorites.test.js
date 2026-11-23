import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseFavorites, serializeFavorites, toggleFavorite } from '../lib/favorites.js'

test('toggleFavorite ajoute un identifiant absent', () => {
  assert.deepEqual(toggleFavorite([1, 2], 3), [1, 2, 3])
})

test('toggleFavorite retire un identifiant présent', () => {
  assert.deepEqual(toggleFavorite([1, 2, 3], 2), [1, 3])
})

test('toggleFavorite ne modifie pas la liste d’origine', () => {
  const original = [1, 2]
  toggleFavorite(original, 3)
  assert.deepEqual(original, [1, 2])
})

test('parseFavorites accepte une liste valide', () => {
  assert.deepEqual(parseFavorites('[9858,"VER"]'), [9858, 'VER'])
})

test('parseFavorites renvoie une liste vide si rien n’est stocké', () => {
  assert.deepEqual(parseFavorites(null), [])
  assert.deepEqual(parseFavorites(''), [])
})

test('parseFavorites ne plante pas sur du JSON cassé ou inattendu', () => {
  assert.deepEqual(parseFavorites('{pas du json'), [])
  assert.deepEqual(parseFavorites('{"a":1}'), [])
  assert.deepEqual(parseFavorites('"texte"'), [])
})

test('parseFavorites écarte les valeurs de mauvais type', () => {
  assert.deepEqual(parseFavorites('[1,null,{"x":1},"ok",true]'), [1, 'ok'])
})

test('serializeFavorites puis parseFavorites redonne la liste', () => {
  assert.deepEqual(parseFavorites(serializeFavorites([5, 6])), [5, 6])
})
