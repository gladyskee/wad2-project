<template>
  <div>
    <div class="d-flex flex-wrap align-items-baseline gap-2 mb-2">
      <h4 class="mb-0">Itinerary & Adaptive Conflict Engine</h4>
      <span v-if="saveStatus" class="small" :class="saveStatus.startsWith('Could not') ? 'text-danger' : 'text-muted'" role="status" data-testid="save-status">{{ saveStatus }}</span>
    </div>

    <PreferencesPanel />

    <!-- Day picker -->
    <div v-if="dayList.length" class="d-flex flex-wrap gap-2 mb-3" aria-label="Trip days">
      <button v-for="(d, n) in dayList" :key="d" type="button" class="btn btn-sm"
        :class="d === selectedDate ? 'btn-primary' : 'btn-outline-secondary'"
        :aria-pressed="d === selectedDate" @click="selectDay(d)" data-testid="day-btn">
        Day {{ n + 1 }} · {{ dayLabel(d) }}
      </button>
    </div>

    <!-- Weather alert: recalculated whenever a stop moves or the weather changes -->
    <div v-if="hasConflict" class="alert alert-warning" data-testid="weather-alert">
      <strong>Weather alert:</strong> Rain forecast at {{ rainHours }}<span v-if="simulatedWeather"> (simulated forecast)</span>.
      Affected: {{ rainConflicts.map(i => shortName(i.name)).join(', ') }}.
      <div class="mt-2 d-flex align-items-center gap-2 flex-wrap">
        <template v-if="wishlist.length">
          <select v-model="chosenWishId" class="form-select form-select-sm w-auto" aria-label="Wishlist replacement" data-testid="wishlist-select">
            <option v-for="w in wishlist" :key="w.id" :value="w.id">⭐ {{ w.name }}</option>
          </select>
          <button class="btn btn-sm btn-danger" :disabled="anyLoading" @click="resolveConflict" data-testid="resolve-btn">Replace {{ shortName(rainConflicts[0].name) }}</button>
        </template>
        <span v-else class="small">Your wishlist is empty. Add an indoor place in the wishlist below to swap in.</span>
      </div>
    </div>
    <p v-else-if="selectedDate && !dayWeather.length" class="small text-muted" data-testid="no-weather">
      {{ weatherError ? 'Weather is unavailable right now.' : 'No forecast for this day yet (forecasts cover about 5 days ahead).' }}
    </p>

    <div v-if="retimeNotes.length" class="alert alert-info small" data-testid="retime-notes">
      <strong>Re-timed after the swap:</strong>
      <div v-for="n in retimeNotes" :key="n">{{ n }}</div>
    </div>

    <!-- Plan my day -->
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      <button class="btn btn-primary btn-sm" :disabled="anyLoading || !itinerary.length" @click="makePlan" data-testid="plan-day-btn">
        ✨ Plan my day
      </button>
      <button class="btn btn-outline-primary btn-sm" @click="toggleAdd" data-testid="add-stop-toggle">{{ showAdd ? 'Close' : '+ Add stop' }}</button>
      <span class="small text-muted">Re-times your stops to avoid crowds (🔒 preserved stops stay put)</span>
    </div>

    <!-- Add a stop -->
    <form v-if="showAdd" class="card p-3 mb-3" @submit.prevent="addStop" novalidate data-testid="add-stop-form">
      <div class="row g-2">
        <div class="col-md-6">
          <label for="stop-name" class="form-label small">Place or activity</label>
          <input id="stop-name" v-model="addForm.name" class="form-control form-control-sm" maxlength="120" placeholder="e.g. Fushimi Inari Shrine" data-testid="stop-name">
        </div>
        <div class="col-md-6">
          <label for="stop-address" class="form-label small">Address <span class="text-muted">(optional, turns on crowd info)</span></label>
          <input id="stop-address" v-model="addForm.address" class="form-control form-control-sm" maxlength="200" placeholder="e.g. 68 Fukakusa Yabunouchicho, Kyoto" data-testid="stop-address">
        </div>
        <div class="col-6 col-md-3">
          <label for="stop-date" class="form-label small">Day</label>
          <input id="stop-date" type="date" v-model="addForm.date" :min="startDate || null" :max="endDate || null" class="form-control form-control-sm" data-testid="stop-date">
        </div>
        <div class="col-6 col-md-3">
          <label for="stop-hour" class="form-label small">Start time</label>
          <select id="stop-hour" v-model.number="addForm.hour" class="form-select form-select-sm" data-testid="stop-hour">
            <option v-for="h in hourOptions" :key="h" :value="h">{{ formatHour(h) }}</option>
          </select>
        </div>
        <div class="col-6 col-md-3">
          <label for="stop-duration" class="form-label small">Duration</label>
          <select id="stop-duration" v-model="addForm.duration" class="form-select form-select-sm">
            <option :value="null">Auto</option>
            <option v-for="d in durationOptions" :key="d" :value="d">{{ d }} h</option>
          </select>
        </div>
        <div class="col-6 col-md-3 d-flex align-items-end">
          <div class="form-check">
            <input id="stop-outdoor" type="checkbox" v-model="addForm.outdoor" class="form-check-input" data-testid="stop-outdoor">
            <label for="stop-outdoor" class="form-check-label small">Outdoors</label>
          </div>
        </div>
      </div>
      <p v-if="addError" class="text-danger small mt-2 mb-0" role="alert" data-testid="add-stop-error">{{ addError }}</p>
      <div><button type="submit" class="btn btn-success btn-sm mt-2" data-testid="add-stop-save">Add to itinerary</button></div>
    </form>

    <div v-if="plan" class="card p-3 mb-3 border-primary" data-testid="plan-preview">
      <div class="d-flex justify-content-between flex-wrap gap-2 mb-2">
        <strong>New plan</strong>
        <span v-if="plan.avgBefore !== null" class="small text-muted">
          Avg crowd {{ plan.avgBefore }}% → <strong class="text-body">{{ plan.avgAfter }}%</strong>
        </span>
      </div>

      <ul class="list-unstyled small mb-2">
        <li v-for="row in plan.rows" v-show="row.newHour !== null" :key="row.index" class="py-1">
          <strong>{{ formatHour(row.newHour) }}</strong> {{ row.name }}
          <span v-if="row.locked" class="text-muted">(preserved)</span>
          <span v-else-if="row.noData" class="text-muted">(no crowd data, kept)</span>
          <span v-else-if="row.newHour !== row.oldHour" class="text-primary">(was {{ formatHour(row.oldHour) }})</span>
          <span v-else class="text-muted">(no change)</span>
        </li>
      </ul>

      <div v-for="u in plan.unplaced" :key="'u' + u.index" class="small text-danger mb-2" data-testid="plan-unplaced">
        {{ u.name }}: {{ u.reason }}
      </div>

      <div class="d-flex gap-2">
        <button class="btn btn-primary btn-sm" @click="applyPlan" data-testid="plan-apply-btn">Apply</button>
        <button class="btn btn-outline-secondary btn-sm" @click="plan = null" data-testid="plan-cancel-btn">Cancel</button>
      </div>
    </div>

    <div class="card p-3 mb-3">
      <p v-if="!itinerary.length" class="text-muted mb-0" data-testid="empty-day">
        {{ selectedDate ? 'No stops on this day yet. Use "+ Add stop" to plan it.' : 'Use "+ Add stop" and pick a day to start your itinerary.' }}
      </p>

      <div v-for="(item, i) in itinerary" :key="item.id">
        <div class="mb-2 p-2 rounded" :class="item.highlight ? 'bg-success-subtle' : 'bg-light'" data-testid="itinerary-item">

          <!-- Time, name, badge, lock -->
          <div class="d-flex flex-wrap align-items-center gap-2">
            <strong>{{ formatHour(item.hour) }}</strong>
            <span v-if="item.replacedFrom" class="text-decoration-line-through text-muted me-1">{{ item.replacedFrom }}</span>
            <span :class="{ 'fw-semibold text-primary': item.replacedFrom }">{{ item.replacedFrom ? '→ ' : '' }}{{ item.name }}<template v-if="item.replacedFrom"> ⭐</template></span>

            <span v-if="inRain(item)" title="Outdoors during rain forecast">🌧️</span>

            <span v-if="crowdInfo[i].closedToday" class="badge bg-danger" data-testid="closed-badge">Closed {{ tripDay }}s</span>
            <CrowdBadge v-else-if="item.address" :loading="item.loading" :busyness="crowdInfo[i].busyness"
              :estimated="!!(item.forecast && item.forecast.estimated)" />

            <label class="small text-muted ms-auto" title="Preserved stops are never moved by suggestions, Plan my day or weather swaps">
              <input type="checkbox" v-model="item.locked" @change="plan = null" class="form-check-input me-1" data-testid="lock-checkbox">🔒 Preserve
            </label>
            <button type="button" class="btn btn-sm btn-outline-danger py-0" :aria-label="'Remove ' + item.name" @click="removeStop(item)" data-testid="remove-stop">✕</button>
          </div>

          <div v-if="item.error" class="small text-danger mt-1">{{ item.error }}</div>

          <!-- No real data: offer nearby landmarks -->
          <div v-if="item.forecast && item.forecast.estimated && item.forecast.nearby.length"
            class="small mt-1 d-flex flex-wrap align-items-center gap-1" data-testid="crowd-estimate-note">
            <span class="text-muted">No data for this place (showing an estimate). Use data from nearby:</span>
            <button v-for="place in item.forecast.nearby" :key="place" class="btn btn-sm btn-link p-0 me-2"
              :disabled="item.loading" @click="useNearby(item, place)" data-testid="crowd-nearby-btn">{{ place }}</button>
          </div>
          <div v-if="item.dataFrom" class="small text-muted mt-1" data-testid="crowd-source">Crowd data from {{ item.dataFrom }} (nearby)</div>

          <!-- Preference + duration -->
          <div v-if="item.forecast && item.forecast.days && !crowdInfo[i].closedToday" class="small mt-1 d-flex flex-wrap align-items-center gap-2">
            <label :for="'best-' + i" class="text-muted">Preference</label>
            <select :id="'best-' + i" v-model="item.bestTime" class="form-select form-select-sm w-auto" data-testid="best-time-select">
              <option v-for="opt in timeOptions" :key="opt" :value="opt">
                {{ timeLabels[opt] }}{{ opt === item.forecast.bestTimeDefault ? ' (recommended)' : '' }}
              </option>
            </select>
            <label :for="'dur-' + i" class="text-muted ms-1">Duration</label>
            <select :id="'dur-' + i" v-model.number="item.duration" class="form-select form-select-sm w-auto" data-testid="duration-select">
              <option v-for="d in durationOptions" :key="d" :value="d">
                {{ d }} h{{ d === item.forecast.durationDefault ? ' (typical)' : '' }}
              </option>
            </select>
          </div>

          <!-- Suggestion -->
          <div v-if="crowdInfo[i].suggestHour !== null || crowdInfo[i].swap" class="small mt-2 d-flex flex-wrap align-items-center gap-2">
            <span class="text-muted" :title="crowdInfo[i].reason">💡 {{ crowdInfo[i].short }}</span>
            <button v-if="crowdInfo[i].suggestHour !== null" class="btn btn-sm btn-outline-primary py-0"
              @click="moveItem(i, crowdInfo[i].suggestHour)" data-testid="crowd-move-btn">
              Move to {{ formatHour(crowdInfo[i].suggestHour) }}
            </button>
            <button v-if="crowdInfo[i].swap" class="btn btn-sm btn-outline-secondary py-0"
              :title="'This at ' + formatHour(crowdInfo[i].swap.hour) + ', ' + crowdInfo[i].swap.name + ' at ' + formatHour(crowdInfo[i].swap.otherNewHour)"
              @click="swapItems(i, crowdInfo[i].swap.index)" data-testid="crowd-swap-btn">
              Swap times with {{ shortName(crowdInfo[i].swap.name) }}
            </button>
          </div>

          <!-- Hourly chart -->
          <CrowdChart v-if="item.forecast && item.forecast.days && item.forecast.days[tripDay] && !crowdInfo[i].closedToday"
            :forecast="item.forecast" :day-name="tripDay"
            :planned-hour="item.hour" :suggest-hour="crowdInfo[i].suggestHour" />
        </div>

        <!-- Transit time between stops -->
        <div v-if="i < itinerary.length - 1 && item.transitToNext" class="text-center small text-muted my-1" data-testid="transit-badge">
          🚇 ~{{ item.transitToNext }} transit to next stop
        </div>
      </div>
    </div>

    <!-- Wishlist -->
    <div class="card p-3 mb-3" data-testid="wishlist-card">
      <h5 class="mb-1">Wishlist</h5>
      <p class="small text-muted">Indoor backup places. If rain is forecast during an outdoor stop, you can swap one in.</p>
      <ul class="list-unstyled small mb-2">
        <li v-for="w in wishlist" :key="w.id" class="d-flex justify-content-between align-items-center py-1 border-bottom">
          <span>⭐ {{ w.name }}</span>
          <button type="button" class="btn btn-sm btn-outline-danger py-0" :aria-label="'Remove ' + w.name" @click="removeWish(w)">✕</button>
        </li>
        <li v-if="!wishlist.length" class="text-muted">Nothing here yet.</li>
      </ul>
      <form class="row g-2" @submit.prevent="addWish" novalidate>
        <div class="col-md-5">
          <label for="wish-name" class="visually-hidden">Wishlist place</label>
          <input id="wish-name" v-model="wishForm.name" class="form-control form-control-sm" maxlength="120" placeholder="Indoor place, e.g. teamLab Borderless" data-testid="wish-name">
        </div>
        <div class="col-md-5">
          <label for="wish-address" class="visually-hidden">Wishlist address</label>
          <input id="wish-address" v-model="wishForm.address" class="form-control form-control-sm" maxlength="200" placeholder="Address (optional)">
        </div>
        <div class="col-md-2"><button type="submit" class="btn btn-outline-primary btn-sm w-100" data-testid="wish-add">Add</button></div>
      </form>
    </div>
  </div>
