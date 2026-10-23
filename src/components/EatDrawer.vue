<template>
  <!-- Slide-over: places to eat near the previous stop, open around the meal time -->
  <Teleport to="body">
    <transition name="ed-fade">
      <div v-if="open" class="ed-overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
        <transition name="ed-slide" appear>
          <aside class="ed" role="dialog" aria-modal="true" aria-labelledby="ed-title">
            <header class="ed-head">
              <div class="ed-titles">
                <h3 id="ed-title" class="ed-title">{{ context.icon }} {{ context.label }} ideas</h3>
                <p class="ed-sub">
                  Near <strong>{{ context.fromName || context.city || 'your day' }}</strong>
                  · open around <strong>{{ formatHour(context.start) }}</strong>
                </p>
              </div>
              <button type="button" class="ed-close" aria-label="Close" @click="emit('close')"><AppIcon name="x" :size="18" /></button>
            </header>

            <div class="ed-tools">
              <label class="ed-search">
                <AppIcon name="search" :size="16" />
                <span class="visually-hidden">Search places to eat</span>
                <input ref="searchEl" v-model="query" type="search" placeholder="Search by name or cuisine" autocomplete="off">
              </label>
              <div class="ed-chips" role="group" aria-label="Filter">
                <button v-for="f in FILTERS" :key="f.key" type="button" class="ed-chip" :class="{ on: filter === f.key }"
                  :aria-pressed="filter === f.key" @click="filter = filter === f.key ? '' : f.key">{{ f.icon }} {{ f.label }}</button>
              </div>
            </div>

            <div class="ed-body">
              <p v-if="loading" class="ed-msg" role="status"><span class="ed-spin" aria-hidden="true"></span> Finding places to eat nearby…</p>
              <p v-else-if="error" class="ed-msg bad" role="alert">{{ error }}</p>
              <p v-else-if="!shown.length" class="ed-msg">
                Nothing matches{{ filter || query ? ' those filters' : ' nearby' }}.
                <button v-if="filter || query" type="button" class="ed-link" @click="filter = ''; query = ''">Clear filters</button>
              </p>

              <article v-for="p in shown" :key="p.id" class="ed-card">
                <div class="ed-thumb" aria-hidden="true">{{ p.icon }}</div>
                <div class="ed-info">
                  <h4 class="ed-name">{{ p.name }}<small v-if="p.nameLocal"> {{ p.nameLocal }}</small></h4>
                  <p class="ed-cuisine">{{ p.cuisineText }}</p>
                  <div class="ed-badges">
                    <span class="ed-badge" :class="p.open === true ? 'ok' : p.open === false ? 'bad' : ''">{{ p.openText }}</span>
                    <span class="ed-badge">{{ p.walkText }}</span>
                    <span v-if="p.diet.vegan" class="ed-badge diet"><AppIcon name="leaf" :size="12" /> Vegan</span>
                    <span v-else-if="p.diet.vegetarian" class="ed-badge diet"><AppIcon name="leaf" :size="12" /> Vegetarian</span>
                    <span v-if="p.diet.halal" class="ed-badge diet"><AppIcon name="utensils" :size="12" /> Halal</span>
                    <span v-if="p.diet.glutenFree" class="ed-badge diet"><AppIcon name="utensils" :size="12" /> Gluten-free</span>
                    <span v-if="p.fitsYou" class="ed-badge you"><AppIcon name="check" :size="12" /> Fits your food needs</span>
                  </div>
                  <div class="ed-actions">
                    <button type="button" class="ed-add" @click="emit('add', p)">+ Add to itinerary</button>
                    <a class="ed-maps" :href="mapsUrl(p)" target="_blank" rel="noopener">↗ Google Maps</a>
                  </div>
                </div>
              </article>
            </div>

            <p class="ed-foot">From OpenStreetMap. Ratings and prices aren't available there, so check Google Maps for reviews.</p>
          </aside>
        </transition>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
