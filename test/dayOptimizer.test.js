// Day optimizer: opening hours, real travel times and honest messages
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { optimizeDay, scheduleInOrder, travelMatrix } from '../src/dayOptimizer.js'

const museum = { id: 'm', name: 'Museum', lat: 35.0, lon: 135.0, duration: 2, outdoor: false, locked: false, hour: 8, open: 10, close: 17 }
const opts = { dayStart: 8, dayEnd: 22 }

test('a stop that opens at 10 starts at 10, not at the start of the day', () => {
  const items = scheduleInOrder([museum], [], travelMatrix([museum]), opts)
  assert.equal(items[0].start, 10)
})

test('optimize never calls a day with a closed stop "in a good order"', () => {
  const shut = { ...museum, open: 23, close: 23.5 } // can't fit in the day at all
  const result = optimizeDay([shut], null, opts)
  assert.doesNotMatch(result.summary, /good order/)
})

test('a known travel time (saved route) beats the straight-line estimate', () => {
  const a = { id: 'a', lat: 35.0, lon: 135.0 }
  const b = { id: 'b', lat: 35.001, lon: 135.001 } // ~150 m apart: estimated as a short walk
  const m = travelMatrix([a, b], { 'a>b': { min: 27, mode: 'transit', source: 'saved', label: 'Bus' } })
  assert.equal(m.a.b.min, 27)
  assert.equal(m.a.b.source, 'saved')
  assert.equal(m.b.a.mode, 'walk') // the other direction is still estimated
})
