/* packing.spec.js — E2E test (by Lam)

 WHAT:  The Packing tab in a real browser, against the real deployed server and database, signed in as the
        test account (E2E_USERNAME / E2E_PASSWORD), on a fresh 3-day Kyoto trip the test makes through the
        API first and deletes at the end.
 WHY:   The unit and component tests fake the server. Only this test proves a traveller's packing progress
        actually reaches the database and comes back after a reload — losing it is the worst packing bug.

 | Case | User does                                                  | Expected                                              |
 |------|------------------------------------------------------------|-------------------------------------------------------|
 | H1   | Ticks an unpacked item, waits for "Saved ✓", reloads        | still ticked and still "1 of N packed" after reload   |
 | H2   | Adds own item "E2E item <time>", reloads, then removes it   | item is still there after reload; gone after removing |
 | U1   | Types only spaces into "Add" and presses Enter              | Add is disabled, the item count does not change       |
*/

import { test, expect } from '@playwright/test'
import { hasLogin, E2E_USE, createTestTrip, deleteTestTrip, openTrip, debugOnFailure } from '../../shared/e2e.js'

test.use(E2E_USE)
test.skip(!hasLogin, 'Needs E2E_USERNAME and E2E_PASSWORD (the test account)')
debugOnFailure(test)

let trip // this file's own test trip, made in beforeAll

async function openPacking(page) {
  await openTrip(page, trip, 'packing')
  await expect(page.getByTestId('packing-progress')).toBeVisible()
}

// "3 of 25 packed" -> { packed: 3, total: 25 }
async function progress(page) {
  const text = await page.getByTestId('packing-progress').innerText()
  const [, packed, total] = text.match(/(\d+) of (\d+) packed/)
  return { packed: Number(packed), total: Number(total) }
}
const progressIs = (page, packed, total) => expect(page.getByTestId('packing-progress')).toHaveText(new RegExp('^\\s*' + packed + ' of ' + total + ' packed\\s*$'))
const saved = (page) => expect(page.locator('#pane-packing').getByRole('status')).toHaveText('Saved ✓', { timeout: 15000 })

test.describe('E2E · Packing — progress and own items are saved to the server and survive a reload', () => {
  test.beforeAll(async ({ playwright }, info) => {
    trip = await createTestTrip(playwright, info.project.use.baseURL)
  })
  test.afterAll(async () => {
    await deleteTestTrip(trip)
  })

  test('H1: a ticked item stays ticked after reloading the page', async ({ page }) => {
    await openPacking(page)
    const before = await progress(page)
    expect(before.packed, 'need at least one unpacked item to tick').toBeLessThan(before.total)

    const row = page.locator('.pk-item:not(.packed)').first()
    const name = (await row.locator('.pk-name').innerText()).split('\n')[0].trim()
    await row.getByTestId('packing-check').check()
    await progressIs(page, before.packed + 1, before.total)
    await saved(page)

    await page.reload()
    await expect(page.getByTestId('packing-progress')).toBeVisible({ timeout: 20000 })
    await progressIs(page, before.packed + 1, before.total)
    await expect(page.locator('.pk-item', { hasText: name }).first().getByTestId('packing-check')).toBeChecked()
  })

  test('H2: my own item is still on the list after a reload, and removing it takes it off', async ({ page }) => {
    await openPacking(page)
    const before = await progress(page)
    const itemName = 'E2E item ' + Date.now()

    const other = page.locator('[aria-labelledby="pk-cat-other"]')
    await other.getByLabel('Add an item to Other').fill(itemName)
    await other.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('.pk-item', { hasText: itemName })).toContainText('Added by you')
    await progressIs(page, before.packed, before.total + 1)
    await saved(page)

    await page.reload()
    await expect(page.locator('.pk-item', { hasText: itemName })).toBeVisible({ timeout: 20000 })
    await progressIs(page, before.packed, before.total + 1)

    await page.getByRole('button', { name: 'Remove ' + itemName }).click()
    await expect(page.locator('.pk-item', { hasText: itemName })).toHaveCount(0)
    await progressIs(page, before.packed, before.total)
    await saved(page)
  })

  test('U1: a blank (spaces-only) item cannot be added', async ({ page }) => {
    await openPacking(page)
    const before = await progress(page)

    const other = page.locator('[aria-labelledby="pk-cat-other"]')
    const input = other.getByLabel('Add an item to Other')
    await input.fill('     ')
    await expect(other.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
    await input.press('Enter')

    await progressIs(page, before.packed, before.total)
  })
})
