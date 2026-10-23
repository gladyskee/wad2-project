<template>
  <div class="dx" :class="{ 'has-tray': shortlist.length }" :style="{ '--dx-top-h': topHeight + 'px' }">
    <!-- Discover: filter by dates, budget and vibe; countries on the left, a 3D pillar map on the right,
         and a shortlist tray docked at the bottom -->
    <!-- ===== Filters ===== -->
    <header ref="topEl" class="dx-top glass">
      <div class="dx-brand">
        <!-- Inside a country, the always-visible back button returns to all countries -->
        <button v-if="openName" type="button" class="dx-back" aria-label="Back to all countries" title="Back to all countries (Esc)" @click="unfocus">‹</button>
        <router-link v-else :to="auth.token ? '/home' : '/'" class="dx-back" :aria-label="auth.token ? 'Back to my trips' : 'Back to the start'">‹</router-link>
        <div>
          <nav v-if="openName" class="dx-crumbs" aria-label="You are here">
            <button type="button" class="dx-crumb" @click="unfocus">All countries</button>
            <span aria-hidden="true">›</span>
            <h1 class="dx-title">{{ openName }}</h1>
          </nav>
          <h1 v-else class="dx-title">Where to next?</h1>
          <p v-if="openName" class="dx-sub">Tap ‹ or press Esc to see all countries</p>
          <p v-else class="dx-sub">{{ visibleCities.length }} {{ visibleCities.length === 1 ? 'place' : 'places' }} across {{ groups.length }} {{ groups.length === 1 ? 'country' : 'countries' }}, ranked for you</p>
        </div>
      </div>
      <div class="dx-filters" data-tour="vibe-filters">
        <div class="dx-dates" role="group" aria-label="Travel dates">
          <input v-model="start" type="date" :min="today" aria-label="From" class="dx-input">
          <span aria-hidden="true">→</span>
          <input v-model="end" type="date" :min="start || today" aria-label="To" class="dx-input">
        </div>
        <div class="dx-seg" role="group" aria-label="Daily budget">
          <button v-for="b in BUDGETS" :key="b.value" type="button" :class="{ on: budget === b.value }" :aria-pressed="budget === b.value"
            :title="b.title" @click="budget = b.value">{{ b.label }}</button>
        </div>
        <!-- Vibe: a dropdown where you can tick more than one -->
        <div class="dx-dd" @keydown.esc="vibeOpen = false">
          <button type="button" class="dx-dd-btn" :class="{ on: vibes.length }" aria-haspopup="true" :aria-expanded="vibeOpen" @click.stop="vibeOpen = !vibeOpen">
            {{ vibeLabel }} <span class="dx-dd-caret" aria-hidden="true">▾</span>
          </button>
          <transition name="dx-pop">
            <div v-if="vibeOpen" class="dx-dd-menu glass" role="group" aria-label="Vibe" @click.stop>
              <button v-for="v in VIBES" :key="v.key" type="button" class="dx-dd-item" :class="{ on: vibes.includes(v.key) }"
                role="menuitemcheckbox" :aria-checked="vibes.includes(v.key)" @click="toggleVibe(v.key)">
                <span class="dx-dd-check" aria-hidden="true">{{ vibes.includes(v.key) ? '✓' : '' }}</span>
                {{ v.icon }} {{ v.key }}
              </button>
              <button v-if="vibes.length" type="button" class="dx-dd-clear" @click="vibes = []">Clear vibes</button>
            </div>
          </transition>
        </div>
      </div>
      <button v-if="!auth.token" type="button" class="dx-signin" @click="askToSignIn('')">Sign in</button>

      <!-- Search: a big pill like on travel sites, with suggestions as you type -->
      <div class="dx-search" :class="{ open: suggestOpen && suggestions.length }">
        <svg class="dx-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <input ref="searchEl" v-model="search" type="text" class="dx-search-input" placeholder="Search a city or country, e.g. Kyoto or Japan"
          role="combobox" aria-autocomplete="list" aria-controls="dx-suggest" :aria-expanded="suggestOpen && suggestions.length > 0"
          :aria-activedescendant="activeSuggest >= 0 ? 'dx-sg-' + activeSuggest : null" aria-label="Search a city or country"
          autocomplete="off" spellcheck="false" @input="suggestOpen = true; activeSuggest = -1" @focus="suggestOpen = true"
          @blur="closeSuggest" @keydown="onSearchKey">
        <button v-if="search" type="button" class="dx-search-clear" aria-label="Clear search" @mousedown.prevent @click="clearSearch">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <kbd v-else class="dx-search-kbd" aria-hidden="true" title="Press / to search">/</kbd>

        <ul v-if="suggestOpen && suggestions.length" id="dx-suggest" class="dx-suggest" role="listbox" aria-label="Suggestions">
          <li v-for="(sg, i) in suggestions" :id="'dx-sg-' + i" :key="sg.key" role="option" :aria-selected="i === activeSuggest"
            class="dx-sg" :class="{ active: i === activeSuggest }" @mousedown.prevent="pickSuggest(sg)" @mouseenter="activeSuggest = i">
            <span class="dx-sg-flag" aria-hidden="true">{{ sg.flag }}</span>
            <span class="dx-sg-text">
              <strong>{{ sg.label }}</strong>
              <small>{{ sg.sub }}</small>
            </span>
            <span class="dx-sg-kind">{{ sg.kind === 'country' ? 'Country' : 'City' }}</span>
          </li>
        </ul>
      </div>
      <p v-if="dateError" class="dx-error" role="alert">{{ dateError }}</p>
    </header>

    <div class="dx-split">
      <!-- ===== Feed: one card per country, its cities in a swipeable row ===== -->
      <section ref="feedEl" class="dx-feed" aria-label="Destinations">
        <article v-for="g in groups" :key="g.country" :data-country="g.country" class="dx-country glass" :class="{ lit: hoverCountry === g.country, focused: focusCountry === g.country }"
          @mouseenter="hoverCountry = g.country" @mouseleave="hoverCountry = null" @click="openCountryCard($event, g.country)">
          <!-- Opened country: a photo header -->
          <div v-if="focusCountry === g.country" class="dx-hero" :class="{ nophoto: !countryPhotos[g.country] }" :style="countryPhotos[g.country] ? { backgroundImage: 'linear-gradient(180deg, rgba(0, 38, 58,0) 40%, rgba(0, 38, 58,0.9)), url(' + countryPhotos[g.country] + ')' } : null">
            <button type="button" class="dx-hero-back" @click="unfocus">‹ All countries</button>
            <h2 class="dx-hero-name">{{ flag(g.cc) }} {{ g.country }}</h2>
          </div>
          <header class="dx-country-head">
            <button v-if="focusCountry !== g.country" type="button" class="dx-country-btn" :aria-label="'Explore ' + g.country" @click="focus(g.country)">
              <h2 class="dx-country-name">{{ flag(g.cc) }} {{ g.country }} <span class="dx-explore" aria-hidden="true">Explore ›</span></h2>
              <p class="dx-tagline">{{ g.tagline }}</p>
            </button>
            <p v-else class="dx-tagline big">{{ g.tagline }}</p>
            <div class="dx-country-meta">
              <span class="dx-score-pill" :title="'Best match in ' + g.country">{{ g.best }}</span>
              <span v-if="g.gems" class="dx-gems">+{{ g.gems }} hidden gem{{ g.gems === 1 ? '' : 's' }}</span>
            </div>
          </header>

          <div class="dx-row" role="list" :aria-label="'Cities in ' + g.country">
            <article v-for="c in g.cities" :key="c.id" :ref="(el) => { if (el) cardEls[c.id] = el }" role="listitem"
              class="dx-city" :class="{ lit: hoverId === c.id, flash: flashId === c.id, gem: c.tier === 'extended' }"
              :style="photoStyle(c)" tabindex="0" :aria-label="'Show ' + c.cityName + ' on the map'"
              @mouseenter="hoverId = c.id" @mouseleave="hoverId = null" @focus="hoverId = c.id" @blur="hoverId = null"
              @click="showOnMap(c)" @keydown.enter.self="showOnMap(c)">
              <span v-if="c.tier === 'extended'" class="dx-gem-tag">Hidden gem</span>
              <button type="button" class="dx-heart" :class="{ on: liked(c.id) }" :aria-pressed="liked(c.id)"
                :aria-label="(liked(c.id) ? 'Remove ' : 'Add ') + c.cityName + (liked(c.id) ? ' from' : ' to') + ' your shortlist'"
                @click.stop="toggleLike(c, $event)"><AppIcon name="heart" :size="19" :filled="liked(c.id)" /></button>
              <div class="dx-city-body">
                <span class="dx-match">{{ c.score }}<small>/100</small></span>
                <h3 class="dx-city-name">{{ c.cityName }}</h3>
                <div class="dx-tags">
                  <span v-for="t in c.vibeTags" :key="t" :class="{ hit: vibes.includes(t) }">{{ t }}</span>
                </div>
                <p class="dx-facts">
                  <span :class="{ good: c.monthFit === 1 }">{{ c.monthFit === 1 ? '✓ Great time to go' : 'Best ' + monthsText(c.bestMonths) }}</span>
                  <span>~${{ c.estDailyBudget }}/day</span>
                </p>
              </div>
            </article>
          </div>

          <!-- Opened country: its top sights, to tempt you in (tap one to see its city on the map) -->
          <section v-if="focusCountry === g.country && sightsOf(g.country).length" class="dx-sights" :aria-label="'Top sights in ' + g.country">
            <h3 class="dx-sights-title">Top {{ sightsOf(g.country).length }} things to see</h3>
            <ol class="dx-sights-row">
              <li v-for="(a, i) in sightsOf(g.country)" :key="a.name">
                <button type="button" class="dx-sight" :style="sightStyle(a)" :aria-label="(i + 1) + '. ' + sightName(a) + ', near ' + a.city + '. Show on the map'" @click="showSight(g.country, a)">
                  <span class="dx-sight-rank" aria-hidden="true">{{ i + 1 }}</span>
                  <span class="dx-sight-text">
                    <strong>{{ sightName(a) }}</strong>
                    <small><AppIcon name="map-pin" :size="12" /> {{ a.city }}</small>
                  </span>
                </button>
              </li>
            </ol>
          </section>
        </article>
        <!-- A country without cities in Discover yet -->
        <article v-if="otherCountry" class="dx-country glass focused">
          <div class="dx-hero" :class="{ nophoto: !countryPhotos[otherCountry] }" :style="countryPhotos[otherCountry] ? { backgroundImage: 'linear-gradient(180deg, rgba(0, 38, 58,0) 40%, rgba(0, 38, 58,0.9)), url(' + countryPhotos[otherCountry] + ')' } : null">
            <button type="button" class="dx-hero-back" @click="unfocus">‹ All countries</button>
            <h2 class="dx-hero-name">{{ otherCountry }}</h2>
          </div>
          <p class="dx-tagline big">Not in Discover yet: we haven't hand-picked its cities. You can still plan a trip here and choose the places yourself.</p>
          <button type="button" class="dx-cta dx-other-cta" :disabled="!!dateError" @click="planOther">Plan a trip to {{ otherCountry }} →</button>
        </article>
        <p v-else-if="!groups.length && search.trim()" class="dx-empty glass">
          No city or country matches "{{ search.trim() }}". <button type="button" class="dx-link" @click="search = ''">Clear search</button>
        </p>
        <p v-else-if="!groups.length" class="dx-empty glass">No places match those vibes yet. Try another vibe.</p>
      </section>

      <!-- ===== 3D map ===== -->
      <section class="dx-mapwrap" aria-label="Map of destinations" data-tour="map-layer">
        <div ref="mapEl" class="dx-map"></div>
        <p v-if="mapError" class="dx-maperr glass">{{ mapError }}</p>
        <!-- Rotation slider (also follows right-click / two-finger rotating) -->
        <div class="dx-rotate glass">
          <label for="dx-rot" class="dx-rot-label">Rotate</label>
          <input id="dx-rot" v-model.number="rotation" type="range" min="-180" max="180" step="1" class="dx-rot-range"
            :aria-valuetext="rotation + ' degrees'" @input="rotateMap">
          <button type="button" class="dx-rot-reset" :disabled="rotation === 0" title="North up" aria-label="Reset rotation to north up" @click="rotation = 0; rotateMap()">N</button>
        </div>

        <!-- Glass tooltip over a hovered pillar -->
        <transition name="dx-pop">
          <div v-if="tip" class="dx-tip glass" :style="{ left: tip.x + 'px', top: tip.y + 'px' }" aria-hidden="true">
            <div class="dx-tip-photo" :style="photoStyle(tip.city)"></div>
            <div class="dx-tip-body">
              <strong>{{ flag(tip.city.cc) }} {{ tip.city.cityName }}</strong>
              <small>{{ tip.city.score }}/100 · ~${{ tip.city.estDailyBudget }}/day</small>
            </div>
            <p v-if="liked(tip.city.id)" class="dx-tip-hint"><AppIcon name="heart" :size="13" filled /> In your shortlist</p>
          </div>
        </transition>
      </section>
    </div>

    <!-- Confirm your trip: check the name, dates and city order, then create it -->
    <transition name="dx-pop">
      <div v-if="plan" class="dx-sheet-overlay" @click.self="plan = null" @keydown.esc="plan = null">
        <form class="dx-sheet glass" role="dialog" aria-modal="true" aria-labelledby="dx-sheet-title" @submit.prevent="createTrip">
          <button type="button" class="dx-sheet-x" aria-label="Close" @click="plan = null"><AppIcon name="x" :size="16" /></button>
          <h2 id="dx-sheet-title" class="dx-sheet-title">Confirm your trip</h2>

          <label for="dx-plan-name" class="dx-sheet-label">Trip name</label>
          <input id="dx-plan-name" v-model="plan.name" class="dx-input dx-sheet-input" maxlength="60">

          <span class="dx-sheet-label">Dates</span>
          <div class="dx-dates">
            <input v-model="plan.start" type="date" :min="today" aria-label="From" class="dx-input">
            <span aria-hidden="true">→</span>
            <input v-model="plan.end" type="date" :min="plan.start || today" aria-label="To" class="dx-input">
          </div>

          <span class="dx-sheet-label">Cities, in travel order</span>
          <ol class="dx-route">
            <li v-for="(c, i) in plan.cities" :key="c.id">
              <span class="dx-route-n">{{ i + 1 }}</span>
              <span class="dx-route-name">{{ flag(c.cc) }} {{ c.cityName }}</span>
              <button type="button" :disabled="i === 0" :aria-label="'Move ' + c.cityName + ' earlier'" @click="moveCity(i, -1)">↑</button>
              <button type="button" :disabled="i === plan.cities.length - 1" :aria-label="'Move ' + c.cityName + ' later'" @click="moveCity(i, 1)">↓</button>
              <button type="button" :aria-label="'Remove ' + c.cityName" @click="dropCity(i)"><AppIcon name="x" :size="14" /></button>
            </li>
          </ol>

          <p v-if="planError" class="dx-error" role="alert">{{ planError }}</p>
          <button type="submit" class="dx-cta dx-sheet-cta" :disabled="creating">{{ creating ? 'Creating your trip…' : 'Create trip →' }}</button>
        </form>
      </div>
    </transition>

    <AuthJoinModal :open="authOpen" initial-tab="signin" :reason="authReason" next="" @close="authOpen = false" @authed="startPlanning" />

    <!-- ===== Shortlist tray ===== -->
    <transition name="dx-tray">
      <aside v-if="shortlist.length" ref="trayEl" class="dx-tray glass" aria-label="Your shortlist" data-tour="shortlist-tray">
        <span class="dx-tray-count" aria-live="polite">{{ shortlist.length }}</span>
        <ul class="dx-tray-chips">
          <li v-for="c in shortlistCities" :key="c.id" class="dx-chip">
            {{ flag(c.cc) }} {{ c.cityName }}
            <button type="button" :aria-label="'Remove ' + c.cityName" @click="unlike(c.id)"><AppIcon name="x" :size="13" /></button>
          </li>
        </ul>
        <button type="button" class="dx-cta" :disabled="!!dateError" @click="startPlanning">
          Start planning with selected ({{ shortlist.length }}) →
        </button>
      </aside>
    </transition>

    <!-- First visit: three tip bubbles (filters, map, shortlist). Seen once per browser. -->
    <FeatureTour storage-key="chuise-tour-discover-v1" :steps="TOUR_STEPS" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import DATA from '../data/discoverCities.json'
