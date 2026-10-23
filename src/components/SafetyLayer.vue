<script setup>
/*
  SafetyLayer.vue: the Safety tab
  --------------------------------
  Layout (top to bottom, most urgent first):
   1. Status banner     (NERV): one big "All clear" / warning bar with where, how serious, when, and last sync
   2. Action center     (Red Cross): one-tap local emergency calls + "I'm safe" message to friends and family
   3. Local radar       (Citizen): hospitals, police, evacuation points and your embassy around where you stay
   4. Offline card      (Red Cross): your stay in English + local script for taxi drivers, and quick guides
   5. Official advice   : UK travel advice level + our combined risk score, with sources

  WHERE IT CHECKS:
   - Before/after the trip: the trip's destination (or your hotel, once you add it)
   - During the trip: your live GPS (falls back to the destination if location is off)
  WHEN IT CHECKS:
   - Only once the Safety tab is opened, or straight away while the trip is happening
     (so the warning banner on other tabs still works); then every 5 minutes or after moving 1 km.

  Emits "risk-change" so the trip page can show a banner and flag outdoor stops.
*/
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import SafetyRadar from './SafetyRadar.vue'
import {
  getLocationInfo, locatePlace, getTravelAdvisory, getNearbyEarthquakes, getDisasterAlerts,
  getNearbySafety, computeRiskScore, haversineKm, openStatus, EMERGENCY_NUMBERS, HOME_HELPLINE
} from '../services/safetyService.js'

const props = defineProps({
  tripId: { type: String, default: '' },
  destinations: { type: Array, default: () => [] },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  stay: { type: Object, default: null },      // { name, address, nameLocal, addressLocal, lat, lon }
  stops: { type: Array, default: () => [] },  // itinerary stops: { id, name, address, date }
  me: { type: String, default: '' },
  active: { type: Boolean, default: false }   // is the Safety tab open?
})
const emit = defineEmits(['risk-change', 'stay-change'])

/* Demo cities, so the presentation works without flying anywhere */
const DEMO_LOCATIONS = {
  hualien: { lat: 23.9871, lon: 121.6015, label: 'Hualien, Taiwan (quake zone)' },
  tokyo: { lat: 35.6812, lon: 139.7671, label: 'Tokyo, Japan' },
  seoul: { lat: 37.5665, lon: 126.978, label: 'Seoul, South Korea' },
  bangkok: { lat: 13.7563, lon: 100.5018, label: 'Bangkok, Thailand' }
}
const REFRESH_MS = 5 * 60 * 1000
const MOVE_THRESHOLD_KM = 1

/* ---------- state ---------- */
const today = new Date().toISOString().slice(0, 10)
const tripIsNow = computed(() => !!props.startDate && !!props.endDate && props.startDate <= today && today <= props.endDate)
const area = ref('dest-0')          // 'dest-<index>' | 'live' | 'demo-<key>'
const position = ref(null)          // { lat, lon }
const locationInfo = ref(null)      // { countryCode, countryName, city }
const advisory = ref(null)
const quakes = ref([])
const disasters = ref([])
const places = ref([])              // nearby help
const stopPoints = ref([])          // today's stops with coordinates
const loading = ref(false)
const errors = ref([])
const notice = ref('')              // e.g. "Location is off, showing Kyoto instead"
const lastUpdated = ref(null)
const toasts = ref([])
const started = ref(false)
const stayCache = ref(null)         // offline copy of the stay

let lastFetchedAt = null
let watchId = null
let timerId = null
// Each pick of "where" (and each refresh) gets a number. Answers that come back for an older
// pick are ignored, so a slow Giza lookup can't overwrite "My location" after you switched.
let areaRun = 0
let refreshRun = 0
const nearbyLoading = ref(false)
const notifiedIds = []              // alerts already announced (never twice)
const stopCoords = {}               // address -> { lat, lon } (cached)

/* ---------- computed ---------- */
const risk = computed(() => computeRiskScore({ advisory: advisory.value, quakes: quakes.value, disasters: disasters.value }))

const callLines = computed(() => EMERGENCY_NUMBERS[locationInfo.value && locationInfo.value.countryCode] || EMERGENCY_NUMBERS.DEFAULT)

const allAlerts = computed(() => {
  const list = []
  for (const d of disasters.value) {
    list.push({ ...d, level: d.alertLevel === 'Red' ? 'warning' : 'advisory', what: d.type, where: d.title + (d.distanceKm !== null && d.distanceKm !== undefined ? ' · ' + d.distanceKm + ' km away' : ''), severity: d.alertLevel + ' alert' + (d.details ? ' · ' + d.details : '') })
  }
  for (const q of quakes.value) {
    list.push({ ...q, level: q.magnitude >= 6 ? 'warning' : 'advisory', what: 'Earthquake M' + q.magnitude.toFixed(1), where: q.distanceKm + ' km from ' + placeName.value + (q.place ? ' · ' + q.place : ''), severity: q.tsunami ? 'Tsunami possible: move to high ground' : q.magnitude >= 6 ? 'Strong' : 'Light to moderate' })
  }
  return list
})

const placeName = computed(() => (locationInfo.value && locationInfo.value.city) || 'here')

const areaOptions = computed(() => {
  const list = []
  props.destinations.forEach((d, i) => list.push({ key: 'dest-' + i, label: '📍 ' + d.split(', ')[0] }))
  list.push({ key: 'live', label: '🧭 My location' })
  return list
})

/* The stay shown on the card: the saved one, or the offline copy if we couldn't load the trip */
// The saved stay from the trip; the copy in this browser only when offline (or before the trip loads)
const stayShown = computed(() => props.stay || (navigator.onLine && props.tripId !== 'seoul' ? null : stayCache.value))

const bannerTitle = computed(() => {
  if (risk.value.state === 'clear') return 'All clear'
  const top = allAlerts.value[0]
  if (top) return top.what
  return risk.value.label + ' risk'
})

