/* photos.spec.js — E2E test (by Lam)

 WHAT:  The Photos tab in a real browser, against the real deployed server and database, signed in as the
        test account (E2E_USERNAME / E2E_PASSWORD), on a fresh trip the test makes first and deletes at the
        end (which also deletes its photos).
 WHY:   Uploads and reactions are shared with the whole group, so they must really be stored — a reaction
        that only lives in your browser is a lie to everyone else. And bad files must be stopped in the
        browser before they are sent (a 10 MB+ file or a HEIC would otherwise fail on the server or show broken).

 | Case | User does                                                     | Expected                                          |
 |------|---------------------------------------------------------------|---------------------------------------------------|
 | H1   | New album → upload a JPEG → react ❤️ → reload                  | photo in the album; ❤️ is "1" and mine after reload|
 |      | → react ❤️ again                                               | ❤️ back to 0                                       |
 | U1   | Picks a .txt, a .heic and an 11 MB "JPEG"                      | 3 clear error messages; nothing is sent to the    |
 |      |                                                               | server                                            |
*/

import { test, expect } from '@playwright/test'
import { hasLogin, E2E_USE, createTestTrip, deleteTestTrip, openTrip, debugOnFailure } from '../../shared/e2e.js'

test.use(E2E_USE)
test.skip(!hasLogin, 'Needs E2E_USERNAME and E2E_PASSWORD (the test account)')
debugOnFailure(test)

let trip // this file's own test trip, made in beforeAll

const picker = (page) => page.locator('input[type="file"][accept^="image/jpeg"]')
// The ❤️ button on the first photo tile (reaction buttons only show on hover, so hover first)
async function heart(page, count) {
  const tile = page.getByTestId('photo-grid').locator('.ph-tile').first()
  await tile.hover()
  return tile.getByRole('button', { name: '❤️ ' + count, exact: true })
}

test.describe('E2E · Photos — upload to an album, react, and reject files that are not photos', () => {
  test.beforeAll(async ({ playwright }, info) => {
    trip = await createTestTrip(playwright, info.project.use.baseURL)
  })
  test.afterAll(async () => {
    await deleteTestTrip(trip)
  })

  test('H1: an uploaded photo can be reacted to, and the reaction is saved for the group', async ({ page }) => {
    await openTrip(page, trip, 'photos')
    await expect(page.getByRole('heading', { name: 'Shared roll' })).toBeVisible()

    const albumName = 'Lam E2E ' + Date.now()
    await page.getByRole('button', { name: '+ Add album' }).click()
    await page.getByLabel('Album name').fill(albumName)
    // KNOWN RACE (found by this test): the new album is selected at once but saved in the background; a photo
    // uploaded before that save finishes silently lands in Highlights. So wait for the album to be saved first.
    const albumSaved = page.waitForResponse((r) => r.url().endsWith('/albums') && r.request().method() === 'PUT')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    expect((await albumSaved).ok(), 'album saved on the server').toBe(true)
    await expect(page.getByRole('tab', { name: new RegExp(albumName) })).toHaveAttribute('aria-selected', 'true')

    await picker(page).setInputFiles('tests/lam/e2e/fixtures/test-photo.jpg')
    await expect(page.getByText('Added ✓')).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('photo-grid').getByRole('img', { name: /Photo by/ })).toHaveCount(1)

    await (await heart(page, 0)).click()
    await expect(await heart(page, 1)).toHaveAttribute('aria-pressed', 'true')

    // reload: the reaction must come back from the server (and the photo must still be in the album)
    await page.waitForTimeout(1500) // let the reaction request finish
    await page.reload()
    await page.getByRole('tab', { name: new RegExp(albumName) }).click({ timeout: 20000 })
    await expect(await heart(page, 1)).toHaveAttribute('aria-pressed', 'true')

    await (await heart(page, 1)).click()
    await expect(await heart(page, 0)).toHaveAttribute('aria-pressed', 'false')
  })

  test('U1: a text file, a HEIC photo and a file over 10 MB are rejected before upload', async ({ page }) => {
    await openTrip(page, trip, 'photos')
    await expect(page.getByRole('heading', { name: 'Shared roll' })).toBeVisible()

    const uploads = []
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/api\/trips\/[^/]+\/photos(\?|$)/.test(req.url())) uploads.push(req.url())
    })

    await picker(page).setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') },
      { name: 'IMG_0001.heic', mimeType: 'image/heic', buffer: Buffer.from('fake heic') },
      { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(11 * 1024 * 1024) }
    ])

    const errors = page.getByRole('alert')
    await expect(errors.filter({ hasText: 'notes.txt: Not a JPEG, PNG, WebP or GIF' })).toBeVisible()
    await expect(errors.filter({ hasText: 'IMG_0001.heic: HEIC photos are not supported, export as JPEG' })).toBeVisible()
    await expect(errors.filter({ hasText: 'huge.jpg: Bigger than 10 MB' })).toBeVisible()

    await page.waitForTimeout(1000)
    expect(uploads, 'no file should have been sent to the server').toEqual([])
  })
})