import SIGHTS from '../data/countryAttractions.json'
import { PHOTO_CACHE } from '../photoCache.js'
import { flagEmoji } from '../destinations.js'
import { loadMapLibre } from '../services/maplibre.js'
import { topoFeatures, unwrapLongitudes } from '../topo.js'
import { shortlist, syncShortlist } from '../shortlist.js'
import { auth } from '../auth.js'
import AuthJoinModal from '../components/AuthJoinModal.vue'
import AppIcon from '../components/AppIcon.vue'
import FeatureTour from '../components/FeatureTour.vue'

// The first-visit tour (FeatureTour). Step 3 points at the first heart until the shortlist tray exists.
const TOUCH = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches // phones: "tap", not "hover"
const TOUR_STEPS = [
  { target: '[data-tour="vibe-filters"]', icon: 'sliders', title: 'Dial in your vibe',
    body: 'Filter destinations by travel style, season and budget.', cta: 'Next (1/3) →' },
  { target: '[data-tour="map-layer"]', icon: 'map', title: 'Interactive 3D map',
    body: (TOUCH ? 'Tap' : 'Hover over') + ' a pillar to preview the city. Taller, brighter pillars match you better. Tap a country to explore it.', cta: 'Next (2/3) →' },
  { target: '[data-tour="shortlist-tray"]', fallback: '.dx-heart', icon: 'heart', title: 'Stage your itinerary',
    body: 'Like cities to collect them in your shortlist. Once ready, hit Start planning to turn them into a trip.', cta: "Got it, let's explore! (3/3)" }
]
import { notify } from '../notify.js'

