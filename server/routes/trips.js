import express from 'express'
import mongoose from 'mongoose'
import Trip from '../models/trip.js'
import User from '../models/User.js'
import Photo from '../models/Photo.js'
import Group from '../models/Group.js'
import { requireAuth } from './auth.js'
import { mergePacking, mergeById, sameStops } from '../merge.js'
import { findTripFor, memberName, roleOf, ensureMembers, newInviteCode, accessQuery, addGroupMember } from '../tripAccess.js'

const router = express.Router()
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Same keys as src/tripOptions.js
const ACTIVITY_KEYS = ['sightseeing', 'food', 'shopping', 'beach', 'hiking', 'snow', 'themepark', 'nightlife', 'business', 'camping']
const WEATHER_KEYS = ['hot', 'mild', 'cold', 'rain']
const EXTRA_KEYS = ['laundry', 'carryon', 'kids', 'flight']
const PACKING_CATEGORIES = ['docs', 'clothes', 'toiletries', 'health', 'tech', 'gear', 'other']

// Keep only known keys, no repeats
function pickKeys(list, allowed) {
  const out = []
  if (!Array.isArray(list)) return out
  for (const k of list) {
    if (allowed.includes(k) && !out.includes(k)) out.push(k)
  }
  return out
}

// Clean the packing progress sent by the browser. Returns null if anything is invalid.
function cleanPacking(p) {
  if (!p || typeof p !== 'object') return null
  const id = (v) => String(v || '').slice(0, 60)
  const checked = {}
  const qty = {}
  if (p.checked && typeof p.checked === 'object') {
    const keys = Object.keys(p.checked).slice(0, 300)
    for (const k of keys) if (p.checked[k]) checked[id(k)] = true
  }
  if (p.qty && typeof p.qty === 'object') {
    const keys = Object.keys(p.qty).slice(0, 300)
    for (const k of keys) {
      const n = Math.floor(Number(p.qty[k]))
      if (n >= 0 && n <= 99) qty[id(k)] = n
    }
  }
  const removed = Array.isArray(p.removed) ? p.removed.slice(0, 300).map(id) : []
  const custom = []
  if (Array.isArray(p.custom)) {
    for (const c of p.custom.slice(0, 100)) {
      const name = c && typeof c.name === 'string' ? c.name.trim().slice(0, 80) : ''
      if (!name) return null
      const category = PACKING_CATEGORIES.includes(c.category) ? c.category : 'other'
      const n = Math.min(99, Math.max(1, Math.floor(Number(c.qty) || 1)))
      custom.push({ id: id(c.id), category, name, qty: n })
    }
  }
  return { checked, qty, removed, custom }
}

// Food needs + WhatsApp from each member's Settings: { userId: { diet, phone } }
async function memberContacts(trip) {
  const ids = []
  for (const m of trip.members || []) ids.push(m.user)
  const users = await User.find({ _id: { $in: ids } }, 'diet phone contactSaved')
  const map = {}
  for (const u of users) map[String(u._id)] = { diet: u.diet || [], phone: u.phone || '', saved: !!u.contactSaved }
  return map
}

