// Group decisions: more than half of the people still on the trip
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { votesNeeded, yesVotes, isGroupPick } from '../src/voting.js'

test('3 travellers need 2 votes, 4 need 3', () => {
  assert.equal(votesNeeded(['A', 'B', 'C']), 2)
  assert.equal(votesNeeded(['A', 'B', 'C', 'D']), 3)
})

test('votes from someone no longer on the trip do not count', () => {
  const place = { votes: ['Amy', 'Zed'] }
  assert.deepEqual(yesVotes(place, ['Amy', 'Ben', 'Cat']), ['Amy'])
  assert.equal(isGroupPick(place, ['Amy', 'Ben', 'Cat']), false)
})

test('solo trips skip voting', () => {
  assert.equal(isGroupPick({ votes: [] }, ['Amy']), true)
})
