<script setup>
/*
  SafetyLayer.vue
  ---------------
  The UI for the Real-Time Safety Layer (shown in the "Safety" tab of TripView).

  HOW IT WORKS:
  1. Gets the user's live location with navigator.geolocation.watchPosition()
     (or a demo city, so the presentation doesn't depend on being abroad)
  2. Calls all 5 APIs from safetyService.js in parallel with Promise.allSettled
  3. Works out a risk score and shows it, along with the advisory,
     nearby alerts, the nearest hospital/police and emergency numbers
  4. Re-checks every 5 minutes, or when the user moves more than 1 km
  5. Sends a browser push notification for any NEW serious alert
     (never the same alert twice)
  6. Emits "risk-change" so the parent page (TripView / living itinerary)
     can react, e.g. flag outdoor activities when the risk is High.
     This links the safety layer to our core problem statement
     ("adapt the plan when real-world changes occur").
*/

import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  getLocationInfo,
  getTravelAdvisory,
  getNearbyEarthquakes,
  getDisasterAlerts,
  getNearestEmergencyServices,
  computeRiskScore,
  haversineKm,
  EMERGENCY_NUMBERS
} from '../services/safetyService.js'

/* lets the parent component listen with @risk-change="..." */
const emit = defineEmits(['risk-change'])

/*
  DEMO LOCATIONS
  For the presentation we can't fly overseas, so these let us "teleport".
  Seoul matches the demo trip in TripView. Japan is included because
  Gladys's comment in the ideas doc said to include Japan.
*/
const DEMO_LOCATIONS = {
  seoul: { lat: 37.5665, lon: 126.978, label: 'Seoul, South Korea' },
  tokyo: { lat: 35.6812, lon: 139.7671, label: 'Tokyo, Japan' },
  singapore: { lat: 1.2966, lon: 103.8502, label: 'Singapore (SMU)' },
  bangkok: { lat: 13.7563, lon: 100.5018, label: 'Bangkok, Thailand' },
  hualien: { lat: 23.9871, lon: 121.6015, label: 'Hualien, Taiwan (quake zone)' }
}

const REFRESH_MS = 5 * 60 * 1000   /* re-check every 5 minutes */
const MOVE_THRESHOLD_KM = 1        /* or when the user moves > 1 km */

/* ---------- reactive state (ref = Vue re-renders when it changes) ---------- */
const selectedLocation = ref('live')  /* "live" = real GPS, otherwise a DEMO_LOCATIONS key */
const position = ref(null)            /* { lat, lon } */
const locationInfo = ref(null)        /* { countryCode, countryName, city } */
const advisory = ref(null)
const quakes = ref([])
const disasters = ref([])
const services = ref({})
const loading = ref(false)
const errors = ref([])                /* which APIs failed, shown as a warning */
const lastUpdated = ref(null)
const toasts = ref([])                /* in-app alerts (backup if notifications are blocked) */

/*
  The location where we last fetched data. Used to decide whether the
  user has moved far enough to fetch again (avoids hitting the APIs
  every few seconds while GPS updates).
*/
let lastFetchedAt = null
let watchId = null
let timerId = null

/*
  A Set remembers which alert IDs we've already notified about,
  so the user isn't spammed with the same earthquake every 5 minutes.
*/
const notifiedIds = new Set()

/* ---------- computed values (recalculate automatically) ---------- */

/* the merged risk score, using our algorithm in safetyService.js */
const risk = computed(() =>
  computeRiskScore({
    advisory: advisory.value,
    quakes: quakes.value,
    disasters: disasters.value
  })
)

/* local emergency numbers for the current country, falling back to 112 */
const emergencyNumbers = computed(() =>
  EMERGENCY_NUMBERS[locationInfo.value?.countryCode] || EMERGENCY_NUMBERS.DEFAULT
)

/* earthquakes and disasters merged into one list for display */
const allAlerts = computed(() => [
  ...disasters.value.map((d) => ({ ...d, severity: d.alertLevel === 'Red' ? 'danger' : 'warning' })),
  ...quakes.value.map((q) => ({ ...q, severity: q.magnitude >= 6 ? 'danger' : 'warning' }))
])