function toClient(t, userId, contacts) {
  return {
    role: userId ? roleOf(t, userId) : null,   // 'owner' | 'member'
    isOwner: userId ? String(t.owner) === String(userId) : false,
    group: t.group || null,                    // family group it's shared with (or null)
    version: t.version || 0,                   // itinerary version (see PUT /:id/itinerary)
    me: userId ? memberName(t, userId) : null, // my traveller name on this trip
    members: (t.members || []).map((m) => {
      const c = contacts ? contacts[String(m.user)] : null
      return { id: m.user, name: m.name, role: m.role, joinedAt: m.joinedAt, lastSeenAt: m.lastSeenAt || null, diet: c ? c.diet : null, phone: c ? c.phone : null, contactSaved: c ? c.saved : false }
    }),
    crew: t.crew || {},
    // Only filled in when the users were looked up (populate), e.g. on GET /api/trips/:id
    pendingInvites: (t.pendingInvites || []).map((p) => ({
      id: p.user && p.user._id ? p.user._id : p.user,
      name: p.user && p.user.name ? p.user.name : '',
      username: p.user && p.user.username ? p.user.username : '',
      invitedBy: p.invitedBy,
      invitedById: p.invitedById
    })),
    id: t._id,
    name: t.name,
    destination: t.destination,
    // Older trips only have one destination
    destinations: t.destinations && t.destinations.length ? t.destinations : [t.destination],
    startDate: t.startDate,
    endDate: t.endDate,
    travellers: t.travellers,
    activities: t.activities || [],
    weather: t.weather || [],
    extras: t.extras || [],
    packing: t.packing || null,
    expenses: t.expenses || null,
    photoAlbums: t.photoAlbums || [],
    stay: t.stay || null,
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
  if (!Array.isArray(list) || list.length > 100) return null
  const out = []
  for (const w of list) {
    if (!w || typeof w !== 'object') return null
    const name = typeof w.name === 'string' ? w.name.trim() : ''
    if (!name || name.length > 120) return null
    const address = typeof w.address === 'string' && w.address.trim() ? w.address.trim().slice(0, 200) : null
    const type = typeof w.type === 'string' ? w.type.slice(0, 20) : null
    const city = typeof w.city === 'string' && w.city.trim() ? w.city.trim().slice(0, 80) : null // e.g. 'Kyoto, Japan'
    // votes = names of the travellers who want to go, e.g. ['Sarah', 'Amy']
    const votes = []
    if (Array.isArray(w.votes)) {
      for (const v of w.votes.slice(0, 20)) {
        const voter = String(v).trim().slice(0, 40)
        if (voter && !votes.includes(voter)) votes.push(voter)
      }
    }
    // Tours and activities added by hand: how long, where it was booked, and the booking link
    let duration = Number(w.duration)
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24) duration = null
    const bookedVia = typeof w.bookedVia === 'string' && w.bookedVia.trim() ? w.bookedVia.trim().slice(0, 40) : null
    const link = typeof w.link === 'string' && /^https?:\/\//i.test(w.link.trim()) ? w.link.trim().slice(0, 500) : null
    out.push({ id: String(w.id || new mongoose.Types.ObjectId()).slice(0, 40), name, address, outdoor: !!w.outdoor, type, city, votes, duration, bookedVia, link })
  }
  return out
}

// GET /api/trips -> the logged-in user's trips, newest first
router.get('/', requireAuth, async (req, res) => {
  // My trips, trips I joined, and trips shared with my family groups
  // The list only needs what the trip cards show, so the big parts (expenses, packing, photos...) stay on the server
  const trips = await Trip.find(await accessQuery(req.userId))
    .select('-expenses -packing -crew -stay -photoAlbums -wishlist -comments')
    .sort({ createdAt: -1 })
  const fixes = []
  for (const t of trips) {
    // Only older trips (no members yet) or a first visit from a family group need a save
    if (!t.members || !t.members.length || (t.group && !memberName(t, req.userId))) {
      fixes.push(ensureMembers(t).then(() => addGroupMember(t, req.userId)))
    }
  }
  await Promise.all(fixes)
  const list = []
  for (const t of trips) {
    const c = toClient(t, req.userId)
    c.stopCount = (t.stops || []).length
    delete c.stops // the card only needs how many
    list.push(c)
  }
  res.json(list)
})