// "Find somewhere to eat" for a lunch/dinner break in the planner.
// context: { label: 'Lunch', icon, start (hour), date 'YYYY-MM-DD', fromName, from: { lat, lon } | null, city }
import { ref, computed, watch, nextTick } from 'vue'
import axios from 'axios'
import { travelBetween } from '../dayOptimizer.js'
import { openStatus } from '../services/safetyService.js'
import { formatDistance } from '../userSettings.js'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  context: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['close', 'add'])

const FILTERS = [
  { key: 'quick', label: 'Quick Bites', icon: '🥪' },
  { key: 'local', label: 'Local Specialties', icon: '⭐' },
  { key: 'cafe', label: 'Cafes', icon: '☕' },
  { key: 'veg', label: 'Vegetarian', icon: '🥦' }
]
// Cuisines that count as "local" in each country (OpenStreetMap cuisine words)
const LOCAL = {
  JP: ['japanese', 'ramen', 'sushi', 'udon', 'soba', 'tempura', 'yakitori', 'izakaya', 'kaiseki', 'okonomiyaki', 'tonkatsu', 'donburi'],
  CN: ['chinese', 'sichuan', 'hot_pot', 'dumpling', 'noodle', 'cantonese', 'hunan', 'dim_sum'],
  KR: ['korean', 'korean_barbecue', 'bbq'],
  TW: ['taiwanese', 'chinese', 'bubble_tea'],
  HK: ['cantonese', 'chinese', 'dim_sum', 'noodle'],
  TH: ['thai'], VN: ['vietnamese', 'pho'], IN: ['indian', 'south_indian', 'north_indian'],
  IT: ['italian', 'pizza', 'pasta'], FR: ['french', 'crepe'], ES: ['spanish', 'tapas'], PT: ['portuguese'],
  GR: ['greek'], TR: ['turkish', 'kebab'], MX: ['mexican', 'tacos'], US: ['american', 'burger', 'barbecue'],
  MY: ['malaysian', 'chinese', 'indian', 'nasi_lemak'], SG: ['singaporean', 'chinese', 'malaysian', 'indian'],
  ID: ['indonesian'], PH: ['filipino'], EG: ['egyptian', 'arab'], MA: ['moroccan'], RU: ['russian', 'georgian']
}
const ICONS = { ramen: '🍜', noodle: '🍜', sushi: '🍣', pizza: '🍕', burger: '🍔', chinese: '🥟', dumpling: '🥟', korean: '🍲', thai: '🍛', indian: '🍛', coffee_shop: '☕', bakery: '🥐', dessert: '🍰', ice_cream: '🍨', vegetarian: '🥦', vegan: '🌱', seafood: '🦐', kebab: '🥙', mexican: '🌮', italian: '🍝', japanese: '🍱' }

const places = ref([])
const loading = ref(false)
const error = ref('')
const query = ref('')
const filter = ref('')
const searchEl = ref(null)
const where = ref(null)       // { lat, lon } we searched around
const country = ref('')
let myDiet = null             // from Settings (asked once)

async function load() {
  error.value = ''
  places.value = []
  loading.value = true
  try {
    let point = props.context.from
    if (props.context.city) {
      const res = await axios.get('/api/safety/locate', { params: { place: props.context.city } }).catch(() => null)
      if (res) {
        country.value = res.data.countryCode || ''
        if (!point) point = { lat: res.data.lat, lon: res.data.lon }
      }
    }
    if (!point) throw new Error('no place')
    where.value = point
    if (myDiet === null) {
      myDiet = await axios.get('/api/auth/me').then((r) => r.data.diet || []).catch(() => [])
    }
    const res = await axios.get('/api/eat', { params: { lat: point.lat, lon: point.lon }, timeout: 30000 })
    places.value = res.data
  } catch (err) {
    error.value = err.message === 'no place'
      ? "We don't know where this day is yet. Add an address to the stop before this meal."
      : 'Places to eat are unavailable right now. Try again in a moment.'
  }
  loading.value = false
}

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  query.value = ''
  filter.value = ''
  load()
  nextTick(() => searchEl.value && searchEl.value.focus())
})

