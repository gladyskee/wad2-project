/*
  safetyService.js
  ----------------
  WHAT THIS FILE DOES:
  Holds all the API calls and logic for the Real-Time Safety Layer.
  It does not touch the UI. The Vue component (SafetyLayer.vue) calls
  these functions and only handles display.

  APIS USED (all free, no API key):
  1. BigDataCloud reverse geocode (browser) -> live GPS to country + city
  2. UK FCDO travel advice (gov.uk content API, browser) -> official advisory per country
  3. USGS earthquake feed (browser) -> earthquakes NEAR the place
  4. GDACS (UN/EU Global Disaster Alert system, browser) -> floods, cyclones, volcanoes...
  5. Our server (/api/safety/...) -> hospitals, police, evacuation points and your embassy
     from OpenStreetMap, plus place lookups. Done on the server so busy map servers are retried
     and results cached, instead of failing in the browser.

  IMPROVEMENTS (Oct 2026):
  - Every request gives up after 10 s (no endless "Checking…")
  - GPS is rounded to ~100 m before it leaves the device (privacy)
  - FCDO country pages are looked up from the FCDO's own country list (no wrong URLs)
  - Risk floors: "avoid all travel" is never shown as Moderate
  - Emergency numbers for many more countries, plus tourist hotlines

  ALGORITHMS: Haversine distance, our combined 0-100 risk score (see computeRiskScore).
*/
import axios from 'axios'

const GEOCODE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
const FCDO_URL = 'https://www.gov.uk/api/content/foreign-travel-advice/'
const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query'
const GDACS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH'
const TIMEOUT_MS = 10000

/*
  getJSON()
  fetch() does NOT throw on a 404/500, only on network failure, so we check res.ok.
  AbortSignal.timeout stops a request that hangs.
*/
async function getJSON(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
  return res.json()
}

/* ~100 m precision: enough for safety info, and we don't send exact positions to other services */
export function roundCoord(n) {
  return Math.round(n * 1000) / 1000
}