// POST /api/trips  { name, destinations: ['Kyoto, Japan', 'Osaka, Japan'], startDate?, endDate?, travellers? }
// (a single { destination } still works)
router.post('/', requireAuth, async (req, res) => {
  const name = (req.body.name || '').trim()

  // Build the destinations list: trimmed, no blanks, no repeats, max 10
  const raw = Array.isArray(req.body.destinations) ? req.body.destinations : [req.body.destination]
  const destinations = []
  for (const d of raw) {
    const clean = String(d || '').trim()
    if (clean && !destinations.includes(clean)) destinations.push(clean)
  }
  if (destinations.length > 10) return res.status(400).json({ message: 'A trip can have up to 10 destinations.' })
  for (const d of destinations) {
    if (d.length > 80) return res.status(400).json({ message: 'Each destination must be 80 characters or fewer.' })
  }
  const destination = destinations[0] || ''
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
  // The creator is a traveller too: use their name from the list if it's there, otherwise add it first
  const user = await User.findById(req.userId)
  let myName = user ? user.name : 'Organiser'
  for (const t of travellers) {
    if (t.toLowerCase() === myName.toLowerCase()) myName = t
  }
  if (!travellers.includes(myName)) travellers.unshift(myName)
  const members = [{ user: req.userId, name: myName, role: 'owner' }]

  // Sharing with a family group: only allowed if I am in it. Its members can then open the trip.
  let groupId = null
  if (req.body.group) {
    if (!mongoose.isValidObjectId(req.body.group)) return res.status(400).json({ message: 'That group is not valid.' })
    const group = await Group.findOne({ _id: req.body.group, members: req.userId })
    if (!group) return res.status(403).json({ message: 'You are not a member of that group.' })
    groupId = group._id
  }

  const activities = pickKeys(req.body.activities, ACTIVITY_KEYS)
  const weather = pickKeys(req.body.weather, WEATHER_KEYS)
  const extras = pickKeys(req.body.extras, EXTRA_KEYS)

  // Expenses start in the organiser's base currency (Settings)
  const owner = await User.findById(req.userId, 'settings')
  const homeCurrency = (owner && owner.settings && owner.settings.currency) || 'SGD'
  const expenses = { homeCurrency, budget: null, items: [], settlements: [] }

  const trip = await Trip.create({ owner: req.userId, members, group: groupId, name, destination, destinations, startDate, endDate, travellers, activities, weather, extras, expenses })
  res.status(201).json(toClient(trip, req.userId))
})

// GET /api/trips/:id
router.get('/:id', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  await trip.populate('pendingInvites.user', 'name username')
  res.json(toClient(trip, req.userId, await memberContacts(trip)))
})

// POST /api/trips/:id/votes  { wishIds: [...], person, yes }  -> vote yes (or take it back) on one or more places
// Saved straight into each place's vote list, so votes from different people never overwrite each other.
router.post('/:id/votes', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const wishIds = Array.isArray(req.body.wishIds) ? req.body.wishIds.slice(0, 200).map((x) => String(x)) : []
  const person = String(req.body.person || '')
  // You can vote for yourself; the organiser also for people without an account
  const me = memberName(trip, req.userId)
  let allowed = person === me
  if (!allowed && roleOf(trip, req.userId) === 'owner') {
    allowed = trip.travellers.includes(person) && !trip.members.some((m) => m.name === person)
  }
  if (!allowed || !wishIds.length) return res.status(403).json({ message: 'You can only change your own votes.' })
  const change = req.body.yes ? { $addToSet: { 'wishlist.$[w].votes': person } } : { $pull: { 'wishlist.$[w].votes': person } }
  await Trip.updateOne({ _id: trip._id }, change, { arrayFilters: [{ 'w.id': { $in: wishIds } }] })
  const fresh = await Trip.findById(trip._id).select('wishlist')
  const votes = {}
  for (const w of fresh.wishlist || []) votes[w.id] = Array.isArray(w.votes) ? w.votes : []
  res.json({ votes })
})

