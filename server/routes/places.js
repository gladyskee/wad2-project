import express from 'express'
import { requireAuth } from './auth.js'
import Attraction from '../models/Attraction.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Hand-picked top sights per country (the same list Discover shows), put first in "Popular in ..."
let TOP_SIGHTS = {}
try {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data', 'countryAttractions.json')
  TOP_SIGHTS = JSON.parse(fs.readFileSync(file, 'utf8')).countries || {}
} catch (err) {
  console.warn('Could not read the top sights list:', err.message)
}

const router = express.Router()

// Remember recent searches so typing the same letters again is instant and free
const cache = new Map()
const CACHE_LIMIT = 300

// Place types we want to suggest (cities, towns, regions, countries...)

// GET /api/places?q=kyo  -> [{ label: 'Kyoto, Japan', name, country, countryCode: 'JP', type }]
// Uses Photon (photon.komoot.io): a free place search built for type-ahead, based on OpenStreetMap.
router.get('/', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim()
  if (q.length < 2 || q.length > 60) return res.json([])

  const key = q.toLowerCase()
  if (cache.has(key)) return res.json(cache.get(key))

  let data
  try {
    const url = 'https://photon.komoot.io/api/?' + new URLSearchParams({ q, limit: '15', lang: 'en', osm_tag: 'place' })
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ChuiseYourTrip/1.0 (SMU IS216 student project)' },
      signal: AbortSignal.timeout(5000)
    })
    data = await response.json()
  } catch (err) {
    return res.status(502).json({ message: 'Place search is unavailable right now.' })
  }

  // Rank what came back so travel destinations win over same-named small towns:
  // a country or big city beats a town, and an exact name match beats a partial one.
  // Searching "Russia" should give Russia, not Russia (Ohio), Russiaville or Russian Island.
  const TYPE_WEIGHT = { country: 100, city: 80, state: 60, province: 60, region: 60, island: 40, town: 30 }
  const wantedName = q.toLowerCase()
  const ranked = []
  const seen = []
  for (const f of data.features || []) {
    const p = f.properties || {}
    const weight = TYPE_WEIGHT[p.osm_value]
    if (!p.name || weight === undefined) continue // villages, hamlets, counties... aren't trip destinations
    // A country, or a city-state named after itself ("Singapore, Singapore"), is just its name
    const label = p.osm_value === 'country' || !p.country || p.name === p.country ? p.name : p.name + ', ' + p.country
    if (seen.includes(label)) continue
    seen.push(label)
    const name = p.name.toLowerCase()
    const match = name === wantedName ? 50 : name.startsWith(wantedName) ? 20 : 0
    ranked.push({ label, name: p.name, country: p.country || '', countryCode: (p.countrycode || '').toUpperCase(), type: p.osm_value, score: weight + match })
  }
  ranked.sort((x, y) => y.score - x.score)
  // Keep only results close to the best one (a famous match hides obscure look-alikes), max 6
  const best = ranked.length ? ranked[0].score : 0
  const results = []
  for (const r of ranked) {
    if (r.score < best - 60 || results.length === 6) break
    results.push({ label: r.label, name: r.name, country: r.country, countryCode: r.countryCode, type: r.type })
  }

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value) // forget the oldest
  cache.set(key, results)
  res.json(results)
})

// ---------------------------------------------------------------------
// GET /api/places/attractions?destination=Kyoto, Japan
// -> up to 100 popular attractions there: [{ name, type, indoor, address }]
//
// 1. Photon finds the destination (city or country).
// 2. Overpass (OpenStreetMap) lists named tourist places inside it.
// 3. "Popular" = places important enough to have a Wikipedia/Wikidata page.
// Results are saved in MongoDB, so each destination is only looked up once.
// ---------------------------------------------------------------------
const HEADERS = { 'User-Agent': 'ChuiseYourTrip/1.0 (SMU IS216 student project)' }
const TYPES = 'attraction|museum|gallery|viewpoint|zoo|theme_park|aquarium'
const INDOOR_TYPES = ['museum', 'gallery', 'aquarium']
const CACHE_DAYS = 30
// Two public Overpass servers: if the first is busy or slow, try the second
// Public Overpass servers: if one is busy, down or rate-limiting us, the next one is tried
const OVERPASS_SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