/*
  Emergency lines per country (shown as one-tap call buttons).
  First = police, then ambulance/fire, then helpful extras (tourist lines).
  Unknown countries fall back to 112, which most mobile networks redirect.
*/
export const EMERGENCY_NUMBERS = {
  JP: [{ icon: '👮', label: 'Police', number: '110' }, { icon: '🚑', label: 'Ambulance & Fire', number: '119' },
       { icon: '🗾', label: 'Japan Visitor Hotline (English, 24h)', number: '+81 50 3816 2787' }],
  KR: [{ icon: '👮', label: 'Police', number: '112' }, { icon: '🚑', label: 'Ambulance & Fire', number: '119' },
       { icon: 'ℹ️', label: 'Korea Travel Hotline (English)', number: '1330' }],
  SG: [{ icon: '👮', label: 'Police', number: '999' }, { icon: '🚑', label: 'Ambulance & Fire', number: '995' }],
  MY: [{ icon: '🚨', label: 'Police, Ambulance & Fire', number: '999' }],
  TH: [{ icon: '👮', label: 'Police', number: '191' }, { icon: '🚑', label: 'Ambulance', number: '1669' },
       { icon: 'ℹ️', label: 'Tourist Police (English)', number: '1155' }],
  TW: [{ icon: '👮', label: 'Police', number: '110' }, { icon: '🚑', label: 'Ambulance & Fire', number: '119' }],
  CN: [{ icon: '👮', label: 'Police', number: '110' }, { icon: '🚑', label: 'Ambulance', number: '120' }, { icon: '🚒', label: 'Fire', number: '119' }],
  HK: [{ icon: '🚨', label: 'Police, Ambulance & Fire', number: '999' }],
  ID: [{ icon: '🚨', label: 'Emergency', number: '112' }, { icon: '👮', label: 'Police', number: '110' }, { icon: '🚑', label: 'Ambulance', number: '118' }],
  PH: [{ icon: '🚨', label: 'Emergency', number: '911' }],
  VN: [{ icon: '👮', label: 'Police', number: '113' }, { icon: '🚑', label: 'Ambulance', number: '115' }, { icon: '🚒', label: 'Fire', number: '114' }],
  KH: [{ icon: '👮', label: 'Police', number: '117' }, { icon: '🚑', label: 'Ambulance', number: '119' }, { icon: '🚒', label: 'Fire', number: '118' }],
  IN: [{ icon: '🚨', label: 'Emergency', number: '112' }],
  LK: [{ icon: '👮', label: 'Police', number: '119' }, { icon: '🚑', label: 'Ambulance', number: '1990' },
       { icon: 'ℹ️', label: 'Tourist Police', number: '1912' }],
  AU: [{ icon: '🚨', label: 'Police, Ambulance & Fire', number: '000' }],
  NZ: [{ icon: '🚨', label: 'Police, Ambulance & Fire', number: '111' }],
  US: [{ icon: '🚨', label: 'Police, Ambulance & Fire', number: '911' }],
  CA: [{ icon: '🚨', label: 'Police, Ambulance & Fire', number: '911' }],
  MX: [{ icon: '🚨', label: 'Emergency', number: '911' }],
  GB: [{ icon: '🚨', label: 'Police, Ambulance & Fire', number: '999' }],
  AE: [{ icon: '👮', label: 'Police', number: '999' }, { icon: '🚑', label: 'Ambulance', number: '998' }, { icon: '🚒', label: 'Fire', number: '997' }],
  EG: [{ icon: '👮', label: 'Police', number: '122' }, { icon: '🚑', label: 'Ambulance', number: '123' },
       { icon: 'ℹ️', label: 'Tourist Police', number: '126' }],
  JO: [{ icon: '🚨', label: 'Emergency', number: '911' }],
  OM: [{ icon: '🚨', label: 'Emergency', number: '9999' }],
  TR: [{ icon: '🚨', label: 'Emergency', number: '112' }],
  KG: [{ icon: '👮', label: 'Police', number: '102' }, { icon: '🚑', label: 'Ambulance', number: '103' }, { icon: '🚒', label: 'Fire', number: '101' }],
  DEFAULT: [{ icon: '🚨', label: 'Emergency (EU & most mobiles)', number: '112' }]
}

/* For Singaporeans abroad: MFA's 24-hour duty office (lost passport, arrests, disasters) */
export const HOME_HELPLINE = { icon: '🇸🇬', label: 'Singapore MFA 24h duty office', number: '+65 6379 8800' }

/*
  haversineKm()
  Straight-line distance in km between two lat/lon points on Earth (radius 6371 km).
*/
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/* Compass bearing from point 1 to point 2 in degrees (0 = north), used by the radar */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/* Live GPS -> country + city (rounded coordinates only) */
export async function getLocationInfo(lat, lon) {
  const params = new URLSearchParams({ latitude: roundCoord(lat), longitude: roundCoord(lon), localityLanguage: 'en' })
  const data = await getJSON(`${GEOCODE_URL}?${params}`)
  return { countryCode: data.countryCode, countryName: data.countryName, city: data.city || data.locality || data.principalSubdivision }
}

/* A trip destination like "Kyoto, Japan" -> { lat, lon, city, countryCode, countryName } (via our server) */
export async function locatePlace(place) {
  const res = await axios.get('/api/safety/locate', { params: { place }, timeout: TIMEOUT_MS })
  const d = res.data || {}
  // A place without coordinates can't be shown: treat it as "not found" instead of breaking the page
  if (typeof d.lat !== 'number' || typeof d.lon !== 'number') throw new Error('Place not found')
  return d
}

/* Hospitals, clinics, police, fire stations, evacuation points (3 km) and your embassy (40 km), via our server */
export async function getNearbySafety(lat, lon, home = 'SG') {
  const res = await axios.get('/api/safety/nearby', { params: { lat: roundCoord(lat), lon: roundCoord(lon), home }, timeout: 30000 })
  const places = res.data && res.data.places
  return Array.isArray(places) ? places.filter((p) => p && typeof p.lat === 'number' && typeof p.lon === 'number') : []
}