// PUT /api/trips/:id/itinerary  { stops: [...], wishlist: [...], version?, base?: { stops, wishlist } }
// "version" is the version the browser last saw. If someone else saved in between:
//  - with "base" (the stops + wishlist as this browser last loaded them), the two saves are merged:
//    saved places added/edited/removed by each person all stay, and the days keep whoever changed them.
//    Only when BOTH people changed the days do we answer 409 with the latest trip.
//  - without "base" (older pages) it's 409 straight away.
// Without a version at all it just saves.
const WISH_FIELDS = ['name', 'address', 'outdoor', 'type', 'city', 'duration', 'bookedVia', 'link']
router.put('/:id/itinerary', requireAuth, async (req, res) => {
  const stops = cleanStops(req.body.stops)
  const wishlist = cleanWishlist(req.body.wishlist)
  if (!stops || !wishlist) return res.status(400).json({ message: 'Some itinerary details are invalid.' })
  const base = req.body.base ? { stops: cleanStops(req.body.base.stops), wishlist: cleanWishlist(req.body.base.wishlist) } : null
  if (base && (!base.stops || !base.wishlist)) return res.status(400).json({ message: 'Some itinerary details are invalid.' })

  let sent = null
  if (req.body.version !== undefined && req.body.version !== null) {
    sent = Number(req.body.version)
    if (!Number.isInteger(sent) || sent < 0) return res.status(400).json({ message: 'Invalid trip version. Please refresh the page.' })
  }

  let latest = await findTripFor(req.userId, req.params.id)
  if (!latest) return res.status(404).json({ message: 'Trip not found.' })

  // Votes: you can only change your own (the organiser also for people without an account).
  // Everyone else's votes are kept exactly as they are saved.
  const me = memberName(latest, req.userId)
  const allowed = [me]
  if (roleOf(latest, req.userId) === 'owner') {
    for (const t of latest.travellers) {
      if (!latest.members.some((m) => m.name === t)) allowed.push(t)
    }
  }
  const conflict = async () => {
    const fresh = await Trip.findById(latest._id)
    return res.status(409).json({ message: 'Someone else changed this trip. Showing their latest version.', trip: toClient(fresh, req.userId) })
  }

  // Try a few times in case someone else saves in between
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = latest.version || 0
    let saveStops = stops
    let saveWish = wishlist
    let merged = false
    if (sent !== null && sent !== current) {
      if (!base) return conflict()
      if (sameStops(stops, base.stops)) saveStops = latest.stops // I didn't touch the days: keep theirs
      else if (!sameStops(latest.stops, base.stops)) return conflict() // we both changed the days
      saveWish = mergeById(latest.wishlist || [], base.wishlist, wishlist, WISH_FIELDS)
      merged = true
    }
    saveWish = saveWish.map((w) => {
      const before = (latest.wishlist || []).find((x) => x.id === w.id)
      const beforeVotes = before && Array.isArray(before.votes) ? before.votes : []
      const sentItem = wishlist.find((x) => x.id === w.id)
      const mine = (sentItem ? sentItem.votes : beforeVotes).filter((v) => allowed.includes(v))
      return { ...w, votes: beforeVotes.filter((v) => !allowed.includes(v)).concat(mine) }
    })

    // One atomic step: save only if the version is still the one we merged with, and add 1 to it
    const filter = { _id: latest._id }
    if (sent !== null) filter.version = current === 0 ? { $in: [0, null] } : current // trips from before versions have none
    const updated = await Trip.findOneAndUpdate(filter, { $set: { stops: saveStops, wishlist: saveWish }, $inc: { version: 1 } }, { new: true })
    if (updated) {
      // Notes on stops that were just removed go too
      const stopIds = saveStops.map((st) => st.id)
      await Trip.updateOne({ _id: latest._id }, { $pull: { comments: { stopId: { $nin: stopIds } } } })
      return res.json({ ok: true, version: updated.version, merged, trip: merged ? toClient(updated, req.userId) : undefined })
    }
    if (!base) return conflict()
    latest = await Trip.findById(latest._id)
  }
  return conflict()
})

// PUT /api/trips/:id/dates  { endDate }  -> the planner's "+ Add Day" (anyone on the trip)
router.put('/:id/dates', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const endDate = String(req.body.endDate || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || (trip.startDate && endDate < trip.startDate)) {
    return res.status(400).json({ message: 'Invalid end date.' })
  }
  trip.endDate = endDate
  await trip.save()
  res.json({ startDate: trip.startDate, endDate: trip.endDate })
})

// GET /api/trips/:id/packing  -> the packing list only (Packing checks for the group's ticks with this)
router.get('/:id/packing', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  res.json({ activities: trip.activities || [], weather: trip.weather || [], extras: trip.extras || [], packing: trip.packing || null })
})

// PUT /api/trips/:id/packing  { activities, weather, extras, packing: { checked, qty, removed, custom } }
router.put('/:id/packing', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Trip not found.' })
  const packing = cleanPacking(req.body.packing)
  if (!packing) return res.status(400).json({ message: 'Some packing details are invalid.' })

  // "base" = the list as this person last saw it. Only what THEY changed since then is applied,
  // on top of the latest saved list, so two people ticking items at the same time don't undo each other.
  const base = req.body.base ? cleanPacking(req.body.base) : null

  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const set = {
    activities: pickKeys(req.body.activities, ACTIVITY_KEYS),
    weather: pickKeys(req.body.weather, WEATHER_KEYS),
    extras: pickKeys(req.body.extras, EXTRA_KEYS)
  }
  // Try a few times in case someone else saves in between (the "packing" value must still be what we read)
  let latest = trip.packing
  for (let attempt = 0; attempt < 4; attempt++) {
    const merged = base ? mergePacking(cleanPacking(latest || {}) || { checked: {}, qty: {}, removed: [], custom: [] }, base, packing) : packing
    const filter = { _id: trip._id, packing: latest === undefined ? null : latest }
    const updated = await Trip.findOneAndUpdate(filter, { $set: { ...set, packing: merged } }, { new: true })
    if (updated) return res.json({ ok: true, packing: merged })
    latest = (await Trip.findById(trip._id).select('packing')).packing
  }
  res.status(409).json({ message: 'Lots of people are editing the list. Please try again.' })
})

