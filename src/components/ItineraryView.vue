<template>
  <div>
    <h4>Day 2 Itinerary & Adaptive Conflict Engine</h4>

    <PreferencesPanel />

    <!-- Weather alert (unchanged) -->
    <div v-if="hasConflict" class="alert alert-warning">
      <strong>Weather Alert:</strong> Heavy rain predicted at 14:00. Outdoor activities affected.
      <div class="mt-2 d-flex align-items-center gap-2">
        <select v-model="selectedWishlistItem" class="form-select form-select-sm w-auto">
          <option v-for="w in wishlist" :key="w.name" :value="w">:star: {{ w.name }}</option>
        </select>
        <button class="btn btn-sm btn-danger" @click="resolveConflict">Replace with Wishlist Pick</button>
      </div>
    </div>

    <!-- Plan my day -->
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      <button class="btn btn-primary btn-sm" :disabled="anyLoading" @click="makePlan" data-testid="plan-day-btn">
        ✨ Plan my day
      </button>
      <span class="small text-muted">Re-times your stops to avoid crowds (🔒 preserved stops stay put)</span>
    </div>

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
      <div v-for="(item, i) in itinerary" :key="item.name">
        <!-- Itinerary Item Box -->
        <div class="mb-2 p-2 rounded"
          :class="item.highlight ? 'bg-success-subtle' : 'bg-light'" data-testid="itinerary-item">

          <!-- Time, name, badge, lock -->
          <div class="d-flex flex-wrap align-items-center gap-2">
            <strong>{{ formatHour(item.hour) }}</strong>
            <!-- History-aware name display requested by reviewer -->
            <span :class="{'text-decoration-line-through text-muted me-1': item.replacedFrom}">
              {{ item.replacedFrom ? item.replacedFrom : item.name }}
            </span>
            <span v-if="item.replacedFrom" class="text-primary fw-semibold small">
              → Swapped to: {{ item.name }} ✨
            </span>

            <span v-if="inRain(item)" title="Outdoors during rain forecast">🌧️</span>

            <span v-if="crowdInfo[i].closedToday" class="badge bg-danger" data-testid="closed-badge">Closed {{ tripDay }}s</span>
            <CrowdBadge v-else-if="item.address" :loading="item.loading" :busyness="crowdInfo[i].busyness"
              :estimated="!!(item.forecast && item.forecast.estimated)" />

            <label class="small text-muted ms-auto" title="Preserved stops are never moved by suggestions or Plan my day">
              <input type="checkbox" v-model="item.locked" @change="plan = null" class="form-check-input me-1" data-testid="lock-checkbox">🔒 Preserve
            </label>
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

        <!-- Transit time badge shown between stops -->
        <div v-if="i < itinerary.length - 1 && item.transitToNext" class="text-center small text-muted my-1">
          🚗 ~{{ item.transitToNext }} transit to next stop
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import CrowdBadge from './CrowdBadge.vue'
import CrowdChart from './CrowdChart.vue'
import PreferencesPanel from './PreferencesPanel.vue'
import { prefs, loadPreferences } from '../preferences.js'
import { getForecast, suggestSlot, planDay, busynessAt, formatHour, TIME_WINDOWS, TIME_LABELS } from '../crowd.js'
import { fetchTravelTime } from '../services/maps.js'
import { fetchWeatherForecast } from '../services/weatherService.js'