/*
  FCDO country slugs.
  We load the FCDO's own list of countries once and match names, so
  "Tanzania, United Republic of" or "Côte d'Ivoire" still find the right page.
  The override table covers names the geocoder spells very differently.
*/
const FCDO_SLUG_OVERRIDES = {
  US: 'usa', GB: null, KR: 'south-korea', KP: 'north-korea', VN: 'vietnam', LA: 'laos', TW: 'taiwan',
  HK: 'hong-kong', MO: 'macao', AE: 'united-arab-emirates', CZ: 'czech-republic', TR: 'turkey', RU: 'russia',
  CD: 'democratic-republic-of-the-congo', CG: 'congo', CI: 'cote-d-ivoire', TZ: 'tanzania', SY: 'syria',
  IR: 'iran', BO: 'bolivia', VE: 'venezuela', MD: 'moldova', PS: 'the-occupied-palestinian-territories'
}
let fcdoIndex = null // normalised country name -> slug

const normalise = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '')

async function loadFcdoIndex() {
  if (fcdoIndex) return fcdoIndex
  const data = await getJSON(FCDO_URL.replace(/\/$/, ''))
  fcdoIndex = {}
  for (const child of (data.links && data.links.children) || []) {
    const slug = String(child.base_path || '').split('/').pop()
    const name = (child.details && child.details.country && child.details.country.name) || child.title || ''
    if (slug) fcdoIndex[normalise(name.replace(/ travel advice$/i, ''))] = slug
  }
  return fcdoIndex
}

async function toFcdoSlug(countryCode, countryName) {
  if (countryCode in FCDO_SLUG_OVERRIDES) return FCDO_SLUG_OVERRIDES[countryCode]
  try {
    const index = await loadFcdoIndex()
    const key = normalise(countryName)
    if (index[key]) return index[key]
    for (const name in index) {
      if (key.startsWith(name) || name.startsWith(key)) return index[name]
    }
  } catch (err) {
    // index unavailable: fall back to guessing from the name below
  }
  return String(countryName).toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/[^a-z\s-]/g, '').replace(/\s+/g, '-')
}

/*
  getTravelAdvisory()
  The UK government's official travel advice for the country, as a level 1-4:
    1 = normal caution, 2 = avoid non-essential travel to PARTS,
    3 = avoid ALL travel to parts / non-essential to the WHOLE country, 4 = avoid ALL travel
*/
export async function getTravelAdvisory(countryCode, countryName) {
  const slug = await toFcdoSlug(countryCode, countryName)
  if (!slug) return null
  const data = await getJSON(FCDO_URL + slug)
  const statuses = data.details.alert_status || []
  let level = 1
  if (statuses.includes('avoid_all_but_essential_travel_to_parts')) level = 2
  if (statuses.includes('avoid_all_travel_to_parts') || statuses.includes('avoid_all_but_essential_travel_to_whole_country')) level = 3
  if (statuses.includes('avoid_all_travel_to_whole_country')) level = 4
  const labels = { 1: 'Exercise normal caution', 2: 'Avoid non-essential travel to some areas', 3: 'Avoid travel to some areas', 4: 'Avoid all travel' }
  return {
    level,
    label: labels[level],
    latestChange: data.details.change_description,
    updatedAt: data.updated_at,
    url: 'https://www.gov.uk/foreign-travel-advice/' + slug
  }
}

/* USGS: M4+ earthquakes within radiusKm in the last `days` days. GeoJSON coordinates are [lon, lat]. */
export async function getNearbyEarthquakes(lat, lon, radiusKm = 300, days = 3) {
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    format: 'geojson', latitude: roundCoord(lat), longitude: roundCoord(lon),
    maxradiuskm: radiusKm, minmagnitude: 4, starttime: start.toISOString()
  })
  const data = await getJSON(`${USGS_URL}?${params}`)
  return (data.features || []).filter((f) => f && f.geometry && f.properties && typeof f.properties.mag === 'number').map((f) => {
    const [qLon, qLat] = f.geometry.coordinates
    return {
      id: 'eq-' + f.id,
      type: 'earthquake',
      title: f.properties.title,
      place: f.properties.place,
      magnitude: f.properties.mag,
      tsunami: f.properties.tsunami === 1,
      distanceKm: Math.round(haversineKm(lat, lon, qLat, qLon)),
      time: new Date(f.properties.time),
      url: f.properties.url
    }
  })
}