// PUT /api/trips/:id/albums  { albums: [{ id, name, icon }], base?: [...] }  -> the trip's photo albums
// "base" = the albums as this browser last loaded them: albums added/renamed/deleted by
// different people at the same time are merged (same idea as packing). A plain array still works.
function cleanAlbums(list) {
  if (!Array.isArray(list) || list.length > 50) return null
  const albums = []
  for (const a of list) {
    const name = a && typeof a.name === 'string' ? a.name.trim().slice(0, 60) : ''
    if (!name) return null
    albums.push({ id: String(a.id || new mongoose.Types.ObjectId()).slice(0, 40), name, icon: String(a.icon || '📍').slice(0, 8) })
  }
  return albums
}
// GET /api/trips/:id/albums  -> the albums only (Photos checks for the group's changes with this)
router.get('/:id/albums', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  res.json({ albums: trip.photoAlbums || [] })
})

router.put('/:id/albums', requireAuth, async (req, res) => {
  const body = Array.isArray(req.body) ? { albums: req.body } : req.body || {}
  const mine = cleanAlbums(body.albums)
  const base = body.base ? cleanAlbums(body.base) : null
  if (!mongoose.isValidObjectId(req.params.id) || !mine || (body.base && !base)) {
    return res.status(400).json({ message: 'Every album needs a name.' })
  }
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  // Try a few times in case someone else saves in between (the albums must still be what we read)
  let latest = trip.photoAlbums || []
  let albums = null
  for (let attempt = 0; attempt < 4 && !albums; attempt++) {
    const merged = base ? mergeById(latest, base, mine, ['name', 'icon']) : mine
    const updated = await Trip.findOneAndUpdate({ _id: trip._id, photoAlbums: latest }, { $set: { photoAlbums: merged } })
    if (updated) albums = merged
    else latest = (await Trip.findById(trip._id).select('photoAlbums')).photoAlbums || []
  }
  if (!albums) return res.status(409).json({ message: 'Lots of people are editing albums. Please try again.' })
  // Photos in a deleted album go back to Trip highlights
  const ids = albums.map((a) => a.id)
  await Photo.updateMany({ trip: trip._id, album: { $nin: ids.concat('') } }, { album: '' })
  res.json({ ok: true, albums })
})

// PUT /api/trips/:id/stay  { name, address, nameLocal, addressLocal, lat, lon } or {} to clear
router.put('/:id/stay', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const b = req.body || {}
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const name = text(b.name, 120)
  if (!name) {
    trip.stay = null
  } else {
    const lat = Number(b.lat)
    const lon = Number(b.lon)
    trip.stay = {
      name,
      address: text(b.address, 200),
      nameLocal: text(b.nameLocal, 120),
      addressLocal: text(b.addressLocal, 200),
      lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
      lon: Number.isFinite(lon) && Math.abs(lon) <= 180 ? lon : null
    }
  }
  trip.markModified('stay')
  await trip.save()
  res.json({ stay: trip.stay })
})

