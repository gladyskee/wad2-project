// Safety: a disaster only counts if it is close enough to the trip
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nearDisaster } from '../src/services/safetyService.js'

const tokyo = { lat: 35.68, lon: 139.69 }
const event = (type, lon, lat) => ({ geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { eventtype: type } })

test('a cyclone near Okinawa is not a risk in Tokyo', () => {
  assert.equal(nearDisaster(event('TC', 127.7, 26.2), tokyo.lat, tokyo.lon).near, false)
})

test('an earthquake 50 km from Tokyo is', () => {
  const r = nearDisaster(event('EQ', 139.9, 35.3), tokyo.lat, tokyo.lon)
  assert.equal(r.near, true)
  assert.ok(r.distanceKm < 100)
})

test('droughts count anywhere in the country', () => {
  assert.equal(nearDisaster(event('DR', 130.0, 33.0), tokyo.lat, tokyo.lon).near, true)
})
