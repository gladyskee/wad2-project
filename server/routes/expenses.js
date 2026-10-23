import express from 'express'
import mongoose from 'mongoose'
import Trip from '../models/trip.js'
import { requireAuth } from './auth.js'
import { findTripFor, memberName } from '../tripAccess.js'

// Mounted at /api/trips/:tripId/expenses
// Each change is saved on its own (add one, edit one, delete one) with MongoDB's $push / $pull,
// so two people adding expenses at the same time never overwrite each other.
const router = express.Router({ mergeParams: true })

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CATEGORIES = ['food', 'stay', 'transport', 'activities', 'shopping', 'other']
const EMPTY = { homeCurrency: 'SGD', budget: null, items: [], settlements: [], groupRates: {} }

const code = (c) => (typeof c === 'string' && /^[A-Z]{3}$/.test(c) ? c : null)
const amountOk = (n) => Number.isFinite(n) && n > 0 && n <= 1e9

// One expense from the browser -> a clean copy, or null if something is wrong
function cleanItem(x, travellers, id, addedBy) {
  if (!x || typeof x !== 'object') return null
  const isPerson = (n) => typeof n === 'string' && travellers.includes(n)
  const title = typeof x.title === 'string' ? x.title.trim().slice(0, 80) : ''
  const amount = Number(x.amount)
  if (!title || !amountOk(amount) || !code(x.currency) || !isPerson(x.paidBy) || !DATE_PATTERN.test(x.date || '')) return null
  const people = Array.isArray(x.people) ? x.people.filter(isPerson) : []
  const exact = {}
  if (x.exact && typeof x.exact === 'object') {
    for (const name in x.exact) {
      const n = Number(x.exact[name])
      if (isPerson(name) && amountOk(n)) exact[name] = n
    }
  }
  const splitType = x.splitType === 'exact' ? 'exact' : 'equal'
  if (splitType === 'equal' && !people.length) return null
  if (splitType === 'exact' && !Object.keys(exact).length) return null
  // Exact shares must add up to the bill (the form checks this too)
  if (splitType === 'exact' && Math.abs(Object.values(exact).reduce((t, n) => t + n, 0) - amount) > 0.01) return null
  return {
    id, title, amount, currency: x.currency,
    category: CATEGORIES.includes(x.category) ? x.category : 'other',
    paidBy: x.paidBy, date: x.date, splitType, people, exact,
    addedBy, updatedAt: new Date().toISOString()
  }
}

async function loadTrip(req, res) {
  const trip = await findTripFor(req.userId, req.params.tripId)
  if (!trip) {
    res.status(404).json({ message: 'Trip not found.' })
    return null
  }
  // Start the expenses object the first time
  if (!trip.expenses) await Trip.updateOne({ _id: trip._id, expenses: null }, { $set: { expenses: EMPTY } })
  return trip
}

async function current(tripId) {
  const t = await Trip.findById(tripId).select('expenses')
  return t.expenses || EMPTY
}

// GET  -> the trip's expenses (the page asks every few seconds to see others' changes)
router.get('/', requireAuth, async (req, res) => {
  const trip = await loadTrip(req, res)
  if (!trip) return
  res.json(await current(trip._id))
})

// POST /items  { expense }  -> add one
router.post('/items', requireAuth, async (req, res) => {
  const trip = await loadTrip(req, res)
  if (!trip) return
  const item = cleanItem(req.body, trip.travellers, String(new mongoose.Types.ObjectId()), memberName(trip, req.userId))
  if (!item) return res.status(400).json({ message: 'Some expense details are invalid.' })
  await Trip.updateOne({ _id: trip._id }, { $push: { 'expenses.items': item } })
  res.status(201).json(await current(trip._id))
})

// PUT /items/:itemId  { expense }  -> edit one
router.put('/items/:itemId', requireAuth, async (req, res) => {
  const trip = await loadTrip(req, res)
  if (!trip) return
  const before = ((trip.expenses && trip.expenses.items) || []).find((x) => x.id === req.params.itemId)
  const item = cleanItem(req.body, trip.travellers, req.params.itemId, before ? before.addedBy : memberName(trip, req.userId))
  if (!item) return res.status(400).json({ message: 'Some expense details are invalid.' })
  const result = await Trip.updateOne({ _id: trip._id, 'expenses.items.id': req.params.itemId }, { $set: { 'expenses.items.$': item } })
  if (!result.matchedCount) return res.status(404).json({ message: 'Someone else deleted this expense.' })
  res.json(await current(trip._id))
})

