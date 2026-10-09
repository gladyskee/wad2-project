/*
  safetyService.js
  ----------------
  WHAT THIS FILE DOES:
  Holds all the API calls and logic for the Real-Time Safety Layer.
  It does not touch the UI. The Vue component (SafetyLayer.vue) calls
  these functions and only handles display. Keeping them apart means
  other features (e.g. the living itinerary) can reuse the same
  functions, e.g. to check the risk at the NEXT activity's location.

  WHY fetch() AND NOT axios?
  Our repo doesn't have axios installed, and fetch() is built into
  every browser, so no new dependency is needed. getJSON() below is a
  small wrapper that throws an error on a bad HTTP status, like axios does.

  APIS USED (all free, no API key, all allow browser calls / CORS):
  1. BigDataCloud reverse geocode -> turns lat/lon into country + city
  2. UK FCDO travel advice (gov.uk content API) -> official government
     advisory per country (the "government advisory feed" from our
     project ideas doc)
  3. USGS earthquake feed -> earthquakes NEAR the traveller's actual
     location (location-level, not just country-level)
  4. GDACS (UN/EU Global Disaster Alert system) -> floods, cyclones,
     volcanoes, droughts, etc. for the current country
  5. OpenStreetMap Overpass API -> nearest hospital / clinic /
     police / fire station (free stand-in for Google Places, which
     needs a paid key)

  ALGORITHMS (for the "X-factor" in the Project Q&A slides):
  - Haversine formula: real distance between two GPS points
  - Risk score: combines the advisory level, quake magnitude,
    distance and recency, and disaster alert level into one
    0-100 score
*/

const GEOCODE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
const FCDO_URL = 'https://www.gov.uk/api/content/foreign-travel-advice/'
const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query'
const GDACS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH'
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

/*
  getJSON()
  fetch() does NOT throw on a 404/500, it only throws on network
  failure. So we check res.ok ourselves and throw, which makes the
  failure show up in Promise.allSettled in the component.
*/
async function getJSON(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
  return res.json()
}

/*
  The FCDO API looks countries up by a "slug" in the URL, e.g.
  .../foreign-travel-advice/south-korea
  The geocoder returns names like "Korea" or "Viet Nam", which don't
  match the slug, so countries with awkward names are mapped by hand.
  GB is null because the UK has no travel advice for itself.
*/
const FCDO_SLUG_OVERRIDES = {
  US: 'usa',
  GB: null,
  KR: 'south-korea',
  KP: 'north-korea',
  VN: 'vietnam',
  LA: 'laos',
  TW: 'taiwan',
  HK: 'hong-kong',
  MO: 'macao',
  AE: 'united-arab-emirates',
  CZ: 'czech-republic',
  TR: 'turkey',
  RU: 'russia'
}

/*
  Local emergency numbers, shown as tap-to-call buttons.
  The default 112 works on most mobile networks worldwide.
*/
export const EMERGENCY_NUMBERS = {
  SG: { police: '999', ambulance: '995' },
  JP: { police: '110', ambulance: '119' },
  KR: { police: '112', ambulance: '119' },
  TH: { police: '191', ambulance: '1669' },
  MY: { police: '999', ambulance: '999' },
  TW: { police: '110', ambulance: '119' },
  DEFAULT: { police: '112', ambulance: '112' }
}

/*
  haversineKm()
  Calculates the straight-line distance in km between two lat/lon
  points on Earth, a sphere with radius 6371 km.
  Used to:
   - sort hospitals/police by how close they are
   - weight earthquakes (a quake 20 km away matters more than one 280 km away)
   - only re-fetch data when the user has actually moved (saves API calls)
*/
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/*
  getLocationInfo()
  Reverse geocoding: GPS coordinates -> country code, country name, city.
  The country code (e.g. "KR") drives the advisory lookup, the GDACS
  filter and the emergency numbers.
*/
export async function getLocationInfo(lat, lon) {
  const params = new URLSearchParams({ latitude: lat, longitude: lon, localityLanguage: 'en' })
  const data = await getJSON(`${GEOCODE_URL}?${params}`)
  return {
    countryCode: data.countryCode,
    countryName: data.countryName,
    city: data.city || data.locality || data.principalSubdivision
  }
}