// PUT /api/trips/:id/crew/:name  { persona, flight, arrival, sameFlightAs, diet, phone }
// Your own card, or (organiser only) the card of someone without an account.
// diet: preset keys (e.g. 'halal', 'nut-allergy') or short custom tags (e.g. 'No spicy food').
// sameFlightAs: another traveller's name. Their flight is shown instead, so it is only stored once.
router.put('/:id/crew/:name', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const name = req.params.name
  if (!trip.travellers.includes(name)) return res.status(404).json({ message: 'That person is not on this trip.' })
  const isMe = memberName(trip, req.userId) === name
  const isGuest = !trip.members.some((m) => m.name === name)
  if (!isMe && !(isGuest && roleOf(trip, req.userId) === 'owner')) {
    return res.status(403).json({ message: 'You can only edit your own details.' })
  }
  const b = req.body || {}
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

  const diet = []
  if (Array.isArray(b.diet)) {
    for (const d of b.diet) {
      const tag = text(d, 30)
      if (tag && !diet.includes(tag) && diet.length < 8) diet.push(tag)
    }
  }

  let sameFlightAs = text(b.sameFlightAs, 60)
  if (sameFlightAs === name || !trip.travellers.includes(sameFlightAs)) sameFlightAs = ''

  const arrival = text(b.arrival, 16)
  const profile = {
    persona: text(b.persona, 40),
    sameFlightAs,
    flight: sameFlightAs ? '' : text(b.flight, 12).toUpperCase(),
    arrival: !sameFlightAs && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(arrival) ? arrival : '',
    diet,
    phone: text(b.phone, 20).replace(/[^\d+ ]/g, '')
  }
  trip.crew = { ...(trip.crew || {}), [name]: profile }
  trip.markModified('crew')
  await trip.save()
  res.json({ crew: trip.crew })
})

// POST /api/trips/:id/invites/:userId/resend  -> moves the invite back to the top of their home page
router.post('/:id/invites/:userId/resend', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const invite = trip.pendingInvites.find((p) => String(p.user) === String(req.params.userId))
  if (!invite) return res.status(404).json({ message: 'That invite was already answered.' })
  invite.at = new Date()
  trip.markModified('pendingInvites')
  await trip.save()
  res.json({ ok: true })
})

// ---------- Sharing ----------

// POST /api/trips/:id/invite  -> { code }  (any member can share the link; reset=true makes a new one, owner only)
router.post('/:id/invite', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  if (req.body.reset && roleOf(trip, req.userId) !== 'owner') return res.status(403).json({ message: 'Only the organiser can reset the link.' })
  if (!trip.inviteCode || req.body.reset) {
    trip.inviteCode = newInviteCode()
    await trip.save()
  }
  res.json({ code: trip.inviteCode })
})

// POST /api/trips/:id/invites  { userId }  -> invite an account by username (any member can)
router.post('/:id/invites', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const userId = String(req.body.userId || '')
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Pick someone to invite.' })
  const user = await User.findById(userId)
  if (!user) return res.status(404).json({ message: 'That account does not exist.' })
  if (memberName(trip, userId)) return res.status(400).json({ message: user.name + ' is already on this trip.' })
  if (trip.pendingInvites.some((p) => String(p.user) === userId)) return res.status(400).json({ message: user.name + ' is already invited.' })
  if (trip.pendingInvites.length >= 30) return res.status(400).json({ message: 'Too many invites waiting. Cancel some first.' })
  trip.pendingInvites.push({ user: userId, invitedBy: memberName(trip, req.userId), invitedById: req.userId })
  // The invite card opens the join page, which needs a code
  if (!trip.inviteCode) trip.inviteCode = newInviteCode()
  await trip.save()
  await trip.populate('pendingInvites.user', 'name username')
  res.status(201).json(toClient(trip, req.userId).pendingInvites)
})

// DELETE /api/trips/:id/invites/:userId  -> cancel (the organiser, or whoever sent it)
router.delete('/:id/invites/:userId', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const invite = trip.pendingInvites.find((p) => String(p.user) === String(req.params.userId))
  if (!invite) return res.status(404).json({ message: 'That invite was already answered.' })
  if (roleOf(trip, req.userId) !== 'owner' && String(invite.invitedById) !== String(req.userId)) {
    return res.status(403).json({ message: 'Only the organiser or whoever sent it can cancel this invite.' })
  }
  trip.pendingInvites = trip.pendingInvites.filter((p) => p !== invite)
  await trip.save()
  await trip.populate('pendingInvites.user', 'name username')
  res.json(toClient(trip, req.userId).pendingInvites)
})

// POST /api/trips/:id/guests  { name }  -> someone going who won't make an account (kids, parents...)
router.post('/:id/guests', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const name = String(req.body.name || '').trim().slice(0, 40)
  if (!name) return res.status(400).json({ message: 'Type their name.' })
  if (trip.travellers.some((t) => t.toLowerCase() === name.toLowerCase())) return res.status(400).json({ message: name + ' is already on this trip.' })
  if (trip.travellers.length >= 20) return res.status(400).json({ message: 'A trip can have up to 20 people.' })
  trip.travellers.push(name)
  await trip.save()
  res.status(201).json({ travellers: trip.travellers })
})