/* How far each kind of disaster reaches (km from its centre). A flood in Hokkaido is not a risk in Tokyo.
   Droughts cover whole regions (one point for 20+ countries), so they count anywhere in the country. */
export const DISASTER_REACH_KM = { EQ: 300, TC: 500, FL: 150, VO: 100, DR: Infinity, WF: 100, TS: 500 }

/* Keep a GDACS event if it is within its reach of lat/lon. Events without a position are kept (can't tell). */
export function nearDisaster(f, lat, lon) {
  const c = f.geometry && f.geometry.type === 'Point' ? f.geometry.coordinates : null
  if (!c || lat === undefined || lat === null) return { near: true, distanceKm: null }
  const distanceKm = Math.round(haversineKm(lat, lon, c[1], c[0]))
  const reach = DISASTER_REACH_KM[f.properties.eventtype] || 200
  return { near: distanceKm <= reach, distanceKm: reach === Infinity ? null : distanceKm }
}

/* GDACS: Orange/Red alerts from the last 7 days in this country, close enough to lat/lon to matter. ";" must stay unencoded. */
export async function getDisasterAlerts(countryCode, lat, lon, days = 7) {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const data = await getJSON(`${GDACS_URL}?alertlevel=Orange;Red&fromdate=${from}`)
  const typeNames = { EQ: 'Earthquake', TC: 'Tropical cyclone', FL: 'Flood', VO: 'Volcano', DR: 'Drought', WF: 'Wildfire', TS: 'Tsunami' }
  const list = []
  for (const f of data.features || []) {
    if (!(f.properties.affectedcountries || []).some((c) => c.iso2 === countryCode)) continue
    const { near, distanceKm } = nearDisaster(f, lat, lon)
    if (!near) continue
    list.push({
      id: 'gdacs-' + f.properties.eventtype + f.properties.eventid,
      type: typeNames[f.properties.eventtype] || 'Disaster',
      title: f.properties.name,
      alertLevel: f.properties.alertlevel, // "Orange" or "Red"
      details: f.properties.severitydata && f.properties.severitydata.severitytext,
      time: f.properties.fromdate ? new Date(f.properties.fromdate) : null,
      url: f.properties.url && f.properties.url.report,
      distanceKm
    })
  }
  return list
}

/*
  computeRiskScore()
  OUR OWN ALGORITHM: one 0-100 number from 3 sources.
  1. Advisory: (level - 1) * 15
  2. Each earthquake: (magnitude - 3) * 8 * distanceFactor * recencyFactor
       distanceFactor = 1 - distance/300, recencyFactor = 1 - hoursAgo/72
  3. Each GDACS alert: Red = 30, Orange = 15
  FLOORS (so the label never understates a real warning):
    advisory level 3 -> at least High (50), level 4 -> at least Critical (75), any Red alert -> at least High,
    a quake within 100 km in the last 24 h: M5.5+ -> at least Moderate, M6.5+ or tsunami flag -> at least High
*/
export function computeRiskScore({ advisory, quakes = [], disasters = [] }) {
  let score = 0
  if (advisory) score += (advisory.level - 1) * 15
  for (const q of quakes) {
    const hoursAgo = (Date.now() - q.time.getTime()) / 3600000
    const distanceFactor = Math.max(0, 1 - q.distanceKm / 300)
    const recencyFactor = Math.max(0, 1 - hoursAgo / 72)
    score += Math.max(0, q.magnitude - 3) * 8 * distanceFactor * recencyFactor
  }
  let anyRed = false
  for (const d of disasters) {
    score += d.alertLevel === 'Red' ? 30 : 15
    if (d.alertLevel === 'Red') anyRed = true
  }
  // A strong, close, recent quake is always worth a warning, whatever the formula says
  for (const q of quakes) {
    const hoursAgo = (Date.now() - q.time.getTime()) / 3600000
    if (q.distanceKm <= 100 && hoursAgo <= 24 && q.magnitude >= 5.5) score = Math.max(score, 30)
    if (q.distanceKm <= 100 && hoursAgo <= 24 && q.magnitude >= 6.5) score = Math.max(score, 50)
    if (q.tsunami && hoursAgo <= 24) score = Math.max(score, 50)
  }
  if (advisory && advisory.level === 3) score = Math.max(score, 50)
  if (advisory && advisory.level === 4) score = Math.max(score, 75)
  if (anyRed) score = Math.max(score, 50)
  score = Math.min(100, Math.round(score))

  // state drives the banner colours: clear (green), advisory (amber), warning (red), critical (purple)
  let label = 'Low', state = 'clear'
  if (score >= 25) { label = 'Moderate'; state = 'advisory' }
  if (score >= 50) { label = 'High'; state = 'warning' }
  if (score >= 75) { label = 'Critical'; state = 'critical' }
  return { score, label, state }
}