// Cards: walking time, open at the meal time, diet badges; open places and closer ones first
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  const at = props.context.date ? new Date(props.context.date + 'T00:00:00') : new Date()
  const hour = props.context.start || 12
  at.setHours(Math.floor(hour), Math.round((hour % 1) * 60))
  const localWords = LOCAL[country.value] || []
  const list = []
  for (const p of places.value) {
    const cuisines = p.cuisine
    if (q && !(p.name.toLowerCase().includes(q) || cuisines.some((c) => c.includes(q)))) continue
    const isCafe = p.kind === 'cafe' || cuisines.includes('coffee_shop')
    if (filter.value === 'quick' && !(p.kind === 'fast_food' || p.kind === 'food_court' || cuisines.some((c) => ['sandwich', 'noodle', 'ramen', 'kebab', 'burger'].includes(c)))) continue
    if (filter.value === 'cafe' && !isCafe) continue
    if (filter.value === 'veg' && !(p.diet.vegetarian || cuisines.includes('vegetarian') || cuisines.includes('vegan'))) continue
    if (filter.value === 'local' && !(p.kind === 'restaurant' && cuisines.some((c) => (localWords.length ? localWords.includes(c) : c === 'regional')))) continue

    const walk = where.value ? travelBetween(where.value, p) : null
    const status = openStatus(p.openingHours, at)
    let icon = isCafe ? '☕' : p.kind === 'fast_food' ? '🍔' : '🍽'
    for (const c of cuisines) if (ICONS[c]) { icon = ICONS[c]; break }
    list.push({
      ...p,
      icon,
      cuisineText: cuisines.length ? cuisines.map((c) => c.replace(/_/g, ' ')).slice(0, 3).join(' · ') : ({ cafe: 'Café', fast_food: 'Quick bites', food_court: 'Food court' }[p.kind] || 'Restaurant'),
      open: status.open,
      openText: status.open === true ? 'Open at ' + formatHour(hour) : status.open === false ? 'Closed at ' + formatHour(hour) : 'Hours not listed',
      walkMin: walk ? walk.min : 99,
      walkText: walk ? (walk.mode === 'walk' ? '🚶 ' + walk.min + ' min (' + formatDistance(walk.km) + ')' : '🚇 ' + walk.min + ' min') : '',
      fitsYou: fits(p)
    })
  }
  const rank = (x) => (x.open === true ? 0 : x.open === null ? 1 : 2)
  list.sort((a, b) => rank(a) - rank(b) || a.walkMin - b.walkMin)
  return list.slice(0, 40)
})

// Only checks what OpenStreetMap can tell us (vegetarian, vegan, halal, gluten-free)
function fits(p) {
  if (!myDiet || !myDiet.length) return false
  let checked = 0
  for (const d of myDiet) {
    if (d === 'vegetarian') { if (!p.diet.vegetarian) return false; checked++ }
    if (d === 'vegan') { if (!p.diet.vegan) return false; checked++ }
    if (d === 'halal') { if (!p.diet.halal) return false; checked++ }
    if (d === 'gluten-free') { if (!p.diet.glutenFree) return false; checked++ }
  }
  return checked > 0
}

function mapsUrl(p) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.name + ' ' + p.lat + ',' + p.lon)
}
function formatHour(h) {
  const hour = Math.floor(h || 0) % 24
  const min = Math.round(((h || 0) % 1) * 60)
  return (hour % 12 === 0 ? 12 : hour % 12) + ':' + String(min).padStart(2, '0') + (hour >= 12 ? ' PM' : ' AM')
}
</script>