export async function askOverpass(query, waitSeconds) {
  let lastError = null
  for (const server of OVERPASS_SERVERS) {
    try {
      const response = await fetch(server, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout((waitSeconds + 5) * 1000)
      })
      const text = await response.text()
      if (!response.ok) throw new Error('Overpass ' + response.status + ' (' + server + ')')
      const data = JSON.parse(text) // throws if Overpass sent an HTML error page
      // When busy, Overpass can answer "OK" with no places and a remark like "Query timed out"
      if (data.remark && !(data.elements || []).length) throw new Error('Overpass: ' + data.remark)
      return data
    } catch (err) {
      lastError = err
      console.error('Overpass attempt failed:', err.message)
    }
  }
  throw lastError
}

// Same as askOverpass, but asks every server at once and takes the first good answer
// (the others are cancelled). Much faster when one server is busy: no waiting for it to time out first.
export async function askOverpassFast(query, waitSeconds) {
  const stop = new AbortController()
  const tries = OVERPASS_SERVERS.map(async (server) => {
    // Stops when time runs out, or when another server already answered
    const own = new AbortController()
    const timer = setTimeout(() => own.abort(), waitSeconds * 1000)
    stop.signal.addEventListener('abort', () => own.abort())
    try {
      const response = await fetch(server, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: own.signal
      })
      if (!response.ok) throw new Error('Overpass ' + response.status + ' (' + server + ')')
      const data = JSON.parse(await response.text())
      if (data.remark && !(data.elements || []).length) throw new Error('Overpass: ' + data.remark)
      return data
    } finally {
      clearTimeout(timer)
    }
  })
  try {
    const data = await Promise.any(tries)
    stop.abort() // cancel the slower servers
    return data
  } catch (err) {
    throw new Error('All Overpass servers failed: ' + (err.errors || []).map((e) => e.message).join('; '))
  }
}

// Backup source: Wikipedia articles within 10 km that look like places to visit
// (titles are checked for words like museum, park, mosque, so streets and schools are left out)
const WIKI_KINDS = [
  { words: ['museum'], type: 'museum', indoor: true },
  { words: ['gallery'], type: 'gallery', indoor: true },
  { words: ['zoo'], type: 'zoo', indoor: false },
  { words: ['aquarium'], type: 'aquarium', indoor: true },
  { words: ['theatre', 'theater', 'opera', 'philharmonic', 'circus'], type: 'attraction', indoor: true },
  { words: ['bazaar', 'market', 'mall'], type: 'shop', indoor: true },
  { words: ['mosque', 'church', 'cathedral', 'temple', 'shrine', 'monastery', 'synagogue'], type: 'heritage', indoor: true },
  { words: ['park', 'garden', 'gardens', 'lake', 'gorge', 'waterfall', 'canyon', 'reserve'], type: 'park', indoor: false },
  { words: ['monument', 'memorial', 'square', 'palace', 'tower', 'fortress', 'castle', 'statue', 'gate'], type: 'attraction', indoor: false }
]

// Titles ending in these are about something else ("Ueno Park Building", "Shrine Station")
const NOT_PLACES = ['building', 'station', 'school', 'university', 'college', 'hotel', 'street', 'road', 'avenue',
  'line', 'office', 'hospital', 'company', 'bank', 'headquarters', 'apartments', 'bridge', 'interchange', 'exit']

// What a title is about = the LAST kind word in it ("Meiji Shrine Garden" is a garden). null = not a sight.
export function wikiKind(title) {
  const words = title.replace(/\(.*?\)/g, '').toLowerCase().split(/[^a-z]+/).filter(Boolean)
  if (!words.length || NOT_PLACES.includes(words[words.length - 1])) return null
  for (let i = words.length - 1; i >= 0; i--) {
    const kind = WIKI_KINDS.find((k) => k.words.includes(words[i]))
    if (kind) return kind
  }
  return null
}

async function wikiNearby(lat, lon, destination) {
  // generator=geosearch + pageprops: the articles near the centre, with their Wikidata id (for fame)
  const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'geosearch', ggscoord: lat + '|' + lon, ggsradius: '10000', ggslimit: '100',
    prop: 'pageprops', ppprop: 'wikibase_item', format: 'json'
  })
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
  const data = await response.json()
  const out = []
  for (const g of Object.values((data.query && data.query.pages) || {})) {
    const kind = wikiKind(g.title)
    if (!kind) continue
    out.push({ name: g.title, type: kind.type, indoor: kind.indoor, address: g.title + ', ' + destination, wiki: 'en:' + g.title,
      wikidata: (g.pageprops && g.pageprops.wikibase_item) || null, rank: 0, source: 'wikipedia' })
  }
  // Most famous first, same as the OpenStreetMap list
  await addFame(out)
  return out.sort((a, b) => b.rank - a.rank)
}