// DELETE /api/trips/:id/guests/:name  -> only names without an account, and not used in any expense
router.delete('/:id/guests/:name', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const name = req.params.name
  if (trip.members.some((m) => m.name === name)) return res.status(400).json({ message: name + ' has an account. Remove them as a member instead.' })
  const e = trip.expenses || {}
  let used = false
  for (const x of e.items || []) {
    if (x.paidBy === name || (x.people || []).includes(name) || (x.exact && x.exact[name])) used = true
  }
  for (const p of e.settlements || []) {
    if (p.from === name || p.to === name) used = true
  }
  if (used) return res.status(400).json({ message: name + ' is in some expenses, so they can\'t be removed.' })
  trip.travellers = trip.travellers.filter((t) => t !== name)
  await trip.save()
  res.json({ travellers: trip.travellers })
})

// DELETE /api/trips/:id/members/:userId  -> the owner removes someone, or you leave
// Their traveller name stays on the trip (as a guest) so past expenses still add up.
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const leaving = String(req.params.userId) === String(req.userId)
  if (!leaving && roleOf(trip, req.userId) !== 'owner') return res.status(403).json({ message: 'Only the organiser can remove people.' })
  if (String(req.params.userId) === String(trip.owner)) return res.status(400).json({ message: 'The organiser cannot leave their own trip.' })
  trip.members = trip.members.filter((m) => String(m.user) !== String(req.params.userId))
  await trip.save()
  res.json({ ok: true })
})

// PUT /api/trips/:id  { name, destinations: [...], startDate, endDate }  -> Edit trip (organiser only)
// Moving the whole trip (both dates shifted by the same number of days) moves every stop with it.
// Otherwise, stops that would end up outside the new dates have to be moved first.
router.put('/:id', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id, true)
  if (!trip) return res.status(404).json({ message: 'Only the organiser can edit this trip.' })

  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ message: 'Please give the trip a name.' })
  if (name.length > 80) return res.status(400).json({ message: 'The trip name must be 80 characters or fewer.' })

  const raw = Array.isArray(req.body.destinations) ? req.body.destinations : []
  const destinations = []
  for (const d of raw) {
    const clean = String(d || '').trim()
    const already = destinations.some((x) => x.toLowerCase() === clean.toLowerCase())
    if (clean && !already) destinations.push(clean)
  }
  if (!destinations.length) return res.status(400).json({ message: 'A trip needs at least one destination.' })
  if (destinations.length > 10) return res.status(400).json({ message: 'A trip can have up to 10 destinations.' })
  for (const d of destinations) {
    if (d.length > 80) return res.status(400).json({ message: 'Each destination must be 80 characters or fewer.' })
  }

  const startDate = String(req.body.startDate || '')
  const endDate = String(req.body.endDate || '')
  if ((startDate && !DATE_PATTERN.test(startDate)) || (endDate && !DATE_PATTERN.test(endDate))) {
    return res.status(400).json({ message: 'Dates must look like 2026-10-12.' })
  }
  if (endDate && !startDate) return res.status(400).json({ message: 'Please add a start date too.' })
  if (startDate && endDate && endDate < startDate) {
    return res.status(400).json({ message: 'The end date must be on or after the start date.' })
  }

  // Did the whole trip move? (e.g. 14-19 Oct -> 21-26 Oct)
  const DAY = 86400000
  const dayNumber = (s) => Math.round(new Date(s + 'T00:00:00Z').getTime() / DAY)
  let shift = 0
  if (trip.startDate && trip.endDate && startDate && endDate) {
    const startMove = dayNumber(startDate) - dayNumber(trip.startDate)
    const endMove = dayNumber(endDate) - dayNumber(trip.endDate)
    if (startMove === endMove) shift = startMove
  }
  const stops = []
  let outside = 0
  for (const st of trip.stops || []) {
    const copy = { ...st }
    if (shift) copy.date = new Date((dayNumber(st.date) + shift) * DAY).toISOString().slice(0, 10)
    if ((startDate && copy.date < startDate) || (endDate && copy.date > endDate)) outside++
    stops.push(copy)
  }
  if (outside) {
    return res.status(400).json({
      message: outside + (outside === 1 ? ' stop is' : ' stops are') + ' planned outside these dates. Move ' +
        (outside === 1 ? 'it' : 'them') + ' in the itinerary first, or move the whole trip (both dates by the same number of days).'
    })
  }

  trip.name = name
  trip.destinations = destinations
  trip.destination = destinations[0]
  trip.startDate = startDate
  trip.endDate = endDate
  if (shift) {
    trip.stops = stops
    trip.markModified('stops')
    trip.version = (trip.version || 0) + 1 // open itineraries reload instead of saving old dates
  }
  await trip.save()
  res.json({ ...toClient(trip, req.userId), movedStops: shift ? stops.length : 0, shiftDays: shift })
})