const router = useRouter()
const VIBES = [
  { key: 'Culture', icon: '🏛' },
  { key: 'Nature', icon: '🌿' },
  { key: 'Food & Nightlife', icon: '🍜' },
  { key: 'Slow Living', icon: '☕' }
]
const BUDGETS = [
  { value: 1, label: '$', title: 'Up to ~$60 a day', cap: 60 },
  { value: 2, label: '$$', title: 'Up to ~$150 a day', cap: 150 },
  { value: 3, label: '$$$', title: 'Anything goes', cap: 9999 }
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ---------- filters ----------
function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function inDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return iso(d)
}
const today = iso(new Date())
const start = ref(inDays(30))
const end = ref(inDays(37))
const budget = ref(2)
const vibes = ref([])
const search = ref('') // city or country name
const searchEl = ref(null)
const suggestOpen = ref(false)
const activeSuggest = ref(-1) // highlighted suggestion (arrow keys)
const dateError = computed(() => {
  if (!start.value || !end.value) return 'Pick both dates.'
  if (start.value < today) return 'Pick a start date from today onwards.'
  if (end.value < start.value) return 'The end date is before the start date.'
  return ''
})
const vibeOpen = ref(false)
// "Any vibe", "🌿 Nature", or "🌿 Nature +2"
const vibeLabel = computed(() => {
  if (!vibes.value.length) return '✨ Any vibe'
  const first = VIBES.find((v) => v.key === vibes.value[0])
  return first.icon + ' ' + first.key + (vibes.value.length > 1 ? ' +' + (vibes.value.length - 1) : '')
})
function closeVibes() {
  vibeOpen.value = false
}
function toggleVibe(key) {
  if (vibes.value.includes(key)) vibes.value = vibes.value.filter((v) => v !== key)
  else vibes.value = vibes.value.concat(key)
}
// Months (1-12) the trip touches
const tripMonths = computed(() => {
  const list = []
  if (dateError.value) return [new Date().getMonth() + 1]
  const d = new Date(start.value + 'T00:00:00')
  const last = new Date(end.value + 'T00:00:00')
  while (d <= last && list.length < 12) {
    if (!list.includes(d.getMonth() + 1)) list.push(d.getMonth() + 1)
    d.setDate(d.getDate() + 1)
  }
  return list
})

// ---------- an opened country (tap its card or its shape on the map) ----------
const focusCountry = ref(null)
const otherCountry = ref(null) // a country with no cities in our data yet
const hoverAny = ref(null)     // any country under the mouse on the map
const countryPhotos = ref({})
const feedEl = ref(null)
// The sticky header's height, so the map and "scroll to" stop just below it instead of under it
const topEl = ref(null)
const topHeight = ref(112)
let topWatcher = null
// ---------- top sights of an opened country ----------
const sightPhotos = ref({})
function sightsOf(country) {
  return SIGHTS.countries[country] || []
}
// "Pantheon, Rome" / "Golden Bridge (Vietnam)" -> "Pantheon" / "Golden Bridge"
function sightName(a) {
  return a.name.replace(/ \([^)]*\)$/, '').split(', ')[0]
}
function sightStyle(a) {
  const url = sightPhotos.value[a.name]
  return url ? { backgroundImage: 'linear-gradient(180deg, rgba(0, 38, 58,0) 35%, rgba(0, 38, 58,0.92)), url(' + url + ')' } : null
}
function loadSightPhotos(country) {
  for (const a of sightsOf(country)) {
    if (sightPhotos.value[a.name] !== undefined) continue
    sightPhotos.value = { ...sightPhotos.value, [a.name]: null }
    axios.get('/api/discover/about', { params: { title: a.name } })
      .then((res) => { if (res.data.photo) sightPhotos.value = { ...sightPhotos.value, [a.name]: res.data.photo } })
      .catch(() => {})
  }
}
// A sight's card flies the map to the city it's near
function showSight(country, a) {
  const city = allCities.find((c) => c.country === country && c.cityName === a.city)
  if (city) showOnMap(visibleCities.value.find((c) => c.id === city.id) || city)
}

