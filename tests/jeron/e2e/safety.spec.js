/* safety.spec.js — E2E test (by Jeron)

 WHAT:  The Safety tab in a real browser, against the real deployed server, signed in as the test account
        (E2E_USERNAME / E2E_PASSWORD), on a fresh Kyoto, Japan trip the test makes first and deletes at the end.
 WHY:   In an emergency the right number must be one tap away for the country you're in. And simulated
        emergencies (demo tools for presenting) must never be mixed up with real alerts for normal users.

 | Case | User does                                          | Expected                                                |
 |------|----------------------------------------------------|---------------------------------------------------------|
 | H1   | Opens Safety on a Kyoto trip                       | Emergency calls for Japan: tap-to-call 110 (Police),    |
 |      |                                                    | 119 (Ambulance & Fire), and Singapore's MFA helpline    |
 | H2   | Opens Safety with ?demo=1 (presenter mode)         | "Demo tools" are there to simulate a situation          |
 | U1   | Opens Safety normally (a real user)                | NO demo tools, and no alert marked "demo" / SIMULATED   |
*/

import { test, expect } from '@playwright/test'
import { hasLogin, E2E_USE, createTestTrip, deleteTestTrip, openTrip, debugOnFailure } from '../../shared/e2e.js'

test.use(E2E_USE)
test.skip(!hasLogin, 'Needs E2E_USERNAME and E2E_PASSWORD (the test account)')
debugOnFailure(test)

let trip // this file's own test trip, made in beforeAll

test.describe('E2E · Safety — the right emergency numbers, and simulations kept apart from real alerts', () => {
  test.beforeAll(async ({ playwright }, info) => {
    trip = await createTestTrip(playwright, info.project.use.baseURL)
  })
  test.afterAll(async () => {
    await deleteTestTrip(trip)
  })

  test('H1: a Kyoto trip shows Japan\'s emergency numbers as tap-to-call links', async ({ page }) => {
    await openTrip(page, trip, 'safety')
    await expect(page.getByRole('heading', { name: /Emergency calls/ })).toContainText('Japan', { timeout: 30000 })

    const police = page.locator('a.sf-call', { hasText: 'Police' }).first()
    await expect(police).toHaveAttribute('href', 'tel:110')
    await expect(page.locator('a.sf-call', { hasText: 'Ambulance & Fire' })).toHaveAttribute('href', 'tel:119')
    await expect(page.locator('a.sf-call', { hasText: 'Singapore MFA 24h duty office' })).toHaveAttribute('href', 'tel:+6563798800')
  })

  test('H2: presenter mode (?demo=1) shows the demo tools for simulating a situation', async ({ page }) => {
    await openTrip(page, trip, 'safety')
    await page.goto('/trip/' + trip.id + '?tab=safety&demo=1')
    await expect(page.getByTestId('safety-layer')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('details.sf-demo summary')).toContainText('Demo tools')
  })

  test('U1: a normal user never sees demo tools or simulated ("demo") alerts', async ({ page }) => {
    await openTrip(page, trip, 'safety')
    await expect(page.getByTestId('risk-card')).toBeVisible()
    await page.waitForTimeout(3000) // let the live checks come back
    await expect(page.locator('details.sf-demo')).toHaveCount(0)
    await expect(page.getByTestId('safety-layer').locator('.sf-tag', { hasText: 'demo' })).toHaveCount(0)
    await expect(page.getByTestId('safety-layer')).not.toContainText('SIMULATED')
  })
})
