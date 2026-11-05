// Shared steps for the browser (E2E) tests in tests/<person>/e2e/.
//  - Each test file makes its OWN trip through the API before its tests and deletes it afterwards
//    (deleting a trip also deletes its photos and invites), so tests never depend on, or change, real trips.
//  - Logging in: the API gives a token, which is put in the browser's storage before the app loads
//    (the same thing the login page does), so every test starts already signed in.
//  - debugOnFailure(test): when a test fails, prints the page address, what the page says, failed
//    requests and browser errors into the GitHub Actions log, so a failure can be understood from the log.
import { expect } from '@playwright/test'

export const hasLogin = !!(process.env.E2E_USERNAME && process.env.E2E_PASSWORD)

// Same for every E2E file: wide window (all trip tabs visible), no animations (they make clicks wait),
// screenshots + traces of failures (uploaded by the workflow).
export const E2E_USE = {
  viewport: { width: 1600, height: 1000 },
  reducedMotion: 'reduce',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure'
}

async function apiLogin(playwright, baseURL) {
  const anon = await playwright.request.newContext({ baseURL })
  const res = await anon.post('/api/auth/login', { data: { username: process.env.E2E_USERNAME, password: process.env.E2E_PASSWORD } })
  const body = await res.text()
  await anon.dispose()
  expect(res.ok(), 'API login as ' + process.env.E2E_USERNAME + ' failed: ' + res.status() + ' ' + body).toBe(true)
  return JSON.parse(body) // { token, user }
}

// Makes a 3-day Kyoto trip (sightseeing, mild weather). Returns { id, token, user, api } where api sends the token.
export async function createTestTrip(playwright, baseURL, extra = {}) {
  const login = await apiLogin(playwright, baseURL)
  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Authorization: 'Bearer ' + login.token } })
  const res = await api.post('/api/trips', {
    data: {
      name: 'E2E ' + process.env.E2E_USERNAME + ' ' + Date.now(),
      destinations: ['Kyoto, Japan'],
      startDate: '2026-03-01',
      endDate: '2026-03-03',
      activities: ['sightseeing'],
      weather: ['mild'],
      ...extra
    }
  })
  const body = await res.text()
  expect(res.status(), 'create test trip: ' + body).toBe(201)
  const trip = JSON.parse(body)
  return { id: String(trip.id), me: trip.me, token: login.token, user: login.user, api }
}

export async function deleteTestTrip(trip) {
  if (!trip) return
  await trip.api.delete('/api/trips/' + trip.id).catch(() => {})
  await trip.api.dispose()
}

// Opens /trip/<id>?tab=<tab> already signed in, and waits for that tab's panel
export async function openTrip(page, trip, tab) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
  }, { token: trip.token, user: trip.user })
  await page.goto('/trip/' + trip.id + (tab ? '?tab=' + tab : ''))
  if (tab) await expect(page.locator('#pane-' + tab)).toBeVisible({ timeout: 20000 })
}

export function debugOnFailure(test) {
  test.beforeEach(async ({ page }) => {
    const log = []
    page.on('console', (m) => { if (m.type() === 'error') log.push('browser console error: ' + m.text()) })
    page.on('pageerror', (e) => log.push('page crashed: ' + e.message))
    page.on('response', (r) => { if (r.status() >= 400) log.push('HTTP ' + r.status() + ' ' + r.request().method() + ' ' + r.url()) })
    page.on('requestfailed', (r) => log.push('request failed: ' + r.method() + ' ' + r.url() + ' (' + (r.failure() || {}).errorText + ')'))
    page.__debugLog = log
  })
  test.afterEach(async ({ page }, info) => {
    if (info.status === info.expectedStatus) return
    const text = await page.locator('body').innerText({ timeout: 3000 }).catch((e) => '(could not read the page: ' + e.message + ')')
    console.log([
      '',
      '──────── DEBUG: ' + info.title + ' ────────',
      'Page address: ' + page.url(),
      'Error: ' + ((info.error && info.error.message) || '').split('\n').slice(0, 6).join('\n       '),
      'Requests/errors seen:',
      ...(page.__debugLog || []).slice(-25).map((l) => '  ' + l),
      'What the page said (first 2500 characters):',
      text.replace(/\n{2,}/g, '\n').slice(0, 2500),
      '──────── END DEBUG ────────'
    ].join('\n'))
  })
}
