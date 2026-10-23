// Popular places backup (Wikipedia): only real sights, typed by what they are
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wikiKind } from '../routes/places.js'

test('"Ueno Park Building" is not a park', () => {
  assert.equal(wikiKind('Ueno Park Building'), null)
})

test('the last kind word decides the type', () => {
  assert.equal(wikiKind('Meiji Shrine').type, 'heritage')
  assert.equal(wikiKind('Shinjuku Gyoen National Garden').type, 'park')
  assert.equal(wikiKind('Tokyo National Museum').type, 'museum')
})

test('streets and stations are left out', () => {
  assert.equal(wikiKind('Omotesando (street)'), null)
  assert.equal(wikiKind('Harajuku Station'), null)
})
