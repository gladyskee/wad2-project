import express from 'express'
import { requireAuth } from './auth.js'

const router = express.Router()

// GET /api/weather?lat=37.56&lon=126.97   OR   /api/weather?q=Kyoto, Japan
// -> OpenWeatherMap 5-day / 3-hour forecast
router.get('/', requireAuth, async (req, res) => {
  const key = process.env.OPENWEATHER_API_KEY
  if (!key) {
    return res.status(503).json({ message: 'Weather is not set up yet (OPENWEATHER_API_KEY missing in server/.env).' })
  }

  let lat = Number(req.query.lat)
  let lon = Number(req.query.lon)

  // A place name: look up its coordinates first
  if (req.query.q) {
    const geoParams = new URLSearchParams({ q: String(req.query.q).slice(0, 100), limit: '1', appid: key })
    const geoRes = await fetch('https://api.openweathermap.org/geo/1.0/direct?' + geoParams, { signal: AbortSignal.timeout(10000) })
    if (!geoRes.ok) {
        console.error('OpenWeather geocode failed:', geoRes.status, await geoRes.text())
        return res.status(502).json({ message: 'Weather service error. Try again later.' })
    }
    const geo = await geoRes.json()
    if (!geo.length) return res.status(404).json({ message: 'Could not find that destination for weather.' })
    lat = geo[0].lat
    lon = geo[0].lon
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ message: 'Please give lat and lon, or a place name (q).' })
  }

  const params = new URLSearchParams({ lat, lon, units: 'metric', appid: key })
  const response = await fetch('https://api.openweathermap.org/data/2.5/forecast?' + params, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) {
    console.error('OpenWeather forecast failed:', response.status, await response.text())
    return res.status(502).json({ message: 'Weather service error. Try again later.' })
  }
  const data = await response.json()
  res.json({ city: { timezone: data.city.timezone }, list: data.list })
})

export default router