function loadCountryPhoto(name) {
  if (countryPhotos.value[name] === undefined) {
    countryPhotos.value = { ...countryPhotos.value, [name]: null }
    axios.get('/api/discover/about', { params: { title: name } })
      .then((res) => { if (res.data.photo) countryPhotos.value = { ...countryPhotos.value, [name]: res.data.photo } })
      .catch(() => {})
  }
}
function focus(name) {
  otherCountry.value = null
  focusCountry.value = name
  hoverCountry.value = null
  nextTick(() => feedEl.value && feedEl.value.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  fitCountry(name)
  loadCountryPhoto(name)
  loadSightPhotos(name)
}
// Tapped a country we have no cities for: zoom to its shape and show the light card
function openOther(name, geometry) {
  focusCountry.value = null
  otherCountry.value = name
  nextTick(() => feedEl.value && feedEl.value.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  loadCountryPhoto(name)
  if (map && ml && geometry) {
    const bounds = new ml.LngLatBounds()
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    for (const poly of polys) for (const p of poly[0]) bounds.extend(p)
    map.fitBounds(bounds, { padding: 90, maxZoom: 6, pitch: 50, bearing: rotation.value, duration: 900 })
  }
}
function planOther() {
  router.push({ path: '/home', query: { dest: otherCountry.value, name: 'Trip to ' + otherCountry.value, start: start.value, end: end.value } })
}
// Clicking anywhere on a country card opens it (city cards, hearts and buttons keep their own action)
function openCountryCard(e, name) {
  if (focusCountry.value === name) return
  if (e.target.closest('.dx-city, .dx-sights, button, a')) return
  focus(name)
}
function unfocus() {
  const was = focusCountry.value
  otherCountry.value = null
  focusCountry.value = null
  if (map) map.flyTo({ center: [128, 8], zoom: 2, pitch: 52, bearing: rotation.value, duration: 900 })
  // Back in the list where you left off: at the country you just closed
  nextTick(() => {
    const card = was && feedEl.value ? feedEl.value.querySelector('[data-country="' + was + '"]') : null
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}
// The country (or other place) that's open, for the header's "All countries › China"
const openName = computed(() => focusCountry.value || otherCountry.value)

// ---------- data: which cities show, and their match score ----------
function countryOf(name) {
  return DATA.countries.find((c) => c.country === name)
}
// How well a month fits a city's best months: in season 1, a month either side 0.6, two months away 0.25
function seasonOf(month, bestMonths) {
  let best = 0
  for (const b of bestMonths) {
    let gap = Math.abs(month - b)
    if (gap > 6) gap = 12 - gap // December is next to January
    const fit = gap === 0 ? 1 : gap === 1 ? 0.6 : gap === 2 ? 0.25 : 0
    if (fit > best) best = fit
  }
  return best
}
// Match score out of 100. Each part is between 0 and 1:
//   vibe   = share of your picked vibes the city has (only counts when you picked some)
//   season = how close your travel months are to its best months
//   budget = fits your daily budget (a little higher the more room it leaves; drops off when over)
//   love   = how popular the country is, and how high the city ranks inside it
// Base cities always show; hidden gems show for very popular countries, or when they match a vibe or your search.
const visibleCities = computed(() => {
  const list = []
  const cap = BUDGETS.find((b) => b.value === budget.value).cap
  const q = search.value.trim().toLowerCase()
  for (const c of DATA.cities) {
    const country = countryOf(c.country)
    const nameHit = !!q && (c.cityName.toLowerCase().includes(q) || c.country.toLowerCase().includes(q))
    if (q && !nameHit) continue
    const vibeHit = c.vibeTags.filter((t) => vibes.value.includes(t)).length
    // (an opened country, or a searched one, shows all of its cities)
    if (c.tier === 'extended' && country.popularity < 85 && !vibeHit && !nameHit && c.country !== focusCountry.value) continue

    let season = 0
    let inSeason = 0
    for (const m of tripMonths.value) {
      season += seasonOf(m, c.bestMonths)
      if (c.bestMonths.includes(m)) inSeason++
    }
    season = season / tripMonths.value.length
    const monthFit = inSeason / tripMonths.value.length

    let budgetFit = 1
    if (cap < 9999) {
      budgetFit = c.estDailyBudget <= cap ? 0.8 + 0.2 * (1 - c.estDailyBudget / cap) : Math.max(0, 1 - (c.estDailyBudget - cap) / cap)
    }
    const love = 0.6 * country.popularity / 100 + 0.4 / (1 + 0.35 * (c.popularityRank - 1))

    let score
    if (vibes.value.length) {
      const vibeFit = vibeHit / vibes.value.length
      score = 0.4 * vibeFit + 0.3 * season + 0.15 * budgetFit + 0.15 * love
    } else {
      score = 0.45 * season + 0.25 * budgetFit + 0.3 * love
    }
    list.push({ ...c, id: (c.cityName + '-' + c.country).toLowerCase().replace(/[^a-z]+/g, '-'), cc: country.cc, score: Math.round(100 * score), monthFit })
  }
  return list
})
// One group per country: its cities best first; countries ordered by their best city
const groups = computed(() => {
  const result = []
  for (const country of DATA.countries) {
    if (otherCountry.value || (focusCountry.value && country.country !== focusCountry.value)) continue
    const cities = visibleCities.value.filter((c) => c.country === country.country).sort((a, b) => b.score - a.score || a.popularityRank - b.popularityRank)
    if (!cities.length) continue
    let gems = 0
    for (const c of cities) if (c.tier === 'extended') gems++
    result.push({ ...country, cities, best: cities[0].score, gems })
  }
  result.sort((a, b) => b.best - a.best)
  return result
})
function cityById(id) {
  return visibleCities.value.find((c) => c.id === id) || allCities.find((c) => c.id === id)
}
// Every city (for shortlist chips, even if a filter hides it now)
const allCities = DATA.cities.map((c) => ({ ...c, id: (c.cityName + '-' + c.country).toLowerCase().replace(/[^a-z]+/g, '-'), cc: countryOf(c.country).cc, score: 0 }))

function flag(cc) {
  return flagEmoji(cc)
}
function monthsText(list) {
  return list.slice(0, 3).map((m) => MONTHS[m - 1]).join(', ')
}

// ---------- photos (heroImage, or Wikipedia when empty) ----------
const photos = ref({})
// City photos: asked for 40 at a time (not one request per city), and kept for the rest of the visit
async function loadPhotos() {
  const found = { ...PHOTO_CACHE }
  const titles = []
  const idOf = {}
  for (const c of allCities) {
    if (c.heroImage) found[c.id] = c.heroImage
    else if (!found[c.id]) {
      const t = c.cityName + ', ' + c.country
      titles.push(t)
      idOf[t] = c.id
    }
  }
  photos.value = found
  for (let i = 0; i < titles.length; i += 40) {
    try {
      const res = await axios.get('/api/discover/photos', { params: { titles: titles.slice(i, i + 40).join('|') } })
      const more = {}
      for (const t in res.data) {
        if (res.data[t]) {
          more[idOf[t]] = res.data[t]
          PHOTO_CACHE[idOf[t]] = res.data[t]
        }
      }
      photos.value = { ...photos.value, ...more }
    } catch (err) {
      // no photo: the card keeps its plain colour
    }
  }
}
function photoStyle(c) {
  const url = photos.value[c.id]
  return url ? { backgroundImage: 'linear-gradient(180deg, rgba(0, 38, 58,0.05) 30%, rgba(0, 38, 58,0.92)), url(' + url + ')' } : null
}

// ---------- shortlist (kept in this browser) ----------
// (shared with the rest of the app: kept in this browser for guests, saved to the account once signed in)
const shortlistCities = computed(() => shortlist.value.map(cityById).filter(Boolean))
const trayEl = ref(null)
function liked(id) {
  return shortlist.value.includes(id)
}
function unlike(id) {
  shortlist.value = shortlist.value.filter((x) => x !== id)
}
// Liking flies a little tag from the heart down into the tray
let lastTap = { id: null, at: 0 }
function toggleLike(c, event) {
  // A quick double tap would add and then remove straight away, so taps within half a second are ignored
  const now = Date.now()
  if (lastTap.id === c.id && now - lastTap.at < 500) return
  lastTap = { id: c.id, at: now }
  if (liked(c.id)) {
    unlike(c.id)
    return
  }
  shortlist.value = shortlist.value.concat(c.id)
  const from = event.currentTarget.getBoundingClientRect()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  nextTick(() => {
    const to = trayEl.value ? trayEl.value.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight - 60, width: 0 }
    const tag = document.createElement('div')
    tag.className = 'dx-fly'
    tag.textContent = flag(c.cc) + ' ' + c.cityName
    tag.style.left = from.left + 'px'
    tag.style.top = from.top + 'px'
    document.body.appendChild(tag)
    const dx = to.left + 60 - from.left
    const dy = to.top + 10 - from.top
    tag.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: 'translate(' + dx * 0.5 + 'px, ' + (dy * 0.5 - 80) + 'px) scale(1.1)', opacity: 1, offset: 0.45 },
      { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(0.6)', opacity: 0.2 }
    ], { duration: 650, easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = () => tag.remove()
  })
}
// Saving a trip needs an account: guests get a gentle sign-in, then planning carries on by itself
const authOpen = ref(false)
const authReason = ref('')
function askToSignIn(reason) {
  authReason.value = reason
  authOpen.value = true
}
function startPlanning() {
  if (!auth.token) {
    askToSignIn('Sign in or create an account to turn your shortlist into a trip.')
    return
  }
  // Open the confirm sheet with everything filled in
  const list = shortlistCities.value.slice(0, 10) // a trip holds up to 10 places
  const countries = []
  for (const c of list) if (!countries.includes(c.country)) countries.push(c.country)
  plan.value = {
    name: countries.length === 1 ? 'Trip to ' + countries[0] : 'Trip to ' + countries.slice(0, 3).join(' & '),
    cities: list.slice(),
    start: start.value,
    end: end.value
  }
  planError.value = ''
}

// ---------- confirm sheet: name, dates, city order, then create the trip ----------
const plan = ref(null) // { name, cities, start, end } while the sheet is open
const planError = ref('')
const creating = ref(false)
function moveCity(i, step) {
  const list = plan.value.cities.slice()
  const j = i + step
  if (j < 0 || j >= list.length) return
  const temp = list[i]
  list[i] = list[j]
  list[j] = temp
  plan.value.cities = list
}
function dropCity(i) {
  plan.value.cities = plan.value.cities.filter((c, k) => k !== i)
}
// Outdoor guess for a sight, from its name (only used for rain warnings later)
function looksOutdoor(name) {
  return /park|beach|lake|mount|falls|garden|bay|canyon|island|valley|gorge|river|cliff|peak|trail|reef|glacier|lagoon|forest|desert|square|street|market|bridge|harbour|coast/i.test(name)
}
async function createTrip() {
  const p = plan.value
  planError.value = ''
  if (!p.name.trim()) { planError.value = 'Give your trip a name.'; return }
  if (!p.cities.length) { planError.value = 'Keep at least one city.'; return }
  if (!p.start || !p.end || p.start < today || p.end < p.start) { planError.value = 'Check your dates: they need to be from today on, and the end after the start.'; return }
  creating.value = true
  try {
    const labels = p.cities.map((c) => c.cityName + ', ' + c.country)
    const res = await axios.post('/api/trips', { name: p.name.trim(), destinations: labels, startDate: p.start, endDate: p.end })
    const id = res.data.id
    // Start the wishlist with the top sights near the chosen cities, so the next steps aren't empty
    const wishlist = []
    for (const c of p.cities) {
      for (const a of sightsOf(c.country)) {
        if (a.city !== c.cityName || wishlist.length >= 30) continue
        wishlist.push({
          id: 'w-' + Date.now().toString(36) + wishlist.length,
          name: sightName(a), address: sightName(a) + ', ' + c.cityName + ', ' + c.country,
          outdoor: looksOutdoor(a.name), type: /museum|gallery/i.test(a.name) ? 'museum' : 'attraction',
          city: c.cityName + ', ' + c.country, votes: []
        })
      }
    }
    if (wishlist.length) {
      try {
        await axios.put('/api/trips/' + id + '/itinerary', { stops: [], wishlist, version: 0 })
      } catch (err) {
        // the trip exists; the wishlist can still be filled in on the next page
        notify('Your trip is ready, but its top sights could not be added. You can save places on the next step.')
      }
    }
    // The planned cities leave the shortlist
    const planned = p.cities.map((c) => c.id)
    shortlist.value = shortlist.value.filter((x) => !planned.includes(x))
    plan.value = null
    router.push('/trip/' + id + '/setup/invite')
  } catch (err) {
    planError.value = (err.response && err.response.data && err.response.data.message) || 'Could not create the trip. Is the server running?'
  }
  creating.value = false
}

// ---------- hover sync between cards and map ----------
const hoverId = ref(null)       // a city (card or pillar)
const hoverCountry = ref(null)  // a whole country card
const flashId = ref(null)
const cardEls = {}

// ---------- 3D map (MapLibre: free, no key; dark countries drawn from world-atlas) ----------
const mapEl = ref(null)
const mapError = ref('')
const tip = ref(null) // { city, x, y }
let map = null
let ml = null
let tipTimer = null
let lastHover = null

// A pillar = a small circle on the ground, extruded upwards. It shrinks as you zoom in so it stays pillar-shaped.
function circle(lon, lat, km) {
  const pts = []
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2
    pts.push([lon + (km / (111 * Math.cos(lat * Math.PI / 180))) * Math.cos(a), lat + (km / 111) * Math.sin(a)])
  }
  return [pts]
}
function pillarData() {
  const zoom = map ? map.getZoom() : 2
  const shrink = Math.pow(2, Math.max(0, zoom - 2))
  const features = []
  const points = []
  visibleCities.value.forEach((c, i) => {
    const props = { id: c.id, score: c.score, h: (40000 + c.score * 9000) / shrink }
    features.push({ type: 'Feature', id: i, properties: props, geometry: { type: 'Polygon', coordinates: circle(c.lon, c.lat, 110 / shrink) } })
    points.push({ type: 'Feature', id: i, properties: props, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })
  })
  return { pillars: { type: 'FeatureCollection', features }, points: { type: 'FeatureCollection', features: points } }
}
function indexOf(id) {
  return visibleCities.value.findIndex((c) => c.id === id)
}
// Light up the hovered pillar (and every pillar of a hovered country), mark liked ones
function paintStates() {
  if (!map || !map.getSource('dx-pillars')) return
  const country = hoverCountry.value
  visibleCities.value.forEach((c, i) => {
    const dim = !!otherCountry.value || (!!focusCountry.value && c.country !== focusCountry.value)
    const state = { hover: !dim && (c.id === hoverId.value || c.country === country), liked: liked(c.id), dim }
    map.setFeatureState({ source: 'dx-pillars', id: i }, state)
    map.setFeatureState({ source: 'dx-points', id: i }, state)
  })
  const lit = country || hoverAny.value || focusCountry.value || otherCountry.value || (hoverId.value ? cityById(hoverId.value).country : '')
  if (map.getLayer('dx-country-lit')) map.setFilter('dx-country-lit', ['in', ['get', 'name'], ['literal', mapNames(lit)]])
}
function refreshPillars() {
  if (!map || !map.getSource('dx-pillars')) return
  const data = pillarData()
  map.getSource('dx-pillars').setData(data.pillars)
  map.getSource('dx-points').setData(data.points)
  nextTick(paintStates)
}
watch(visibleCities, refreshPillars)
watch([hoverId, hoverCountry, hoverAny, shortlist, focusCountry, otherCountry], paintStates)

// The map's country names -> ours (and back)
const NAME_FIX = {
  'United States of America': 'United States', Macao: 'Macau', 'Czech Rep.': 'Czechia', 'Republic of Korea': 'South Korea',
  'Bosnia and Herz.': 'Bosnia and Herzegovina', Macedonia: 'North Macedonia', 'N. Macedonia': 'North Macedonia'
}
const OUR_COUNTRIES = DATA.countries.map((c) => c.country)
function ourName(mapName) {
  return NAME_FIX[mapName] || mapName
}
function mapNames(name) {
  const list = [name]
  for (const k in NAME_FIX) if (NAME_FIX[k] === name) list.push(k)
  return list
}
// Zoom to a country's cities, keeping the 3D tilt
function fitCountry(name) {
  if (!map || !ml) return
  const bounds = new ml.LngLatBounds()
  for (const c of allCities) if (c.country === name) bounds.extend([c.lon, c.lat])
  if (bounds.isEmpty()) return
  map.fitBounds(bounds, { padding: 90, maxZoom: 6, pitch: 50, bearing: rotation.value, duration: 900 })
}

async function loadOutlines() {
  for (const host of ['https://unpkg.com/', 'https://cdn.jsdelivr.net/npm/']) {
    try {
      const res = await fetch(host + 'world-atlas@2.0.2/countries-50m.json')
      // (Antarctica is left out: no trips there, and it wraps the whole bottom of the map)
      if (res.ok) return unwrapLongitudes(topoFeatures(await res.json(), 'countries').filter((f) => f.properties.name !== 'Antarctica'))
    } catch (err) {
      // try the next host
    }
  }
  return []
}

async function buildMap() {
  try {
    ml = await loadMapLibre()
  } catch (err) {
    mapError.value = 'The 3D map could not load. Everything else still works.'
    return
  }
  map = new ml.Map({
    container: mapEl.value,
    style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#001d2c' } }] },
    center: [128, 8], zoom: 2, pitch: 52, bearing: rotation.value, antialias: true, attributionControl: false
  })
  map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-right')
  map.on('load', async () => {
    const countries = await loadOutlines()
    if (countries.length) {
      map.addSource('dx-countries', { type: 'geojson', data: { type: 'FeatureCollection', features: countries } })
      map.addLayer({ id: 'dx-land', type: 'fill', source: 'dx-countries', paint: { 'fill-color': '#0f4566' } })
      map.addLayer({ id: 'dx-country-lit', type: 'fill', source: 'dx-countries', filter: ['==', ['get', 'name'], ''], paint: { 'fill-color': '#edae49', 'fill-opacity': 0.24 } })
      map.addLayer({ id: 'dx-borders', type: 'line', source: 'dx-countries', paint: { 'line-color': '#4a7a96', 'line-width': 0.6 } })
      // Countries are tappable: hover tints them, a tap opens them
      map.on('mousemove', 'dx-land', (e) => {
        if (lastHover) return // a pillar is under the mouse
        const name = ourName(e.features[0].properties.name)
        map.getCanvas().style.cursor = 'pointer' // every country can be tapped
        hoverAny.value = name
        hoverCountry.value = OUR_COUNTRIES.includes(name) ? name : null
      })
      map.on('mouseleave', 'dx-land', () => {
        hoverAny.value = null
        hoverCountry.value = null
        if (!lastHover) map.getCanvas().style.cursor = ''
      })
      map.on('click', 'dx-land', (e) => {
        if (map.queryRenderedFeatures(e.point, { layers: ['dx-pillars'] }).length) return // the pillar handles it
        const name = ourName(e.features[0].properties.name)
        if (OUR_COUNTRIES.includes(name)) focus(name)
        else openOther(name, e.features[0].geometry)
      })
    } else {
      mapError.value = 'Country outlines could not load, so pillars float on a plain background.'
    }
    const data = pillarData()
    map.addSource('dx-points', { type: 'geojson', data: data.points })
    map.addSource('dx-pillars', { type: 'geojson', data: data.pillars })
    const hover = ['boolean', ['feature-state', 'hover'], false]
    const isLiked = ['boolean', ['feature-state', 'liked'], false]
    // Aurora glow on the ground under each pillar
    map.addLayer({
      id: 'dx-glow', type: 'circle', source: 'dx-points',
      paint: {
        'circle-color': '#edae49', 'circle-blur': 1, 'circle-pitch-alignment': 'map',
        'circle-radius': ['case', hover, 34, isLiked, 16, 10],
        'circle-opacity': ['case', hover, 0.75, isLiked, 0.45, 0.18],
        'circle-radius-transition': { duration: 250 }, 'circle-opacity-transition': { duration: 250 }
      }
    })
    map.addLayer({
      id: 'dx-pillars', type: 'fill-extrusion', source: 'dx-pillars',
      paint: {
        'fill-extrusion-color': ['case', ['boolean', ['feature-state', 'dim'], false], '#0a2a3d', hover, '#edae49', isLiked, '#f3c26f',
          ['interpolate', ['linear'], ['get', 'score'], 0, '#30638e', 55, '#00798c', 100, '#edae49']],
        'fill-extrusion-height': ['*', ['get', 'h'], ['case', ['boolean', ['feature-state', 'dim'], false], 0.35, hover, 1.3, 1]],
        'fill-extrusion-opacity': 0.92
      }
    })
    paintStates()

    // Hovering a pillar: light it up and show the glass tooltip; click jumps to its card
    map.on('mousemove', 'dx-pillars', (e) => {
      const id = e.features[0].properties.id
      map.getCanvas().style.cursor = 'pointer'
      if (id !== lastHover) {
        lastHover = id
        hoverId.value = id
      }
      showTip(id)
    })
    map.on('mouseleave', 'dx-pillars', () => {
      map.getCanvas().style.cursor = ''
      lastHover = null
      dropTip()
    })
    map.on('click', 'dx-pillars', (e) => goToCard(e.features[0].properties.id))
    map.on('zoomend', refreshPillars)
    // Rotating with the mouse moves the slider too
    map.on('rotate', () => { if (map) rotation.value = Math.round(map.getBearing()) })
    map.on('rotateend', rotateMap)
    map.on('move', () => { if (map && tip.value) showTip(tip.value.city.id) })
  })
}
function showTip(id) {
  clearTimeout(tipTimer)
  const c = cityById(id)
  if (!c || !map) return
  const p = map.project([c.lon, c.lat])
  tip.value = { city: c, x: p.x, y: p.y }
}
function dropTip() {
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => {
    tip.value = null
    if (!lastHover) hoverId.value = null
  }, 250)
}
// Tapping a city card: fly the map to it, light its pillar and show its tooltip
function showOnMap(c) {
  if (!map) return
  hoverId.value = c.id
  lastHover = c.id // keeps it lit until the mouse moves onto something else
  // On phones the map sits above the list: bring it into view first
  const box = mapEl.value.getBoundingClientRect()
  if (box.bottom < 0 || box.top > window.innerHeight) mapEl.value.scrollIntoView({ behavior: 'smooth', block: 'center' })
  map.flyTo({ center: [c.lon, c.lat], zoom: Math.max(map.getZoom(), 5.5), pitch: 55, bearing: rotation.value, duration: 1200, essential: true })
  map.once('moveend', () => {
    showTip(c.id)
    lastHover = null
  })
}
// ---------- rotation slider ----------
function readRotation() {
  try {
    const saved = Number(localStorage.getItem('dxRotation'))
    return Number.isFinite(saved) && localStorage.getItem('dxRotation') !== null ? saved : -12
  } catch (err) {
    return -12
  }
}
const rotation = ref(readRotation())
function rotateMap() {
  if (map) map.rotateTo(rotation.value, { duration: 0 })
  try { localStorage.setItem('dxRotation', String(rotation.value)) } catch (err) { /* private mode */ }
}
function goToCard(id) {
  const el = cardEls[id]
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  flashId.value = id
  setTimeout(() => { if (flashId.value === id) flashId.value = null }, 1200)
}

function onKey(e) {
  if (e.key === 'Escape' && (focusCountry.value || otherCountry.value)) unfocus()
  // "/" jumps to the search box (unless you're already typing somewhere)
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)
  if (e.key === '/' && !typing && searchEl.value) {
    e.preventDefault()
    searchEl.value.focus()
  }
}

