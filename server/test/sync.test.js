// Two people using the same trip at once (the prof's "changes don't sync" feedback)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { startDb, stopDb, makeApp, makeTrip, stop, place } from './helpers.js'

const app = makeApp()
before(startDb)
after(stopDb)

const put = (id, token, path, body) => request(app).put('/api/trips/' + id + path).set('Authorization', token).send(body)
const get = (id, token, path = '') => request(app).get('/api/trips/' + id + path).set('Authorization', token)

test('wishlist: Amy and Ben save a place at the same time, both are kept', async () => {
  const t = await makeTrip()
  const base = { stops: [], wishlist: [] }
  const r1 = await put(t.id, t.amy, '/itinerary', { stops: [], wishlist: [place('w1')], version: 0, base })
  const r2 = await put(t.id, t.ben, '/itinerary', { stops: [], wishlist: [place('w2')], version: 0, base })
  assert.equal(r1.status, 200)
  assert.equal(r2.status, 200)
  assert.equal(r2.body.merged, true)
  const trip = (await get(t.id, t.amy)).body
  assert.deepEqual(trip.wishlist.map((w) => w.id).sort(), ['w1', 'w2'])
})

test('itinerary: Ben adds a place while Amy moves a stop, both are kept', async () => {
  const t = await makeTrip()
  const s = stop('s1', '2026-12-01', 9)
  await put(t.id, t.amy, '/itinerary', { stops: [s], wishlist: [], version: 0 })
  const base = { stops: [s], wishlist: [] }
  await put(t.id, t.amy, '/itinerary', { stops: [{ ...s, hour: 14 }], wishlist: [], version: 1, base })
  const r = await put(t.id, t.ben, '/itinerary', { stops: [s], wishlist: [place('w9')], version: 1, base })
  assert.equal(r.status, 200)
  assert.equal(r.body.trip.stops[0].hour, 14) // Amy's move
  assert.equal(r.body.trip.wishlist[0].id, 'w9') // Ben's place
})

test('itinerary: both change the days at once, the second gets 409 with the latest trip', async () => {
  const t = await makeTrip()
  const s = stop('s1', '2026-12-01', 9)
  await put(t.id, t.amy, '/itinerary', { stops: [s], wishlist: [], version: 0 })
  const base = { stops: [s], wishlist: [] }
  const r1 = await put(t.id, t.amy, '/itinerary', { stops: [{ ...s, hour: 10 }], wishlist: [], version: 1, base })
  const r2 = await put(t.id, t.ben, '/itinerary', { stops: [{ ...s, hour: 16 }], wishlist: [], version: 1, base })
  assert.equal(r1.status, 200)
  assert.equal(r2.status, 409)
  assert.equal(r2.body.trip.stops[0].hour, 10)
})

test('albums: Amy and Ben each add an album, both are kept', async () => {
  const t = await makeTrip()
  await put(t.id, t.amy, '/albums', { albums: [{ id: 'a1', name: 'Shrines', icon: '⛩' }], base: [] })
  const r = await put(t.id, t.ben, '/albums', { albums: [{ id: 'a2', name: 'Food', icon: '🍜' }], base: [] })
  assert.deepEqual(r.body.albums.map((a) => a.id), ['a1', 'a2'])
  assert.equal((await get(t.id, t.amy, '/albums')).body.albums.length, 2)
})

test('packing: Amy and Ben tick different items, both stay ticked', async () => {
  const t = await makeTrip()
  const empty = { checked: {}, qty: {}, removed: [], custom: [] }
  await put(t.id, t.amy, '/packing', { packing: { ...empty, checked: { passport: true } }, base: empty })
  await put(t.id, t.ben, '/packing', { packing: { ...empty, checked: { charger: true } }, base: empty })
  const res = await get(t.id, t.ben, '/packing')
  assert.deepEqual(res.body.packing.checked, { passport: true, charger: true })
})