/*
  openStatus()
  Reads simple OpenStreetMap opening hours, e.g. "24/7", "Mo-Fr 09:00-18:00; Sa 09:00-12:00; Su off".
  Returns { open: true | false | null, text } for the given time (local time where the place is).
  Unusual formats (holidays, sunrise...) give open: null and just show the hours as written.
*/
const DAY_KEYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function openStatus(hours, now = new Date()) {
  if (!hours) return { open: null, text: 'Hours not listed' }
  const h = String(hours).trim()
  if (h === '24/7' || h === '00:00-24:00' || h === 'Mo-Su 00:00-24:00') return { open: true, text: 'Open 24 hours' }

  const today = now.getDay()
  const minutes = now.getHours() * 60 + now.getMinutes()
  let todaysRanges = null // last rule that mentions today wins
  for (const raw of h.split(';')) {
    const rule = raw.trim()
    const m = rule.match(/^((?:[A-Z][a-z](?:-[A-Z][a-z])?,?)+)?\s*(.*)$/)
    if (!m) return { open: null, text: h }
    let appliesToday = !m[1] // no days listed = every day
    if (m[1]) {
      for (const part of m[1].split(',')) {
        if (!part) continue
        const [a, b] = part.split('-')
        const from = DAY_KEYS.indexOf(a)
        const to = b ? DAY_KEYS.indexOf(b) : from
        if (from < 0 || to < 0) return { open: null, text: h }
        // ranges can wrap past Sunday, e.g. Sa-Mo
        let d = from
        for (let i = 0; i < 7; i++) {
          if (d === today) appliesToday = true
          if (d === to) break
          d = (d + 1) % 7
        }
      }
    }
    if (!appliesToday) continue
    const times = m[2].trim()
    if (times === 'off' || times === 'closed') {
      todaysRanges = []
      continue
    }
    const ranges = []
    for (const t of times.split(',')) {
      const r = t.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/)
      if (!r) return { open: null, text: h }
      ranges.push([Number(r[1]) * 60 + Number(r[2]), Number(r[3]) * 60 + Number(r[4])])
    }
    todaysRanges = ranges
  }
  // Every rule names other days (e.g. "Sa-Mo ..." on a Tuesday): closed today
  if (todaysRanges === null) return { open: false, text: 'Closed today' }
  const fmt = (mins) => String(Math.floor(mins / 60) % 24).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0')
  for (const [a, b] of todaysRanges) {
    const end = b <= a ? b + 1440 : b // overnight, e.g. 20:00-02:00
    if (minutes >= a && minutes < end) return { open: true, text: 'Open now · until ' + fmt(b) }
  }
  for (const [a] of todaysRanges) {
    if (a > minutes) return { open: false, text: 'Closed now · opens ' + fmt(a) }
  }
  return { open: false, text: 'Closed now' }
}
