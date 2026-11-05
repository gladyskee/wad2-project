// @vitest-environment jsdom
/* TripShare.spec.js — COMPONENT test (by Jeron)

 WHAT:  src/components/TripShare.vue — "Invite to <trip>": invite people by username, the shareable
        join link, and who is on the trip. The server (axios) is a fake, so we choose its answers.
 WHY:   Inviting is how a crew forms. Inviting the wrong person, a link that isn't made, or a silent
        failure means friends never get the trip — and nobody notices until departure.

 | Case | User does / server answers                                 | Expected                                            |
 |------|------------------------------------------------------------|-----------------------------------------------------|
 | H1   | Opens the invite box                                        | join link "<site>/join/ABC123" is shown             |
 | H2   | Types "@irw" → server finds Irwin → taps Invite             | search sent without "@"; POST invite for Irwin's id;|
 |      |                                                            | "✓ Invited Irwin"; "1 invited" in the trip count    |
 | H3   | Copy link                                                   | link copied, button says "Copied ✓"                 |
 | U1   | Types "ir" (2 letters)                                      | "Type at least 3 letters.", no search sent          |
 | U2   | Types "nobody" → server finds no one                        | "No account starts with "@nobody"…"                 |
 | U3   | Server refuses the invite (e.g. already on another trip)    | the server's message is shown, nobody marked invited|
 | U4   | Server can't make a join link                               | "Could not make a link…" error, no broken link      |
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../../src/auth.js', () => ({ auth: { user: { id: 'u-jeron' } } }))

import { mount, flushPromises } from '@vue/test-utils'
import axios from 'axios'
import TripShare from '../../../src/components/TripShare.vue'

const IRWIN = { id: 'u-irwin', name: 'Irwin', username: 'irwin', status: '' }

// Fake server: link + friends + username search. Override parts per test.
function fakeServer({ link = { data: { code: 'ABC123' } }, search = [IRWIN], inviteError } = {}) {
  axios.get.mockImplementation((url) => {
    if (url === '/api/friends') return Promise.resolve({ data: { friends: [] } })
    if (url === '/api/invites/users') return Promise.resolve({ data: search.map((u) => ({ ...u })) }) // fresh copies each time
    return Promise.reject(new Error('unknown ' + url))
  })
  axios.post.mockImplementation((url) => {
    if (url.endsWith('/invite')) return link instanceof Error ? Promise.reject(link) : Promise.resolve(link)
    if (url.endsWith('/invites')) return inviteError ? Promise.reject(inviteError) : Promise.resolve({ data: [{ id: 'u-irwin', name: 'Irwin', username: 'irwin' }] })
    return Promise.reject(new Error('unknown ' + url))
  })
}

async function mountShare() {
  const w = mount(TripShare, {
    props: { tripId: 't1', tripName: 'Kyoto', inline: true, role: 'owner', me: 'Jeron', members: [{ id: 'u-jeron', name: 'Jeron', role: 'owner' }], travellers: ['Jeron'] },
    global: { stubs: { AppIcon: true } }
  })
  await flushPromises()
  return w
}
async function typeUsername(w, text) {
  await w.get('[data-testid="invite-username"]').setValue(text)
  await vi.advanceTimersByTimeAsync(300) // the search waits for typing to pause
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers()
  axios.get.mockReset()
  axios.post.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('Component · TripShare — invite friends by username or join link, see who is on the trip', () => {

  describe('happy paths', () => {
    it('H1: the trip\'s join link is made and shown', async () => {
      fakeServer()
      const w = await mountShare()
      expect(axios.post).toHaveBeenCalledWith('/api/trips/t1/invite', { reset: false })
      expect(w.get('#ts-url').element.value).toBe(window.location.origin + '/join/ABC123')
    })

    it('H2: searching "@irw" finds Irwin, and Invite sends the invite for his account', async () => {
      fakeServer()
      const w = await mountShare()
      await typeUsername(w, '@irw')
      expect(axios.get).toHaveBeenCalledWith('/api/invites/users', { params: { q: 'irw', trip: 't1' } })

      await w.get('[data-testid="invite-user"]').trigger('click')
      await flushPromises()
      expect(axios.post).toHaveBeenCalledWith('/api/trips/t1/invites', { userId: 'u-irwin' })
      expect(w.text()).toContain('✓ Invited Irwin.')
      expect(w.get('.ts-count').text()).toContain('1 invited')
      expect(w.get('[data-testid="invite-username"]').element.value).toBe('') // ready for the next one
    })

    it('H3: "Copy link" copies the join link and confirms it', async () => {
      fakeServer()
      const writeText = vi.fn(() => Promise.resolve())
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
      const w = await mountShare()
      const copyBtn = w.findAll('button').find((b) => b.text().includes('Copy link'))
      await copyBtn.trigger('click')
      await flushPromises()
      expect(writeText).toHaveBeenCalledWith(window.location.origin + '/join/ABC123')
      expect(copyBtn.text()).toContain('Copied ✓')
    })
  })

  describe('unhappy paths', () => {
    it('U1: fewer than 3 letters asks for more and does not search', async () => {
      fakeServer()
      const w = await mountShare()
      await typeUsername(w, 'ir')
      expect(w.text()).toContain('Type at least 3 letters.')
      expect(axios.get).not.toHaveBeenCalledWith('/api/invites/users', expect.anything())
    })

    it('U2: a username nobody has says so (and suggests the link)', async () => {
      fakeServer({ search: [] })
      const w = await mountShare()
      await typeUsername(w, 'nobody')
      expect(w.text()).toContain('No account starts with "@nobody". Send them the link instead.')
    })

    it('U3: when the server refuses the invite, its message is shown and nobody is marked invited', async () => {
      fakeServer({ inviteError: { response: { data: { message: 'Irwin is already on this trip.' } } } })
      const w = await mountShare()
      await typeUsername(w, 'irwin')
      await w.get('[data-testid="invite-user"]').trigger('click')
      await flushPromises()

      expect(w.get('[role="alert"]').text()).toBe('Irwin is already on this trip.')
      expect(w.text()).not.toContain('✓ Invited')
      expect(w.get('.ts-count').text()).not.toContain('invited')
    })

    it('U4: if the join link can\'t be made, an error shows instead of a broken link', async () => {
      fakeServer({ link: new Error('Network Error') })
      const w = await mountShare()
      expect(w.get('[role="alert"]').text()).toBe('Could not make a link. Is the server running?')
      expect(w.get('#ts-url').element.value).toBe('Making a link…')
    })
  })
})