// ---------- Notes on stops ----------
// GET    /api/trips/:id/comments?stop=<stopId>  -> notes on that stop, oldest first
// POST   /api/trips/:id/comments  { stopId, text }
// PUT    /api/trips/:id/comments/:commentId  { text }   (your own notes only)
// DELETE /api/trips/:id/comments/:commentId             (your own, or any if you're the organiser)
function commentJson(c, trip, userId) {
  const mine = String(c.user) === String(userId)
  return {
    id: c._id, stopId: c.stopId, name: c.name, text: c.text,
    at: c.createdAt, editedAt: c.editedAt || null,
    mine, canDelete: mine || roleOf(trip, userId) === 'owner'
  }
}
function cleanCommentText(v) {
  const text = typeof v === 'string' ? v.trim() : ''
  if (!text) return { error: 'Write something first.' }
  if (text.length > 500) return { error: 'Notes can be up to 500 characters.' }
  return { text }
}

router.get('/:id/comments', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const stopId = String(req.query.stop || '')
  const list = []
  for (const c of trip.comments || []) {
    if (!stopId || c.stopId === stopId) list.push(commentJson(c, trip, req.userId))
  }
  res.json(list)
})

router.post('/:id/comments', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const stopId = String(req.body.stopId || '')
  if (!(trip.stops || []).some((st) => st.id === stopId)) {
    return res.status(404).json({ message: 'That stop is no longer on the itinerary.' })
  }
  const { text, error } = cleanCommentText(req.body.text)
  if (error) return res.status(400).json({ message: error })
  if ((trip.comments || []).filter((c) => c.stopId === stopId).length >= 50) {
    return res.status(400).json({ message: 'This stop already has 50 notes. Delete some first.' })
  }
  trip.comments.push({ stopId, user: req.userId, name: memberName(trip, req.userId) || 'Someone', text })
  await trip.save()
  res.status(201).json(commentJson(trip.comments[trip.comments.length - 1], trip, req.userId))
})

router.put('/:id/comments/:commentId', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const comment = mongoose.isValidObjectId(req.params.commentId) ? trip.comments.id(req.params.commentId) : null
  if (!comment) return res.status(404).json({ message: 'That note was deleted.' })
  if (String(comment.user) !== String(req.userId)) return res.status(403).json({ message: 'You can only edit your own notes.' })
  const { text, error } = cleanCommentText(req.body.text)
  if (error) return res.status(400).json({ message: error })
  comment.text = text
  comment.editedAt = new Date()
  await trip.save()
  res.json(commentJson(comment, trip, req.userId))
})

router.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  const trip = await findTripFor(req.userId, req.params.id)
  if (!trip) return res.status(404).json({ message: 'Trip not found.' })
  const comment = mongoose.isValidObjectId(req.params.commentId) ? trip.comments.id(req.params.commentId) : null
  if (!comment) return res.json({ ok: true }) // already gone
  if (String(comment.user) !== String(req.userId) && roleOf(trip, req.userId) !== 'owner') {
    return res.status(403).json({ message: 'You can only delete your own notes.' })
  }
  comment.deleteOne()
  await trip.save()
  res.json({ ok: true })
})

// DELETE /api/trips/:id  (its photos too)
router.delete('/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Trip not found.' })
  const result = await Trip.deleteOne({ _id: req.params.id, owner: req.userId })
  if (!result.deletedCount) return res.status(404).json({ message: 'Trip not found.' })
  await Photo.deleteMany({ trip: req.params.id })
  res.json({ ok: true })
})

export default router