// ---------- search suggestions ----------
// Countries and cities whose name contains what's typed; names that start with it come first
const suggestions = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return []
  const starts = []
  const contains = []
  for (const co of DATA.countries) {
    if (!co.country.toLowerCase().includes(q)) continue
    let n = 0
    for (const c of DATA.cities) if (c.country === co.country) n++
    const sg = { kind: 'country', key: 'country-' + co.country, label: co.country, flag: flag(co.cc), sub: n + ' place' + (n === 1 ? '' : 's') + ' to explore' }
    if (co.country.toLowerCase().startsWith(q)) starts.push(sg)
    else contains.push(sg)
  }
  for (const c of allCities) {
    if (!c.cityName.toLowerCase().includes(q)) continue
    const sg = { kind: 'city', key: c.id, label: c.cityName, flag: flag(c.cc), sub: c.country, city: c }
    if (c.cityName.toLowerCase().startsWith(q)) starts.push(sg)
    else contains.push(sg)
  }
  return starts.concat(contains).slice(0, 6)
})
function pickSuggest(sg) {
  suggestOpen.value = false
  activeSuggest.value = -1
  search.value = ''
  if (searchEl.value) searchEl.value.blur()
  focus(sg.kind === 'country' ? sg.label : sg.city.country)
  // A city: once the country is open, fly to the city too
  if (sg.kind === 'city') setTimeout(() => showOnMap(cityById(sg.city.id)), 950)
}
function onSearchKey(e) {
  const n = suggestions.value.length
  if (e.key === 'ArrowDown' && n) {
    e.preventDefault()
    suggestOpen.value = true
    activeSuggest.value = (activeSuggest.value + 1) % n
  } else if (e.key === 'ArrowUp' && n) {
    e.preventDefault()
    activeSuggest.value = activeSuggest.value <= 0 ? n - 1 : activeSuggest.value - 1
  } else if (e.key === 'Enter') {
    if (activeSuggest.value >= 0 && activeSuggest.value < n) pickSuggest(suggestions.value[activeSuggest.value])
    else if (n === 1) pickSuggest(suggestions.value[0])
    else suggestOpen.value = false // keep the filtered list
  } else if (e.key === 'Escape') {
    e.stopPropagation()
    if (suggestOpen.value && n) suggestOpen.value = false
    else clearSearch()
  }
}
function clearSearch() {
  search.value = ''
  activeSuggest.value = -1
  if (searchEl.value) searchEl.value.focus()
}
function closeSuggest() {
  setTimeout(() => { suggestOpen.value = false }, 120)
}
// The map keeps focus in the search box when it's clicked (no blur), so close on any press outside it
function closeSuggestOutside(e) {
  if (!e.target.closest('.dx-search')) suggestOpen.value = false
}
onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.addEventListener('click', closeVibes)
  document.addEventListener('pointerdown', closeSuggestOutside)
  document.body.classList.add('dx-body')
  if (auth.token) syncShortlist() // picks saved on another device show up here too
  loadPhotos()
  buildMap()
  if (topEl.value && window.ResizeObserver) {
    topWatcher = new ResizeObserver(() => { topHeight.value = topEl.value ? topEl.value.offsetHeight : 112 })
    topWatcher.observe(topEl.value)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('click', closeVibes)
  document.removeEventListener('pointerdown', closeSuggestOutside)
  document.body.classList.remove('dx-body')
  if (topWatcher) topWatcher.disconnect()
  clearTimeout(tipTimer)
  // Forget the map first, so nothing touches it while it is being taken down
  const old = map
  map = null
  try {
    if (old) old.remove()
  } catch (err) {
    // the map was still loading; nothing to clean up
  }
})
</script>