// DELETE /items/:itemId
router.delete('/items/:itemId', requireAuth, async (req, res) => {
  const trip = await loadTrip(req, res)
  if (!trip) return
  await Trip.updateOne({ _id: trip._id }, { $pull: { 'expenses.items': { id: req.params.itemId } } })
  res.json(await current(trip._id))
})

// POST /settlements  { from, to, amount }  -> "Amy paid John back"
router.post('/settlements', requireAuth, async (req, res) => {
  const trip = await loadTrip(req, res)
  if (!trip) return
  const { from, to } = req.body
  const amount = Number(req.body.amount)
  if (!trip.travellers.includes(from) || !trip.travellers.includes(to) || from === to || !amountOk(amount)) {
    return res.status(400).json({ message: 'Invalid payment.' })
  }
  // Paid in the trip's currency at the time (so changing the currency later converts it, not re-reads it)
  const currency = (trip.expenses && trip.expenses.homeCurrency) || EMPTY.homeCurrency
  const s = { id: String(new mongoose.Types.ObjectId()), from, to, amount, currency, date: new Date().toISOString().slice(0, 10), addedBy: memberName(trip, req.userId) }
  await Trip.updateOne({ _id: trip._id }, { $push: { 'expenses.settlements': s } })
  res.status(201).json(await current(trip._id))
})

// DELETE /settlements/:id  -> undo a payment
router.delete('/settlements/:settlementId', requireAuth, async (req, res) => {
  const trip = await loadTrip(req, res)
  if (!trip) return
  await Trip.updateOne({ _id: trip._id }, { $pull: { 'expenses.settlements': { id: req.params.settlementId } } })
  res.json(await current(trip._id))
})

// PUT /rates/:code  { rate }  -> the group's own exchange rate, e.g. what you got at the money changer.
// rate = how much of :code you get for 1 home currency (1 SGD = 112.5 JPY -> rate 112.5).
// Saved with the home currency it's for, who set it and when; it beats the live rate for this trip.
router.put('/rates/:code', requireAuth, async (req, res) => {
  const trip = await loadTrip(req, res)
  if (!trip) return
  const c = code(req.params.code)
  const rate = Number(req.body.rate)
  const home = (trip.expenses && trip.expenses.homeCurrency) || 'SGD'
  if (!c || c === home) return res.status(400).json({ message: 'Pick a currency other than the one totals are shown in.' })
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1e7) return res.status(400).json({ message: 'Enter a rate above 0.' })
  const entry = { base: home, rate, by: memberName(trip, req.userId) || 'Someone', at: new Date().toISOString() }
  await Trip.updateOne({ _id: trip._id }, { $set: { ['expenses.groupRates.' + c]: entry } })
  res.json(await current(trip._id))
})

// DELETE /rates/:code  -> back to the live rate
router.delete('/rates/:code', requireAuth, async (req, res) => {
  const trip = await loadTrip(req, res)
  if (!trip) return
  const c = code(req.params.code)
  if (!c) return res.status(400).json({ message: 'Invalid currency.' })
  await Trip.updateOne({ _id: trip._id }, { $unset: { ['expenses.groupRates.' + c]: '' } })
  res.json(await current(trip._id))
})

// PATCH /settings  { homeCurrency?, budget? }
// The budget is saved with the currency it was typed in, so switching currency converts it.
router.patch('/settings', requireAuth, async (req, res) => {
  const trip = await loadTrip(req, res)
  if (!trip) return
  const set = {}
  if (req.body.homeCurrency !== undefined) {
    if (!code(req.body.homeCurrency)) return res.status(400).json({ message: 'Invalid currency.' })
    set['expenses.homeCurrency'] = req.body.homeCurrency
  }
  if (req.body.budget !== undefined) {
    const b = req.body.budget === null || req.body.budget === '' ? null : Number(req.body.budget)
    if (b !== null && !amountOk(b)) return res.status(400).json({ message: 'Invalid budget.' })
    set['expenses.budget'] = b
    set['expenses.budgetCurrency'] = set['expenses.homeCurrency'] || (trip.expenses && trip.expenses.homeCurrency) || EMPTY.homeCurrency
  }
  await Trip.updateOne({ _id: trip._id }, { $set: set })
  res.json(await current(trip._id))
})

export default router
