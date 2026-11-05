/* crew.spec.js — E2E test (by Jeron)

 WHAT:  "+ Invite" (TripShare) in a real browser, against the real deployed server and database, signed in as
        the test account (E2E_USERNAME / E2E_PASSWORD), on a fresh trip the test makes first and deletes at the
        end (which also cancels its invites). It invites another test account (E2E_Irwin, or E2E_Lam).
 WHY:   Inviting is how a crew forms. The invite must really be stored on the trip (so the friend sees it on
        their home page), the join link must exist, and a wrong username must be clearly reported.

 | Case | User does                                            | Expected                                              |
 |------|------------------------------------------------------|-------------------------------------------------------|
 | H1   | Opens "+ Invite"                                      | a join link ".../join/<code>" is shown                |
 | H2   | Searches the other test account's username → Invite   | "✓ Invited …"; the trip on the server lists the invite|
 | U1   | Searches "zz_nobody_e2e"                              | "No account starts with "@zz_nobody_e2e"…"            |
 | U2   | Types "ab" (2 letters)                                | "Type at least 3 letters."                            |
*/

import { test, expect } from '@playwright/test'
import { hasLogin, E2E_USE, createTestTrip, deleteTestTrip, openTrip, debugOnFailure } from '../../shared/e2e.js'

test.use(E2E_USE)
test.skip(!hasLogin, 'Needs E2E_USERNAME and E2E_PASSWORD (the test account)')
debugOnFailure(test)

let trip // this file's own test trip, made in beforeAll
const FRIEND = (process.env.E2E_USERNAME || '').toLowerCase() === 'e2e_irwin' ? 'e2e_lam' : 'e2e_irwin'

async function openInvite(page) {
  await openTrip(page, trip, 'crew')
  await page.getByTestId('invite-btn').click()
  await expect(page.getByTestId('invite-username')).toBeVisible()
}

test.describe('E2E · Crew invites — join link, invite by username, clear errors for wrong usernames', () => {
  test.beforeAll(async ({ playwright }, info) => {
    trip = await createTestTrip(playwright, info.project.use.baseURL)
  })
  test.afterAll(async () => {
    await deleteTestTrip(trip)
  })

  test('H1: the invite box shows a join link for this trip', async ({ page }) => {
    await openInvite(page)
    await expect(page.locator('#ts-url')).toHaveValue(/\/join\/[A-Za-z0-9_-]+$/, { timeout: 15000 })
  })

  test('H2: inviting the other test account by username stores the invite on the trip', async ({ page }) => {
    await openInvite(page)
    await page.getByTestId('invite-username').fill(FRIEND)
    const inviteBtn = page.getByTestId('invite-user').first()
    await expect(inviteBtn).toBeVisible({ timeout: 15000 })
    await inviteBtn.click()
    await expect(page.getByText(/✓ Invited /)).toBeVisible()

    const saved = await (await trip.api.get('/api/trips/' + trip.id)).json()
    const usernames = (saved.pendingInvites || []).map((p) => String(p.username || '').toLowerCase())
    expect(usernames, 'pending invites on the server').toContain(FRIEND)
  })

  test('U1: a username nobody has is reported clearly', async ({ page }) => {
    await openInvite(page)
    await page.getByTestId('invite-username').fill('zz_nobody_e2e')
    await expect(page.getByText('No account starts with "@zz_nobody_e2e". Send them the link instead.')).toBeVisible({ timeout: 15000 })
  })

  test('U2: fewer than 3 letters asks for more', async ({ page }) => {
    await openInvite(page)
    await page.getByTestId('invite-username').fill('ab')
    await expect(page.getByText('Type at least 3 letters.')).toBeVisible()
  })
})
