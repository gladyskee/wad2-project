// Shared setup for the API tests: a throwaway MongoDB in memory, the trip routes,
// and a trip with two people on it (Amy organises, Ben joined with his own account).
import express from 'express'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { MongoMemoryServer } from 'mongodb-memory-server'
import Trip from '../models/trip.js'
import User from '../models/User.js'
import tripRoutes from '../routes/trips.js'
import expenseRoutes from '../routes/expenses.js'

process.env.JWT_SECRET = 'test-secret'

let mongo
export async function startDb() {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
}
export async function stopDb() {
  await mongoose.disconnect()
  await mongo.stop()
}

export function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/trips/:tripId/expenses', expenseRoutes)
  app.use('/api/trips', tripRoutes)
  return app
}

// A fresh trip each test: Amy (owner) and Ben (member) have accounts, Cat is a guest
export async function makeTrip(extra = {}) {
  const n = Math.random().toString(36).slice(2, 8)
  const amy = await User.create({ name: 'Amy', username: 'amy' + n, email: 'amy' + n + '@x.com', passwordHash: 'x' })
  const ben = await User.create({ name: 'Ben', username: 'ben' + n, email: 'ben' + n + '@x.com', passwordHash: 'x' })
  const trip = await Trip.create({
    owner: amy._id, name: 'Test trip', destination: 'Tokyo, Japan', destinations: ['Tokyo, Japan'],
    startDate: '2026-12-01', endDate: '2026-12-03', travellers: ['Amy', 'Ben', 'Cat'],
    members: [{ user: amy._id, name: 'Amy', role: 'owner' }, { user: ben._id, name: 'Ben', role: 'member' }],
    ...extra
  })
  const token = (u) => 'Bearer ' + jwt.sign({ id: u._id }, process.env.JWT_SECRET)
  return { id: String(trip._id), amy: token(amy), ben: token(ben) }
}

export const stop = (id, date, hour, more = {}) => ({ id, name: 'Stop ' + id, address: null, date, hour, duration: 1, outdoor: false, locked: false, ...more })
export const place = (id, more = {}) => ({ id, name: 'Place ' + id, address: null, outdoor: false, type: 'museum', city: null, votes: [], ...more })