/* advisory level 1-4 -> Bootstrap colour */
const ADVISORY_COLOURS = ['success', 'warning', 'danger', 'dark']

/* nicer labels for the OSM amenity types */
const SERVICE_LABELS = {
  hospital: '🏥 Hospitals',
  clinic: '🩺 Clinics',
  police: '👮 Police',
  fire_station: '🚒 Fire stations'
}

/* ---------- main logic ---------- */

/*
  refreshSafetyData()
  The heart of the component. Calls every API and updates the state.

  WHY Promise.allSettled AND NOT Promise.all?
  Promise.all fails completely if ANY one API fails. allSettled waits for
  all of them and tells us which succeeded, so if GDACS is down the
  user still sees the advisory, earthquakes and hospitals.
  The 4 calls also run in PARALLEL (at the same time), not one after
  another, so the panel loads much faster.
*/
async function refreshSafetyData(force = false) {
  if (!position.value) return
  const { lat, lon } = position.value

  /* skip if we haven't moved much and this isn't a forced/timed refresh */
  if (
    !force &&
    lastFetchedAt &&
    haversineKm(lat, lon, lastFetchedAt.lat, lastFetchedAt.lon) < MOVE_THRESHOLD_KM
  ) return

  loading.value = true
  errors.value = []

  try {
    /* step 1: we need the country before the advisory and GDACS calls */
    locationInfo.value = await getLocationInfo(lat, lon)
    const { countryCode, countryName } = locationInfo.value

    /* step 2: everything else in parallel */
    const [adv, eq, dis, svc] = await Promise.allSettled([
      getTravelAdvisory(countryCode, countryName),
      getNearbyEarthquakes(lat, lon),
      getDisasterAlerts(countryCode),
      getNearestEmergencyServices(lat, lon)
    ])

    /* keep the data from each call that succeeded, note each failure */
    if (adv.status === 'fulfilled') advisory.value = adv.value
    else errors.value.push('Travel advisory')

    /* keep any simulated quakes (demo button) when real data refreshes */
    const simulated = quakes.value.filter((q) => q.simulated)
    if (eq.status === 'fulfilled') quakes.value = [...simulated, ...eq.value]
    else errors.value.push('Earthquake feed')

    if (dis.status === 'fulfilled') disasters.value = dis.value
    else errors.value.push('Disaster alerts')

    if (svc.status === 'fulfilled') services.value = svc.value
    else errors.value.push('Nearby emergency services')

    lastFetchedAt = { lat, lon }
    lastUpdated.value = new Date()

    notifyNewAlerts()
    emit('risk-change', { ...risk.value, location: locationInfo.value })
  } catch (err) {
    console.error('Safety layer error:', err)
    errors.value.push('Location lookup')
  } finally {
    loading.value = false
  }
}

/*
  notifyNewAlerts()
  Sends a push notification for each serious alert we haven't shown yet.
  Uses the browser Notification API if the user allowed it. Otherwise
  (or as well) it shows an in-app toast, so the demo still works if
  the browser blocks notifications.
*/
function notifyNewAlerts() {
  for (const alert of allAlerts.value) {
    if (notifiedIds.has(alert.id)) continue
    notifiedIds.add(alert.id)

    const message =
      alert.type === 'earthquake'
        ? `M${alert.magnitude} earthquake ${alert.distanceKm} km from you`
        : `${alert.alertLevel} alert: ${alert.title}`

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('⚠️ Safety alert', { body: message })
    }
    showToast(message, alert.severity)
  }
}

/* toast: a small pop-up box that disappears after 8 seconds */
function showToast(message, severity = 'warning') {
  const id = Date.now() + Math.random()
  toasts.value.push({ id, message, severity })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 8000)
}

/*
  startLiveTracking()
  watchPosition calls our function EVERY time the device's location
  changes (unlike getCurrentPosition, which only runs once). That's
  what makes this "real-time".
  enableHighAccuracy uses GPS rather than just Wi-Fi.
  maximumAge 60000 means a cached position up to 1 minute old is OK
  (saves battery).
*/
function startLiveTracking() {
  if (!('geolocation' in navigator)) {
    errors.value.push('Geolocation not supported on this device')
    return
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      position.value = { lat: pos.coords.latitude, lon: pos.coords.longitude }
      refreshSafetyData()
    },
    (err) => {
      console.error('Geolocation error:', err)
      errors.value.push('Location permission denied, choose a demo city instead')
    },
    { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 }
  )
}

function stopLiveTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  watchId = null
}

/*
  onLocationChange()
  Runs when the dropdown changes. "live" = real GPS,
  otherwise stop GPS and jump to the demo city.
*/
function onLocationChange() {
  stopLiveTracking()
  lastFetchedAt = null
  quakes.value = []
  advisory.value = null
  disasters.value = []
  services.value = {}
  locationInfo.value = null
  if (selectedLocation.value === 'live') {
    startLiveTracking()
  } else {
    const demo = DEMO_LOCATIONS[selectedLocation.value]
    position.value = { lat: demo.lat, lon: demo.lon }
    refreshSafetyData(true)
  }
}

/*
  simulateEarthquake()
  DEMO ONLY. Prof's comment was "try to demo that time is changing".
  Real disasters won't happen on cue during our presentation, so this
  injects a fake M6.2 quake 15 km away. That lets us show the score
  jump, the notification firing and the itinerary reacting
  through the risk-change event.
*/
function simulateEarthquake() {
  if (!position.value) return
  if (loading.value && !force) return // a fetch is already running
  quakes.value.unshift({
    id: 'sim-' + Date.now(),
    type: 'earthquake',
    title: 'M 6.2 - SIMULATED earthquake (demo)',
    magnitude: 6.2,
    distanceKm: 15,
    time: new Date(),
    url: null,
    simulated: true
  })
  notifyNewAlerts()
  emit('risk-change', { ...risk.value, location: locationInfo.value })
}

/* asks the browser for permission to show push notifications */
async function enableNotifications() {
  if ('Notification' in window) await Notification.requestPermission()
}

/* small helper to show "5 min ago" style times */
function timeAgo(date) {
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000)
  if (mins < 60) return mins + ' min ago'
  if (mins < 1440) return Math.round(mins / 60) + ' h ago'
  return Math.round(mins / 1440) + ' d ago'
}

/*
  LIFECYCLE
  onMounted: start tracking and set the 5-minute timer when the
  component appears.
  onUnmounted: STOP both when the user leaves the page. Without this,
  GPS and the timer keep running in the background, draining battery
  and calling the APIs for nothing (a memory leak).
*/
onMounted(() => {
  startLiveTracking()
  timerId = setInterval(() => refreshSafetyData(true), REFRESH_MS)
})

onUnmounted(() => {
  stopLiveTracking()
  clearInterval(timerId)
})
</script>