/* "I'm safe" message for friends and family */
const safeMessage = computed(() => {
  const where = stayShown.value ? 'staying at ' + stayShown.value.name + (stayShown.value.address ? ', ' + stayShown.value.address : '') : 'in ' + placeName.value
  const map = position.value ? ' Map: https://maps.google.com/?q=' + position.value.lat.toFixed(4) + ',' + position.value.lon.toFixed(4) : ''
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const status = risk.value.state === 'clear' ? 'No warnings here.' : 'There is a ' + bannerTitle.value.toLowerCase() + ' alert nearby, but I am OK.'
  return "✅ I'm safe. " + (props.me ? '— ' + props.me + ', ' : '') + where + '. ' + status + ' (' + time + ')' + map
})

/*
  Several options per kind, so there's a backup if the nearest one is closed.
  "Open now" only makes sense when you're actually there (live location / during the trip);
  before the trip we show the opening hours instead.
*/
const KIND_GROUPS = [
  { kind: 'hospital', label: '🏥 Hospitals', search: 'hospital', show: 5 },
  { kind: 'clinic', label: '🩺 Clinics', search: 'clinic', show: 3 },
  { kind: 'police', label: '👮 Police', search: 'police', show: 2 },
  { kind: 'shelter', label: '🟢 Evacuation points', search: 'evacuation site', show: 3 },
  { kind: 'fire_station', label: '🚒 Fire stations', search: 'fire station', show: 1 },
  { kind: 'embassy', label: '🇸🇬 Singapore embassy', search: 'Singapore embassy', show: 1 }
]
const showNow = computed(() => area.value === 'live' || tripIsNow.value)
const expanded = ref([]) // kinds showing all their options

const optionsByKind = computed(() => {
  const result = {}
  if (!position.value) return result
  for (const g of KIND_GROUPS) {
    const list = []
    for (const p of places.value || []) {
      if (p.kind !== g.kind) continue
      const status = openStatus(p.openingHours)
      list.push({ ...p, dist: haversineKm(position.value.lat, position.value.lon, p.lat, p.lon), status })
    }
    // Nearest first, but when you're there, places that are open (or 24h A&E) come before closed ones
    list.sort((a, b) => {
      if (showNow.value) {
        const rank = (x) => (x.emergency || x.status.open === true ? 0 : x.status.open === null ? 1 : 2)
        if (rank(a) !== rank(b)) return rank(a) - rank(b)
      }
      return a.dist - b.dist
    })
    result[g.kind] = list
  }
  return result
})

function toggleKind(kind) {
  const i = expanded.value.indexOf(kind)
  if (i >= 0) expanded.value.splice(i, 1)
  else expanded.value.push(kind)
}

function searchUrl(term) {
  return 'https://www.google.com/maps/search/' + encodeURIComponent(term) + '/@' + position.value.lat + ',' + position.value.lon + ',14z'
}

/* ---------- loading data ---------- */
async function refresh(force = false) {
  if (!position.value) return
  const { lat, lon } = position.value
  if (!force && lastFetchedAt && haversineKm(lat, lon, lastFetchedAt.lat, lastFetchedAt.lon) < MOVE_THRESHOLD_KM) return
  const run = ++refreshRun
  const area0 = areaRun
  const isCurrent = () => run === refreshRun && area0 === areaRun
  lastFetchedAt = { lat, lon }
  loading.value = true
  const failed = []

  // Help nearby starts straight away and shows as soon as it arrives (it doesn't wait for the rest)
  nearbyLoading.value = true
  const nearbyJob = getNearbySafety(lat, lon)
    .then((list) => {
      if (isCurrent()) places.value = list
    })
    .catch(() => {
      if (isCurrent()) failed.push('nearby help')
    })
    .finally(() => {
      if (isCurrent()) nearbyLoading.value = false
    })

  try {
    if (!locationInfo.value) {
      const info = await getLocationInfo(lat, lon)
      if (!isCurrent()) return
      locationInfo.value = info
    }
    const { countryCode, countryName } = locationInfo.value
    const [adv, eq, dis] = await Promise.allSettled([
      getTravelAdvisory(countryCode, countryName),
      getNearbyEarthquakes(lat, lon),
      getDisasterAlerts(countryCode, lat, lon)
    ])
    if (!isCurrent()) return
    if (adv.status === 'fulfilled') advisory.value = adv.value
    else failed.push('travel advice')
    const simulated = quakes.value.filter((q) => q.simulated)
    if (eq.status === 'fulfilled') quakes.value = simulated.concat(eq.value)
    else failed.push('earthquakes')
    if (dis.status === 'fulfilled') disasters.value = dis.value
    else failed.push('disaster alerts')
    lastUpdated.value = new Date()
    notifyNewAlerts()
    emit('risk-change', { ...risk.value, location: locationInfo.value })
  } catch (err) {
    console.error('Safety layer error:', err)
    if (isCurrent()) failed.push('location lookup')
  } finally {
    if (isCurrent()) loading.value = false
  }
  await nearbyJob
  if (!isCurrent()) return
  errors.value = failed // replaced each time, never piles up
  loadStops()
}

/* Today's itinerary stops (or the first day's) on the radar */
async function loadStops() {
  if (!area.value.startsWith('dest')) {
    stopPoints.value = []
    return
  }
  const dates = props.stops.map((s) => s.date).sort()
  const day = dates.includes(today) ? today : dates[0]
  const list = []
  for (const s of props.stops) {
    if (s.date !== day || !s.address || list.length >= 8) continue
    try {
      if (!stopCoords[s.address]) stopCoords[s.address] = await locatePlace(s.address)
      list.push({ id: 'stop-' + s.id, name: s.name, lat: stopCoords[s.address].lat, lon: stopCoords[s.address].lon })
    } catch (err) {
      // a stop we can't place is just left off the radar
    }
  }
  stopPoints.value = list
}