export default {
  components: { CrowdBadge, CrowdChart, PreferencesPanel },
  data() {
    return {
      hasConflict: false,
      isResolved: false,
      tripDay: 'Tuesday', // Day 2 = Tue 13 Oct 2026
      weather: [], // Stores clean weather objects
      timeOptions: Object.keys(TIME_WINDOWS),
      timeLabels: TIME_LABELS,
      plan: null, // result of "Plan my day" until applied or cancelled
      durationOptions: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6],
      // address: null = we don't track crowds for this stop
      itinerary: [
        { hour: 10, duration: 1, name: 'Korean Street Food Breakfast', address: null, outdoor: false, forecast: null, bestTime: null, loading: false, error: '', highlight: false, dataFrom: '', locked: false },
        { hour: 12, duration: null, name: 'Gyeongbokgung Palace', address: '161 Sajik-ro, Jongno-gu, Seoul, South Korea', outdoor: true, forecast: null, bestTime: null, loading: false, error: '', highlight: false, dataFrom: '', locked: false },
        { hour: 14, duration: null, name: 'Namsan Park (Outdoor)', address: '231 Samil-daero, Jung-gu, Seoul, South Korea', outdoor: true, forecast: null, bestTime: null, loading: false, error: '', highlight: false, dataFrom: '', locked: false },
        { hour: 18, duration: 1.5, name: 'Dinner Reservation (Myeongdong Kyoja)', address: null, outdoor: false, forecast: null, bestTime: null, loading: false, error: '', highlight: false, dataFrom: '', locked: true },
        { hour: 20, duration: null, name: 'Itaewon Street', address: 'Itaewon-ro, Yongsan-gu, Seoul, South Korea', outdoor: true, forecast: null, bestTime: null, loading: false, error: '', highlight: false, dataFrom: '', locked: false }
      ],
      // Add to your data() return object in ItineraryView.vue:
    wishlist: [
      { name: 'Starfield Library (Indoor Mall)', address: '513 Yeongdong-daero, Gangnam-gu, Seoul', outdoor: false },
      { name: 'National Museum of Korea', address: '137 Seobinggo-ro, Yongsan-gu, Seoul', outdoor: false },
      { name: 'Lotte World Indoor Adventure', address: '240 Olympic-ro, Songpa-gu, Seoul', outdoor: false }
    ],
    selectedWishlistItem: null,

    // Update your resolveConflict() method:
    resolveConflict() {
      this.hasConflict = false
      this.isResolved = true
      
      const replacement = this.selectedWishlistItem || this.wishlist[1] // Default to National Museum if none selected
      
      for (const item of this.itinerary) {
        if (this.inRain(item)) {
          item.replacedFrom = item.name
          item.name = `${replacement.name} ✨ [Wishlist Replacement]`
          item.address = replacement.address
          item.outdoor = replacement.outdoor
          item.forecast = null
          item.highlight = true
        }
      }
      this.reportItinerary()
    }
    }
  },

  async mounted() {
    // The user's save d preferences (keeps the defaults if this fails)
    try {
      await loadPreferences()
    } catch (err) {
      console.warn('Could not load preferences, using defaults')
    }

    try {
      this.weather = await fetchWeatherForecast('Seoul')
      this.checkForWeatherConflicts()
    } catch (err) {
      console.warn('Could not load weather forecast, using fallback logic')
    }

    // Load each tracked stop's forecast from our server
    for (const item of this.itinerary) {
      if (!item.address) continue
      item.loading = true
      try {
        item.forecast = await getForecast(item.name, item.address)
        item.bestTime = item.forecast.bestTimeDefault
        if (item.duration === null) item.duration = item.forecast.durationDefault
      } catch (err) {
        item.error = this.errorText(err)
      }
      item.loading = false
    }
  },

  computed: {
    anyLoading() {
      for (const item of this.itinerary) {
        if (item.loading) return true
      }
      return false
    },

    // One entry per stop: crowd % now + a better time (if any)
    crowdInfo() {
      const result = []
      for (let i = 0; i < this.itinerary.length; i++) {
        const item = this.itinerary[i]
        const info = { busyness: null, suggestHour: null, reason: '', short: '', swap: null, closedToday: false }

        // Closed all day? (e.g. Gyeongbokgung Palace is closed on Tuesdays)
        if (item.forecast && item.forecast.days && item.forecast.days[this.tripDay] && item.forecast.days[this.tripDay].closed) {
          info.closedToday = true
        } else if (item.forecast && item.forecast.days && item.forecast.days[this.tripDay]) {
          info.busyness = busynessAt(item.forecast, this.tripDay, item.hour)

          // The other stops' times, so we don't suggest a clash
          const takenSlots = []
          for (let j = 0; j < this.itinerary.length; j++) {
            const other = this.itinerary[j]
            if (j !== i) {
              takenSlots.push({
                start: other.hour,
                duration: other.duration || 1,
                name: other.name,
                index: j,
                forecast: other.forecast, // so a swap also checks the OTHER stop's crowds
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
            prefs // from the preferences panel
          })
          // Locked stops keep their time: show crowds, but no suggestions
          if (!item.locked) {
            info.suggestHour = s.hour
            info.reason = s.reason // full explanation (shown on hover)
            info.swap = s.swap
            // One short line: "20% at 9:00 PM" or "Closed at 9:00 AM"
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

    checkForWeatherConflicts() {
      // Automatically flag if any outdoor activity encounters rain
      const conflictFound = this.itinerary.some(item => this.inRain(item))
      this.hasConflict = conflictFound && !this.isResolved
    },

    // Is this an outdoor stop that's happening during the 2pm rain?
    inRain(item) {
      if (!item.outdoor || item.locked) {
        return false
      }

      for (const w of this.weather) {
        if (
          w.rain &&
          w.time >= item.hour &&
          w.time < item.hour + (item.duration || 1)
        ) {
          return true
        }
      }
      return false
    },

    // A clear message for any failed request
    errorText(err) {
      if (err.response && err.response.data && err.response.data.message) return err.response.data.message
      if (err.response) return 'Server error (' + err.response.status + '). Check the server terminal.'
      return 'Server not reachable. Is it running?'
    },

    reportItinerary() {
      this.$emit('itinerary-change', this.itinerary)
    },

    

    // "Plan my day": work out new times for every stop and show a preview
    makePlan() {
      const stops = []
      for (let i = 0; i < this.itinerary.length; i++) {
        const item = this.itinerary[i]
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
        this.itinerary[row.index].hour = row.newHour
        this.itinerary[row.index].highlight = true
      }
      this.itinerary.sort((a, b) => a.hour - b.hour) // sort AFTER all changes (indexes point to the old order)
      this.plan = null
      await this.updateTransitTimes() // Recalculate transit spacing
      this.reportItinerary()
    },

    // Swap the times of two stops, e.g. tower <-> dinner
    async swapItems(a, b) {
      this.plan = null
      const first = this.itinerary[a]
      const second = this.itinerary[b]
      const temp = first.hour
      first.hour = second.hour
      second.hour = temp
      first.highlight = true
      second.highlight = true
      this.itinerary.sort((x, y) => x.hour - y.hour)
      await this.updateTransitTimes() // Recalculate transit spacing
      this.reportItinerary()
    },

    async moveItem(index, newHour) {
      this.plan = null
      this.itinerary[index].hour = newHour
      this.itinerary[index].highlight = true
      // Keep the day in time order
      this.itinerary.sort((a, b) => a.hour - b.hour)
      await this.updateTransitTimes() // Recalculate transit spacing
      this.reportItinerary()
    },

    async updateTransitTimes() {
    for (let i = 0; i < this.itinerary.length - 1; i++) {
      const currentStop = this.itinerary[i]
      const nextStop = this.itinerary[i + 1]

      if (currentStop.address && nextStop.address) {
        try {
          const transit = await fetchTravelTime(currentStop.address, nextStop.address)
          currentStop.transitToNext = transit.durationText
        } catch (err) {
          currentStop.transitToNext = '30 mins (est)'
        }
      }
    }
  }
  }
}
</script>