</template>

<script>
import axios from 'axios'
import CrowdBadge from './CrowdBadge.vue'
import CrowdChart from './CrowdChart.vue'
import PreferencesPanel from './PreferencesPanel.vue'
import { prefs, loadPreferences } from '../preferences.js'
import { getForecast, suggestSlot, planDay, busynessAt, formatHour, TIME_WINDOWS, TIME_LABELS } from '../crowd.js'
import { fetchTravelTime } from '../services/maps.js'
import { fetchWeatherForecast } from '../services/weatherService.js'
import { trip, loadDemo, loadFromServer, savedShape, runtimeStop, newId } from '../itineraryStore.js'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default {
  components: { CrowdBadge, CrowdChart, PreferencesPanel },
  emits: ['itinerary-change'],
  props: {
    tripId: { type: String, default: 'seoul' }, // 'seoul' = the demo trip (not saved)
    destination: { type: String, default: '' },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    initialStops: { type: Array, default: () => [] },
    initialWishlist: { type: Array, default: () => [] }
  },
  data() {
    return {
      selectedDate: '', // 'YYYY-MM-DD'
      weather: [], // every forecast entry: { date, time, span, condition, rain }
      weatherError: false,
      timeOptions: Object.keys(TIME_WINDOWS),
      timeLabels: TIME_LABELS,
      plan: null, // result of "Plan my day" until applied or cancelled
      durationOptions: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6],
      hourOptions: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      selectedWishlistId: null,
      retimeNotes: [],
      showAdd: false,
      addForm: { name: '', address: '', date: '', hour: 10, duration: null, outdoor: false },
      addError: '',
      wishForm: { name: '', address: '' },
      saveStatus: '',
      loaded: false,
      lastSavedKey: ''
    }
  },

  async mounted() {
    // Start from this trip's saved data (or the demo)
    if (this.isDemo) loadDemo()
    else loadFromServer({ stops: this.initialStops, wishlist: this.initialWishlist })

    const firstStopDay = trip.stops.map((s) => s.date).sort()[0]
    this.selectedDate = firstStopDay || this.dayList[0] || ''

    // The user's saved preferences (keeps the defaults if this fails)
    try {
      await loadPreferences()
    } catch (err) {
      console.warn('Could not load preferences, using defaults')
    }

    // Weather first, so the alert can show while crowd data loads
    try {
      this.weather = await fetchWeatherForecast(this.weatherParams)
    } catch (err) {
      this.weatherError = true
    }

    // Load each tracked stop's forecast from our server (in parallel)
    await Promise.all(trip.stops.map((item) => this.loadForecast(item)))

    await this.updateTransitTimes()
    this.reportItinerary()

    // From here on, changes are saved
    this.lastSavedKey = this.persistKey
    this.loaded = true
  },

  beforeUnmount() {
    // Don't lose a change made just before leaving the page
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveNow()
    }
  },

  watch: {
    // Fires whenever anything worth saving changes
    persistKey(key) {
      if (!this.loaded || this.isDemo || key === this.lastSavedKey) return
      this.saveStatus = 'Saving…'
      clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(this.saveNow, 800)
    }
  },

  computed: {
    isDemo() {
      return this.tripId === 'seoul'
    },
    weatherParams() {
      return this.isDemo
        ? { lat: 37.5665, lon: 126.978, fallbackDate: '2026-10-13', simulateOnFail: true }
        : { q: this.destination }
    },
    persistKey() {
      return JSON.stringify(savedShape())
    },

    // The days of the trip: the date range if set, otherwise the days that have stops
    dayList() {
      if (this.startDate) {
        const end = this.endDate || this.startDate
        const days = []
        const d = new Date(this.startDate + 'T00:00:00')
        const last = new Date(end + 'T00:00:00')
        while (d <= last && days.length < 31) {
          days.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))
          d.setDate(d.getDate() + 1)
        }
        return days
      }
      return [...new Set(trip.stops.map((s) => s.date))].sort()
    },
    tripDay() {
      return this.selectedDate ? DAY_NAMES[new Date(this.selectedDate + 'T00:00:00').getDay()] : ''
    },
    dayWeather() {
      return this.weather.filter((w) => w.date === this.selectedDate)
    },

    // The selected day's stops in time order. A new array each time, so the store itself is never reordered.
    itinerary() {
      return trip.stops.filter((s) => s.date === this.selectedDate).sort((a, b) => a.hour - b.hour)
    },
    wishlist() {
      return trip.wishlist
    },
    selectedWishlistItem() {
      return this.wishlist.find((w) => w.id === this.selectedWishlistId) || this.wishlist[0] || null
    },
    // For the dropdown: shows the first wishlist item until the user picks another
    chosenWishId: {
      get() { return this.selectedWishlistItem ? this.selectedWishlistItem.id : null },
      set(id) { this.selectedWishlistId = id }
    },

    // Outdoor, unlocked stops that overlap forecast rain. Updates by itself when anything moves.
    rainConflicts() {
      return this.itinerary.filter((item) => this.inRain(item))
    },
    hasConflict() {
      return this.rainConflicts.length > 0
    },
    rainHours() {
      return this.dayWeather
        .filter((w) => w.rain)
        .map((w) => formatHour(w.time) + '–' + formatHour(w.time + (w.span || 1)))
        .join(', ')
    },
    simulatedWeather() {
      return this.dayWeather.some((w) => w.simulated)
    },

    anyLoading() {
      return trip.stops.some((item) => item.loading)
    },

    // One entry per stop: crowd % now + a better time (if any)
    crowdInfo() {
      const list = this.itinerary
      const result = []
      for (let i = 0; i < list.length; i++) {
        const item = list[i]
        const info = { busyness: null, suggestHour: null, reason: '', short: '', swap: null, closedToday: false }

        // Closed all day? (e.g. Gyeongbokgung Palace is closed on Tuesdays)
        if (item.forecast && item.forecast.days && item.forecast.days[this.tripDay] && item.forecast.days[this.tripDay].closed) {
          info.closedToday = true
        } else if (item.forecast && item.forecast.days && item.forecast.days[this.tripDay]) {
          info.busyness = busynessAt(item.forecast, this.tripDay, item.hour)

          // The other stops' times, so we don't suggest a clash
          const takenSlots = []
          for (let j = 0; j < list.length; j++) {
            const other = list[j]
            if (j !== i) {
              takenSlots.push({
                start: other.hour,
                duration: other.duration || 1,
                name: other.name,
                index: j,
                forecast: other.forecast,
                bestTime: other.bestTime,
                locked: other.locked
              })
            }
          }

          const s = suggestSlot({
            forecast: item.forecast,
            dayName: this.tripDay,
            currentHour: item.hour,
            duration: item.duration,
            bestTime: item.bestTime,
            takenSlots,
            prefs
          })
          // Locked stops keep their time: show crowds, but no suggestions
          if (!item.locked) {
            info.suggestHour = s.hour
            info.reason = s.reason
            info.swap = s.swap
            if (s.currentProblem) info.short = s.currentProblem
            else if (s.hour !== null) info.short = 'Quieter at ' + formatHour(s.hour) + ' (' + s.busyness + '% vs ' + s.currentBusyness + '% now)'
            else if (s.swap) info.short = 'Swapping gives a quieter time (' + s.swap.busyness + '% vs ' + s.currentBusyness + '% now)'
          }
        }
        result.push(info)
      }
      return result
    }
  },

  methods: {
    formatHour,

    // "Dinner Reservation (Myeongdong Kyoja)" -> "Dinner Reservation"
    shortName(name) {
      return name.split(' (')[0]
    },

    dayLabel(d) {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    },

    selectDay(d) {
      this.selectedDate = d
      this.plan = null
      this.retimeNotes = []
      this.addForm.date = d
    },

    // ---------- saving ----------
    async saveNow() {
      this.saveTimer = null
      if (this.isDemo) return
      const key = this.persistKey
      try {
        await axios.put('/api/trips/' + this.tripId + '/itinerary', JSON.parse(key))
        this.lastSavedKey = key
        this.saveStatus = 'All changes saved'
      } catch (err) {
        this.saveStatus = 'Could not save changes. Is the server running?'
      }
    },

    // ---------- adding / removing stops ----------
    toggleAdd() {
      this.showAdd = !this.showAdd
      this.addError = ''
      this.addForm.date = this.selectedDate || this.startDate || ''
    },

    async addStop() {
      this.addError = ''
      const name = this.addForm.name.trim()
      const date = this.addForm.date
      if (!name) {
        this.addError = 'Please enter a place or activity.'
        return
      }
      if (!date) {
        this.addError = 'Please pick a day.'
        return
      }
      if ((this.startDate && date < this.startDate) || (this.endDate && date > this.endDate)) {
        this.addError = 'That day is outside your trip dates.'
        return
      }

      this.plan = null
      trip.stops.push(runtimeStop({
        id: newId('s'),
        name,
        date,
        hour: Number(this.addForm.hour),
        duration: this.addForm.duration,
        address: this.addForm.address.trim() || null,
        outdoor: this.addForm.outdoor
      }))
      const added = trip.stops[trip.stops.length - 1] // the reactive version of the new stop
      this.selectedDate = date
      this.addForm.name = ''
      this.addForm.address = ''
      this.addForm.outdoor = false

      await this.loadForecast(added)
      await this.updateTransitTimes()
      this.reportItinerary()
    },

    async removeStop(stop) {
      this.plan = null
      trip.stops = trip.stops.filter((s) => s.id !== stop.id)
      await this.updateTransitTimes()
      this.reportItinerary()
    },

    addWish() {
      const name = this.wishForm.name.trim()
      if (!name) return
      trip.wishlist.push({ id: newId('w'), name, address: this.wishForm.address.trim() || null, outdoor: false })
      this.wishForm.name = ''
      this.wishForm.address = ''
    },

    removeWish(w) {
      trip.wishlist = trip.wishlist.filter((x) => x.id !== w.id)
    },

    // ---------- crowd data ----------
    // Load one stop's crowd forecast (stops without an address aren't tracked)
    async loadForecast(item) {
      if (!item.address) return
      item.loading = true
      item.error = ''
      try {
        item.forecast = await getForecast(item.name, item.address)
        item.bestTime = item.forecast.bestTimeDefault
        if (item.duration === null) item.duration = item.forecast.durationDefault
      } catch (err) {
        item.error = this.errorText(err)
      }
      item.loading = false
    },

    // Swap an estimate for a nearby landmark's real forecast, e.g. Namsan Park -> N Seoul Tower
    async useNearby(item, placeName) {
      item.loading = true
      item.error = ''
      try {
        const forecast = await getForecast(placeName, item.address)
        if (forecast.found) {
          item.forecast = forecast
          item.bestTime = forecast.bestTimeDefault
          item.duration = forecast.durationDefault
          item.dataFrom = placeName
        } else {
          item.error = placeName + ' has no crowd data either. Keeping the estimate.'
        }
      } catch (err) {
        item.error = this.errorText(err)
      }
      item.loading = false
    },

    // ---------- weather ----------
    // Is this an outdoor, unlocked stop that overlaps forecast rain?
    // Each forecast entry covers [time, time + span), the stop covers [hour, hour + duration).
    inRain(item) {
      if (!item.outdoor || item.locked) return false
      const end = item.hour + (item.duration || 1)
      return this.dayWeather.some((w) => w.rain && w.time < end && w.time + (w.span || 1) > item.hour)
    },

    // Replace the first rained-on stop with the chosen wishlist place,
    // load its crowd data, recalculate transit and push later stops back if needed.
    async resolveConflict() {
      const target = this.rainConflicts[0]
      const pick = this.selectedWishlistItem
      if (!target || !pick) return
      this.plan = null

      target.replacedFrom = target.name
      target.name = pick.name
      target.address = pick.address
      target.outdoor = pick.outdoor
      target.highlight = true
      target.forecast = null
      target.dataFrom = ''
      target.duration = null // use the new place's typical visit length

      trip.wishlist = trip.wishlist.filter((w) => w.id !== pick.id) // each wishlist pick is used once
      this.selectedWishlistId = null

      await this.loadForecast(target)
      if (target.duration === null) target.duration = 1.5 // no crowd data

      await this.updateTransitTimes()
      this.retimeStops()
      await this.updateTransitTimes()
      this.reportItinerary()
    },

    // Push later stops back when an earlier stop (plus travel) now runs into them
    retimeStops() {
      const list = this.itinerary // fixed snapshot: hours change while we loop
      const notes = []
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1]
        const cur = list[i]
        const prevEnd = prev.hour + (prev.duration || 1) + (prev.transitSecs || 0) / 3600
        if (cur.hour >= prevEnd) continue
        if (cur.locked) {
          notes.push(this.shortName(cur.name) + ' is preserved at ' + formatHour(cur.hour) + ' but now clashes with ' + this.shortName(prev.name) + '. Adjust one of them.')
        } else {
          const newHour = Math.ceil(prevEnd)
          notes.push(this.shortName(cur.name) + ': ' + formatHour(cur.hour) + ' → ' + formatHour(newHour))
          cur.hour = newHour
          cur.highlight = true
        }
      }
      this.retimeNotes = notes
    },

    // ---------- transit ----------
    // Travel time from every stop to the next (all requests run at once)
    async updateTransitTimes() {
      const list = this.itinerary
      const place = (s) => s.address || this.shortName(s.name) + (this.destination ? ', ' + this.destination : '')
      await Promise.all(list.map(async (stop, i) => {
        const next = list[i + 1]
        if (!next) {
          stop.transitToNext = null
          stop.transitSecs = 0
          return
        }
        try {
          const t = await fetchTravelTime(place(stop), place(next))
          stop.transitToNext = t.durationText
          stop.transitSecs = t.durationValue
        } catch (err) {
          stop.transitToNext = '30 mins (est)'
          stop.transitSecs = 1800
        }
      }))
    },

    // A clear message for any failed request
    errorText(err) {
      if (err.response && err.response.data && err.response.data.message) return err.response.data.message
      if (err.response) return 'Server error (' + err.response.status + '). Check the server terminal.'
      return 'Server not reachable. Is it running?'
    },

    reportItinerary() {
      this.$emit('itinerary-change', trip.stops)
    },

    // ---------- crowd-based planning ----------
    // "Plan my day": work out new times for every stop and show a preview
    makePlan() {
      this.planStops = this.itinerary // snapshot, so row.index still matches when applied
      const stops = []
      for (let i = 0; i < this.planStops.length; i++) {
        const item = this.planStops[i]
        stops.push({
          index: i,
          name: item.name,
          hour: item.hour,
          duration: item.duration || (item.forecast && item.forecast.durationDefault) || 1,
          forecast: item.forecast,
          bestTime: item.bestTime,
          locked: item.locked
        })
      }
      this.plan = planDay({ stops, dayName: this.tripDay, prefs })
    },

    async applyPlan() {
      for (const row of this.plan.rows) {
        if (row.newHour === null || row.newHour === row.oldHour) continue
        this.planStops[row.index].hour = row.newHour
        this.planStops[row.index].highlight = true
      }
      this.plan = null
      this.retimeNotes = []
      await this.updateTransitTimes()
      this.reportItinerary()
    },

    // Swap the times of two stops, e.g. tower <-> dinner
    async swapItems(a, b) {
      this.plan = null
      const list = this.itinerary
      const first = list[a]
      const second = list[b]
      const temp = first.hour
      first.hour = second.hour
      second.hour = temp
      first.highlight = true
      second.highlight = true
      await this.updateTransitTimes()
      this.reportItinerary()
    },

    async moveItem(index, newHour) {
      this.plan = null
      const item = this.itinerary[index]
      item.hour = newHour
      item.highlight = true
      await this.updateTransitTimes()
      this.reportItinerary()
    }
  }
}
</script>