<style scoped>
.dx {
  --bg: #001d2c;
  --panel: #0f4566;
  --line: rgba(255, 255, 255, 0.16);
  --text: #f6f1e7;
  --muted: #b4c3cf;
  --emerald: #edae49;
  color: var(--text);
  padding: 16px 0 32px;
}
.dx.has-tray {
  padding-bottom: 110px;
}
.glass {
  background: rgba(14, 64, 94, 0.82);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--line);
  border-radius: 18px;
}

/* Filters */
.dx-top {
  position: sticky;
  top: 8px;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.dx-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dx-back {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.16);
  color: var(--text);
  font-size: 22px;
  text-decoration: none;
}
.dx-back:hover {
  background: rgba(237, 174, 73, 0.18);
  color: var(--emerald);
}
.dx-crumbs {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--muted);
}
.dx-crumb {
  padding: 0;
  border: 0;
  background: none;
  color: var(--emerald);
  font-size: 15px;
  font-weight: 700;
}
.dx-crumb:hover {
  text-decoration: underline;
}
.dx-crumb:focus-visible {
  outline: 3px solid rgba(237, 174, 73, 0.6);
  outline-offset: 2px;
  border-radius: 4px;
}
.dx-title {
  font-family: var(--font-display);
  font-size: 1.6rem;
  margin: 0;
  letter-spacing: -0.01em;
}
.dx-sub {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}
.dx-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.dx-dates {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
}
.dx-input {
  height: 40px;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  color-scheme: dark;
}
.dx-search {
  position: relative;
  flex: 1 1 100%; /* its own row under the title and filters */
  order: 10;
}
.dx-search-icon {
  position: absolute;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--emerald);
  pointer-events: none;
}
.dx-search-input {
  box-sizing: border-box;
  width: 100%;
  height: 50px;
  padding: 0 52px 0 48px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  color: var(--text);
  font-size: 15.5px;
  font-weight: 500;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 6px 18px rgba(0, 0, 0, 0.18);
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.dx-search-input::placeholder {
  color: var(--muted);
  font-weight: 400;
}
.dx-search-input:hover {
  background: rgba(255, 255, 255, 0.09);
}
.dx-search-input:focus {
  outline: none;
  border-color: var(--emerald);
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 0 4px rgba(237, 174, 73, 0.18), 0 10px 26px rgba(0, 0, 0, 0.25);
}
.dx-search.open .dx-search-input {
  border-radius: 25px 25px 0 0;
  border-bottom-color: transparent;
}
.dx-search-clear,
.dx-search-kbd {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
}
.dx-search-clear {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  color: var(--text);
}
.dx-search-clear:hover,
.dx-search-clear:focus-visible {
  background: var(--emerald);
  color: #001d2c;
  outline: none;
}
.dx-search-kbd {
  right: 16px;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  border-radius: 7px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.06);
  color: var(--muted);
  font: 700 12px/22px ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: center;
}
/* Suggestions drop down from the pill */
.dx-suggest {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 40;
  margin: 0;
  padding: 6px;
  list-style: none;
  border: 1px solid var(--emerald);
  border-top: 1px solid var(--line);
  border-radius: 0 0 22px 22px;
  background: rgba(10, 53, 80, 0.97);
  box-shadow: 0 0 0 4px rgba(237, 174, 73, 0.18), 0 22px 44px rgba(0, 0, 0, 0.45);
}
.dx-sg {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 14px;
  cursor: pointer;
}
.dx-sg.active {
  background: rgba(237, 174, 73, 0.12);
}
.dx-sg-flag {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: rgba(255, 255, 255, 0.07);
}
.dx-sg-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.dx-sg-text strong {
  font-size: 15px;
  color: var(--text);
}
.dx-sg-text small {
  font-size: 12.5px;
  color: var(--muted);
}
.dx-sg-kind {
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--muted);
}
.dx-sg.active .dx-sg-kind {
  border-color: var(--emerald);
  color: var(--emerald);
}
@media (max-width: 560px) {
  .dx-search-kbd,
  .dx-sg-kind {
    display: none;
  }
  .dx-search-input {
    font-size: 15px;
  }
}
.dx-link {
  border: 0;
  background: none;
  padding: 0;
  color: var(--emerald);
  font-weight: 700;
  text-decoration: underline;
}
.dx-seg {
  display: inline-flex;
  box-sizing: border-box;
  height: 40px; /* same height as the vibe dropdown next to it */
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}
.dx-seg button {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  padding: 0 14px;
  font-size: 14px;
  font-weight: 700;
}
.dx-seg button.on {
  background: var(--emerald);
  color: #001d2c;
}
.dx-vibes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dx-vibe {
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.dx-vibe:hover {
  border-color: rgba(237, 174, 73, 0.5);
}
.dx-vibe.on {
  background: rgba(237, 174, 73, 0.16);
  border-color: var(--emerald);
  color: var(--emerald);
}
.dx-dd {
  position: relative;
}
.dx-dd-btn {
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  border-radius: 999px;
  box-sizing: border-box;
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}
.dx-dd-btn.on {
  border-color: var(--emerald);
  color: var(--emerald);
  background: rgba(237, 174, 73, 0.12);
}
.dx-dd-caret {
  margin-left: 4px;
  font-size: 10px;
}
.dx-dd-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 30;
  min-width: 220px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: rgba(10, 53, 80, 0.95);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
}
.dx-dd-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text);
  padding: 9px 10px;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
}
.dx-dd-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.dx-dd-item.on {
  color: var(--emerald);
}
.dx-dd-check {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1.5px solid var(--line);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
.dx-dd-item.on .dx-dd-check {
  background: var(--emerald);
  border-color: var(--emerald);
  color: #001d2c;
}
.dx-dd-clear {
  margin-top: 4px;
  border: 0;
  border-top: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  padding: 8px 10px 4px;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
}
.dx-dd-clear:hover {
  color: var(--text);
}
.dx-dd-btn:focus-visible,
.dx-dd-item:focus-visible,
.dx-dd-clear:focus-visible {
  outline: 3px solid rgba(237, 174, 73, 0.6);
  outline-offset: 2px;
}
.dx-signin {
  border: 1px solid rgba(237, 174, 73, 0.5);
  border-radius: 999px;
  background: transparent;
  color: #edae49;
  padding: 7px 16px;
  font-weight: 700;
  font-size: 13px;
}
.dx-signin:hover {
  background: rgba(237, 174, 73, 0.12);
}
.dx-error {
  width: 100%;
  margin: 0;
  color: #ec8a97;
  font-size: 13px;
}

/* Split */
.dx-split {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.dx-feed {
  scroll-margin-top: calc(var(--dx-top-h, 112px) + 20px);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dx-country {
  scroll-margin-top: calc(var(--dx-top-h, 112px) + 20px);
  padding: 16px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.dx-country.lit {
  border-color: rgba(237, 174, 73, 0.4);
  box-shadow: 0 0 0 1px rgba(237, 174, 73, 0.15), 0 18px 40px rgba(0, 0, 0, 0.35);
}
.dx-country-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}
.dx-allbtn {
  align-self: flex-start;
  padding: 8px 16px;
  color: var(--text);
  font-weight: 700;
  border-radius: 999px;
}
.dx-allbtn:hover {
  color: var(--emerald);
  border-color: rgba(237, 174, 73, 0.5);
}
.dx-country.focused {
  padding-top: 0;
  overflow: hidden;
  border-color: rgba(237, 174, 73, 0.35);
}
.dx-hero {
  height: 200px;
  margin: 0 -16px 14px;
  display: flex;
  align-items: flex-end;
  padding: 16px;
  background: linear-gradient(160deg, #0f4566, #0f4566) center / cover no-repeat;
}
.dx-hero {
  position: relative;
}
.dx-hero.nophoto {
  height: 120px;
}
.dx-hero-back {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 3;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  padding: 7px 14px;
  background: rgba(0, 38, 58, 0.7);
  backdrop-filter: blur(8px);
  color: var(--text);
  font-weight: 700;
  font-size: 13px;
  transition: color 0.15s, border-color 0.15s;
}
.dx-hero-back:hover {
  color: var(--emerald);
  border-color: var(--emerald);
}
.dx-hero-back:focus-visible {
  outline: 3px solid rgba(237, 174, 73, 0.6);
  outline-offset: 2px;
}
.dx-hero-name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 2.2rem;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
}
.dx-country:not(.focused) {
  cursor: pointer;
}
.dx-country-btn {
  border: 0;
  background: none;
  padding: 0;
  color: inherit;
  text-align: left;
}
.dx-explore {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 700;
  color: var(--emerald);
  opacity: 0;
  transition: opacity 0.15s;
}
.dx-country:hover .dx-explore,
.dx-country-btn:focus-visible .dx-explore {
  opacity: 1;
}
.dx-other-cta {
  margin-top: 14px;
}
.dx-tagline.big {
  font-size: 15px;
  color: #dde6ec;
  margin: 0;
}
.dx-allbtn:focus-visible,
.dx-country-btn:focus-visible {
  outline: 3px solid rgba(237, 174, 73, 0.6);
  outline-offset: 3px;
}
/* Top sights row */
.dx-sights {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.dx-sights-title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  margin: 0 0 10px;
}
.dx-sights-row {
  list-style: none;
  margin: 0;
  padding: 2px 2px 10px;
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: thin;
}
.dx-sights-row li {
  flex: 0 0 160px;
  scroll-snap-align: start;
}
.dx-sight {
  position: relative;
  width: 100%;
  height: 190px;
  display: flex;
  align-items: flex-end;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: linear-gradient(160deg, #0f4566, #0f4566) center / cover no-repeat;
  color: var(--text);
  text-align: left;
  transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.dx-sight:hover {
  transform: translateY(-3px);
  border-color: var(--emerald);
  box-shadow: 0 12px 26px rgba(237, 174, 73, 0.15);
}
.dx-sight-rank {
  position: absolute;
  top: 8px;
  left: 8px;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 38, 58, 0.75);
  color: var(--emerald);
  font-weight: 800;
  font-size: 13px;
  backdrop-filter: blur(6px);
}
.dx-sight-text strong {
  display: block;
  font-family: var(--font-display);
  font-size: 1rem;
  line-height: 1.15;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}
.dx-sight-text small {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  color: #dde6ec;
}
.dx-sight:focus-visible {
  outline: 3px solid rgba(237, 174, 73, 0.6);
  outline-offset: 2px;
}
.dx-country-name {
  font-family: var(--font-display);
  font-size: 1.35rem;
  margin: 0;
}
.dx-tagline {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--muted);
}
.dx-country-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}
.dx-score-pill {
  font-weight: 800;
  font-size: 13px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(237, 174, 73, 0.16);
  color: var(--emerald);
}
.dx-gems {
  font-size: 11px;
  color: var(--muted);
}

/* City cards: a swipeable row */
.dx-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding: 4px 2px 10px;
  scrollbar-width: thin;
}
.dx-city {
  position: relative;
  flex: 0 0 210px;
  height: 270px;
  scroll-snap-align: start;
  border-radius: 18px;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  background: linear-gradient(160deg, #0f4566, #0f4566) center / cover no-repeat;
  border: 1px solid var(--line);
  outline: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s;
}
.dx-city {
  cursor: pointer;
}
.dx-city.lit,
.dx-city:focus-visible {
  transform: translateY(-4px) scale(1.02);
  border-color: var(--emerald);
  box-shadow: 0 0 0 1px rgba(237, 174, 73, 0.4), 0 16px 36px rgba(237, 174, 73, 0.18);
}
.dx-city.flash {
  animation: dx-flash 1.2s ease;
}
@keyframes dx-flash {
  0%, 100% { box-shadow: 0 0 0 0 rgba(237, 174, 73, 0); }
  30% { box-shadow: 0 0 0 4px rgba(237, 174, 73, 0.7); }
}
.dx-gem-tag {
  position: absolute;
  top: 12px;
  left: 12px;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(0, 38, 58, 0.7);
  color: #ffd27a;
  backdrop-filter: blur(6px);
}
.dx-heart {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 38, 58, 0.6);
  backdrop-filter: blur(6px);
  font-size: 18px;
  transition: transform 0.15s;
}
.dx-heart:hover {
  transform: scale(1.12);
}
.dx-heart:active {
  transform: scale(0.9);
}
.dx-heart.on {
  animation: dx-pop 0.35s ease;
}
/* Heart icon: white outline, filled red once it's in your shortlist */
.dx-heart {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.dx-heart.on {
  color: #d1495b;
}
@keyframes dx-pop {
  50% { transform: scale(1.35); }
}
.dx-city-body {
  width: 100%;
  padding: 14px;
}
.dx-match {
  font-size: 12px;
  font-weight: 800;
  color: var(--emerald);
}
.dx-match small {
  color: var(--muted);
  font-weight: 600;
}
.dx-city-name {
  font-family: var(--font-display);
  font-size: 1.55rem;
  line-height: 1.05;
  margin: 2px 0 8px;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}
.dx-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.dx-tags span {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
}
.dx-tags span.hit {
  background: rgba(237, 174, 73, 0.25);
  color: var(--emerald);
}
.dx-facts {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  margin: 0;
  font-size: 11px;
  color: #dde6ec;
}
.dx-facts .good {
  color: var(--emerald);
  font-weight: 700;
}
.dx-empty {
  padding: 24px;
  text-align: center;
  color: var(--muted);
}

/* Confirm sheet */
.dx-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 38, 58, 0.55);
  backdrop-filter: blur(4px);
}
.dx-sheet {
  position: relative;
  width: min(480px, 100%);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 22px 20px 18px;
  display: flex;
  flex-direction: column;
  background: rgba(10, 53, 80, 0.95);
  box-shadow: 0 -10px 50px rgba(0, 0, 0, 0.5);
  animation: dx-sheet-up 0.25s cubic-bezier(.2, .8, .2, 1);
}
@keyframes dx-sheet-up {
  from { transform: translateY(30px); opacity: 0; }
}
.dx-sheet-x {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: var(--muted);
}
.dx-sheet-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  margin: 0 0 8px;
}
.dx-sheet-label {
  display: block;
  margin: 14px 0 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}