<style scoped>
.ed-overlay {
  position: fixed;
  inset: 0;
  z-index: 1290;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.ed {
  --mint: #edae49;
  --line: rgba(255, 255, 255, 0.08);
  --muted: #8b949e;
  --text: #e6edf3;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  background: #00283c;
  color: var(--text);
  border-left: 1px solid var(--line);
  box-shadow: -20px 0 50px rgba(0, 0, 0, 0.4);
}
.ed-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  padding: 18px 18px 10px;
}
.ed-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  margin: 0;
  color: #fff;
}
.ed-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted);
}
.ed-sub strong {
  color: var(--text);
  font-weight: 600;
}
.ed-close {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
}
.ed-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}
.ed-tools {
  padding: 0 18px 12px;
  border-bottom: 1px solid var(--line);
}
.ed-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: 12px;
  background: #0a3550;
  border: 1px solid var(--line);
  color: var(--muted);
}
.ed-search:focus-within {
  border-color: var(--mint);
  box-shadow: 0 0 0 3px rgba(237, 174, 73, 0.15);
}
.ed-search input {
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text);
  padding: 9px 0;
  font-size: 14px;
}
.ed-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.ed-chip {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #0a3550;
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 11px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.ed-chip:hover {
  color: #fff;
}
.ed-chip.on {
  background: rgba(237, 174, 73, 0.14);
  border-color: rgba(237, 174, 73, 0.4);
  color: var(--mint);
}
.ed-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ed-msg {
  color: var(--muted);
  font-size: 14px;
  margin: 8px 0;
}
.ed-msg.bad {
  color: #f09aa5;
}
.ed-link {
  border: 0;
  background: none;
  padding: 0;
  color: var(--mint);
  font-weight: 600;
  text-decoration: underline;
}
.ed-spin {
  display: inline-block;
  width: 13px;
  height: 13px;
  margin-right: 6px;
  vertical-align: -2px;
  border: 2px solid rgba(237, 174, 73, 0.3);
  border-top-color: var(--mint);
  border-radius: 50%;
  animation: ed-spin 0.8s linear infinite;
}
.ed-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: #0a3550;
  border: 1px solid var(--line);
  transition: border-color 0.15s, transform 0.15s;
}
.ed-card:hover {
  border-color: rgba(255, 255, 255, 0.16);
  transform: translateY(-1px);
}
.ed-thumb {
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 26px;
  background: linear-gradient(135deg, rgba(237, 174, 73, 0.18), rgba(255, 255, 255, 0.04));
}
.ed-info {
  flex: 1;
  min-width: 0;
}
.ed-name {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
  color: #fff;
}
.ed-name small {
  font-weight: 400;
  color: var(--muted);
}
.ed-cuisine {
  margin: 2px 0 6px;
  font-size: 12px;
  color: var(--muted);
  text-transform: capitalize;
}
.ed-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.ed-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #cbd5e1;
}
.ed-badge.ok {
  background: rgba(237, 174, 73, 0.12);
  color: #f8deb0;
}
.ed-badge.bad {
  background: rgba(209, 73, 91, 0.14);
  color: #f3b7bf;
}
.ed-badge.diet {
  background: rgba(88, 166, 255, 0.12);
  color: #c9e1ff;
}
.ed-badge.you {
  background: rgba(237, 174, 73, 0.2);
  color: var(--mint);
}
.ed-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}
.ed-add {
  border: 0;
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 700;
  background: var(--mint);
  color: #00283c;
  transition: transform 0.15s, filter 0.15s;
}
.ed-add:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}
.ed-maps {
  font-size: 12px;
  color: var(--muted);
  text-decoration: none;
}
.ed-maps:hover {
  color: #fff;
  text-decoration: underline;
}
.ed-foot {
  margin: 0;
  padding: 10px 18px 14px;
  font-size: 11px;
  color: var(--muted);
  border-top: 1px solid var(--line);
}
.ed button:focus-visible,
.ed a:focus-visible {
  outline: 2px solid var(--mint);
  outline-offset: 2px;
}

/* Slide in from the right */
.ed-fade-enter-active,
.ed-fade-leave-active {
  transition: opacity 0.2s;
}
.ed-fade-enter-from,
.ed-fade-leave-to {
  opacity: 0;
}
.ed-slide-enter-active {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.ed-slide-enter-from {
  transform: translateX(100%);
}
@keyframes ed-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .ed-slide-enter-active,
  .ed-fade-enter-active,
  .ed-fade-leave-active {
    transition: none;
  }
  .ed-spin {
    animation: none;
  }
}
</style>
