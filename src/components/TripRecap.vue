<template>
  <!-- Recap tab: your trip in numbers, with its route on a map -->
  <section class="tr" aria-labelledby="tr-title">
    <div class="tr-head">
      <div>
        <p class="tr-kicker">{{ kicker }}</p>
        <h2 id="tr-title" class="tr-title">{{ name }}</h2>
      </div>
      <span class="tr-dates">{{ dateText }}</span>
    </div>
    <div class="tr-body">
      <TravelMap class="tr-map" :trips="mapTrips" :active-id="'this'" />
      <ul class="tr-stats">
        <li v-for="st in stats" :key="st.label" :class="{ big: st.big }">
          <b>{{ st.value }}</b><span>{{ st.label }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script>
import axios from 'axios'
import TravelMap from './TravelMap.vue'
import { codeForDestination } from '../destinations.js'
import { userSettings } from '../userSettings.js'
import { toHome } from '../expenses.js'

// Straight-line distance between two { lat, lon } points, in km
function kmBetween(a, b) {
  const r = Math.PI / 180
  const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

export default {
  components: { TravelMap },
  props: {
    tripId: { type: String, required: true },
    name: { type: String, default: '' },
    destinations: { type: Array, default: () => [] },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    travellers: { type: Array, default: () => [] },
    stopCount: { type: Number, default: 0 },
    phase: { type: String, default: 'during' } // 'before', 'during' or 'after' the trip
  },
  data() {
    return {
      places: {},     // destination -> { lat, lon }
      photoCount: null,
      spend: null     // { total, currency, other }
    }
  },
  computed: {
    kicker() {
      if (this.phase === 'before') return 'Your trip at a glance'
      if (this.phase === 'after') return 'Trip wrapped'
      return 'Your trip so far'
    },
    dateText() {
      if (!this.startDate) return ''
      const fmt = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      return this.endDate ? fmt(this.startDate) + ' – ' + fmt(this.endDate) : fmt(this.startDate)
    },
    // The route, in travel order, for the map
    mapTrips() {
      const points = []
      for (const d of this.destinations) {
        if (this.places[d]) points.push({ label: d, lat: this.places[d].lat, lon: this.places[d].lon })
      }
      return [{ id: 'this', name: this.name, done: false, points }]
    },
    stats() {
      let days = 0
      if (this.startDate && this.endDate) {
        // During the trip: only the days up to today. Before or after it: the whole trip.
        let end = new Date(this.endDate)
        if (this.phase === 'during') end = new Date(Math.min(Date.now(), end.getTime()))
        days = Math.max(1, Math.round((end - new Date(this.startDate)) / 86400000) + 1)
      }
      const countries = []
      for (const d of this.destinations) {
        const c = codeForDestination(d) || d.split(', ').pop()
        if (!countries.includes(c)) countries.push(c)
      }
      let km = 0
      for (let i = 1; i < this.destinations.length; i++) {
        const a = this.places[this.destinations[i - 1]]
        const b = this.places[this.destinations[i]]
        if (a && b) km += kmBetween(a, b)
      }
      const list = [
        { value: days || '–', label: days === 1 ? 'Day' : 'Days' },
        { value: this.stopCount, label: this.stopCount === 1 ? 'Stop' : 'Stops planned' },
        { value: this.destinations.length, label: this.destinations.length === 1 ? 'City' : 'Cities' },
        { value: countries.length, label: countries.length === 1 ? 'Country' : 'Countries' },
        { value: this.travellers.length, label: this.travellers.length === 1 ? 'Traveller' : 'Travellers' },
        { value: this.photoCount === null ? '…' : this.photoCount, label: this.photoCount === 1 ? 'Photo' : 'Photos' }
      ]
      const miles = userSettings.units === 'imperial'
      if (km >= 1) list.push({ value: Math.round(miles ? km * 0.621371 : km).toLocaleString(), label: (miles ? 'mi' : 'km') + ' between cities' })
      if (this.spend && this.spend.total > 0) {
        list.push({
          value: this.spend.currency + ' ' + Math.round(this.spend.total).toLocaleString(),
          label: 'spent together' + (this.spend.other ? ' (+' + this.spend.other + ' in other currencies)' : ''),
          big: true
        })
      }
      return list
    }
  },
  mounted() {
    this.loadPlaces()
    this.loadCounts()
  },
  methods: {
    async loadPlaces() {
      const names = this.destinations.slice(0, 20)
      if (!names.length) return
      const codes = []
      for (const n of names) codes.push(codeForDestination(n) || '')
      try {
        const res = await axios.get('/api/discover/cities', { params: { names: names.join('|'), codes: codes.join('|') } })
        const found = {}
        for (const c of res.data) found[c.label] = { lat: c.lat, lon: c.lon }
        this.places = found
      } catch (err) {
        // the map and distance just stay empty
      }
    },
    async loadCounts() {
      try {
        const res = await axios.get('/api/trips/' + this.tripId + '/photos')
        this.photoCount = Array.isArray(res.data) ? res.data.length : 0
      } catch (err) {
        this.photoCount = 0
      }
      try {
        const res = await axios.get('/api/trips/' + this.tripId + '/expenses')
        const home = res.data.homeCurrency || 'SGD'
        // Other currencies are converted like in Expenses: live rates, the group's own rates on top
        let rates = {}
        try {
          rates = (await axios.get('/api/rates', { params: { base: home } })).data.rates || {}
        } catch (err) {
          // without rates, other currencies are counted as "other"
        }
        for (const c in res.data.groupRates || {}) {
          const g = res.data.groupRates[c]
          if (g && g.base === home && g.rate > 0) rates[c] = g.rate
        }
        let total = 0
        let other = 0
        for (const e of res.data.items || []) {
          const amount = toHome(Number(e.amount) || 0, e.currency || home, rates, home)
          if (amount === null) other++
          else total += amount
        }
        this.spend = { total, currency: home === 'SGD' ? 'S$' : home, other }
      } catch (err) {
        this.spend = null
      }
    }
  }
}
</script>

<style scoped>
.tr {
  position: relative;
  z-index: 1;
  margin: 0;
  padding: 22px;
  border-radius: 24px;
  background: #fff;
  color: #001d2c;
  border: 1px solid #ece4d6;
  box-shadow: 0 8px 22px rgba(0, 29, 44, 0.08);
}
.tr-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
}
.tr-kicker {
  margin: 0;
  color: #c98a1e;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.tr-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 800;
}
.tr-dates {
  color: #5b6b75;
  font-weight: 600;
}
.tr-body {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 16px;
}
.tr-map {
  min-height: 240px;
}
.tr-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.tr-stats li {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 12px;
  border-radius: 16px;
  background: #f7f2ea;
}
.tr-stats li.big {
  grid-column: 1 / -1;
  background: #001d2c;
  color: #fff;
}
.tr-stats b {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.tr-stats li.big b {
  color: #edae49;
}
.tr-stats span {
  font-size: 12px;
  font-weight: 600;
  color: #5b6b75;
}
.tr-stats li.big span {
  color: rgba(255, 255, 255, 0.75);
}
@media (max-width: 760px) {
  .tr { margin: 20px 0 0; padding: 16px; }
  .tr-body { grid-template-columns: minmax(0, 1fr); }
  .tr-map { min-height: 200px; }
  .tr-stats b { font-size: 1.3rem; }
}
</style>