// Fame of each place = how many Wikipedia languages have an article on it (Wikidata "sitelinks")
async function addFame(list) {
  const ids = []
  for (const item of list) if (/^Q\d+$/.test(item.wikidata || '') && !ids.includes(item.wikidata)) ids.push(item.wikidata)
  const fame = {}
  // Up to 300 places, 50 per request, all requests at once (a slow or failed one is just skipped)
  const batches = []
  for (let i = 0; i < ids.length && i < 300; i += 50) batches.push(ids.slice(i, i + 50))
  await Promise.all(batches.map(async (batch) => {
    try {
      const url = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
        action: 'wbgetentities', ids: batch.join('|'), props: 'sitelinks', format: 'json'
      })
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error('Wikidata ' + response.status)
      const data = await response.json()
      for (const id in data.entities || {}) {
        const links = data.entities[id].sitelinks || {}
        let n = 0
        for (const site in links) if (site.endsWith('wiki') && site !== 'commonswiki') n++
        fame[id] = n
      }
    } catch (err) {
      console.error('Wikidata fame lookup failed:', err.message)
    }
  }))
  for (const item of list) item.rank = fame[item.wikidata] || 0
}

// "Singapore" or "Kyoto, Japan" -> the hand-picked sights (for a city, only those near it)
function topSightsFor(destination, isCountry) {
  const parts = destination.split(', ')
  const country = parts[parts.length - 1]
  const city = parts.length > 1 ? parts[0] : ''
  const picks = TOP_SIGHTS[country] || TOP_SIGHTS[destination] || []
  if (isCountry || !city) return picks
  return picks.filter((p) => !p.city || plain(p.city) === plain(city))
}
function guessType(name) {
  const n = name.toLowerCase()
  for (const k of WIKI_KINDS) {
    for (const w of k.words) if (n.includes(w)) return k.type
  }
  if (/studios|disney|world|land\b/.test(n)) return 'theme_park'
  return 'attraction'
}

