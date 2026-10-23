// The merge rules used when two people save the same trip at the same time
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeById, mergePacking, sameStops } from '../merge.js'

const a = { id: 'a', name: 'Album A', icon: '🏯' }
const b = { id: 'b', name: 'Album B', icon: '🍜' }

test('two people adding at the same time: both are kept', () => {
  const base = [a]
  const latest = [a, b] // someone else added B
  const mine = [a, { id: 'c', name: 'Album C', icon: '🌸' }] // I added C
  assert.deepEqual(mergeById(latest, base, mine, ['name', 'icon']).map((x) => x.id), ['a', 'b', 'c'])
})

test('my rename is applied, their delete is kept', () => {
  const base = [a, b]
  const latest = [a] // someone deleted B
  const mine = [{ ...a, name: 'Renamed' }, b]
  assert.deepEqual(mergeById(latest, base, mine, ['name', 'icon']), [{ ...a, name: 'Renamed' }])
})

test('my delete is applied, their rename of another item is kept', () => {
  const base = [a, b]
  const latest = [a, { ...b, name: 'B2' }]
  const mine = [b] // I deleted A
  assert.deepEqual(mergeById(latest, base, mine, ['name', 'icon']), [{ ...b, name: 'B2' }])
})

test('packing: two people ticking different items both stay ticked', () => {
  const empty = { checked: {}, qty: {}, removed: [], custom: [] }
  const latest = { ...empty, checked: { passport: true } }
  const mine = { ...empty, checked: { charger: true } }
  assert.deepEqual(mergePacking(latest, empty, mine).checked, { passport: true, charger: true })
})

test('sameStops ignores order but not changes', () => {
  const s1 = { id: '1', name: 'A', date: '2026-12-01', hour: 9 }
  const s2 = { id: '2', name: 'B', date: '2026-12-01', hour: 11 }
  assert.ok(sameStops([s1, s2], [s2, s1]))
  assert.ok(!sameStops([s1, s2], [s1, { ...s2, hour: 12 }]))
})
