import { test, expect } from '@playwright/test'


test('user can open a trip and switch to Day 2', async ({ page }) => {
  // 1. Go directly to the login page
  await page.goto('/login')


  // 2. Log in
  await page.getByTestId('login-username').fill(process.env.E2E_USERNAME)
  await page.getByTestId('login-password').fill(process.env.E2E_PASSWORD)
  await page.getByTestId('login-submit').click()


  // 3. Successful login should bring the user to My Trips
  await expect(page).toHaveURL(/\/home/)


  // 4. Find the "Kyoto" trip card
  const tripCard = page.locator('.trip-card').filter({
    hasText: 'Kyoto'
  }).last()


  // 5. Open that trip
  await tripCard.getByTestId('open-trip').click()


  // 6. The trip should open on the Itinerary page
  await expect(
    page.getByRole('heading', { name: 'Itinerary' })
  ).toBeVisible()


  // 7. Day 1 should initially be selected
  const day1 = page.getByRole('tab', { name: /Day 1/ })
  await expect(day1).toHaveAttribute('aria-selected', 'true')


  // 8. Click Day 2
  const day2 = page.getByRole('tab', { name: /Day 2/ })
  await day2.click()


  // 9. Day 2 should now be selected
  await expect(day2).toHaveAttribute('aria-selected', 'true')
})


test('user can lock and unlock an itinerary stop', async ({ page }) => {
  // 1. Go to login
  await page.goto('/login')


  // 2. Log in
  await page.getByTestId('login-username').fill(process.env.E2E_USERNAME)
  await page.getByTestId('login-password').fill(process.env.E2E_PASSWORD)
  await page.getByTestId('login-submit').click()


  await expect(page).toHaveURL(/\/home/)


  // 3. Find the Kyoto trip
  const tripCard = page.locator('.trip-card').filter({
    hasText: 'Kyoto'
  }).last()


  // 4. Open the trip
  await tripCard.getByTestId('open-trip').click()


  // 5. Check that the Itinerary page is visible
  await expect(
    page.getByRole('heading', { name: 'Itinerary' })
  ).toBeVisible()


  // 6. Find the first UNLOCKED stop
  const lockButton = page.getByRole('button', {
    name: /^Lock /
  }).first()


  await expect(lockButton).toBeVisible()


  // Remember its current label, e.g. "Lock Kiyomizu-dera"
  const lockLabel = await lockButton.getAttribute('aria-label')


  // 7. Lock the stop
  await lockButton.click()


  // The label should now become:
  // "Lock Kiyomizu-dera" -> "Unlock Kiyomizu-dera"
  const unlockLabel = lockLabel.replace(/^Lock /, 'Unlock ')


  const unlockButton = page.getByRole('button', {
    name: unlockLabel
  })


  await expect(unlockButton).toBeVisible()


  // 8. CLEANUP: unlock it again
  // This prevents the test from permanently changing our test trip.
  await unlockButton.click()


  // 9. Verify it returned to the original unlocked state
  await expect(
    page.getByRole('button', { name: lockLabel })
  ).toBeVisible()
})


test('simulated rainy weather generates an itinerary replan', async ({ page }) => {
  // 1. Log in
  await page.goto('/login')


  await page.getByTestId('login-username').fill(process.env.E2E_USERNAME)
  await page.getByTestId('login-password').fill(process.env.E2E_PASSWORD)
  await page.getByTestId('login-submit').click()


  await expect(page).toHaveURL(/\/home/)


  // 2. Open the Kyoto trip
  const tripCard = page.locator('.trip-card').filter({
    hasText: 'Kyoto'
  }).last()


  await tripCard.getByTestId('open-trip').click()


  await expect(
    page.getByRole('heading', { name: 'Itinerary' })
  ).toBeVisible()


  // 3. Find the weather simulation section
  const weatherSection = page.locator('.ip-weather-sim').filter({
    hasText: 'Simulate weather conditions'
  })


  await expect(weatherSection).toBeVisible()


  // 4. Open the itinerary-stop dropdown
  await weatherSection
    .getByLabel('Itinerary stop')
    .click()


  // 5. Choose the first available stop
  const firstStopOption = page.getByRole('option').first()
  await firstStopOption.click()


  // 6. The weather dropdown automatically suggests
  // the opposite of the stop's original weather.
  // For this test we specifically want Rainy.
  await weatherSection
    .getByLabel('Simulate weather')
    .click()


  await page
    .getByRole('option', { name: /Rainy/i })
    .click()


  // 7. Apply the simulated rainy weather
    await weatherSection
    .locator('button.ip-sim-button')
    .click()


  // 8. Verify that rainy weather is now being simulated
  await expect(weatherSection).toContainText('Simulating')
  await expect(weatherSection).toContainText('rainy')


  // 9. The app should suggest clearer times
  await expect(
    weatherSection.getByText('Try a clearer time')
  ).toBeVisible()



// 10. Check whether a clearer alternative time is available
const clearerTime = weatherSection
  .getByRole('button', { name: /^Preview moving it to / })
  .first()

const noClearTime = weatherSection.getByText(
  'No suitable clear time is available today.'
)

// The app must either offer a preview or explain why it cannot
await expect(
  clearerTime.or(noClearTime).first()
).toBeVisible()

if (await clearerTime.isVisible()) {
  // 11A. A clearer time exists: preview the replan
  await clearerTime.click()

  await expect(
    weatherSection.getByText('Proposed itinerary change')
  ).toBeVisible()

  await expect(
    weatherSection.getByText('Expected weather:')
  ).toBeVisible()
} else {
    // 11B. No suitable time exists: verify the explanation
    await expect(noClearTime).toBeVisible()
}

  // 12. Reset the simulation so the test leaves no changes behind
  await weatherSection
    .getByRole('button', { name: 'Reset' })
    .click()


  await expect(
    weatherSection.getByText('Proposed itinerary change')
  ).not.toBeVisible()
})
