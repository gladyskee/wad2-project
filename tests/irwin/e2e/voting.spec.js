/* voting.spec.js — E2E test (by Irwin)

 WHAT:  "Places → Group decisions" in a real browser, against the real deployed server and database, signed in
        as the test account (E2E_USERNAME / E2E_PASSWORD). The test makes its own trip first: the account as
        organiser plus a guest "Gran" (no account), with 2 wishlist places — and deletes it at the end.
        With 2 travellers, a place needs 2 yes votes to be a group pick.
 WHY:   Votes are shared and decide the plan, so they must be saved on the server, survive a reload, and
        the server must refuse votes cast for someone you aren't allowed to vote for.

 | Case | User does                                                     | Expected                                          |
 |------|---------------------------------------------------------------|---------------------------------------------------|
 | H1   | Votes yes on "Fushimi Inari", reloads                          | 1/2 votes, still voting (not a pick); kept after reload |
 | H2   | As organiser, also votes for guest Gran                        | 2/2: "✓ 1 group pick"; still a pick after reload  |
 | U1   | Sends a vote for "Mallory" (not on the trip) through the API   | 403 "You can only change your own votes."; no vote saved |
*/

import { test, expect } from '@playwright/test'
import { hasLogin, E2E_USE, createTestTrip, deleteTestTrip, openTrip, debugOnFailure } from '../../shared/e2e.js'

test.use(E2E_USE)
test.skip(!hasLogin, 'Needs E2E_USERNAME and E2E_PASSWORD (the test account)')
debugOnFailure(test)

let trip // this file's own test trip, made in beforeAll

async function openVoting(page) {
  await openTrip(page, trip, 'places')
  await page.getByTestId('places-vote').click()
  await expect(page.getByTestId('vote-summary')).toBeVisible()
}
const card = (page, name) => page.locator('.pv-card', { has: page.getByRole('heading', { name, exact: true }) })

test.describe('E2E · Group voting — votes are saved, make group picks, and only allowed votes count', () => {
  test.beforeAll(async ({ playwright }, info) => {
    trip = await createTestTrip(playwright, info.project.use.baseURL, { travellers: ['Gran'] })
    const res = await trip.api.put('/api/trips/' + trip.id + '/itinerary', {
      data: {
        stops: [],
        wishlist: [
          { id: 'e2e-w1', name: 'Fushimi Inari', city: 'Kyoto, Japan', outdoor: true, votes: [] },
          { id: 'e2e-w2', name: 'Kinkaku-ji', city: 'Kyoto, Japan', outdoor: true, votes: [] }
        ]
      }
    })
    expect(res.ok(), 'seed wishlist: ' + (await res.text())).toBe(true)
  })
  test.afterAll(async () => {
    await deleteTestTrip(trip)
  })

  test('H1: my yes vote is saved (1 of 2 — not a group pick yet)', async ({ page }) => {
    await openVoting(page)
    const mine = card(page, 'Fushimi Inari').getByTestId('vote-btn').filter({ hasText: 'You' })
    await mine.click()
    await expect(mine).toHaveAttribute('aria-pressed', 'true')
    await expect(card(page, 'Fushimi Inari').getByRole('progressbar')).toHaveAttribute('aria-label', '1 of 2 votes')
    await expect(page.getByTestId('vote-summary')).toHaveText('✓ 0 group picks')

    await page.waitForTimeout(1500) // let the vote request finish
    await page.reload()
    await page.getByTestId('places-vote').click({ timeout: 20000 })
    await expect(card(page, 'Fushimi Inari').getByTestId('vote-btn').filter({ hasText: 'You' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('H2: the organiser\'s vote for guest Gran makes it 2 of 2 — a group pick, kept after reload', async ({ page }) => {
    await openVoting(page)
    const gran = card(page, 'Fushimi Inari').getByTestId('vote-btn').filter({ hasText: 'Gran' })
    await gran.click()
    await expect(gran).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('vote-summary')).toHaveText('✓ 1 group pick')
    await expect(page.locator('[aria-labelledby="pv-h-picks"]')).toContainText('Fushimi Inari')

    await page.waitForTimeout(1500)
    await page.reload()
    await page.getByTestId('places-vote').click({ timeout: 20000 })
    await expect(page.getByTestId('vote-summary')).toHaveText('✓ 1 group pick')
  })

  test('U1: the server refuses a vote for someone who isn\'t on the trip', async () => {
    const res = await trip.api.post('/api/trips/' + trip.id + '/votes', { data: { wishIds: ['e2e-w2'], person: 'Mallory', yes: true } })
    expect(res.status()).toBe(403)
    expect((await res.json()).message).toBe('You can only change your own votes.')

    const saved = await (await trip.api.get('/api/trips/' + trip.id)).json()
    expect(saved.wishlist.find((w) => w.id === 'e2e-w2').votes).toEqual([])
  })
})