router.get('/attractions', requireAuth, async (req, res) => {
  const destination = (req.query.destination || '').trim()
  if (!destination || destination.length > 80) return res.json([])

  const key = destination.toLowerCase()
  const saved = await Attraction.findOne({ key })
  // Use the saved list if it is recent and not empty (an empty list means an earlier lookup went wrong)
  // (lists saved before places were ranked by fame have no "rank" and are looked up again)
  const ranked = saved && saved.items.length && saved.items[0].rank !== undefined
  // A Wikipedia-only list (OpenStreetMap was down) is kept for an hour, then OpenStreetMap is tried again
  const maxDays = saved && saved.fallback ? 1 / 24 : CACHE_DAYS
  if (ranked && (Date.now() - saved.fetchedAt.getTime()) / 86400000 < maxDays) return res.json(saved.items)

  try {
    // 1. Where is it?
    const geoUrl = 'https://photon.komoot.io/api/?' + new URLSearchParams({ q: destination, limit: '1', lang: 'en', osm_tag: 'place' })
    const geoRes = await fetch(geoUrl, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
    const geo = await geoRes.json()
    const place = geo.features && geo.features[0]
    if (!place) return res.json([])
    const props = place.properties || {}
    const [lon, lat] = place.geometry.coordinates
    const isCountry = props.osm_value === 'country'

    // 2. Ask OpenStreetMap (Overpass). Each try can fail (busy servers), so we fall back step by step:
    //    a) inside the boundary, famous places only   b) 15 km around the centre, any named tourist place
    //    c) if Overpass is down completely: Wikipedia articles near the centre (see wikiNearby)
    const famous = isCountry ? '["wikipedia"]' : '["wikidata"]'
    // Time budget: all Overpass servers are asked at once and the first answer wins
    const waitSeconds = isCountry ? 40 : 20
    let osm = { elements: [] }
    try {
      const prefix = props.osm_type === 'R' ? 'area(' + (3600000000 + Number(props.osm_id)) + ')->.a;' : ''
      const sel = props.osm_type === 'R' ? 'nwr(area.a)' : 'nwr(around:15000,' + lat + ',' + lon + ')'
      // Tourist sights with a Wikipedia/Wikidata entry. For a city, also famous parks/gardens and historic places
      // (a whole country has too many of those to ask about in time).
      let parts = sel + '["tourism"~"^(' + TYPES + ')$"]["name"]' + famous + ';'
      if (!isCountry) {
        parts += sel + '["leisure"~"^(park|garden|nature_reserve|water_park)$"]["name"]["wikidata"];' +
          sel + '["historic"~"^(castle|monument|memorial|fort|palace|ruins|archaeological_site)$"]["name"]["wikidata"];'
      }
      const query = '[out:json][timeout:' + waitSeconds + '];' + prefix + '(' + parts + ');out tags center 500;'
      osm = await askOverpassFast(query, waitSeconds + 5)
    } catch (err) {
      console.error('Overpass step a failed for "' + destination + '":', err.message)
    }
    if (!(osm.elements || []).length && !isCountry) {
      try {
        const nearby = '[out:json][timeout:25];(nwr(around:15000,' + lat + ',' + lon + ')' +
          '["tourism"~"^(' + TYPES + ')$"]["name"];);out tags center 300;'
        osm = await askOverpassFast(nearby, 20)
      } catch (err) {
        console.error('Overpass step b failed for "' + destination + '":', err.message)
      }
    }

    // 3. Collect the places (one per name)
    const list = []
    const seen = []
    for (const el of osm.elements || []) {
      const t = el.tags || {}
      const name = t['name:en'] || t.name
      if (!name || seen.includes(plain(name))) continue
      seen.push(plain(name))
      // What kind of place: tourism type first, then parks and historic places
      let type = t.tourism
      if (!type && t.leisure) type = 'park'
      if (!type && t.historic) type = 'heritage'

      // Build an address the crowd tracker can use later
      const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ')
      const address = street ? street + ', ' + (t['addr:city'] || destination) : name + ', ' + destination

      list.push({
        name,
        type,
        indoor: INDOOR_TYPES.includes(type),
        address,
        // Where its photo can be found (used by /photos): "en:Arch of Triumph (Pyongyang)", "Q1234"
        wiki: t.wikipedia || null,
        wikidata: t.wikidata || null,
        rank: 0
      })
    }

    // 4. How famous is each place? The number of Wikipedia languages that have an article about it
    //    (Universal Studios Singapore: ~40, a small neighbourhood park: 1-2). Wikidata answers 50 at a time.
    try {
      await addFame(list)
    } catch (err) {
      console.error('Could not rank places by fame:', err.message)
    }
    const typeBonus = { theme_park: 6, zoo: 5, aquarium: 5, museum: 3, attraction: 3, viewpoint: 2, gallery: 2, heritage: 2, park: 0 }
    for (const item of list) item.score = item.rank + (typeBonus[item.type] || 0) + (item.wiki ? 2 : 0)
    list.sort((a, b) => b.score - a.score)

    // 5. Hand-picked top sights for this country (and city) go first
    const top = []
    for (const pick of topSightsFor(destination, isCountry)) {
      const same = list.find((x) => plain(x.name).includes(plain(pick.name)) || plain(pick.name).includes(plain(x.name)))
      if (same) {
        same.rank = 999 // keep its real map details, just move it to the top
        top.push(same)
      } else {
        top.push({ name: pick.name, type: guessType(pick.name), indoor: false, address: pick.name + ', ' + (pick.city || destination),
          wiki: 'en:' + pick.name, wikidata: null, rank: 999 })
      }
    }
    for (const item of list) {
      if (top.length >= 100) break
      if (!top.includes(item)) top.push(item)
    }
    for (let i = 0; i < top.length; i++) {
      const it = top[i]
      top[i] = { name: it.name, type: it.type, indoor: it.indoor, address: it.address, wiki: it.wiki, wikidata: it.wikidata, rank: it.rank }
    }
    // c) Still nothing: famous places from Wikipedia near the centre
    if (!top.length) {
      try {
        for (const item of await wikiNearby(lat, lon, destination)) top.push(item)
      } catch (err) {
        console.error('Wikipedia fallback failed for "' + destination + '":', err.message)
      }
    }
    if (!top.length) throw new Error('no source answered')

    // Saved when OpenStreetMap answered; a Wikipedia-only list is saved for an hour (see above).
    // (A list of just the hand-picked sights is tried again next time.)
    const fromOsm = (osm.elements || []).length > 0
    const fromWiki = top.some((x) => x.source === 'wikipedia')
    if (fromOsm || fromWiki) await Attraction.findOneAndUpdate({ key }, { key, items: top, fetchedAt: new Date(), fallback: !fromOsm }, { upsert: true })
    res.json(top)
  } catch (err) {
    console.error('Attractions lookup failed for "' + destination + '":', err.message)
    res.status(502).json({ message: 'Could not load popular places right now. Try again in a minute.' })
  }
})

// ---------------------------------------------------------------------
// GET /api/places/photos?city=Pyongyang, North Korea&names=Juche Tower|Arch of Triumph
// -> { "Juche Tower": "https://upload.wikimedia.org/...jpg", "Arch of Triumph": null }
// A photo for each place, trying (in order):
//   1. the Wikipedia article OpenStreetMap links to   2. the Wikidata entry's main image
//   3. a Wikipedia search for "name city"              4. a Wikimedia Commons photo search
// Answers are kept in memory (photos for a day, "no photo" for an hour).
// ---------------------------------------------------------------------
const placePhotos = new Map() // 'name|city' -> { url, at }

function plainWords(text) {
  return plain(text).split(/[^a-z0-9]+/).filter((w) => w.length > 2)
}
// Does a page/file title look like it's about this place? (shares a real word with its name)
function sameThing(name, title) {
  const words = plainWords(name).filter((w) => !['the', 'and', 'museum', 'park', 'temple', 'tower', 'palace', 'bridge'].includes(w))
  const t = plain(title)
  if (!words.length) return t.includes(plain(name))
  for (const w of words) if (t.includes(w)) return true
  return false
}
async function wikiJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}
// 1. "en:Arch of Triumph (Pyongyang)" -> that article's picture
async function photoFromArticle(tag) {
  const at = tag.indexOf(':')
  const lang = at > 0 && at < 4 ? tag.slice(0, at) : 'en'
  const title = at > 0 && at < 4 ? tag.slice(at + 1) : tag
  const data = await wikiJson('https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')))
  return (data.thumbnail && data.thumbnail.source) || null
}
// 2. Q-number -> its "image" (P18) on Wikimedia Commons
async function photoFromWikidata(id) {
  if (!/^Q\d+$/.test(id)) return null
  const data = await wikiJson('https://www.wikidata.org/wiki/Special:EntityData/' + id + '.json')
  const entity = data.entities && data.entities[id]
  const claim = entity && entity.claims && entity.claims.P18 && entity.claims.P18[0]
  const file = claim && claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value
  return file ? 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=800' : null
}
// 3. Search Wikipedia for "name city" and take the first matching article with a picture
async function photoFromSearch(name, city) {
  const data = await wikiJson('https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: name + ' ' + city, gsrlimit: '5',
    prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '800', format: 'json'
  }))
  const pages = Object.values((data.query && data.query.pages) || {}).sort((a, b) => a.index - b.index)
  for (const pg of pages) {
    if (pg.thumbnail && sameThing(name, pg.title)) return pg.thumbnail.source
  }
  return null
}
// 4. Search Wikimedia Commons for a photo file named after the place
async function photoFromCommons(name, city) {
  const data = await wikiJson('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'search', gsrnamespace: '6', gsrsearch: name + ' ' + city + ' filetype:bitmap', gsrlimit: '6',
    prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: '800', format: 'json'
  }))
  const pages = Object.values((data.query && data.query.pages) || {}).sort((a, b) => a.index - b.index)
  for (const pg of pages) {
    const info = pg.imageinfo && pg.imageinfo[0]
    if (!info || info.mime !== 'image/jpeg' || info.width < 400) continue
    if (/map|flag|logo|seal|diagram|plan/i.test(pg.title)) continue
    if (sameThing(name, pg.title)) return info.thumburl || info.url
  }
  return null
}
async function photoForPlace(name, city, item) {
  const key = plain(name) + '|' + plain(city)
  const known = placePhotos.get(key)
  if (known && Date.now() - known.at < (known.url ? 86400000 : 3600000)) return known.url
  const steps = []
  if (item && item.wiki) steps.push(() => photoFromArticle(item.wiki))
  if (item && item.wikidata) steps.push(() => photoFromWikidata(item.wikidata))
  steps.push(() => photoFromSearch(name, city))
  steps.push(() => photoFromCommons(name, city))
  let url = null
  for (const step of steps) {
    try {
      url = await step()
    } catch (err) {
      url = null // that source failed; try the next one
    }
    if (url) break
  }
  placePhotos.set(key, { url, at: Date.now() })
  return url
}