/*
  toFcdoSlug()
  Turns a country into the FCDO URL slug.
  Uses the override table first, otherwise builds it from the name:
  "Singapore" -> "singapore", "New Zealand" -> "new-zealand"
*/
function toFcdoSlug(countryCode, countryName) {
  if (countryCode in FCDO_SLUG_OVERRIDES) return FCDO_SLUG_OVERRIDES[countryCode]
  return countryName
    .toLowerCase()
    .replace(/\(.*?\)/g, '')     /* drop things like "(the)" */
    .trim()
    .replace(/[^a-z\s-]/g, '')   /* drop accents/punctuation */
    .replace(/\s+/g, '-')        /* spaces -> dashes */
}

/*
  getTravelAdvisory()
  Fetches the UK government's official travel advice for the country.
  FCDO returns an "alert_status" array, which we turn into a level 1-4
  (like a traffic light):
    1 = no special warnings (exercise normal caution)
    2 = avoid all but essential travel to PARTS of the country
    3 = avoid ALL travel to parts / all but essential to WHOLE country
    4 = avoid ALL travel to the WHOLE country
  "change_description" is what changed most recently, e.g. "Addition of
  information about flooding and heavy rain". This is how we show
  "what's new", not just a static warning.
*/
export async function getTravelAdvisory(countryCode, countryName) {
  const slug = toFcdoSlug(countryCode, countryName)
  if (!slug) return null

  const data = await getJSON(FCDO_URL + slug)
  const statuses = data.details.alert_status || []

  let level = 1
  if (statuses.includes('avoid_all_but_essential_travel_to_parts')) level = 2
  if (
    statuses.includes('avoid_all_travel_to_parts') ||
    statuses.includes('avoid_all_but_essential_travel_to_whole_country')
  ) level = 3
  if (statuses.includes('avoid_all_travel_to_whole_country')) level = 4

  const labels = {
    1: 'Exercise normal caution',
    2: 'Avoid non-essential travel to some areas',
    3: 'Avoid travel to some areas',
    4: 'Avoid all travel'
  }

  return {
    level,
    label: labels[level],
    latestChange: data.details.change_description,
    updatedAt: data.updated_at,
    url: 'https://www.gov.uk/foreign-travel-advice/' + slug
  }
}

/*
  getNearbyEarthquakes()
  Asks USGS for earthquakes within `radiusKm` of the traveller in the
  last `days` days, magnitude 4+ (smaller ones are rarely felt).
  This is the "where the traveller currently is" part of our feature:
  it searches around the live GPS point, not the whole country.
  USGS GeoJSON stores coordinates as [lon, lat, depth], so it's
  read as [lon, lat] and not the other way round.
*/
export async function getNearbyEarthquakes(lat, lon, radiusKm = 300, days = 3) {
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    format: 'geojson',
    latitude: lat,
    longitude: lon,
    maxradiuskm: radiusKm,
    minmagnitude: 4,
    starttime: start.toISOString()
  })
  const data = await getJSON(`${USGS_URL}?${params}`)

  return data.features.map((f) => {
    const [qLon, qLat] = f.geometry.coordinates
    return {
      id: 'eq-' + f.id,
      type: 'earthquake',
      title: f.properties.title,
      magnitude: f.properties.mag,
      distanceKm: Math.round(haversineKm(lat, lon, qLat, qLon)),
      time: new Date(f.properties.time),
      url: f.properties.url
    }
  })
}