.dx-sheet-input {
  width: 100%;
}
.dx-route {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dx-route li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 6px 6px 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--line);
}
.dx-route-n {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--emerald);
  color: #001d2c;
  font-size: 12px;
  font-weight: 800;
}
.dx-route-name {
  flex: 1;
  font-weight: 600;
}
.dx-route button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.16);
  color: var(--text);
}
.dx-route button:disabled {
  opacity: 0.3;
}
.dx-sheet-cta {
  margin-top: 18px;
  width: 100%;
}
.dx-sheet-x:focus-visible,
.dx-route button:focus-visible {
  outline: 3px solid rgba(237, 174, 73, 0.6);
  outline-offset: 2px;
}

/* Map */
.dx-mapwrap {
  position: sticky;
  top: calc(var(--dx-top-h, 112px) + 20px);
  height: calc(100vh - var(--dx-top-h, 112px) - 40px);
  min-height: 420px;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: #001d2c;
}
.dx-map {
  position: absolute;
  inset: 0;
}
.dx-maperr {
  position: absolute;
  left: 12px;
  right: 12px;
  top: 12px;
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
}
.dx-rotate {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 12px;
  border-radius: 999px;
}
.dx-rot-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}
.dx-rot-range {
  width: 120px;
  accent-color: var(--emerald);
}
.dx-rot-reset {
  width: 28px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  color: var(--emerald);
  font-size: 12px;
  font-weight: 800;
}
.dx-rot-reset:disabled {
  color: var(--muted);
  opacity: 0.6;
}
.dx-rot-range:focus-visible,
.dx-rot-reset:focus-visible {
  outline: 3px solid rgba(237, 174, 73, 0.6);
  outline-offset: 2px;
}
.dx-tip {
  pointer-events: none;
  position: absolute;
  z-index: 5;
  width: 220px;
  transform: translate(-50%, calc(-100% - 18px));
  overflow: hidden;
  padding: 0;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
}
.dx-tip-photo {
  height: 96px;
  background: linear-gradient(160deg, #0f4566, #0f4566) center / cover no-repeat;
}
.dx-tip-body {
  display: flex;
  flex-direction: column;
  padding: 10px 12px 4px;
}
.dx-tip-body small {
  color: var(--muted);
}
.dx-tip-hint {
  margin: 0;
  padding: 0 12px 10px;
  font-size: 11px;
  color: var(--emerald);
}
.dx-pop-enter-active,
.dx-pop-leave-active {
  transition: opacity 0.15s ease;
}
.dx-pop-enter-from,
.dx-pop-leave-to {
  opacity: 0;
}

/* Shortlist tray */
.dx-tray {
  position: fixed;
  left: 50%;
  bottom: 18px;
  z-index: 1200;
  transform: translateX(-50%);
  width: min(960px, calc(100% - 32px));
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 10px 10px 14px;
  background: rgba(10, 53, 80, 0.86);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
}
.dx-tray-count {
  flex-shrink: 0;
  min-width: 30px;
  height: 30px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--emerald);
  color: #001d2c;
  font-weight: 800;
}
.dx-tray-chips {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  list-style: none;
  margin: 0;
  padding: 2px 0;
  scrollbar-width: none;
}
.dx-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px 5px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  font-size: 13px;
  font-weight: 600;
  animation: dx-chip-in 0.3s ease;
}
@keyframes dx-chip-in {
  from { transform: scale(0.6); opacity: 0; }
}
.dx-chip button {
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
  font-size: 11px;
}
.dx-chip button:hover {
  background: rgba(255, 138, 141, 0.3);
}
.dx-cta {
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  padding: 11px 18px;
  font-weight: 800;
  background: var(--emerald);
  color: #001d2c;
  box-shadow: 0 0 24px rgba(237, 174, 73, 0.35);
  transition: transform 0.15s;
}
.dx-cta:hover:not(:disabled) {
  transform: translateY(-1px);
}
.dx-cta:disabled {
  opacity: 0.5;
}
.dx-tray-enter-active,
.dx-tray-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.dx-tray-enter-from,
.dx-tray-leave-to {
  transform: translate(-50%, 120%);
  opacity: 0;
}

