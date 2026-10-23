// Getting around: only people on the trip see its routes, and "transit" that is only walking is dropped
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { startDb, stopDb, makeTrip } from './helpers.js'
import directionsRouter from '../routes/directions.js'

const app = express()
app.use(express.json())
app.use('/api/directions', directionsRouter)
before(startDb)
after(stopDb)

test('saved routes need a login', async () => {
  const t = await makeTrip()
  const r = await request(app).get('/api/directions/saved').query({ tripId: t.id })
  assert.equal(r.status, 401)
})

test('someone not on the trip cannot see its saved routes', async () => {
  const t = await makeTrip()
  const stranger = 'Bearer ' + jwt.sign({ id: '64b000000000000000000000' }, process.env.JWT_SECRET)
  const r = await request(app).get('/api/directions/saved').query({ tripId: t.id }).set('Authorization', stranger)
  assert.equal(r.status, 404)
  const ok = await request(app).get('/api/directions/saved').query({ tripId: t.id }).set('Authorization', t.amy)
  assert.equal(ok.status, 200)
})

test('a "transit" answer that is only walking is left out', async () => {
  const t = await makeTrip()
  const realFetch = globalThis.fetch
  process.env.GOOGLE_MAPS_API_KEY = 'test'
  // Google's answer: every mode = a 31 min walk, no bus or train
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ routes: [{ duration: '1860s', legs: [{ steps: [{ travelMode: 'WALK', staticDuration: '1860s' }] }] }] })
  })
  try {
    const r = await request(app).get('/api/directions').query({ origin: 'A', destination: 'B' }).set('Authorization', t.amy)
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.map((o) => o.type).sort(), ['Taxi / Car', 'Walk'])
  } finally {
    globalThis.fetch = realFetch
  }
})
