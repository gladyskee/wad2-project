// @vitest-environment jsdom
/* PlacesVoting.spec.js — COMPONENT test (by Irwin)

 WHAT:  src/components/PlacesVoting.vue ("Group decisions") on its own. The server (axios) is a fake,
        so we choose what it answers: the group's latest votes, or an error.
 WHY:   Voting is shared: what you see must match what is saved. If a failed save still shows your vote,
        or the group's newer votes are ignored, people plan around a decision that never happened.

 | Case | User does / server answers                                | Expected                                              |
 |------|-----------------------------------------------------------|-------------------------------------------------------|
 | H1   | 3 travellers; I vote yes on "Fushimi Inari" (1 → 2 votes)  | POST {wishIds, person: me, yes: true}; moves to       |
 |      |                                                           | "✓ Group picks"; summary "✓ 1 group pick"             |
 | H2   | Server answers with John's new vote too                   | John's vote shows (the group's latest votes win)      |
 | H3   | "Yes to all" then "Undo"                                  | yes on every place, then exactly the old votes back   |
 | U1   | Server fails to save my vote                              | my vote is taken back on screen (not shown as saved)  |
 | U2   | Someone else's vote                                       | shown, but not a button: I can't change it            |
 | U3   | Empty wishlist                                            | "Your wishlist is empty." error, no voting            |
 | U4   | Demo trip ("seoul")                                       | vote shows, nothing sent to the server                |
*/

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('axios', () => ({ default: { post: vi.fn() } }))
vi.mock('../../../src/notify.js', () => ({ notify: vi.fn(), errorText: (err, fallback) => fallback }))

import { mount, flushPromises } from '@vue/test-utils'
import axios from 'axios'
import PlacesVoting from '../../../src/components/PlacesVoting.vue'
import { trip } from '../../../src/itineraryStore.js'
import { notify } from '../../../src/notify.js'

const TRAVELLERS = ['Irwin', 'John', 'Amy']

function setWishlist() {
  trip.wishlist = [
    { id: 'w1', name: 'Fushimi Inari', votes: ['Amy'] },
    { id: 'w2', name: 'Nishiki Market', votes: [] }
  ]
}

async function mountVoting(props = {}) {
  const w = mount(PlacesVoting, {
    props: { tripId: 't1', travellers: TRAVELLERS, me: 'Irwin', canVoteFor: ['Irwin'], ...props },
    global: { stubs: { AppIcon: true, CustomDropdown: true } }
  })
  await flushPromises()
  return w
}
const card = (w, name) => w.findAll('.pv-card').find((c) => c.get('.pv-name').text() === name)
const myButton = (w, name) => card(w, name).get('[data-testid="vote-btn"]')
const picksSection = (w) => w.get('[aria-labelledby="pv-h-picks"]')

beforeEach(() => {
  setWishlist()
  axios.post.mockReset()
  notify.mockReset()
})

describe('Component · PlacesVoting — vote on wishlist places, see group picks, save votes', () => {

  describe('happy paths', () => {
    it('H1: my yes vote is saved and makes the place a group pick (2 of 3)', async () => {
      axios.post.mockResolvedValue({ data: { votes: { w1: ['Amy', 'Irwin'], w2: [] } } })
      const w = await mountVoting()
      expect(w.get('[data-testid="vote-summary"]').text()).toBe('✓ 0 group picks')

      await myButton(w, 'Fushimi Inari').trigger('click')
      await flushPromises()

      expect(axios.post).toHaveBeenCalledWith('/api/trips/t1/votes', { wishIds: ['w1'], person: 'Irwin', yes: true })
      expect(myButton(w, 'Fushimi Inari').attributes('aria-pressed')).toBe('true')
      expect(picksSection(w).text()).toContain('Fushimi Inari')
      expect(w.get('[data-testid="vote-summary"]').text()).toBe('✓ 1 group pick')
    })

    it('H2: votes from the rest of the group that came back from the server are shown', async () => {
      axios.post.mockResolvedValue({ data: { votes: { w1: ['Amy'], w2: ['John', 'Irwin'] } } })
      const w = await mountVoting()
      await myButton(w, 'Nishiki Market').trigger('click')
      await flushPromises()

      expect(card(w, 'Nishiki Market').get('.pv-count').text()).toBe('2/3')
      expect(card(w, 'Nishiki Market').text()).toContain('John')
      expect(picksSection(w).text()).toContain('Nishiki Market')
    })

    it('H3: "Yes to all" votes yes on every place, and Undo puts back exactly the votes before', async () => {
      axios.post.mockImplementation((url, body) => Promise.resolve({
        data: { votes: body.yes ? { w1: ['Amy', 'Irwin'], w2: ['Irwin'] } : { w1: ['Amy'], w2: [] } }
      }))
      const w = await mountVoting()
      await w.get('[data-testid="vote-all"]').trigger('click')
      await flushPromises()
      expect(axios.post).toHaveBeenLastCalledWith('/api/trips/t1/votes', { wishIds: ['w1', 'w2'], person: 'Irwin', yes: true })
      expect(trip.wishlist.map((p) => p.votes)).toEqual([['Amy', 'Irwin'], ['Irwin']])

      await w.findAll('button').find((b) => b.text() === 'Undo').trigger('click')
      await flushPromises()
      expect(axios.post).toHaveBeenLastCalledWith('/api/trips/t1/votes', { wishIds: ['w1', 'w2'], person: 'Irwin', yes: false })
      expect(trip.wishlist.map((p) => p.votes)).toEqual([['Amy'], []])
    })
  })

  describe('unhappy paths', () => {
    it('U1: when the server can\'t save my vote, it is taken back on screen and I am told', async () => {
      axios.post.mockRejectedValue(new Error('Network Error'))
      const w = await mountVoting()
      await myButton(w, 'Fushimi Inari').trigger('click')
      await flushPromises()

      expect(myButton(w, 'Fushimi Inari').attributes('aria-pressed')).toBe('false')
      expect(card(w, 'Fushimi Inari').get('.pv-count').text()).toBe('1/3')
      expect(notify).toHaveBeenCalledWith('Could not save your vote.', expect.any(Function))
    })

    it('U2: other people\'s votes are shown but are not buttons (only they can change them)', async () => {
      const w = await mountVoting()
      const c = card(w, 'Fushimi Inari')
      expect(c.findAll('[data-testid="vote-btn"]')).toHaveLength(1) // only mine
      expect(c.get('.pv-voter.readonly.yes').text()).toContain('Amy')
    })

    it('U3: an empty wishlist shows an error instead of voting', async () => {
      trip.wishlist = []
      const w = await mountVoting()
      expect(w.get('[data-testid="vote-error"]').text()).toContain('Your wishlist is empty.')
      expect(w.find('[data-testid="vote-btn"]').exists()).toBe(false)
    })

    it('U4: on the demo trip the vote shows but nothing is sent to the server', async () => {
      const w = await mountVoting({ tripId: 'seoul' })
      await myButton(w, 'Nishiki Market').trigger('click')
      await flushPromises()
      expect(myButton(w, 'Nishiki Market').attributes('aria-pressed')).toBe('true')
      expect(axios.post).not.toHaveBeenCalled()
    })
  })
})
