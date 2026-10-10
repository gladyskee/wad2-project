import express from 'express'
import { requireAuth } from './auth.js'

const router = express.Router()

// The free plan only allows about 100 requests a month, so remember answers for 15 minutes
const cache = {}
const CACHE_MINUTES = 15

// GET /api/flights?flight=KE621
router.get('/', requireAuth, async (req, res) => {
  const flight = String(req.query.flight || '').trim().toUpperCase()
  if (!/^[A-Z0-9]{2,8}$/.test(flight)) {
    return res.status(400).json({ message: 'Please give a flight number like KE621.' })
  }
  if (!process.env.AVIATIONSTACK_API_KEY) {
    return res.status(503).json({ message: 'Flights are not set up yet (AVIATIONSTACK_API_KEY missing in server/.env).' })
  }

  const saved = cache[flight]
  if (saved && Date.now() - saved.time < CACHE_MINUTES * 60 * 1000) {
    return res.json(saved.data)
  }

  const params = new URLSearchParams({ access_key: process.env.AVIATIONSTACK_API_KEY, flight_iata: flight })
  const response = await fetch('http://api.aviationstack.com/v1/flights?' + params, { signal: AbortSignal.timeout(10000) })
  const body = await response.json()

  if (body.error) {
    console.error('Aviationstack error:', body.error.message)
    return res.status(502).json({ message: 'Flight service error. Try again later.' })
  }
  const f = body.data && body.data[0]
  if (!f) return res.status(404).json({ message: 'No live data for that flight right now.' })

  const data = {
    flight,
    status: f.flight_status,
    delayMinutes: (f.arrival && f.arrival.delay) || (f.departure && f.departure.delay) || 0,
    originalArrival: f.arrival && f.arrival.scheduled,
    newArrival: f.arrival && f.arrival.estimated
  }
  cache[flight] = { time: Date.now(), data }
  res.json(data)
})

export default router