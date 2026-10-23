// Rules the server enforces, so the data stays right even if a page is out of date
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { startDb, stopDb, makeApp, makeTrip, stop, place } from './helpers.js'
import SavedRoute from '../models/transport.js'

const app = makeApp()
before(startDb)
after(stopDb)

const api = (method, id, token, path, body) => request(app)[method]('/api/trips/' + id + path).set('Authorization', token).send(body)

test('a saved place without a majority cannot go on a day', async () => {
  const t = await makeTrip({ wishlist: [place('w1', { name: 'Shrine', votes: ['Amy'] })] })
  const r = await api('put', t.id, t.amy, '/itinerary', { stops: [stop('s1', '2026-12-01', 9, { name: 'Shrine' })], wishlist: [place('w1', { name: 'Shrine', votes: ['Amy'] })] })
  assert.equal(r.status, 400)
  assert.match(r.body.message, /vote/)
})

test('with 2 of 3 votes it can', async () => {
  const t = await makeTrip({ wishlist: [place('w1', { name: 'Shrine', votes: ['Amy', 'Ben'] })] })
  const r = await api('put', t.id, t.amy, '/itinerary', { stops: [stop('s1', '2026-12-01', 9, { name: 'Shrine' })], wishlist: [place('w1', { name: 'Shrine', votes: ['Amy', 'Ben'] })] })
  assert.equal(r.status, 200)
})

test('removing a guest removes their votes', async () => {
  const t = await makeTrip({ wishlist: [place('w1', { votes: ['Amy', 'Cat'] })] })
  await api('delete', t.id, t.amy, '/guests/Cat')
  const trip = (await api('get', t.id, t.amy, '')).body
  assert.deepEqual(trip.wishlist[0].votes, ['Amy'])
})

test('the trip cannot end before a planned stop', async () => {
  const t = await makeTrip({ stops: [stop('s1', '2026-12-03', 9)] })
  const r = await api('put', t.id, t.amy, '/dates', { endDate: '2026-12-02' })
  assert.equal(r.status, 400)
  assert.match(r.body.message, /Move it first/)
})

test('moving the whole trip moves the saved routes too', async () => {
  const t = await makeTrip({ stops: [stop('s1', '2026-12-02', 9)] })
  await SavedRoute.create({ tripId: t.id, start: 'A', end: 'B', options: [{ type: 'Walk', route: 'On foot', duration: 5, day: '2026-12-02' }] })
  const r = await api('put', t.id, t.amy, '', { name: 'Test trip', destinations: ['Tokyo, Japan'], startDate: '2026-12-08', endDate: '2026-12-10' })
  assert.equal(r.status, 200)
  const route = await SavedRoute.findOne({ tripId: t.id })
  assert.equal(route.options[0].day, '2026-12-09')
})

test('exact split amounts must add up to the bill', async () => {
  const t = await makeTrip()
  const r = await api('post', t.id, t.amy, '/expenses/items', {
    title: 'Dinner', amount: 30, currency: 'SGD', paidBy: 'Amy', date: '2026-12-01', splitType: 'exact', exact: { Amy: 10, Ben: 10 }
  })
  assert.equal(r.status, 400)
})