router.get('/photos', async (req, res) => {
  const city = String(req.query.city || '').trim().slice(0, 80)
  const names = String(req.query.names || '').split('|').map((n) => n.trim().slice(0, 120)).filter(Boolean).slice(0, 40)
  const cityName = city.split(', ')[0]
  // The saved popular places know their Wikipedia/Wikidata links
  let items = []
  try {
    const saved = city ? await Attraction.findOne({ key: city.toLowerCase() }) : null
    items = saved ? saved.items : []
  } catch (err) {
    items = []
  }
  const out = {}
  let next = 0
  async function worker() {
    while (next < names.length) {
      const name = names[next++]
      const item = items.find((x) => x.name === name)
      out[name] = await photoForPlace(name, cityName, item)
    }
  }
  const workers = []
  for (let i = 0; i < 4; i++) workers.push(worker())
  await Promise.all(workers)
  res.json(out)
})

// ---------------------------------------------------------------------
// GET /api/places/search?q=fam&near=Kyoto, Japan
// -> places in that destination matching what's typed, with chains grouped:
//    [{ name: 'FamilyMart', type: 'shop', kind: 'Convenience store', indoor: true,
//       branches: [{ address: '12 Shijo-dori, Shimogyo, Kyoto' }, ...] }]
// Photon searches any named place (shops, restaurants, temples...) inside a box around the destination.
// ---------------------------------------------------------------------
const centres = new Map()   // destination -> { lat, lon }
const searches = new Map()  // 'near|q' -> results

