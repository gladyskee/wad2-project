<template>
  <div>
    <!-- Pop-up notice: stays on screen while scrolling, closes by itself -->
    <div v-if="notice" class="notice-popup alert shadow d-flex align-items-start gap-2" :class="'alert-' + noticeType" role="alert">
      <span class="flex-grow-1">{{ notice }}</span>
      <button type="button" class="btn-close" aria-label="Close" @click="notice = ''"></button>
    </div>

    <!-- Smart Schedule: hours, crowds, buffer, and what the scheduler is doing -->
    <SchedulePanel :save-status="saveStatus" :status="plannerStatus" />

    <!-- Weather: the live forecast, or made-up days for a demo (only on this browser) -->
    <p class="weather-mode small">
      <label><input v-model="simulateWeather" type="checkbox" data-testid="simulate-weather"> Simulate weather (demo)</label>
      <span v-if="weatherError && !simulateWeather" class="text-muted"> · Live forecast unavailable right now</span>
    </p>

    <!-- The itinerary: day navigator, timeline with weather + crowd icons, saved places drawer -->
    <ItineraryPlanner :days="dayList" :selected-date="selectedDate" :stops="itinerary"
      :wishlist="allWishlist" :scheduled-names="scheduledNames" :day-name="tripDay" :weather-blocks="dayWeather" :typical="typicalWeather" :prefs="dayPrefs"
      :can-add-day="!isDemo && !!startDate" :day-counts="dayCounts" :locked-by-day="lockedByDay" :day-issues="dayIssues" :destinations="destinations" :saved-routes="savedRoutes" :travellers="travellers"
      @select-day="selectDay" @add-day="addDay" @remove-day="removeDay" @undo-day="undoDay" @add-place="openAddPlace" @go-vote="openVote"
      @apply="applyOptimized" @lock="setLocked" @schedule="scheduleWish" @unschedule="unscheduleStop" @status="plannerStatus = $event"
      @duration="setDuration" @move-day="moveToDay" @swap="swapWithWish" @edit="editStop" @open-transport="$emit('open-transport')"/>
  </div>
</template>

<script>
import axios from 'axios'
import SchedulePanel from './SchedulePanel.vue'
import ItineraryPlanner from './ItineraryPlanner.vue'
import { prefs, loadPreferences } from '../preferences.js'
import { getForecast } from '../crowd.js'
import { fetchTravelTime } from '../services/maps.js'
import { fetchWeatherForecast, packingWeather } from '../services/weatherService.js'
import { trip, loadDemo, loadFromServer, savedShape, savedBase, markSaved, runtimeStop, newId } from '../itineraryStore.js'
import { savedRoutesFromDb, fetchSavedRoutes } from '../savedRoutes.js'
import { codeForDestination, COUNTRY_CODES } from '../destinations.js'
import DISCOVER from '../data/discoverCities.json'

// "Simulate weather" is remembered on this browser (the demo trip always simulates)
function readSimulate(tripId) {
  if (tripId === 'seoul') return true
  try {
    return localStorage.getItem('chuise-simulate-weather') === '1'
  } catch (err) {
    return false
  }
}