/* Where to check: a destination (or the hotel in it), live GPS, or a demo city */
async function useArea(key) {
  const run = ++areaRun
  area.value = key
  stopLive()
  errors.value = []
  loading.value = false
  nearbyLoading.value = false
  notice.value = ''
  lastFetchedAt = null
  locationInfo.value = null
  advisory.value = null
  disasters.value = []
  places.value = []
  quakes.value = quakes.value.filter((q) => q.simulated)
  position.value = null

  if (key === 'live') {
    startLive()
    return
  }
  if (key.startsWith('demo-')) {
    const demo = DEMO_LOCATIONS[key.slice(5)]
    position.value = { lat: demo.lat, lon: demo.lon }
    return refresh(true)
  }
  const dest = props.destinations[Number(key.slice(5))]
  if (!dest) return
  try {
    const place = await locatePlace(dest)
    if (run !== areaRun) return // you picked somewhere else while this was loading
    locationInfo.value = { countryCode: place.countryCode, countryName: place.countryName, city: place.city }
    // Centre on the hotel if it's in this destination (within 60 km)
    const s = stayShown.value
    if (s && s.lat !== null && s.lat !== undefined && haversineKm(s.lat, s.lon, place.lat, place.lon) < 60) {
      position.value = { lat: s.lat, lon: s.lon }
    } else {
      position.value = { lat: place.lat, lon: place.lon }
    }
    refresh(true)
  } catch (err) {
    if (run === areaRun) errors.value = ['finding ' + dest.split(', ')[0]]
  }
}

function startLive() {
  if (!('geolocation' in navigator)) {
    notice.value = "This device can't share its location, so we're showing your trip's destination."
    return useArea('dest-0')
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      position.value = { lat: pos.coords.latitude, lon: pos.coords.longitude }
      refresh()
    },
    () => {
      // Say it once, then fall back to the destination
      stopLive()
      if (area.value !== 'live') return
      useArea('dest-0').then(() => {
        notice.value = 'Location is off, so we are showing ' + (props.destinations[0] || 'your destination').split(', ')[0] + ' instead.'
      })
    },
    // A quick, rough fix first (Wi-Fi/cell, cached up to 2 min) is plenty for "what's within 3 km"
    { enableHighAccuracy: false, maximumAge: 120000, timeout: 10000 }
  )
}

function stopLive() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  watchId = null
}

function start() {
  if (started.value) return
  started.value = true
  useArea(tripIsNow.value ? 'live' : 'dest-0')
  timerId = setInterval(() => {
    if (!document.hidden) refresh(true)
  }, REFRESH_MS)
}

/* ---------- alerts ---------- */
function notifyNewAlerts() {
  for (const a of allAlerts.value) {
    if (notifiedIds.includes(a.id)) continue
    notifiedIds.push(a.id)
    const message = a.what + ' · ' + a.where
    if ('Notification' in window && Notification.permission === 'granted') new Notification('⚠️ Safety alert', { body: message })
    showToast(message, a.level)
  }
}

function showToast(message, level = 'advisory') {
  const id = Date.now() + Math.random()
  toasts.value.push({ id, message, level })
  setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id) }, 8000)
}

async function enableNotifications() {
  if ('Notification' in window) await Notification.requestPermission()
}

/* DEMO ONLY: a fake M6.2 quake 15 km away, to show the banner, score and itinerary react */
function simulateEarthquake() {
  if (!position.value) return
  quakes.value.unshift({ id: 'sim-' + Date.now(), type: 'earthquake', title: 'SIMULATED earthquake (demo)', place: 'demo', magnitude: 6.2, distanceKm: 15, time: new Date(), url: null, simulated: true })
  notifyNewAlerts()
  emit('risk-change', { ...risk.value, location: locationInfo.value })
}

function clearSimulation() {
  quakes.value = quakes.value.filter((q) => !q.simulated)
  emit('risk-change', { ...risk.value, location: locationInfo.value })
}