// OpenStreetMap tag -> one of our card types (see src/placeStyle.js)
const FOOD = ['restaurant', 'cafe', 'fast_food', 'food_court', 'bar', 'pub', 'ice_cream', 'bakery']
const PARKS = ['park', 'garden', 'nature_reserve', 'beach_resort']
const STATIONS = ['station', 'subway_entrance', 'stop', 'halt', 'bus_station', 'aerodrome', 'terminal']
const WORSHIP = ['place_of_worship', 'shrine', 'temple', 'monastery']

function cardType(key, value) {
  if (key === 'tourism' && ['museum', 'gallery', 'viewpoint', 'zoo', 'theme_park', 'aquarium'].includes(value)) return value
  if (FOOD.includes(value)) return 'food'
  if (key === 'shop' || value === 'marketplace' || value === 'mall') return 'shop'
  if (PARKS.includes(value) || key === 'natural' || key === 'waterway') return 'park' // lakes, peaks, waterfalls too
  if (STATIONS.includes(value) || key === 'railway' || key === 'public_transport') return 'transport'
  if (WORSHIP.includes(value) || key === 'historic') return 'heritage'
  if (key === 'tourism') return 'attraction'
  return 'custom'
}

// 'fast_food' -> 'Fast food'
function prettyKind(value) {
  if (value === 'convenience') return 'Convenience store'
  if (value === 'yes') return 'Place'
  const text = String(value || 'place').replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Ask a free map service for JSON. Fails clearly on a busy/blocked answer (HTML or 429), and tries once more.
async function getMapJson(url) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      return await response.json()
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

// Nominatim (OpenStreetMap's own search) answers in a different shape: turn it into Photon's
function fromNominatim(list) {
  const features = []
  for (const r of list || []) {
    const a = r.address || {}
    features.push({
      geometry: { coordinates: [Number(r.lon), Number(r.lat)] },
      properties: {
        name: r.name || (r.display_name || '').split(',')[0],
        osm_key: r.category, osm_value: r.type,
        housenumber: a.house_number, street: a.road,
        district: a.suburb || a.neighbourhood, city: a.city || a.town || a.village
      }
    })
  }
  return { features }
}

// Where a destination is: Photon first, Nominatim if Photon is down
// ---------- search quality helpers ----------
// Things nobody plans a trip around
const SKIP_KEYS = ['place', 'boundary', 'highway', 'landuse', 'building', 'office', 'power', 'man_made', 'emergency', 'barrier', 'craft']
const SKIP_VALUES = ['bus_stop', 'parking', 'parking_entrance', 'toilets', 'atm', 'bench', 'waste_basket', 'vending_machine', 'post_box', 'charging_station', 'fuel', 'bicycle_parking', 'taxi', 'platform', 'stop_position', 'yes']
// Sights first, then food and shops
const TYPE_SCORE = { attraction: 30, heritage: 30, museum: 30, gallery: 25, viewpoint: 30, zoo: 30, theme_park: 30, aquarium: 30, park: 25, food: 15, shop: 10, transport: 5, custom: 0 }
const FAMOUS = ['attraction', 'museum', 'viewpoint', 'castle', 'palace', 'monument', 'temple', 'water', 'peak', 'waterfall', 'lake']

// "Café Mozart" -> "cafe mozart" (no accents or capitals, so "cafe" finds "Café")
function plain(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
// How well a place's name matches what was typed: exact 100, starts with it 70, a word starts with it 50,
// every typed word starts a word in the name ("lake phew" -> "Phewa Lake") 45, somewhere inside 25
function matchScore(typed, name) {
  const q = plain(typed)
  const n = plain(name)
  if (n === q) return 100
  if (n.startsWith(q)) return 70
  const words = n.split(/[\s\-,'’()]+/)
  for (const w of words) if (w.startsWith(q)) return 50
  let all = true
  for (const part of q.split(/\s+/)) {
    let found = false
    for (const w of words) if (w.startsWith(part)) found = true
    if (!found) all = false
  }
  if (all) return 45
  if (n.includes(q)) return 25
  return 0 // the map service matched it loosely (a typo, or the address)
}
function kmBetween(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(a))
}

async function findCentre(destination) {
  if (centres.has(destination)) return centres.get(destination)
  let centre = null
  try {
    const data = await getMapJson('https://photon.komoot.io/api/?' + new URLSearchParams({ q: destination, limit: '1', lang: 'en', osm_tag: 'place' }))
    const f = data.features && data.features[0]
    if (f) centre = { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], isCountry: f.properties.osm_value === 'country' }
  } catch (err) {
    console.warn('Photon could not find', destination + ':', err.message, '(trying Nominatim)')
    const list = await getMapJson('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ q: destination, format: 'jsonv2', limit: '1', 'accept-language': 'en' }))
    if (list[0]) centre = { lon: Number(list[0].lon), lat: Number(list[0].lat), isCountry: list[0].addresstype === 'country' }
  }
  if (centre) centres.set(destination, centre)
  return centre
}

router.get('/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim()
  const near = (req.query.near || '').trim()
  if (q.length < 2 || q.length > 80 || !near || near.length > 80) return res.json([])

  const key = plain(near) + '|' + plain(q)
  if (searches.has(key)) return res.json(searches.get(key))

  let data
  let centre = null
  try {
    centre = await findCentre(near)
    if (!centre) return res.json([])
    const d = 0.3 // about 30 km around a city
    const box = [centre.lon - d, centre.lat - d, centre.lon + d, centre.lat + d]
    try {
      const params = new URLSearchParams({ q, limit: '40', lang: 'en', lat: String(centre.lat), lon: String(centre.lon) })
      // Cities: only look around the centre. Countries: just prefer places near the middle.
      if (!centre.isCountry) params.set('bbox', box.join(','))
      // Leave out roads, borders and land areas, so the 40 answers are real places
      for (const key of ['highway', 'boundary', 'landuse', 'place']) params.append('osm_tag', '!' + key)
      data = await getMapJson('https://photon.komoot.io/api/?' + params)
    } catch (err) {
      // Photon is busy or down: ask Nominatim instead (slower, but the same OpenStreetMap places)
      console.warn('Photon place search failed:', err.message, '(trying Nominatim)')
      const params = { q, format: 'jsonv2', limit: '20', addressdetails: '1', 'accept-language': 'en' }
      if (!centre.isCountry) {
        params.viewbox = [box[0], box[3], box[2], box[1]].join(',') // left,top,right,bottom
        params.bounded = '1'
      } else {
        params.q = q + ', ' + near
      }
      data = fromNominatim(await getMapJson('https://nominatim.openstreetmap.org/search?' + new URLSearchParams(params)))
    }
  } catch (err) {
    console.error('Place search failed for "' + q + '" near ' + near + ':', err.message)
    return res.status(502).json({ message: 'Place search is unavailable right now.' })
  }

  // Group by name, so a chain like FamilyMart is one row with many branches
  const groups = []
  for (const f of data.features || []) {
    const p = f.properties || {}
    if (!p.name || /^\d+$/.test(p.name) || SKIP_KEYS.includes(p.osm_key) || SKIP_VALUES.includes(p.osm_value)) continue

    const street = [p.housenumber, p.street].filter(Boolean).join(' ')
    const address = [street, p.district || p.locality, p.city].filter(Boolean).join(', ') || p.name + ', ' + near
    const coords = f.geometry && f.geometry.coordinates
    const km = coords && centre ? Math.round(kmBetween(centre.lat, centre.lon, coords[1], coords[0]) * 10) / 10 : null

    let group = null
    for (const g of groups) {
      if (plain(g.name) === plain(p.name)) group = g
    }
    if (!group) {
      const type = cardType(p.osm_key, p.osm_value)
      group = {
        name: p.name,
        type,
        kind: prettyKind(p.osm_value),
        indoor: ['museum', 'gallery', 'aquarium', 'food', 'shop'].includes(type),
        branches: [],
        score: matchScore(q, p.name) + (TYPE_SCORE[type] || 0) + (FAMOUS.includes(p.osm_value) ? 10 : 0),
        km
      }
      groups.push(group)
    }
    if (!group.branches.some((b) => b.address === address)) group.branches.push({ address, km })
    if (km != null && (group.km == null || km < group.km)) group.km = km
  }

  // Best first: a name that matches what was typed, then sights over shops, then the closest to the centre
  for (const g of groups) {
    if (g.km != null) g.score -= Math.min(g.km, 30) / 3 // up to -10 for far away
    g.branches.sort((a, b) => (a.km == null ? 99 : a.km) - (b.km == null ? 99 : b.km))
  }
  groups.sort((a, b) => b.score - a.score)
  const results = []
  for (const g of groups.slice(0, 8)) {
    results.push({ name: g.name, type: g.type, kind: g.kind, indoor: g.indoor, branches: g.branches, km: g.km })
  }

  if (searches.size >= CACHE_LIMIT) searches.delete(searches.keys().next().value)
  searches.set(key, results)
  res.json(results)
})

// ---------------------------------------------------------------------
// GET /api/places/photo?destination=Tokyo, Japan[&size=small]   (small = 960px wide, for cards)
// -> { url, page } a landscape photo of the place from Wikipedia (free, no key), or { url: null }
// Tries the city's article, then "Tourism in <country>", then the country.
// Flags and maps (usually .svg) are skipped so we get a real photo.
// ---------------------------------------------------------------------
const photos = new Map() // destination -> result

async function wikiPhoto(title, width) {
  const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_'))
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(6000) })
  if (!response.ok) return null
  const data = await response.json()
  if (data.type === 'disambiguation') return null
  const original = data.originalimage
  const thumb = data.thumbnail
  if (!original || !thumb) return null
  const file = original.source.toLowerCase()
  if (file.endsWith('.svg') || file.endsWith('.png') || file.includes('flag_of') || file.includes('map')) return null
  if (original.width < original.height) return null // portrait photos look bad as a wide banner
  // Ask Wikimedia for a smaller copy instead of the (often huge) original.
  // (Wikimedia only makes thumbnails in standard widths like 960, 1280 and 1920.)
  let src = original.source
  if (original.width > width) src = thumb.source.replace(/\/\d+px-/, '/' + width + 'px-')
  return { url: src, page: data.content_urls && data.content_urls.desktop ? data.content_urls.desktop.page : null }
}

