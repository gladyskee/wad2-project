import express from 'express'
import mongoose from 'mongoose'
import Trip from '../models/trip.js'
import User from '../models/User.js'
import { requireAuth } from './auth.js'

const router = express.Router()
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function toClient(t) {
  return {
    id: t._id,
    name: t.name,
    destination: t.destination,
    startDate: t.startDate,
    endDate: t.endDate,
    travellers: t.travellers,
    stops: t.stops || [],
    wishlist: t.wishlist || []
  }
}

// Clean the stops sent by the browser. Returns null if anything is invalid.
function cleanStops(list) {
  if (!Array.isArray(list) || list.length > 100) return null
  const out = []
  for (const s of list) {
    if (!s || typeof s !== 'object') return null
    const name = typeof s.name === 'string' ? s.name.trim() : ''
    if (!name || name.length > 120) return null
    if (typeof s.date !== 'string' || !DATE_PATTERN.test(s.date)) return null
    const hour = Number(s.hour)
    if (!Number.isFinite(hour) || hour < 0 || hour >= 24) return null
    let duration = null
    if (s.duration !== null && s.duration !== undefined) {
      duration = Number(s.duration)
      if (!Number.isFinite(duration) || duration <= 0 || duration > 24) return null
    }
    const address = typeof s.address === 'string' && s.address.trim() ? s.address.trim().slice(0, 200) : null
    out.push({
      id: String(s.id || new mongoose.Types.ObjectId()).slice(0, 40),
      name, address, date: s.date, hour, duration,
      outdoor: !!s.outdoor, locked: !!s.locked
    })
  }
  return out
}

function cleanWishlist(list) {
  if (!Array.isArray(list) || list.length > 30) return null
  const out = []
  for (const w of list) {
    if (!w || typeof w !== 'object') return null
    const name = typeof w.name === 'string' ? w.name.trim() : ''
    if (!name || name.length > 120) return null
    const address = typeof w.address === 'string' && w.address.trim() ? w.address.trim().slice(0, 200) : null
    out.push({ id: String(w.id || new mongoose.Types.ObjectId()).slice(0, 40), name, address })
  }
  return out
}

// GET /api/trips -> the logged-in user's trips, newest first
router.get('/', requireAuth, async (req, res) => {
  const trips = await Trip.find({ owner: req.userId }).sort({ createdAt: -1 })
  res.json(trips.map(toClient))
})

// POST /api/trips  { name, destination, startDate?, endDate?, travellers? }
router.post('/', requireAuth, async (req, res) => {
  const name = (req.body.name || '').trim()
  const destination = (req.body.destination || '').trim()
  const startDate = req.body.startDate || ''
  const endDate = req.body.endDate || ''

  if (!name || !destination) return res.status(400).json({ message: 'Trip name and destination are required.' })
  if (name.length > 80 || destination.length > 80) return res.status(400).json({ message: 'Name and destination must be 80 characters or fewer.' })
  if ((startDate && !DATE_PATTERN.test(startDate)) || (endDate && !DATE_PATTERN.test(endDate))) {
    return res.status(400).json({ message: 'Dates must look like 2026-10-12.' })
  }
  if (startDate && endDate && endDate < startDate) {
    return res.status(400).json({ message: 'The end date must be on or after the start date.' })
  }

  let travellers = Array.isArray(req.body.travellers) ? req.body.travellers : []
  travellers = travellers.map((n) => String(n).trim()).filter(Boolean).slice(0, 10)
  if (!travellers.length) {
    const user = await User.findById(req.userId)
    if (user) travellers = [user.name] // default: just the creator
  }

  const trip = await Trip.create({ owner: req.userId, name, destination, startDate, endDate, travellers })
  res.status(201).json(toClient(trip))
})

// GET /api/trips/:id
router.get('/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Trip not found.' })
  const trip = await Trip.findOne({ _id: req.params.id, owner: req.userId })
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  res.json(toClient(trip))
})

// PUT /api/trips/:id/itinerary  { stops: [...], wishlist: [...] }
router.put('/:id/itinerary', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Trip not found.' })
  const stops = cleanStops(req.body.stops)
  const wishlist = cleanWishlist(req.body.wishlist)
  if (!stops || !wishlist) return res.status(400).json({ message: 'Some itinerary details are invalid.' })

  const trip = await Trip.findOne({ _id: req.params.id, owner: req.userId })
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  trip.stops = stops
  trip.wishlist = wishlist
  trip.markModified('stops')
  trip.markModified('wishlist')
  await trip.save()
  res.json({ ok: true })
})

// DELETE /api/trips/:id
router.delete('/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Trip not found.' })
  const result = await Trip.deleteOne({ _id: req.params.id, owner: req.userId })
  if (!result.deletedCount) return res.status(404).json({ message: 'Trip not found.' })
  res.json({ ok: true })
})

export default router