/* ---------- "I'm safe" ---------- */
const copied = ref(false)
async function copySafe() {
  try {
    await navigator.clipboard.writeText(safeMessage.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (err) {
    showToast('Could not copy. Select the message and copy it yourself.', 'advisory')
  }
}
function shareSafe() {
  navigator.share({ text: safeMessage.value }).catch(() => {})
}
const canShare = typeof navigator !== 'undefined' && !!navigator.share

/* ---------- where you're staying ---------- */
const editingStay = ref(false)
const stayQuery = ref('')
const stayResults = ref([])
const staySearching = ref(false)
const stayError = ref('')
const taxiMode = ref(false)
let stayTimer = null

function onStayType() {
  clearTimeout(stayTimer)
  stayTimer = setTimeout(searchStay, 350)
}

async function searchStay() {
  const q = stayQuery.value.trim()
  if (q.length < 3) {
    stayResults.value = []
    return
  }
  staySearching.value = true
  try {
    const res = await axios.get('/api/safety/stay-search', { params: { q, near: props.destinations[0] || '' } })
    stayResults.value = res.data
  } catch (err) {
    stayError.value = 'Search is unavailable. You can still type the address yourself.'
  }
  staySearching.value = false
}

async function saveStay(s) {
  stayError.value = ''
  if (props.tripId === 'seoul') {
    stayCache.value = s
    editingStay.value = false
    return
  }
  try {
    const res = await axios.put('/api/trips/' + props.tripId + '/stay', s)
    emit('stay-change', res.data.stay)
    rememberStayOffline(res.data.stay)
    editingStay.value = false
    stayQuery.value = ''
    stayResults.value = []
    if (area.value.startsWith('dest')) useArea(area.value) // re-centre the radar on the hotel
  } catch (err) {
    stayError.value = (err.response && err.response.data && err.response.data.message) || 'Could not save.'
  }
}

function saveTypedStay() {
  const name = stayQuery.value.trim()
  if (name) saveStay({ name, address: '', nameLocal: '', addressLocal: '', lat: null, lon: null })
}

/* A copy in this browser, so the taxi card still shows without internet */
function rememberStayOffline(s) {
  try {
    if (s) localStorage.setItem('chuise-stay-' + props.tripId, JSON.stringify(s))
    else localStorage.removeItem('chuise-stay-' + props.tripId) // cleared by someone in the group
  } catch (err) {
    // private mode etc.: the card just won't be available offline
  }
}

/* Print just the taxi card (or save it as a PDF from the print dialog) */
function printCard() {
  const s = stayShown.value
  if (!s) return
  const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const w = window.open('', '_blank', 'width=600,height=500')
  if (!w) return
  w.document.write('<!doctype html><meta charset="utf-8"><title>' + esc(s.name) + '</title>' +
    '<body style="font-family:system-ui,sans-serif;padding:32px">' +
    '<p style="color:#555">Please take me to · 请带我去 · ここへ行ってください</p>' +
    (s.nameLocal && s.nameLocal !== s.name ? '<h1 style="font-size:40px;margin:0">' + esc(s.nameLocal) + '</h1>' : '') +
    (s.addressLocal && s.addressLocal !== s.address ? '<p style="font-size:22px">' + esc(s.addressLocal) + '</p>' : '') +
    '<h2 style="margin:16px 0 0">' + esc(s.name) + '</h2><p style="font-size:18px">' + esc(s.address) + '</p></body>')
  w.document.close()
  w.focus()
  w.print()
}

/* ---------- helpers ---------- */
function timeAgo(date) {
  if (!date) return ''
  const mins = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return mins + ' min ago'
  if (mins < 1440) return Math.round(mins / 60) + ' h ago'
  return Math.round(mins / 1440) + ' d ago'
}

function telOf(number) {
  return 'tel:' + number.replace(/[^\d+]/g, '')
}

function mapsUrl(p) {
  return 'https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lon
}

/* ---------- lifecycle ---------- */
watch(() => props.active, (open) => { if (open) start() })
watch(() => props.stay, (s) => {
  stayCache.value = s
  rememberStayOffline(s)
})

onMounted(() => {
  try {
    const saved = localStorage.getItem('chuise-stay-' + props.tripId)
    if (saved) stayCache.value = JSON.parse(saved)
  } catch (err) {
    // no offline copy
  }
  rememberStayOffline(props.stay)
  // During the trip, keep watching even before the tab is opened (for the warning banner)
  if (props.active || tripIsNow.value) start()
})

onUnmounted(() => {
  stopLive()
  clearInterval(timerId)
})
</script>

<template>
  <div class="sf" data-testid="safety-layer">
    <!-- ===== Where to check ===== -->
    <div class="sf-areas" role="group" aria-label="Check safety for">
      <button v-for="o in areaOptions" :key="o.key" type="button" class="sf-pill" :class="{ on: area === o.key }"
        :aria-pressed="area === o.key" @click="useArea(o.key)">{{ o.label }}</button>
      <span v-if="area.startsWith('demo-')" class="sf-pill on">🎬 {{ DEMO_LOCATIONS[area.slice(5)].label }}</span>
      <button type="button" class="sf-ghost ms-auto" title="Get a browser notification for new alerts" @click="enableNotifications">🔔 Alerts</button>
    </div>
    <p v-if="notice" class="sf-notice" role="status">{{ notice }}</p>

    <!-- ===== 1. Status banner (NERV style) ===== -->
    <section class="sf-banner" :class="'is-' + risk.state" aria-live="polite" data-testid="risk-card">
      <div class="sf-banner-main">
        <span class="sf-state-dot" aria-hidden="true"></span>
        <div class="flex-grow-1">
          <p class="sf-kicker">{{ risk.state === 'clear' ? 'Normal' : risk.label + ' risk' }} · {{ placeName }}{{ locationInfo && locationInfo.countryName ? ', ' + locationInfo.countryName : '' }}</p>
          <h3 class="sf-banner-title">{{ loading && !lastUpdated ? 'Checking…' : !lastUpdated ? "Couldn't check yet" : bannerTitle }}</h3>
          <!-- Nothing loaded (e.g. offline): don't claim "All clear" -->
          <p v-if="!lastUpdated && !loading" class="sf-banner-text">
            We couldn't reach the safety services, so there's no check for this place yet. Press Refresh to try again.
          </p>
          <p v-else-if="risk.state === 'clear'" class="sf-banner-text">
            No M4+ earthquakes within 300 km in the last 3 days, and no serious disaster alerts for {{ (locationInfo && locationInfo.countryName) || 'this country' }}.
          </p>
        </div>
        <div v-if="lastUpdated" class="sf-score" :aria-label="'Risk score ' + risk.score + ' out of 100'">
          <span class="sf-score-n">{{ risk.score }}</span><span class="sf-score-of">/100</span>
        </div>
      </div>

      <!-- Active alerts: what, where, how serious, when -->
      <ul v-if="allAlerts.length" class="sf-alerts" data-testid="alert-list">
        <li v-for="a in allAlerts" :key="a.id" class="sf-alert" :class="'lv-' + a.level">
          <span class="sf-alert-what">{{ a.what }}<span v-if="a.simulated" class="sf-tag">demo</span></span>
          <span class="sf-alert-where">📍 {{ a.where }}</span>
          <span class="sf-alert-sev">⚠ {{ a.severity }}</span>
          <span class="sf-alert-when">🕒 {{ timeAgo(a.time) }}</span>
          <a v-if="a.url" :href="a.url" target="_blank" rel="noopener" class="sf-alert-link">Details ↗</a>
        </li>
      </ul>

      <div class="sf-sync">
        <span>
          <template v-if="lastUpdated">Synced {{ lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }} · checks every 5 min</template>
          <template v-else>Not checked yet</template>
          <template v-if="errors.length"> · couldn't load {{ errors.join(', ') }}</template>
        </span>
        <button type="button" class="sf-ghost" :disabled="loading" @click="refresh(true)">{{ loading ? 'Checking…' : '↻ Refresh' }}</button>
      </div>
    </section>

    <div class="sf-grid">
      <!-- ===== 2. Action center ===== -->
      <section class="sf-card sf-actions" aria-labelledby="sf-act-title">
        <h3 id="sf-act-title" class="sf-h">Emergency calls <span class="sf-sub">{{ (locationInfo && locationInfo.countryName) || '' }}</span></h3>
        <div class="sf-calls">
          <a v-for="(l, i) in callLines" :key="l.number" :href="telOf(l.number)" class="sf-call" :class="{ primary: i < 2 && !l.label.includes('Hotline') && !l.label.includes('Tourist') }">
            <span class="sf-call-icon" aria-hidden="true">{{ l.icon }}</span>
            <span class="sf-call-text"><strong>{{ l.number }}</strong><span>{{ l.label }}</span></span>
          </a>
          <a :href="telOf(HOME_HELPLINE.number)" class="sf-call">
            <span class="sf-call-icon" aria-hidden="true">{{ HOME_HELPLINE.icon }}</span>
            <span class="sf-call-text"><strong>{{ HOME_HELPLINE.number }}</strong><span>{{ HOME_HELPLINE.label }}</span></span>
          </a>
        </div>

        <h3 class="sf-h mt-3">I'm safe</h3>
        <p class="sf-safe-preview">{{ safeMessage }}</p>
        <div class="sf-safe-btns">
          <a class="sf-btn wa" :href="'https://wa.me/?text=' + encodeURIComponent(safeMessage)" target="_blank" rel="noopener">💬 WhatsApp</a>
          <a class="sf-btn" :href="'sms:?&body=' + encodeURIComponent(safeMessage)">✉️ SMS</a>
          <button type="button" class="sf-btn" @click="copySafe">{{ copied ? 'Copied ✓' : '📋 Copy' }}</button>
          <button v-if="canShare" type="button" class="sf-btn" @click="shareSafe">⋯ Share</button>
        </div>
      </section>

      <!-- ===== 3. Local radar ===== -->
      <section class="sf-card" aria-labelledby="sf-radar-title">
        <h3 id="sf-radar-title" class="sf-h">Help nearby</h3>
        <p v-if="!position" class="sf-muted">Pick a place above to see help nearby.</p>
        <template v-else>
          <SafetyRadar :center="position" :center-label="stayShown && area.startsWith('dest') && stayShown.lat ? stayShown.name : placeName"
            :places="places" :stops="stopPoints" />
          <p v-if="nearbyLoading && !places.length" class="sf-muted small" role="status">
            <span class="sf-spin" aria-hidden="true"></span> Finding hospitals, police and more nearby…
          </p>
          <!-- Several options per kind, with opening hours, so there's a backup if one is closed -->
          <div v-for="g in KIND_GROUPS" :key="g.kind" v-show="optionsByKind[g.kind] && optionsByKind[g.kind].length" class="sf-group">
            <div class="sf-group-head">
              <span class="sf-group-title">{{ g.label }}</span>
              <a :href="searchUrl(g.search)" target="_blank" rel="noopener" class="sf-more-link">More on Google Maps ↗</a>
            </div>
            <ul class="sf-options">
              <li v-for="(o, i) in (optionsByKind[g.kind] || []).slice(0, expanded.includes(g.kind) ? 10 : g.show)" :key="o.id"
                class="sf-option" :class="{ closed: showNow && o.status.open === false && !o.emergency }">
                <span class="sf-option-main">
                  <span class="sf-option-name">{{ o.name }}<small v-if="o.nameLocal"> {{ o.nameLocal }}</small></span>
                  <span class="sf-badges">
                    <span v-if="i === 0 && showNow" class="sf-badge best">Best option</span>
                    <span v-if="o.emergency" class="sf-badge er">24h emergency</span>
                    <span v-if="showNow && o.status.open === true" class="sf-badge open">{{ o.status.text }}</span>
                    <span v-else-if="showNow && o.status.open === false" class="sf-badge shut">{{ o.status.text }}</span>
                    <span v-else-if="o.openingHours" class="sf-badge hours" :title="o.openingHours">🕒 {{ o.status.text === 'Open 24 hours' ? 'Open 24 hours' : o.openingHours }}</span>
                  </span>
                </span>
                <span class="sf-nearest-dist">{{ o.dist.toFixed(1) }} km</span>
                <a v-if="o.phone" :href="telOf(o.phone)" class="sf-go" :aria-label="'Call ' + o.name">Call</a>
                <a :href="mapsUrl(o)" target="_blank" rel="noopener" class="sf-go" :aria-label="'Directions to ' + o.name">Go ↗</a>
              </li>
            </ul>
            <button v-if="(optionsByKind[g.kind] || []).length > g.show" type="button" class="sf-more" :aria-expanded="expanded.includes(g.kind)" @click="toggleKind(g.kind)">
              {{ expanded.includes(g.kind) ? 'Show fewer' : 'Show ' + (Math.min(10, optionsByKind[g.kind].length) - g.show) + ' more' }}
            </button>
          </div>
          <p v-if="!places.length && lastUpdated" class="sf-muted small">No hospitals or shelters found within 3 km in OpenStreetMap.</p>
        </template>
      </section>

      <!-- ===== 4. Offline card: where you're staying ===== -->
      <section class="sf-card sf-taxi-card" :class="{ fullscreen: taxiMode }" aria-labelledby="sf-stay-title">
        <div class="d-flex justify-content-between align-items-center gap-2">
          <h3 id="sf-stay-title" class="sf-h mb-0">Where we're staying</h3>
          <span class="sf-offline" title="Saved in this browser, so it shows without internet">✓ Works offline</span>
        </div>

        <template v-if="stayShown && !editingStay">
          <div class="sf-taxi">
            <p class="sf-taxi-hint">Please take me to · 请带我去 · ここへ行ってください</p>
            <p v-if="stayShown.nameLocal && stayShown.nameLocal !== stayShown.name" class="sf-taxi-local">{{ stayShown.nameLocal }}</p>
            <p v-if="stayShown.addressLocal && stayShown.addressLocal !== stayShown.address" class="sf-taxi-local-addr">{{ stayShown.addressLocal }}</p>
            <p class="sf-taxi-en">{{ stayShown.name }}</p>
            <p v-if="stayShown.address" class="sf-taxi-en-addr">{{ stayShown.address }}</p>
          </div>
          <div class="sf-safe-btns">
            <button type="button" class="sf-btn" @click="taxiMode = !taxiMode">{{ taxiMode ? '✕ Close' : '⛶ Show big for taxi' }}</button>
            <button type="button" class="sf-btn" @click="printCard">🖨 Print / save PDF</button>
            <button type="button" class="sf-btn" @click="editingStay = true">✎ Change</button>
          </div>
        </template>

        <form v-else class="sf-stay-form" @submit.prevent="saveTypedStay">
          <p class="sf-muted small mb-2">Add your hotel or Airbnb: we'll show its name and address in English and the local script for taxi drivers, and centre the radar on it.</p>
          <label for="sf-stay" class="visually-hidden">Hotel or address</label>
          <input id="sf-stay" v-model="stayQuery" class="sf-input" placeholder="Search your hotel" autocomplete="off" @input="onStayType">
          <ul v-if="stayResults.length" class="sf-results">
            <li v-for="r in stayResults" :key="r.lat + ',' + r.lon">
              <button type="button" class="sf-result" @click="saveStay(r)">
                <strong>{{ r.name }}</strong> <span v-if="r.nameLocal && r.nameLocal !== r.name">{{ r.nameLocal }}</span>
                <small class="d-block">{{ r.address }}</small>
              </button>
            </li>
          </ul>
          <p v-else-if="staySearching" class="sf-muted small">Searching…</p>
          <p v-if="stayError" class="sf-err" role="alert">{{ stayError }}</p>
          <div class="d-flex gap-2 mt-2">
            <button type="submit" class="sf-btn" :disabled="!stayQuery.trim()">Save as typed</button>
            <button v-if="stayShown" type="button" class="sf-btn" @click="editingStay = false">Cancel</button>
          </div>
        </form>
      </section>

      <!-- ===== Quick guides (static, so they work offline) ===== -->
      <section class="sf-card" aria-labelledby="sf-guides-title">
        <h3 id="sf-guides-title" class="sf-h">If something happens</h3>
        <details class="sf-guide" open>
          <summary>🫨 Earthquake</summary>
          <ol>
            <li><strong>Drop, cover, hold on:</strong> get under a sturdy table, protect your head.</li>
            <li>Stay away from windows and things that can fall. Don't run outside while it shakes.</li>
            <li>After it stops: check for gas, wear shoes, and follow staff or local alerts.</li>
            <li>Near the coast? If shaking was strong or long, go to high ground at once (tsunami).</li>
          </ol>
        </details>
        <details class="sf-guide">
          <summary>🌊 Tsunami warning</summary>
          <ol>
            <li>Move to high ground or the 3rd floor or higher of a solid building now.</li>
            <li>Don't wait to see the wave and don't go back until the warning is lifted.</li>
          </ol>
        </details>
        <details class="sf-guide">
          <summary>🌀 Typhoon / heavy rain</summary>
          <ol>
            <li>Stay indoors, away from rivers and slopes. Charge your phone and power bank.</li>
            <li>Check train status before heading out; swap outdoor stops for indoor ones.</li>
          </ol>
        </details>
        <details class="sf-guide">
          <summary>🔥 Fire</summary>
          <ol>
            <li>Leave by the stairs, never the lift. Stay low under smoke.</li>
            <li>Call the fire number above once you're outside.</li>
          </ol>
        </details>
        <details class="sf-guide">
          <summary>🛂 Lost passport</summary>
          <ol>
            <li>Report it to the local police and get a police report.</li>
            <li>Call the Singapore MFA duty office (above) or visit the nearest embassy for a Document of Identity.</li>
          </ol>
        </details>
        <details class="sf-guide">
          <summary>🚑 Medical emergency</summary>
          <ol>
            <li>Call the ambulance number above; the nearest hospital is in "Help nearby".</li>
            <li>Keep your insurance details and medication list with you.</li>
          </ol>
        </details>
      </section>

      <!-- ===== 5. Official advice + how the score works ===== -->
      <section class="sf-card" aria-labelledby="sf-adv-title">
        <h3 id="sf-adv-title" class="sf-h">Official travel advice</h3>
        <template v-if="advisory">
          <p class="sf-level" :class="'lvl-' + advisory.level">Level {{ advisory.level }} of 4 · {{ advisory.label }}</p>
          <p v-if="advisory.latestChange" class="small mb-2"><strong>Latest update:</strong> {{ advisory.latestChange }}</p>
          <a :href="advisory.url" target="_blank" rel="noopener" class="sf-link">Read the UK government's advice ↗</a>
        </template>
        <p v-else class="sf-muted small">No advice loaded yet.</p>
        <details class="sf-guide mt-3">
          <summary>How the risk score works</summary>
          <p class="small mb-1">We combine three sources into one 0–100 score: the UK travel advice level, earthquakes (stronger, closer and newer count more) and UN/EU disaster alerts.</p>
          <p class="small mb-0">Official "avoid travel" advice or a Red alert always shows as High or Critical. Sources: gov.uk, USGS, GDACS, OpenStreetMap.</p>
        </details>
      </section>
    </div>

    <!-- Demo tools for the presentation -->
    <details class="sf-demo">
      <summary>🎬 Demo tools</summary>
      <div class="d-flex flex-wrap gap-2 mt-2">
        <button v-for="(loc, key) in DEMO_LOCATIONS" :key="key" type="button" class="sf-btn" @click="useArea('demo-' + key)">{{ loc.label }}</button>
        <button type="button" class="sf-btn danger" :disabled="!position" @click="simulateEarthquake" data-testid="simulate-btn">Simulate M6.2 quake</button>
        <button type="button" class="sf-btn" @click="clearSimulation">Clear simulation</button>
      </div>
    </details>

    <!-- Pop-up alerts -->
    <Teleport to="body">
      <div class="sf-toasts" aria-live="assertive">
        <div v-for="t in toasts" :key="t.id" class="sf-toast" :class="'lv-' + t.level" role="alert">⚠️ {{ t.message }}</div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sf {
  --mint: #3fb8c6;
  --glass: rgba(255, 255, 255, 0.08);
  --text: #f6efe3;
  --muted: rgba(245, 238, 226, 0.65);
  --clear: #3fb8c6;
  --advisory: #ffb020;
  --warning: #d1495b;
  --critical: #b37feb;
  background: linear-gradient(180deg, #121b19, #022538);
  color: var(--text);
  border: 1px solid var(--glass);
  border-radius: 24px;
  padding: 20px;
}
.sf-muted {
  color: var(--muted);
}
.sf-h {
  font-family: var(--font-display);
  font-size: 1.15rem;
  margin-bottom: 10px;
}
.sf-sub {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 400;
  color: var(--muted);
  margin-left: 6px;
}

/* Area picker */
.sf-areas {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.sf-pill {
  border: 1px solid var(--glass);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 14px;
}
.sf-pill.on {
  background: rgba(63, 184, 198, 0.16);
  border-color: rgba(63, 184, 198, 0.6);
  color: #bfeaf0;
}
.sf-ghost {
  border: 1px solid var(--glass);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
}
.sf-ghost:hover:not(:disabled),
.sf-pill:hover {
  background: rgba(255, 255, 255, 0.12);
}
.sf-notice {
  font-size: 13px;
  color: var(--advisory);
  margin: -4px 0 10px;
}

/* 1. Status banner: one colour per state, high contrast text */
.sf-banner {
  --tone: var(--clear);
  border-radius: 20px;
  padding: 18px 20px 14px;
  margin-bottom: 16px;
  background: color-mix(in srgb, var(--tone) 12%, #022538);
  border: 1.5px solid color-mix(in srgb, var(--tone) 55%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--tone) 8%, transparent);
}
.sf-banner.is-advisory { --tone: var(--advisory); }
.sf-banner.is-warning { --tone: var(--warning); }
.sf-banner.is-critical { --tone: var(--critical); }
.sf-banner-main {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.sf-state-dot {
  width: 16px;
  height: 16px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--tone);
  box-shadow: 0 0 0 0 var(--tone);
  animation: sf-beat 2s infinite;
  flex-shrink: 0;
}
.sf-kicker {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--tone);
}
.sf-banner-title {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 3.5vw, 2rem);
  margin: 2px 0 4px;
  color: #fff;
}
.sf-banner-text {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}
.sf-score {
  text-align: right;
  flex-shrink: 0;
}
.sf-score-n {
  font-size: 2rem;
  font-weight: 800;
  color: var(--tone);
  font-variant-numeric: tabular-nums;
}
.sf-score-of {
  font-size: 13px;
  color: var(--muted);
}
.sf-alerts {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sf-alert {
  display: grid;
  grid-template-columns: 1.2fr 2fr 1.4fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.25);
  border-left: 4px solid var(--advisory);
  font-size: 14px;
}
.sf-alert.lv-warning {
  border-left-color: var(--warning);
}
.sf-alert-what {
  font-weight: 700;
  color: #fff;
}
.sf-alert-where,
.sf-alert-when {
  color: var(--muted);
}
.sf-alert-sev {
  font-weight: 600;
}
.sf-alert-link {
  color: var(--mint);
  font-size: 13px;
}
.sf-tag {
  margin-left: 6px;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.15);
}
.sf-sync {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
  font-size: 12px;
  color: var(--muted);
}

/* Cards */
.sf-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.sf-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass);
  border-radius: 16px;
  padding: 18px;
}

