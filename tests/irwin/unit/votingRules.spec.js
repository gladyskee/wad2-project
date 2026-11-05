/* votingRules.spec.js — UNIT test (by Irwin)

 WHAT:  The group-decision rules inside src/components/PlacesVoting.vue, called directly (no screen):
          needed()     how many yes votes make a place a "group pick" (more than half the group)
          isPick(w)    is this place a group pick?
          applyVotes() add / take back one person's yes vote on some places
          voter()      whose vote the big "Yes to all" button changes
 WHY:   These rules decide what the group goes to. An off-by-one in the majority (e.g. 2 of 4 counting as a
        pick) or a vote counted twice silently changes the trip plan for everyone.

 | Case | Input                                                    | Expected                                          |
 |------|----------------------------------------------------------|---------------------------------------------------|
 | H1   | groups of 1, 2, 3, 4, 5, 6 travellers                    | needed = 1, 2, 2, 3, 3, 4 (more than half)        |
 | H2   | 4 travellers; place with 3 votes / 2 votes               | 3 votes = pick; 2 votes (a tie) = not a pick       |
 | H3   | Sarah votes yes on 2 places, then takes one back         | only her vote changes; others' votes are kept     |
 | H4   | organiser (me) can also vote for a guest                 | "Yes to all" button is for me, not the guest      |
 | U1   | no travellers at all                                     | nothing is a pick, even with votes                |
 | U2   | Sarah votes yes twice on the same place                  | counted once                                      |
 | U3   | a place with no votes list (old saved data)              | not a pick; voting on it still works              |
 | U4   | I can't vote for myself (not in canVoteFor)              | button falls back to the first person I can vote for |
*/

import { describe, it, expect } from 'vitest'
import PlacesVoting from '../../../src/components/PlacesVoting.vue'

const { needed, voter } = PlacesVoting.computed
const { isPick, applyVotes } = PlacesVoting.methods

// A tiny stand-in for the component: just the data the rules read
function ctx(travellers, places = []) {
  const c = { travellers, places }
  c.needed = needed.call(c)
  return c
}

describe('Unit · voting rules — majority needed for a group pick, and adding / taking back votes', () => {

  describe('happy paths', () => {
    it('H1: a group pick needs MORE than half the group (1→1, 2→2, 3→2, 4→3, 5→3, 6→4)', () => {
      const result = [1, 2, 3, 4, 5, 6].map((n) => needed.call({ travellers: Array(n).fill('x') }))
      expect(result).toEqual([1, 2, 2, 3, 3, 4])
    })

    it('H2: with 4 travellers, 3 votes is a group pick but a 2–2 tie is not', () => {
      const c = ctx(['Sarah', 'John', 'Amy', 'Ben'])
      expect(isPick.call(c, { votes: ['Sarah', 'John', 'Amy'] })).toBe(true)
      expect(isPick.call(c, { votes: ['Sarah', 'John'] })).toBe(false)
    })

    it('H3: voting changes only that person\'s vote; everyone else\'s votes are kept', () => {
      const places = [
        { id: 'a', votes: ['John'] },
        { id: 'b', votes: [] },
        { id: 'c', votes: ['Amy'] }
      ]
      const c = ctx(['Sarah', 'John', 'Amy'], places)
      applyVotes.call(c, ['a', 'b'], 'Sarah', true)
      expect(places.map((p) => p.votes)).toEqual([['John', 'Sarah'], ['Sarah'], ['Amy']])

      applyVotes.call(c, ['a'], 'Sarah', false)
      expect(places.map((p) => p.votes)).toEqual([['John'], ['Sarah'], ['Amy']])
    })

    it('H4: the "Yes to all" button is for me, even when I can also vote for guests', () => {
      expect(voter.call({ me: 'Irwin', canVoteFor: ['Irwin', 'Grandma'] })).toBe('Irwin')
    })
  })

  describe('unhappy paths', () => {
    it('U1: with no travellers nothing is a group pick, even with votes', () => {
      expect(isPick.call(ctx([]), { votes: ['Sarah'] })).toBe(false)
    })

    it('U2: voting yes twice on the same place counts once', () => {
      const places = [{ id: 'a', votes: [] }]
      const c = ctx(['Sarah', 'John', 'Amy'], places)
      applyVotes.call(c, ['a'], 'Sarah', true)
      applyVotes.call(c, ['a'], 'Sarah', true)
      expect(places[0].votes).toEqual(['Sarah'])
    })

    it('U3: a place saved without a votes list is not a pick, and can still be voted on', () => {
      const places = [{ id: 'a' }]
      const c = ctx(['Sarah'], places)
      expect(isPick.call(c, places[0])).toBe(false)
      applyVotes.call(c, ['a'], 'Sarah', true)
      expect(places[0].votes).toEqual(['Sarah'])
      expect(isPick.call(c, places[0])).toBe(true)
    })

    it('U4: if I am not in the list of people I can vote for, the button uses the first one (or nobody)', () => {
      expect(voter.call({ me: 'Irwin', canVoteFor: ['Grandma'] })).toBe('Grandma')
      expect(voter.call({ me: 'Irwin', canVoteFor: [] })).toBe('')
    })
  })
})