// Everyone's votes, as text (to notice new votes from the group)
function votesKey(list) {
  const out = []
  for (const w of list || []) out.push(w.id + ':' + (w.votes || []).slice().sort().join(','))
  return out.join('|')
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default {
  components: { SchedulePanel, ItineraryPlanner },
  emits: ['itinerary-change', 'set-end-date', 'go-places', 'open-transport', 'weather-change'],
  props: {
    tripId: { type: String, default: 'seoul' }, // 'seoul' = the demo trip (not saved)
    destination: { type: String, default: '' },
    destinations: { type: Array, default: () => [] },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    initialStops: { type: Array, default: () => [] },
    initialWishlist: { type: Array, default: () => [] },
    initialVersion: { type: Number, default: 0 },
    travellers: { type: Array, default: () => [] } // names, for the "majority of the group" rule on saved places
  },
  data() {
    return {
      selectedDate: '', // 'YYYY-MM-DD'
      plannerStatus: { kind: 'idle', text: 'Add places to this day and the schedule balances itself.' },
      weather: [], // every forecast entry: { date, time, span, condition, rain }
      weatherError: false,
      simulateWeather: readSimulate(this.tripId), // demo: made-up weather instead of the live forecast
      climate: [], // typical weather by month for each destination (for days beyond the 5-day forecast)
      climateRetried: false,
      mapsOff: false, // true once the server says Google Maps isn't set up
      saveStatus: '',
      notice: '',           // text of the pop-up (empty = hidden)
      noticeType: 'warning', // 'warning' (yellow) or 'info' (blue)
      tripVersion: 0, // the version of the trip we last saved or loaded
      saving: false,
      loaded: false,
      lastSavedKey: ''
    }
  },

  async mounted() {
    // Start from this trip's saved data (or the demo)
    if (this.isDemo) loadDemo()
    else loadFromServer({ stops: this.initialStops, wishlist: this.initialWishlist})
    this.tripVersion = this.initialVersion
    
    const firstStopDay = trip.stops.map((s) => s.date).sort()[0]
    this.selectedDate = firstStopDay || this.dayList[0] || ''

    await this.loadWeather()

    // The user's saved preferences (keeps the defaults if this fails)
    try {
      await loadPreferences()
    } catch (err) {
      console.warn('Could not load preferences, using defaults')
    }

    this.loadClimate() // in the background: typical weather for days with no forecast

    // Load each tracked stop's forecast from our server (in parallel)
    await Promise.all(trip.stops.map((item) => this.loadForecast(item)))

    await this.updateTransitTimes()
    this.reportItinerary()

    // From here on, changes are saved
    this.lastSavedKey = this.persistKey
    this.loaded = true

    // Shared trips: check every 30 seconds whether someone else changed it
    if (!this.isDemo) this.pollTimer = setInterval(this.pollTrip, 30000)

    // get trip id for transport options feature
    fetchSavedRoutes(this.tripId);

  },

  beforeUnmount() {
    clearInterval(this.pollTimer)
    clearTimeout(this.noticeTimer)
    // Don't lose a change made just before leaving the page
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveNow()
    }
  },

  watch: {
    simulateWeather(on) {
      try {
        localStorage.setItem('chuise-simulate-weather', on ? '1' : '0')
      } catch (err) {
        // private mode: just for this visit
      }
      this.loadWeather()
    },
    // If typical weather couldn't load (e.g. the server was restarting), try again when the day changes
    selectedDate() {
      if (!this.climate.length) this.loadClimate()
    },
    // Fires whenever anything worth saving changes
    persistKey(key) {
      if (!this.loaded || this.isDemo || key === this.lastSavedKey) return
      this.saveStatus = 'Saving…'
      clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(this.saveNow, 800)
    },
    // transport
    tripId(newId) {
      if (newId) {
        fetchSavedRoutes(newId);
      }
    }

  },

  computed: {
    // The user's day start/end (Preferences), for the day optimizer
    dayPrefs() {
      return prefs
    },
    // For the planner's "Unscheduled" drawer: every wishlist place, and the names already planned
    allWishlist() {
      return trip.wishlist
    },
    // Stops per day (the planner says how many go back to Saved places when the last day is removed)
    dayCounts() {
      const counts = {}
      for (const s of trip.stops) counts[s.date] = (counts[s.date] || 0) + 1
      return counts
    },
    // A locked stop (booking) per day: those days can't be removed
    lockedByDay() {
      const days = {}
      for (const s of trip.stops) if (s.locked) days[s.date] = s.name
      return days
    },
    scheduledNames() {
      return trip.stops.map((s) => s.name)
    },
    isDemo() {
      return this.tripId === 'seoul'
    },
    // The selected day is too far ahead for a forecast: what's the weather usually like that month?
    typicalWeather() {
      if (!this.selectedDate || !this.climate.length) return null
      const m = Number(this.selectedDate.slice(5, 7)) - 1
      // Words that say which city this day is in: the stops' names and addresses, and the city they were saved under
      let text = ''
      for (const s of this.itinerary) {
        text += ' ' + (s.name || '') + ' ' + (s.address || '')
        const saved = trip.wishlist.find((w) => w.name === s.name)
        if (saved && saved.city) text += ' ' + saved.city
      }
      text = text.toLowerCase()
      // The city this day's stops mention ("Time Out Market Lisboa" -> Lisbon), else the first city with data
      let pick = null
      for (const c of this.climate) {
        if (!c.temp || c.temp[m] == null) continue
        const city = c.label.split(', ')[0].toLowerCase()
        if (text.includes(city) || text.includes(city.slice(0, 4))) { pick = c; break }
        if (!pick) pick = c
      }
      if (!pick) return null
      return { month: MONTH_NAMES[m], place: pick.label.split(', ')[0], temp: pick.temp[m], rainyDays: pick.rain ? pick.rain[m] : null }
    },
    // What's worth saving, as text. Votes are left out: each vote is saved on its own (PlacesVoting).
    persistKey() {
      const shape = savedShape()
      for (const w of shape.wishlist) delete w.votes
      return JSON.stringify(shape)
    },

    // The days of the trip: the date range if set, otherwise the days that have stops
    dayList() {
      if (this.startDate) {
        const end = this.endDate || this.startDate
        const days = []
        const d = new Date(this.startDate)
        const last = new Date(end)
        while (d <= last && days.length < 31) {
          days.push(d.toISOString().slice(0, 10)) // "2026-10-12"
          d.setUTCDate(d.getUTCDate() + 1)        // move to the next day
        }
        return days
      }
      // No date range: use the days that have stops
      const dates = []
      for (const stop of trip.stops) {
        if (!dates.includes(stop.date)) dates.push(stop.date)
      }
      return dates.sort()
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

    anyLoading() {
      return trip.stops.some((item) => item.loading)
    },
    // Routes saved in "Getting around" (from the database), shown in a stop's Details
    savedRoutes() {
      return Array.isArray(savedRoutesFromDb.value) ? savedRoutesFromDb.value : [] // an error answer is not a list
    },

    // For the day strip and All days grid: how full each day is, and how many things need a look
    // (outdoors in the rain, closed that day, or more planned than your active hours)
    dayIssues() {
      const result = {}
      const hours = Math.max(1, (prefs.dayEnd || 23) - (prefs.dayStart || 8))
      for (const d of this.dayList) {
        const dayName = DAY_NAMES[new Date(d + 'T00:00:00').getDay()]
        let issues = 0
        let planned = 0
        for (const s of trip.stops) {
          if (s.date !== d) continue
          const dur = s.duration || 1
          planned += dur
          let wet = false
          for (const w of this.weather) {
            if (w.date === d && w.rain && w.time < s.hour + dur && w.time + (w.span || 3) > s.hour) wet = true
          }
          if (s.outdoor && !s.locked && wet) issues++
          const day = s.forecast && s.forecast.days && s.forecast.days[dayName]
          if (day && day.closed) issues++
        }
        if (planned > hours) issues++
        result[d] = { issues, load: planned / hours }
      }
      return result
    }
  },
  methods: {
    // Day optimizer: new times (after Apply, or after dragging a stop)
    async applyOptimized(changes) {
      for (const c of changes) {
        const stop = trip.stops.find((s) => s.id === c.id)
        if (stop) stop.hour = c.hour
      }
      await this.updateTransitTimes()
      this.reportItinerary()
    },
    // Planner: new time at a place, plus the re-timed day
    async setDuration(id, hours, changes) {
      const stop = trip.stops.find((s) => s.id === id)
      if (stop) stop.duration = hours
      await this.applyOptimized(changes)
    },
    // ---------- from a stop's sheet (each one can be undone from the planner's toast) ----------
    async moveToDay(id, date) {
      const stop = trip.stops.find((s) => s.id === id)
      if (!stop) return
      this.snapshotDays()
      stop.date = date
      await this.updateTransitTimes()
      this.reportItinerary()
    },
    // Rain: an indoor saved place takes this stop's time; the old stop goes back to Saved places
    async swapWithWish(id, wishId) {
      const stop = trip.stops.find((s) => s.id === id)
      const pick = trip.wishlist.find((w) => w.id === wishId)
      if (!stop || !pick) return
      this.snapshotDays()
      const known = trip.wishlist.some((w) => w.name.toLowerCase() === stop.name.toLowerCase())
      if (!known) {
        const city = this.destinations.length === 1 ? this.destinations[0] : null
        trip.wishlist.push({ id: newId('w'), name: stop.name, address: stop.address, outdoor: stop.outdoor, type: 'custom', city, votes: [] })
      }
      stop.name = pick.name
      stop.address = pick.address || null
      stop.outdoor = !!pick.outdoor
      stop.duration = pick.duration || null
      stop.forecast = null
      stop.dataFrom = ''
      await this.loadForecast(stop)
      if (!stop.duration) stop.duration = 1.5
      await this.updateTransitTimes()
      this.reportItinerary()
    },
    async editStop(id, fields) {
      const stop = trip.stops.find((s) => s.id === id)
      if (!stop) return
      this.snapshotDays()
      const placeChanged = fields.name !== stop.name || fields.address !== stop.address
      stop.name = fields.name
      stop.address = fields.address
      stop.outdoor = fields.outdoor
      // A different place needs its own crowd data
      if (placeChanged) {
        stop.forecast = null
        stop.dataFrom = ''
        stop.error = ''
        await this.loadForecast(stop)
      }
      await this.updateTransitTimes()
      this.reportItinerary()
    },
    setLocked(id, locked) {
      const stop = trip.stops.find((s) => s.id === id)
      if (stop) stop.locked = locked
    },
    // A wishlist place dropped onto the planner's timeline ('__new' in changes = this new stop)
    async scheduleWish(w, changes) {
      const stop = runtimeStop({ id: newId('s'), name: w.name, address: w.address || null, date: this.selectedDate, hour: 0, duration: w.duration || 1.5, outdoor: !!w.outdoor })
      trip.stops.push(stop)
      await this.applyOptimized(changes.map((c) => (c.id === '__new' ? { ...c, id: stop.id } : c)))
      this.loadForecast(stop)
    },
    // Planner: a stop goes back to the wishlist (Undo restores it via undoDay)
    async unscheduleStop(id) {
      const stop = trip.stops.find((s) => s.id === id)
      if (!stop) return
      this.snapshotDays()
      const known = trip.wishlist.some((w) => w.name.toLowerCase() === stop.name.toLowerCase())
      if (!known) {
        // A stop added straight to the itinerary: file it under the trip's city when there's only one
        const city = this.destinations.length === 1 ? this.destinations[0] : null
        trip.wishlist.push({ id: newId('w'), name: stop.name, address: stop.address, outdoor: stop.outdoor, type: 'custom', city, votes: [] })
      }
      trip.stops = trip.stops.filter((s) => s.id !== id)
      await this.updateTransitTimes()
      this.reportItinerary()
    },
    // ---------- adding / removing days (the planner has already asked to confirm) ----------
    shiftDate(d, days) {
      const date = new Date(d + 'T00:00:00Z')
      date.setUTCDate(date.getUTCDate() + days)
      return date.toISOString().slice(0, 10)
    },
    // Remember how things were, for Undo
    snapshotDays() {
      this.dayUndo = { ...savedShape(), endDate: this.endDate, selectedDate: this.selectedDate }
    },
    addDay() {
      this.snapshotDays()
      this.$emit('set-end-date', this.shiftDate(this.endDate || this.startDate, 1))
    },
    // Save the stops now (not in 800 ms), then change the end date: the server checks
    // that no stop is left outside the trip's dates, so the stops have to be saved first
    async saveThenSetEnd(endDate) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      if (this.persistKey !== this.lastSavedKey) await this.saveNow()
      this.$emit('set-end-date', endDate)
    },
    // Stops on the day go back to the wishlist; later days move one day earlier; the trip gets a day shorter.
    // Locked stops are bookings on a real date, so they never move: unlock them first.
    async removeDay(date) {
      const booked = trip.stops.find((s) => s.locked && s.date >= date)
      if (booked) {
        this.showNotice(booked.name + ' is locked to ' + booked.date + ' (a booking), so this day can\'t be removed. Unlock it or move it first.')
        return
      }
      this.snapshotDays()
      const keep = []
      for (const s of trip.stops) {
        if (s.date === date) {
          const known = trip.wishlist.some((w) => w.name.toLowerCase() === s.name.toLowerCase())
          if (!known) trip.wishlist.push({ id: newId('w'), name: s.name, address: s.address, outdoor: s.outdoor, type: 'custom', city: null, votes: [] })
        } else {
          if (s.date > date) s.date = this.shiftDate(s.date, -1)
          keep.push(s)
        }
      }
      trip.stops = keep
      const newEnd = this.shiftDate(this.endDate, -1)
      if (this.selectedDate > newEnd) this.selectDay(newEnd)
      await this.updateTransitTimes()
      this.reportItinerary()
      await this.saveThenSetEnd(newEnd)
    },
    async undoDay() {
      const u = this.dayUndo
      if (!u) return
      this.dayUndo = null
      loadFromServer({ stops: u.stops, wishlist: u.wishlist, version: this.tripVersion }, { local: true })
      this.selectDay(u.selectedDate)
      await Promise.all(trip.stops.map((item) => this.loadForecast(item)))
      await this.updateTransitTimes()
      this.reportItinerary()
      if (u.endDate !== this.endDate) await this.saveThenSetEnd(u.endDate)
    },
    // "Add stop": places are found and saved in the Places tab, then dragged onto a day here
    // "Add stop": go to Places, telling it which day to come back to
    openAddPlace() {
      const i = this.dayList.indexOf(this.selectedDate)
      this.$emit('go-places', { date: this.selectedDate, day: i >= 0 ? 'Day ' + (i + 1) : 'your itinerary' })
    },
    // "Vote" on a place that's waiting for votes: open Group decisions, with a way back
    openVote() {
      const i = this.dayList.indexOf(this.selectedDate)
      this.$emit('go-places', { date: this.selectedDate, day: i >= 0 ? 'Day ' + (i + 1) : 'your itinerary', tab: 'vote' })
    },
    // "Dinner Reservation (Myeongdong Kyoja)" -> "Dinner Reservation"
    shortName(name) {
      return name.split(' (')[0]
    },

    selectDay(d) {
      this.selectedDate = d
    },

    // Show a pop-up message that hides itself after 8 seconds
    showNotice(message, type = 'warning') {
      this.notice = message
      this.noticeType = type
      clearTimeout(this.noticeTimer)
      this.noticeTimer = setTimeout(() => { this.notice = '' }, 8000)
    },

    // ---------- saving ----------
    async saveNow() {
      this.saveTimer = null
      if (this.isDemo) return
      // A save is already running: try again shortly, so the version numbers don't clash
      if (this.saving) {
        this.saveTimer = setTimeout(this.saveNow, 500)
        return
      }
      this.saving = true
      const key = this.persistKey
      const shape = savedShape() // (with votes: the server keeps everyone else's as they are)
      const body = { ...shape, version: this.tripVersion, base: savedBase() }
      try {
        const res = await axios.put('/api/trips/' + this.tripId + '/itinerary', body)
        if (res.data.merged) {
          // Someone else saved too: the server kept both changes, show them
          await this.applyServerTrip(res.data.trip)
          this.saveStatus = 'All changes saved (with your group\'s latest changes)'
        } else {
          markSaved(shape)
          this.tripVersion = res.data.version
          this.lastSavedKey = key
          this.saveStatus = 'All changes saved'
        }
      } catch (err) {
        if (err.response && err.response.status === 409) {
          // Someone else saved first: show their version instead of overwriting it
          this.saveStatus = 'Someone else changed this trip, so their version was loaded.'
          this.showNotice('Someone in your group changed the same days at the same time as you, so their version was loaded. Your last change to the days was not saved, so please redo it.')
          await this.applyServerTrip(err.response.data.trip)
        } else if (err.response && err.response.data && err.response.data.message) {
          this.saveStatus = err.response.data.message
          this.showNotice(err.response.data.message + ' Your last change was not saved.')
          this.lastSavedKey = key // don't keep retrying the same change
        } else {
          this.saveStatus = 'Could not save changes. Is the server running?'
        }
      }
      this.saving = false
    },

    // Replace what is on screen with a saved version from the server
    async applyServerTrip(saved) {
      loadFromServer({ stops: saved.stops, wishlist: saved.wishlist })
      this.tripVersion = saved.version
      this.lastSavedKey = this.persistKey // so this load doesn't trigger a save
      await Promise.all(trip.stops.map((item) => this.loadForecast(item)))
      await this.updateTransitTimes()
      this.reportItinerary()
    },

    // Every 30 seconds: has someone else changed this trip?
    async pollTrip() {
      // Don't interrupt anything the user is in the middle of
      if (!this.isDemo) fetchSavedRoutes(this.tripId) // routes saved in Getting around by anyone
      if (this.isDemo || this.saveTimer || this.saving || this.anyLoading) return
      if (this.persistKey !== this.lastSavedKey) return // we have unsaved changes of our own
      try {
        const res = await axios.get('/api/trips/' + this.tripId)
        if (res.data.version !== this.tripVersion || votesKey(res.data.wishlist) !== votesKey(trip.wishlist)) {
          await this.applyServerTrip(res.data)
          this.saveStatus = 'Updated with changes from your group'
          this.showNotice('Your group made changes, so this itinerary was updated.', 'info')
        }
      } catch (err) {
        // ignore, we'll try again in 30 seconds
      }
    },
    

    async removeStop(stop) {
      trip.stops = trip.stops.filter((s) => s.id !== stop.id)
      await this.updateTransitTimes()
      this.reportItinerary()
    },

    // ---------- crowd data ----------
    // Load one stop's crowd forecast (stops without an address aren't tracked)
    async loadForecast(item) {
      // No address: look it up by name in the trip's city (breaks like "Lunch" are skipped)
      const where = item.address || (/^(breakfast|brunch|lunch|dinner|supper)( break)?$/i.test((item.name || '').trim()) ? '' : this.destination)
      if (!where) return
      item.loading = true
      item.error = ''
      try {
        item.forecast = await getForecast(item.name, where)
        item.bestTime = item.forecast.bestTimeDefault
        if (item.duration === null) item.duration = item.forecast.durationDefault
      } catch (err) {
        item.error = this.errorText(err)
      }
      item.loading = false
    },

    // Last year's weather by month for the trip's destinations (Open-Meteo, free, cached on the server)
    // A country on its own ("china") has no single weather, so use one of its cities:
    // the one the stops mention (e.g. "Statue of Mao Zedong, Chengdu"), else its best-known city
    cityForClimate(name) {
      if (name.includes(', ')) return name
      let country = ''
      for (const c in COUNTRY_CODES) {
        if (c.toLowerCase() === name.trim().toLowerCase()) country = c
      }
      if (!country) return name
      let text = ''
      for (const s of trip.stops) text += ' ' + (s.name || '') + ' ' + (s.address || '')
      text = text.toLowerCase()
      let best = null
      for (const city of DISCOVER.cities) {
        if (city.country !== country) continue
        if (text.includes(city.cityName.toLowerCase())) return city.cityName + ', ' + country
        if (!best || city.popularityRank < best.popularityRank) best = city
      }
      return best ? best.cityName + ', ' + country : name
    },
    async loadClimate() {
      if (this.isDemo) return
      const picked = (this.destinations.length ? this.destinations : [this.destination]).filter(Boolean).slice(0, 10)
      const names = []
      for (const n of picked) names.push(this.cityForClimate(n))
      if (!names.length) return
      const codes = []
      for (const n of names) codes.push(codeForDestination(n) || '')
      try {
        const res = await axios.get('/api/discover/cities', { params: { names: names.join('|'), codes: codes.join('|') } })
        this.climate = Array.isArray(res.data) ? res.data : []
        this.reportWeather()
      } catch (err) {
        this.climate = [] // days beyond the forecast show "–" for now
      }
      // Nothing came back: try once more in 15 seconds (the server may have been restarting)
      if (!this.climate.length && !this.climateRetried) {
        this.climateRetried = true
        setTimeout(() => this.loadClimate(), 15000)
      }
    },
    // ---------- weather ----------
    // The live forecast for the first destination (or the demo weather), then tell Packing what to expect
    async loadWeather() {
      try {
        this.weather = await fetchWeatherForecast({ q: this.destination, dates: this.dayList, simulate: this.simulateWeather })
        this.weatherError = false
      } catch (err) {
        this.weather = []
        this.weatherError = true
      }
      this.reportWeather()
    },
    reportWeather() {
      this.$emit('weather-change', packingWeather({ blocks: this.weather, climate: this.climate, dates: this.dayList }))
    },

    // ---------- transit ----------
    // Travel time from every stop to the next (all requests run at once)
    async updateTransitTimes() {
      // Travel times come from Google Maps; without a Google key on the server, stop asking
      // (the planner works out walking/transit times itself from the distance between stops)
      if (this.mapsOff) return
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
          if (err.response && err.response.status === 503) this.mapsOff = true
          stop.transitToNext = null // no real time: the planner estimates this leg from the distance
          stop.transitSecs = 0
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

  }
}
</script>

<style scoped>
.weather-mode {
  margin: 0 0 12px;
  color: var(--app-muted, #5a6b78);
}

.weather-mode input {
  margin-right: 6px;
}

.notice-popup {
  position: fixed;
  top: 70px;                 /* just below the navbar */
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  max-width: 560px;
  z-index: 1080;             /* above the page content */
}
</style>