// Settings that change what every page shows: units, countries, today's date
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { userSettings, formatTemp, formatDistance } from '../src/userSettings.js'
import { countryOf } from '../src/destinations.js'
import { localDate } from '../src/dates.js'

test('km / °C by default', () => {
  userSettings.units = 'metric'
  assert.equal(formatTemp(30), '30°C')
  assert.equal(formatDistance(0.42), '400 m')
  assert.equal(formatDistance(3.24), '3.2 km')
})

test('mi / °F when chosen in Settings', () => {
  userSettings.units = 'imperial'
  assert.equal(formatTemp(30), '86°F')
  assert.equal(formatTemp(30, true), '86°')
  assert.equal(formatDistance(3.2), '2.0 mi')
  userSettings.units = 'metric'
})

test('"Tokyo" and "Kyoto, Japan" are the same country; unknown places are not counted', () => {
  assert.equal(countryOf('Tokyo'), 'Japan')
  assert.equal(countryOf('Kyoto, Japan'), 'Japan')
  assert.equal(countryOf('Singapore'), 'Singapore')
  assert.equal(countryOf('Atlantis'), '')
})

test("today is the user's local date, not UTC", () => {
  assert.equal(localDate(new Date(2026, 0, 5, 0, 30)), '2026-01-05') // 12:30 AM local
})