/*
  getDisasterAlerts()
  GDACS gives global disaster alerts (EQ earthquake, TC cyclone,
  FL flood, VO volcano, DR drought, WF wildfire).
  We only ask for Orange/Red alerts (serious ones) from the last 7 days,
  then keep the ones whose affected countries include the traveller's.
  The URL is built by hand (not URLSearchParams) because that would
  encode the ";" in "Orange;Red", and GDACS expects it raw.
*/
export async function getDisasterAlerts(countryCode, days = 7) {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const data = await getJSON(`${GDACS_URL}?alertlevel=Orange;Red&fromdate=${from}`)

  const typeNames = {
    EQ: 'Earthquake', TC: 'Tropical cyclone', FL: 'Flood',
    VO: 'Volcano', DR: 'Drought', WF: 'Wildfire'
  }

  return (data.features || [])
    .filter((f) =>
      (f.properties.affectedcountries || []).some((c) => c.iso2 === countryCode)
    )
    .map((f) => ({
      id: 'gdacs-' + f.properties.eventtype + f.properties.eventid,
      type: typeNames[f.properties.eventtype] || 'Disaster',
      title: f.properties.name,
      alertLevel: f.properties.alertlevel,   /* "Orange" or "Red" */
      details: f.properties.severitydata?.severitytext,
      url: f.properties.url?.report
    }))
}

/*
  getNearestEmergencyServices()
  Uses OpenStreetMap's Overpass API to find hospitals, clinics, police
  and fire stations within `radiusM` metres.
  The query language (Overpass QL) says:
    "find nodes AND ways whose amenity tag is one of these,
     within X metres of this point, and give me their centre point"
  We then work out the distance with haversine, sort nearest first,
  and keep the closest 3 of each type.
  Each result gets a Google Maps directions link. This needs no API key,
  it just opens Google Maps with the destination filled in.
*/
export async function getNearestEmergencyServices(lat, lon, radiusM = 3000) {
  const query = `
    [out:json][timeout:25];
    (
      nwr["amenity"~"hospital|clinic|police|fire_station"](around:${radiusM},${lat},${lon});
    );
    out center;
  `
  const data = await postOverpass(query)

  const places = data.elements
    .map((el) => {
      /* nodes have lat/lon directly; ways/buildings have a "center" */
      const pLat = el.lat ?? el.center?.lat
      const pLon = el.lon ?? el.center?.lon
      return {
        id: el.type + el.id,
        name: el.tags?.['name:en'] || el.tags?.name || 'Unnamed ' + el.tags.amenity,
        type: el.tags.amenity,
        phone: el.tags?.phone || null,
        distanceKm: haversineKm(lat, lon, pLat, pLon),
        mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${pLat},${pLon}`
      }
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)

  /* group by type and keep the closest 3 of each */
  const grouped = {}
  for (const p of places) {
    if (!grouped[p.type]) grouped[p.type] = []
    if (grouped[p.type].length < 3) grouped[p.type].push(p)
  }
  return grouped
}

/*
  computeRiskScore()
  OUR OWN ALGORITHM. It combines 3 data sources into one number
  (0 = safe, 100 = critical) so the user doesn't have to read
  3 different feeds themselves. This is the "get data -> merge
  data -> massage data -> show data" step from the Project Q&A
  slides (the A- level).

  Scoring:
  1. Advisory: (level - 1) * 15  -> level 1 = 0 pts, level 4 = 45 pts
  2. Each earthquake: (magnitude - 3) * 8, then multiplied by
       distanceFactor = 1 - distance/300   (closer = worse)
       recencyFactor  = 1 - hoursAgo/72    (newer = worse)
     So an M6 quake 10 km away an hour ago is about 23 pts,
     and an M4.5 quake 280 km away 2 days ago is about 0.3 pts.
  3. Each GDACS alert: Red = 30 pts, Orange = 15 pts
  The total is capped at 100, then given a label and a Bootstrap colour.
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

  for (const d of disasters) {
    score += d.alertLevel === 'Red' ? 30 : 15
  }

  score = Math.min(100, Math.round(score))

  let label = 'Low', colour = 'success'
  if (score >= 25) { label = 'Moderate'; colour = 'warning' }
  if (score >= 50) { label = 'High'; colour = 'danger' }
  if (score >= 75) { label = 'Critical'; colour = 'dark' }

  return { score, label, colour }
}

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
]

// Try each Overpass server in turn
async function postOverpass(query) {
  let lastErr
  for (const url of OVERPASS_URLS) {
    try {
      return await getJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      })
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}