.dx-back:focus-visible,
.dx-seg button:focus-visible,
.dx-vibe:focus-visible,
.dx-heart:focus-visible,
.dx-chip button:focus-visible,
.dx-cta:focus-visible {
  outline: 3px solid rgba(237, 174, 73, 0.6);
  outline-offset: 2px;
}

@media (max-width: 960px) {
  .dx-split { grid-template-columns: minmax(0, 1fr); } /* minmax: the swipe rows mustn't stretch the page sideways */
  .dx-mapwrap { position: relative; top: 0; height: 340px; min-height: 0; order: -1; }
  .dx-top { position: relative; z-index: 25; } /* not sticky, but search suggestions still sit above the map */
  .dx-feed, .dx-country { scroll-margin-top: 16px; } /* the header scrolls away here */
  .dx-tray { flex-wrap: wrap; }
  .dx-cta { width: 100%; }
  .dx.has-tray { padding-bottom: 170px; } /* the tray is taller once its button wraps */
  .dx-dd-menu { right: auto; left: 0; }   /* open towards the screen, not off its left edge */
  .dx-filters { width: 100%; }
}
/* Small phones: dates share one row, a shorter map, a slimmer tray */
@media (max-width: 420px) {
  .dx-top { padding: 12px; }
  .dx-dates { width: 100%; }
  .dx-dates .dx-input { flex: 1; min-width: 0; padding: 0 6px; font-size: 13px; }
  .dx-mapwrap { height: 280px; }
  .dx-tray { bottom: 10px; width: calc(100% - 20px); padding: 8px; gap: 8px; }
  .dx-cta { padding: 9px 14px; font-size: 14px; }
  .dx-city { flex-basis: 190px; height: 250px; }
}
@media (prefers-reduced-motion: reduce) {
  .dx-city, .dx-heart, .dx-cta, .dx-vibe { transition: none; }
  .dx-city.flash, .dx-heart.on, .dx-chip { animation: none; }
}
</style>

<!-- Things added outside this component (page background, the flying tag, MapLibre controls) -->
<style>
body.dx-body {
  background: radial-gradient(900px 420px at 70% -120px, rgba(237, 174, 73, 0.1), transparent 70%), #001d2c fixed;
  background-color: #001d2c;
}
.dx-fly {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
  padding: 5px 12px;
  border-radius: 999px;
  background: #edae49;
  color: #001d2c;
  font-weight: 800;
  font-size: 13px;
  white-space: nowrap;
  box-shadow: 0 6px 18px rgba(237, 174, 73, 0.45);
}
.dx-mapwrap .maplibregl-ctrl-group {
  background: rgba(10, 53, 80, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.16);
}
.dx-mapwrap .maplibregl-ctrl-group button + button {
  border-top-color: rgba(255, 255, 255, 0.16);
}
.dx-mapwrap .maplibregl-ctrl-icon {
  filter: invert(1);
}
</style>