<template>
  <!-- Bootstrap grid: 1 column on phones, 2 columns from md (768px) up, so it's responsive at 575px for the demo -->
  <div class="safety-layer" data-testid="safety-layer">

    <!-- Header row: title, location picker, notification + refresh buttons -->
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <h4 class="mb-0 me-auto">🛡️ Real-time safety</h4>

      <select
        v-model="selectedLocation"
        @change="onLocationChange"
        class="form-select form-select-sm w-auto"
        data-testid="location-select"
      >
        <option value="live">📍 My live location</option>
        <option v-for="(loc, key) in DEMO_LOCATIONS" :key="key" :value="key">
          {{ loc.label }}
        </option>
      </select>

      <button class="btn btn-sm btn-outline-secondary" @click="enableNotifications">🔔 Alerts</button>
      <button class="btn btn-sm btn-outline-primary" @click="refreshSafetyData(true)" :disabled="loading">
        {{ loading ? 'Checking…' : '↻ Refresh' }}
      </button>
    </div>

    <!-- Warning if any API failed (the rest still shows, thanks to allSettled) -->
    <div v-if="errors.length" class="alert alert-secondary py-2 small">
      Couldn't load: {{ errors.join(', ') }}
    </div>

    <!-- Waiting for GPS -->
    <div v-if="!position" class="text-center text-muted py-5">
      Waiting for your location… allow location access, or pick a demo city above.
    </div>

    <template v-else>
      <!-- RISK SCORE CARD: the merged result of our algorithm -->
      <div :class="`card border-${risk.colour} mb-3`" data-testid="risk-card">
        <div class="card-body d-flex align-items-center gap-3">
          <div :class="`risk-circle bg-${risk.colour} text-white`">{{ risk.score }}</div>
          <div>
            <div class="fw-bold">{{ risk.label }} risk</div>
            <div class="small text-muted">
              {{ locationInfo?.city }}, {{ locationInfo?.countryName }}
              <span v-if="lastUpdated"> · updated {{ lastUpdated.toLocaleTimeString() }}</span>
            </div>
          </div>
          <button class="btn btn-sm btn-outline-danger ms-auto" @click="simulateEarthquake" data-testid="simulate-btn">
            Simulate quake
          </button>
        </div>
      </div>

      <!-- Emergency numbers: tel: links open the phone dialler on mobile -->
      <div class="d-flex gap-2 mb-3">
        <a :href="`tel:${emergencyNumbers.police}`" class="btn btn-danger flex-fill">
          👮 Police {{ emergencyNumbers.police }}
        </a>
        <a :href="`tel:${emergencyNumbers.ambulance}`" class="btn btn-danger flex-fill">
          🚑 Ambulance {{ emergencyNumbers.ambulance }}
        </a>
      </div>

      <div class="row g-3">
        <!-- LEFT: advisory + live alerts -->
        <div class="col-12 col-md-6">
          <div class="card mb-3" v-if="advisory">
            <div class="card-header">Government advisory (UK FCDO)</div>
            <div class="card-body">
              <span :class="`badge bg-${ADVISORY_COLOURS[advisory.level - 1]} mb-2`">
                Level {{ advisory.level }}: {{ advisory.label }}
              </span>
              <p class="small mb-1"><strong>Latest update:</strong> {{ advisory.latestChange }}</p>
              <a :href="advisory.url" target="_blank" class="small">Read full advice →</a>
            </div>
          </div>

          <div class="card">
            <div class="card-header">Live alerts near you</div>
            <ul class="list-group list-group-flush" data-testid="alert-list">
              <li v-if="!allAlerts.length" class="list-group-item text-muted small">
                ✅ No earthquakes or major disasters nearby.
              </li>
              <li v-for="a in allAlerts" :key="a.id" :class="`list-group-item list-group-item-${a.severity}`">
                <div class="fw-semibold small">{{ a.title }}</div>
                <div class="small">
                  <template v-if="a.type === 'earthquake'">{{ a.distanceKm }} km away · {{ timeAgo(a.time) }}</template>
                  <template v-else>{{ a.type }} · {{ a.details }}</template>
                  <a v-if="a.url" :href="a.url" target="_blank" class="ms-1">details</a>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- RIGHT: nearest hospitals / clinics / police / fire stations -->
        <div class="col-12 col-md-6">
          <div class="card">
            <div class="card-header">Nearest help (within 3 km)</div>
            <div class="card-body p-0">
              <div v-if="!Object.keys(services).length" class="p-3 text-muted small">None found nearby.</div>
              <div v-for="(list, type) in services" :key="type" class="p-3 border-bottom">
                <div class="fw-semibold mb-1">{{ SERVICE_LABELS[type] }}</div>
                <div v-for="s in list" :key="s.id" class="d-flex justify-content-between align-items-center small py-1">
                  <span>{{ s.name }} <span class="text-muted">· {{ s.distanceKm.toFixed(1) }} km</span></span>
                  <a :href="s.mapsUrl" target="_blank" class="btn btn-sm btn-outline-primary">Go</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Toasts: in-app pop-up alerts, fixed bottom-right -->
    <div class="toast-stack">
      <div v-for="t in toasts" :key="t.id" :class="`alert alert-${t.severity} shadow mb-2`">
        ⚠️ {{ t.message }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  scoped = these styles only apply to this component and
  won't clash with teammates' CSS.
*/
.risk-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 700;
  flex-shrink: 0;
}

.toast-stack {
  position: fixed;
  bottom: 16px;
  right: 16px;
  max-width: 320px;
  z-index: 1080;
}

/* on phones (the 575px demo width) the toasts go full width */
@media (max-width: 575px) {
  .toast-stack {
    left: 16px;
    right: 16px;
    max-width: none;
  }
}
</style>