/* 2. Emergency calls */
.sf-calls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.sf-call {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--glass);
  color: var(--text);
  text-decoration: none;
  transition: transform 0.15s, background 0.15s;
}
.sf-call.primary {
  background: #c2312f;
  border-color: #e04a47;
  color: #fff;
}
.sf-call:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
.sf-call.primary:hover {
  background: #d63a37;
}
.sf-call-icon {
  font-size: 22px;
}
.sf-call-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sf-call-text strong {
  font-size: 1.25rem;
  font-variant-numeric: tabular-nums;
}
.sf-call-text span {
  font-size: 12px;
  opacity: 0.85;
}
.sf-safe-preview {
  font-size: 13px;
  color: var(--muted);
  background: rgba(0, 0, 0, 0.25);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
.sf-safe-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.sf-btn {
  border: 1px solid var(--glass);
  background: rgba(255, 255, 255, 0.07);
  color: var(--text);
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}
.sf-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}
.sf-btn.wa {
  background: #1f8f4e;
  border-color: #25d366;
  color: #fff;
}
.sf-btn.danger {
  border-color: rgba(209, 73, 91, 0.6);
  color: #f3b7bf;
}
.sf-btn:disabled {
  opacity: 0.5;
}

/* 3. Nearest list */
.sf-group {
  margin-top: 14px;
}
.sf-group-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}
.sf-group-title {
  font-weight: 700;
  font-size: 14px;
}
.sf-more-link {
  font-size: 12px;
  color: var(--mint);
  text-decoration: none;
}
.sf-options {
  list-style: none;
  padding: 0;
  margin: 0;
}
.sf-option {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid var(--glass);
  font-size: 13px;
}
.sf-option.closed .sf-option-name {
  opacity: 0.55;
}
.sf-option-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sf-option-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sf-option-name small {
  color: var(--muted);
}
.sf-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sf-badge {
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  padding: 1px 8px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sf-badge.best {
  background: var(--mint);
  color: #00283c;
}
.sf-badge.er {
  background: rgba(209, 73, 91, 0.2);
  color: #f3b7bf;
}
.sf-badge.open {
  background: rgba(63, 184, 198, 0.15);
  color: #bfeaf0;
}
.sf-badge.shut {
  background: rgba(255, 176, 32, 0.18);
  color: #ffd38a;
}
.sf-more {
  border: 0;
  background: none;
  color: var(--mint);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 0 0;
}
.sf-more:focus-visible,
.sf-more-link:focus-visible {
  outline: 3px solid var(--mint);
  outline-offset: 2px;
}
.sf-nearest {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
}
.sf-nearest li {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 7px 0;
  border-top: 1px solid var(--glass);
  font-size: 13px;
}
.sf-nearest-label {
  color: var(--muted);
  white-space: nowrap;
}
.sf-nearest-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sf-nearest-name small {
  color: var(--muted);
}
.sf-nearest-dist {
  font-variant-numeric: tabular-nums;
}
.sf-go {
  color: var(--mint);
  font-weight: 600;
  text-decoration: none;
}

/* 4. Taxi card: big, high-contrast, light for readability in a car */
.sf-offline {
  font-size: 11px;
  color: var(--mint);
}
.sf-taxi {
  margin-top: 12px;
  background: #fbfaf6;
  color: #111;
  border-radius: 14px;
  padding: 16px;
}
.sf-taxi-hint {
  font-size: 12px;
  color: #555;
  margin-bottom: 6px;
}
.sf-taxi-local {
  font-size: 1.6rem;
  font-weight: 800;
  margin: 0;
  line-height: 1.25;
}
.sf-taxi-local-addr {
  font-size: 1.05rem;
  margin: 4px 0 10px;
}
.sf-taxi-en {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
}
.sf-taxi-en-addr {
  font-size: 0.95rem;
  color: #333;
  margin: 2px 0 0;
}
.sf-taxi-card.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1080;
  border-radius: 0;
  background: #022538;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24px;
}
.sf-taxi-card.fullscreen .sf-taxi-local {
  font-size: clamp(2rem, 7vw, 3.5rem);
}
.sf-taxi-card.fullscreen .sf-taxi-local-addr,
.sf-taxi-card.fullscreen .sf-taxi-en {
  font-size: clamp(1.2rem, 4vw, 2rem);
}
.sf-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--glass);
  color: var(--text);
  border-radius: 12px;
  padding: 9px 12px;
}
.sf-input:focus {
  outline: none;
  border-color: var(--mint);
}
.sf-results {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
}
.sf-result {
  width: 100%;
  text-align: left;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--glass);
  color: var(--text);
  border-radius: 12px;
  padding: 8px 12px;
  margin-bottom: 6px;
}
.sf-result:hover {
  background: rgba(63, 184, 198, 0.1);
}
.sf-result small {
  color: var(--muted);
}
.sf-err {
  color: #f09aa5;
  font-size: 13px;
}