// Backup: any wide photo from the article (e.g. when its main picture is a tall collage, like New York City)
async function wikiGalleryPhoto(title, width) {
  const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'images', titles: title, gimlimit: '40', redirects: '1',
    prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: String(width), format: 'json'
  })
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
  if (!response.ok) return null
  const data = await response.json()
  const pages = (data.query && data.query.pages) || {}
  const skip = ['map', 'flag', 'logo', 'seal', 'icon', 'coat', 'locator', 'symbol', 'diagram', 'chart', 'signature']
  for (const id in pages) {
    const info = pages[id].imageinfo && pages[id].imageinfo[0]
    if (!info || info.mime !== 'image/jpeg') continue
    const name = pages[id].title.toLowerCase()
    if (skip.some((w) => name.includes(w))) continue
    if (info.width < 1200 || info.width < info.height * 1.3) continue // wide photos only
    return { url: info.thumburl || info.url, page: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')) }
  }
  return null
}

router.get('/photo', requireAuth, async (req, res) => {
  const destination = (req.query.destination || '').trim()
  if (!destination || destination.length > 80) return res.json({ url: null })
  const width = req.query.size === 'small' ? 960 : 1920
  const key = width + '|' + destination.toLowerCase()
  if (photos.has(key)) return res.json(photos.get(key))

  const parts = destination.split(',').map((x) => x.trim()).filter(Boolean)
  const place = parts[0]
  const country = parts.length > 1 ? parts[parts.length - 1] : parts[0]
  // e.g. "New York" is the state's article (map), but "New York City" has a skyline photo
  const titles = [place, place + ' City', 'Tourism in ' + place, 'Tourism in ' + country, country]

  let result = { url: null }
  for (const title of titles) {
    try {
      const found = await wikiPhoto(title, width)
      if (found) {
        result = found
        break
      }
    } catch (err) {
      console.error('Wikipedia photo lookup failed for "' + title + '":', err.message)
    }
  }
  // No usable main picture anywhere: look through the city's other photos
  if (!result.url) {
    for (const title of [place + ' City', place]) {
      try {
        const found = await wikiGalleryPhoto(title, width)
        if (found) {
          result = found
          break
        }
      } catch (err) {
        console.error('Wikipedia gallery lookup failed for "' + title + '":', err.message)
      }
    }
  }
  // Only remember found photos, so a miss (or a network hiccup) is tried again next time
  if (result.url) {
    if (photos.size >= CACHE_LIMIT) photos.delete(photos.keys().next().value)
    photos.set(key, result)
  }
  res.json(result)
})

export default router
