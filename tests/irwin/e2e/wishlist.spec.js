/* wishlist.spec.js — E2E test (by Irwin)

 WHAT:  "Places → Wishlist" in a real browser, against the real deployed server and database, signed in as the
        test account (E2E_USERNAME / E2E_PASSWORD), on a fresh trip the test makes first and deletes at the end.
 WHY:   The wishlist is shared by the group. A booked tour must be saved for everyone (survive a reload),
        removing must really remove it, and a broken booking link must never be saved.

 | Case | User does                                                        | Expected                                       |
 |------|------------------------------------------------------------------|------------------------------------------------|
 | U1   | "Add a tour" with link "not a link"                               | error shown; nothing added (also after reload) |
*/

import { test, expect } from '@playwright/test'
import { hasLogin, E2E_USE, createTestTrip, deleteTestTrip, openTrip, debugOnFailure } from '../../shared/e2e.js'

test.use(E2E_USE)
test.skip(!hasLogin, 'Needs E2E_USERNAME and E2E_PASSWORD (the test account)')
debugOnFailure(test)

let trip // this file's own test trip, made in beforeAll

async function openWishlist(page) {
  await openTrip(page, trip, 'places')
  await expect(page.getByRole('heading', { name: /Your wishlist/ })).toBeVisible()
}
async function fillTour(page, name, link) {
  await page.getByRole('button', { name: /Add a tour/ }).click()
  const form = page.getByRole('form', { name: 'Add a tour or activity' })
  await form.locator('#wl-tour-name').fill(name)
  await form.locator('#wl-tour-link').fill(link)
  await form.locator('button[type="submit"]').click()
}
// The trip as saved on the server (wishlist names)
async function savedWishlist() {
  const t = await (await trip.api.get('/api/trips/' + trip.id)).json()
  return (t.wishlist || []).map((w) => w.name)
}

test.describe('E2E · Wishlist — a tour with a broken booking link is refused and never saved', () => {
  test.beforeAll(async ({ playwright }, info) => {
    trip = await createTestTrip(playwright, info.project.use.baseURL)
  })
  test.afterAll(async () => {
    await deleteTestTrip(trip)
  })

  test('U1: a tour with a broken booking link is refused and never saved', async ({ page }) => {
    await openWishlist(page)
    await fillTour(page, 'E2E bad link tour', 'not a link')
    await expect(page.getByRole('alert').filter({ hasText: "That booking link doesn't look right" })).toBeVisible()

    await page.waitForTimeout(2000)
    expect(await savedWishlist()).not.toContain('E2E bad link tour')
  })
})