/* Guides */
.sf-guide {
  border-top: 1px solid var(--glass);
  padding: 8px 0;
}
.sf-guide summary {
  cursor: pointer;
  font-weight: 600;
}
.sf-guide ol {
  margin: 8px 0 0;
  padding-left: 20px;
  font-size: 14px;
  color: var(--muted);
}
.sf-guide li {
  margin-bottom: 4px;
}
.sf-level {
  display: inline-block;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(63, 184, 198, 0.15);
  color: var(--clear);
}
.sf-level.lvl-2 { background: rgba(255, 176, 32, 0.15); color: var(--advisory); }
.sf-level.lvl-3 { background: rgba(209, 73, 91, 0.15); color: #ec8a97; }
.sf-level.lvl-4 { background: rgba(179, 127, 235, 0.18); color: var(--critical); }
.sf-link {
  color: var(--mint);
  font-size: 14px;
}
.sf-demo {
  margin-top: 16px;
  font-size: 14px;
  color: var(--muted);
}
.sf-demo summary {
  cursor: pointer;
}

/* Toasts */
.sf-toasts {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1090;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 360px;
}
.sf-toast {
  background: #1a1416;
  color: #fff;
  border: 1px solid var(--advisory, #ffb020);
  border-left-width: 5px;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 14px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
}
.sf-toast.lv-warning {
  border-color: #d1495b;
}

/* Keyboard focus */
.sf-pill:focus-visible,
.sf-ghost:focus-visible,
.sf-call:focus-visible,
.sf-btn:focus-visible,
.sf-go:focus-visible,
.sf-result:focus-visible,
.sf-guide summary:focus-visible,
.sf-demo summary:focus-visible {
  outline: 3px solid var(--mint);
  outline-offset: 2px;
}

@keyframes sf-beat {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--tone) 60%, transparent); }
  70% { box-shadow: 0 0 0 10px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

@media (max-width: 900px) {
  .sf-grid { grid-template-columns: 1fr; }
  .sf-alert {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
@media (max-width: 480px) {
  .sf { padding: 14px; }
  .sf-calls { grid-template-columns: 1fr; }
  .sf-banner-main { flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) {
  .sf-state-dot { animation: none; }
  .sf-call { transition: none; }
}
.sf-spin {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  vertical-align: -1px;
  border: 2px solid rgba(63, 184, 198, 0.25);
  border-top-color: #3fb8c6;
  border-radius: 50%;
  animation: sf-spin 0.8s linear infinite;
}
@keyframes sf-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .sf-spin { animation: none; }
}
</style>
