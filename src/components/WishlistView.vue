<template>
  <div>
    <!-- Indoor / outdoor filter (the "Find a place" box below is the only search) -->
    <div class="wl-filters" role="group" aria-label="Show">
      <button v-for="f in filterOptions" :key="f.value" type="button" class="wl-chip" :class="{ active: filter === f.value }"
        :aria-pressed="filter === f.value" @click="filter = f.value">{{ f.label }}</button>
    </div>

    <!-- ===== Your wishlist ===== -->
    <h3 class="wl-heading">Your wishlist <span class="wl-count">{{ wishlist.length }}</span></h3>

    <transition-group v-if="shownWishlist.length" name="card" tag="div" class="wl-grid" data-testid="wishlist">
      <article v-for="w in shownWishlist" :key="w.id" :data-wish="w.id" class="wl-card mine" :class="{ 'has-photo': photoOf(w), editing: editId === w.id }" :style="{ '--tint': tintFor(w.type) }">
        <!-- A real photo of the place when Wikipedia has one, otherwise a simple icon -->
        <div class="wl-photo" :class="{ loading: photos[photoTitle(w)] === '' }" :style="photoOf(w) ? { backgroundImage: 'url(' + photoOf(w) + ')' } : null" aria-hidden="true">
          <AppIcon v-if="!photoOf(w)" :name="iconFor(w.type)" :size="44" class="wl-ph-icon" />
        </div>
        <span class="wl-type"><AppIcon :name="iconFor(w.type)" :size="13" />
          <template v-if="w.type === 'tour'">{{ w.bookedVia ? 'Booked · ' + w.bookedVia : 'Tour' }}<template v-if="w.duration"> · {{ lengthText(w.duration) }}</template></template>
          <template v-else>{{ placeStyle(w.type).label }}<template v-if="!w.outdoor"> · Indoor</template></template>
        </span>
        <div class="wl-actions">
          <a v-if="w.link" :href="w.link" target="_blank" rel="noopener" class="wl-round" :aria-label="'Open booking for ' + w.name" title="Open booking">↗</a>
          <button type="button" class="wl-round" :aria-label="'Edit ' + w.name" title="Edit" @click="startEdit(w)"><AppIcon name="pencil" :size="14" /></button>
          <button type="button" class="wl-heart filled" :aria-label="'Remove ' + w.name + ' from wishlist'" title="Remove" @click="remove(w)"><AppIcon name="heart" :size="17" filled /></button>
        </div>
        <div class="wl-info">
          <h4 class="wl-name" :title="w.name">{{ w.name }}</h4>
          <span class="wl-sub" :title="w.address || ''">
            <template v-if="w.city">{{ flagFor(w.city) }} {{ w.city.split(', ')[0] }}</template><template v-if="w.city && streetOf(w)"> · </template>{{ streetOf(w) }}
          </span>
          <span v-if="w.votes && w.votes.length" class="wl-votes" :title="w.votes.join(', ') + ' want to go'"><AppIcon name="thumbs-up" :size="12" /> {{ w.votes.length }} want to go</span>
        </div>
      </article>
    </transition-group>
    <p v-else class="wl-empty">
      {{ wishlist.length ? 'No saved places match this filter.' : 'No places yet. Tap the heart on a popular place below, or add your own.' }}
    </p>

    <!-- Edit panel -->
    <transition name="fade">
      <!-- Opening it scrolls here; Save or Cancel scrolls back to the card -->
      <form v-if="editId" ref="editPanel" class="wl-panel" aria-labelledby="wl-edit-title" @submit.prevent="saveEdit" @keydown.esc="cancelEdit">
        <strong id="wl-edit-title" class="d-block mb-2">Edit place</strong>
        <div class="row g-2">
          <div class="col-md-5">
            <label for="wl-edit-name" class="form-label small">Name</label>
            <input id="wl-edit-name" v-model="editForm.name" class="form-control wl-input" maxlength="120">
          </div>
          <div class="col-md-5">
            <label for="wl-edit-address" class="form-label small">Address <span class="text-muted">(optional, turns on crowd info)</span></label>
            <input id="wl-edit-address" v-model="editForm.address" class="form-control wl-input" maxlength="200">
          </div>
          <div v-if="editForm.isTour" class="col-md-10">
            <label for="wl-edit-link" class="form-label small">Booking link</label>
            <input id="wl-edit-link" v-model="editForm.link" type="url" class="form-control wl-input" maxlength="500" placeholder="https://">
          </div>
          <div class="col-md-2 d-flex align-items-end gap-1">
            <button type="submit" class="btn btn-primary wl-pill-btn flex-fill">Save</button>
            <button type="button" class="btn btn-outline-secondary wl-pill-btn flex-fill" @click="cancelEdit">Cancel</button>
          </div>
        </div>
      </form>
    </transition>

    <!-- Find a place (any shop, restaurant, temple...) or add your own -->
    <form class="wl-add" @submit.prevent="chooseActive">
      <CustomDropdown v-if="destinations.length > 1" v-model="searchIn" :options="cityOptions" class="wl-in"
        header-text="Search in" aria-label="Search in" @change="runSearch" />
      <div class="wl-add-name position-relative">
        <label for="wish-name" class="visually-hidden">Find a place</label>
        <input id="wish-name" v-model="form.name" class="form-control wl-input" maxlength="120" autocomplete="off"
          :placeholder="'Find a place in ' + (searchIn ? searchIn.split(', ')[0] : 'your destination')"
          role="combobox" aria-autocomplete="list" aria-controls="wish-suggest"
          :aria-expanded="showSuggest && rows.length > 0"
          :aria-activedescendant="active >= 0 ? 'wish-opt-' + active : null"
          @focus="showSuggest = true" @blur="showSuggest = false" @input="onType" @keydown="onKeydown"
          data-testid="wish-name">

        <ul v-if="showSuggest && rows.length" id="wish-suggest" class="wl-suggest" role="listbox">
          <li v-for="(row, k) in rows" :id="'wish-opt-' + k" :key="row.key" role="option"
            :class="['wl-row-' + row.kind, { active: k === active }]" :aria-selected="k === active"
            :aria-expanded="row.kind === 'chain' ? openChain === row.name : null"
            @mousedown.prevent="choose(row)" @mouseenter="active = k">
            <span class="wl-row-icon" aria-hidden="true">{{ row.icon }}</span>
            <span class="wl-row-text">
              <!-- The part that matches what you typed is highlighted -->
              <strong v-if="row.kind === 'own' || row.kind === 'branch'">{{ row.name }}</strong>
              <strong v-else><template v-for="(part, n) in highlight(row.name)" :key="n"><mark v-if="part.hit" class="wl-hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></strong>
              <span v-if="row.note" class="wl-row-note"> {{ row.note }}</span>
              <span v-if="row.sub" class="d-block small text-muted text-truncate">{{ row.sub }}</span>
            </span>
            <span v-if="row.kind === 'chain'" class="wl-row-arrow" aria-hidden="true">{{ openChain === row.name ? '▾' : '›' }}</span>
          </li>
        </ul>
        <p v-if="showSuggest && searching" class="wl-searching small text-muted" role="status">Searching…</p>
        <!-- Search failed: a clear message under the box (not on top of the text), with Try again -->
        <div v-else-if="showSuggest && searchError && form.name.trim().length >= 2" class="wl-search-msg" role="status">
          <span>{{ searchError }} Press <strong>Enter</strong> to add "{{ form.name.trim() }}" as your own place.</span>
          <button type="button" class="wl-search-retry" @mousedown.prevent="runSearch">Try again</button>
        </div>
      </div>
      <label for="wish-address" class="visually-hidden">Address</label>
      <input id="wish-address" v-model="form.address" class="form-control wl-input wl-add-address" maxlength="200" placeholder="Address (optional, for your own place)">
      <button type="submit" class="btn btn-primary wl-pill-btn" :disabled="!form.name.trim()" data-testid="wish-add">+ Add</button>
      <button type="button" class="btn wl-pill-btn wl-tour-btn" :class="{ on: tourOpen }" :aria-expanded="tourOpen"
        title="Add a tour or activity you booked, e.g. on GetYourGuide" @click="tourOpen ? (tourOpen = false) : openTour()"><AppIcon name="ticket" :size="16" /> Add a tour</button>
    </form>

    <!-- A tour or activity that isn't on the map (eagle hunting, a GetYourGuide day trip...) -->
    <transition name="fade">
      <form v-if="tourOpen" class="wl-tour" @submit.prevent="saveTour" aria-labelledby="wl-tour-title">
        <div class="wl-tour-head">
          <strong id="wl-tour-title"><AppIcon name="ticket" :size="17" /> Add a tour or activity</strong>
          <button type="button" class="wl-tour-x" aria-label="Close" @click="tourOpen = false"><AppIcon name="x" :size="16" /></button>
        </div>

        <label for="wl-tour-name" class="wl-tour-label">What is it?</label>
        <input id="wl-tour-name" ref="tourName" v-model="tour.name" class="form-control wl-input" maxlength="120"
          placeholder="e.g. Eagle hunting show at Bokonbaevo" required>

        <div class="wl-tour-row">
          <div>
            <span class="wl-tour-label">Booked on</span>
            <CustomDropdown v-model="tour.bookedVia" :options="providerOptions" block aria-label="Booked on" />
          </div>
          <div>
            <label for="wl-tour-link" class="wl-tour-label">Booking link <span class="wl-opt">optional</span></label>
            <input id="wl-tour-link" v-model="tour.link" type="url" class="form-control wl-input" maxlength="500"
              placeholder="Paste the confirmation or tour page" @input="guessProvider">
          </div>
        </div>

        <label for="wl-tour-where" class="wl-tour-label">Meeting point <span class="wl-opt">optional</span></label>
        <input id="wl-tour-where" v-model="tour.address" class="form-control wl-input" maxlength="200" placeholder="Hotel pickup, or an address">

        <span class="wl-tour-label">How long?</span>
        <div class="wl-seg" role="group" aria-label="How long">
          <button v-for="d in lengthOptions" :key="d.value" type="button" :class="{ on: tour.duration === d.value }"
            :aria-pressed="tour.duration === d.value" @click="tour.duration = d.value">{{ d.label }}</button>
        </div>

        <span class="wl-tour-label">Mostly</span>
        <div class="wl-seg" role="group" aria-label="Indoor or outdoor">
          <button type="button" :class="{ on: tour.outdoor }" :aria-pressed="tour.outdoor" @click="tour.outdoor = true"><AppIcon name="trees" :size="15" /> Outdoor</button>
          <button type="button" :class="{ on: !tour.outdoor }" :aria-pressed="!tour.outdoor" @click="tour.outdoor = false"><AppIcon name="landmark" :size="15" /> Indoor</button>
        </div>

        <div v-if="tripDays.length" class="wl-tour-row">
          <div>
            <span class="wl-tour-label">Already have a date? <span class="wl-opt">optional</span></span>
            <CustomDropdown v-model="tour.date" :options="dayOptions" block aria-label="Day" />
          </div>
          <div>
            <label for="wl-tour-time" class="wl-tour-label">Starts at</label>
            <input id="wl-tour-time" v-model="tour.time" type="time" class="form-control wl-input" :disabled="!tour.date">
          </div>
        </div>
        <p class="wl-tour-note">
          <template v-if="tour.date && tour.time">It goes straight into your itinerary as a fixed booking, so the optimizer plans around it.</template>
          <template v-else>It goes into your wishlist, ready to drop into any day.</template>
        </p>
        <p v-if="tourError" class="text-danger small mb-2" role="alert">{{ tourError }}</p>

        <div class="d-flex gap-2 justify-content-end">
          <button type="button" class="btn btn-outline-secondary wl-pill-btn" @click="tourOpen = false">Cancel</button>
          <button type="submit" class="btn btn-primary wl-pill-btn" :disabled="!tour.name.trim()">
            {{ tour.date && tour.time ? 'Add to Day ' + dayNumber(tour.date) : 'Add to wishlist' }}
          </button>
        </div>
      </form>
    </transition>

    <!-- ===== Popular places: one section per destination ===== -->
    <section v-for="sec in sections" :key="sec.dest" class="mt-5" :aria-label="'Popular in ' + sec.city">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h3 class="wl-heading mb-0">{{ sec.flag }} Popular in {{ sec.city }}</h3>
        <span v-if="sec.list.length" class="small text-muted">{{ sec.list.length }} places · from {{ sec.list.every((p) => p.source === 'wikipedia') ? 'Wikipedia' : 'OpenStreetMap' }}</span>
      </div>

      <div v-if="sec.loading" aria-busy="true">
        <p class="small text-muted">Finding popular places… the first time for a whole country can take up to a minute.</p>
        <div class="wl-grid"><div v-for="n in 6" :key="n" class="wl-card skeleton"></div></div>
      </div>
      <div v-else-if="sec.error" class="alert alert-warning d-flex justify-content-between align-items-center" role="alert">
        <span>{{ sec.error }}</span>
        <button class="btn btn-sm btn-outline-secondary" @click="loadPopular(sec.dest)">Try again</button>
      </div>
      <p v-else-if="!sec.list.length" class="wl-empty">No popular places found in {{ sec.city }}. You can still add your own above.</p>

      <template v-else>
        <!-- Narrow down by kind: Museums, Parks, Theme parks... (with how many of each) -->
        <div v-if="kindsOf(sec.dest).length > 1" class="wl-kinds">
          <span class="wl-kinds-label">Show</span>
          <CustomDropdown :model-value="kindFilter[sec.dest] || ''" :options="kindOptions(sec.dest)" header-text="Kind of place"
            :aria-label="'Kind of places to show in ' + sec.city" @update:model-value="kindFilter[sec.dest] = $event" />
        </div>
        <transition-group name="card" tag="div" class="wl-grid" data-testid="popular-list">
          <!-- The whole card is the button: tap to save, tap again to un-save -->
          <article v-for="p in sec.list.slice(0, sec.shown)" :key="p.name" class="wl-card wl-tap" :class="{ saved: isAdded(p), 'has-photo': photoOf(p) }" :style="{ '--tint': tintFor(p.type) }"
            role="button" tabindex="0" :aria-pressed="isAdded(p)" :aria-label="(isAdded(p) ? 'Remove ' : 'Add ') + p.name + (isAdded(p) ? ' from' : ' to') + ' wishlist'"
            @click="togglePopular(p)" @keydown.enter.prevent="togglePopular(p)" @keydown.space.prevent="togglePopular(p)" data-testid="popular-add">
            <div class="wl-photo" :class="{ loading: photos[photoTitle(p)] === '' }" :style="photoOf(p) ? { backgroundImage: 'url(' + photoOf(p) + ')' } : null" aria-hidden="true">
              <AppIcon v-if="!photoOf(p)" :name="iconFor(p.type)" :size="44" class="wl-ph-icon" />
            </div>
            <span class="wl-type"><AppIcon :name="iconFor(p.type)" :size="13" /> {{ placeStyle(p.type).label }}<template v-if="p.indoor"> · Indoor</template></span>
            <span class="wl-heart" :class="{ filled: isAdded(p) }" aria-hidden="true"><AppIcon name="heart" :size="17" :filled="isAdded(p)" /></span>
            <div class="wl-info">
              <h4 class="wl-name" :title="p.name">{{ p.name }}</h4>
              <span class="wl-sub">{{ isAdded(p) ? '✓ In your wishlist' : 'Tap to save' }}</span>
            </div>
          </article>
        </transition-group>
        <div v-if="sec.shown < sec.list.length" class="text-end mt-3">
          <button type="button" class="btn btn-sm btn-outline-secondary wl-pill-btn" @click="showMore(sec.dest)">
            Show more in {{ sec.city }}
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<script>
import axios from 'axios'
import { trip, newId, runtimeStop } from '../itineraryStore.js'
import { codeForDestination, flagEmoji } from '../destinations.js'
import { placeStyle } from '../placeStyle.js'
import CustomDropdown from './CustomDropdown.vue'
import AppIcon from './AppIcon.vue'

// ---------- search matching ----------
// One letter without its accent, lower case: "É" -> "e" (so "cafe" finds "Café")
function plainChar(c) {
  return c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().charAt(0) || c
}
function plain(text) {
  let out = ''
  for (const c of String(text)) out += plainChar(c)
  return out
}
// How well a name matches what was typed (0 = not at all):
// starts with it 70, a word starts with it 50, every typed word starts a word ("lake phew" -> Phewa Lake) 45, inside it 25
function matchScore(typed, name) {
  const q = plain(typed.trim())
  const n = plain(name)
  if (!q) return 0
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
  return 0
}

function emptyTour() {
  return { name: '', bookedVia: '', link: '', address: '', duration: 3, outdoor: true, date: '', time: '' }
}

export default {
  components: { AppIcon, CustomDropdown },
  props: {
    // All of the trip's destinations, e.g. ['Tokyo, Japan', 'Kyoto, Japan']
    destinations: { type: Array, default: () => [] },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' }
  },

  data() {
    return {
      popularByDest: {}, // destination -> list from the server
      photos: {},        // 'Juche Tower, Pyongyang' -> photo URL ('' = looking, null = none)
      kindFilter: {},    // destination -> place type shown ('' = all)
      status: {}, // destination -> { loading, error, shown }
      filter: 'all',
      filterOptions: [
        { value: 'all', label: 'All' },
        { value: 'indoor', label: '🏛 Indoor' },
        { value: 'outdoor', label: '🌳 Outdoor' }
      ],
      form: { name: '', address: '' },
      showSuggest: false,
      searchIn: '',      // which destination "Find a place" searches in
      found: [],         // results from /api/places/search
      searching: false,
      searchError: '',
      searchTimer: null,
      openChain: null,   // name of the chain whose branches are shown
      active: -1,
      editId: null,
      editForm: { name: '', address: '', link: '', isTour: false },
      tourOpen: false,
      tour: emptyTour(),
      tourError: '',
      providerOptions: [
        { value: '', label: 'Not booked yet' },
        { value: 'GetYourGuide', label: 'GetYourGuide' },
        { value: 'Tripadvisor', label: 'Tripadvisor' },
        { value: 'Viator', label: 'Viator' },
        { value: 'Klook', label: 'Klook' },
        { value: 'Airbnb Experiences', label: 'Airbnb Experiences' },
        { value: 'Local operator', label: 'Directly with a local operator' },
        { value: 'Other', label: 'Somewhere else' }
      ],
      lengthOptions: [
        { value: 1, label: '1 h' },
        { value: 2, label: '2 h' },
        { value: 3, label: '3 h' },
        { value: 4, label: 'Half day' },
        { value: 8, label: 'Full day' }
      ]
    }
  },

  watch: {
    // New saved places (or a different kind chip) need their photos
    'wishlist.length'() {
      this.loadPhotos()
    },
    kindFilter: {
      deep: true,
      handler() {
        this.$nextTick(this.loadPhotos)
      }
    },
    // Load every destination's popular places when the trip's destinations arrive
    destinations: {
      immediate: true,
      handler(list) {
        for (const d of list) {
          if (!this.status[d]) this.loadPopular(d)
        }
        if (!list.includes(this.searchIn)) this.searchIn = list[0] || ''
      }
    }
  },

  computed: {
    // Every date of the trip, e.g. ['2026-10-12', '2026-10-13', ...]
    tripDays() {
      const days = []
      if (!this.startDate || !this.endDate) return days
      const d = new Date(this.startDate + 'T00:00:00')
      const end = new Date(this.endDate + 'T00:00:00')
      while (d <= end && days.length < 60) {
        days.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))
        d.setDate(d.getDate() + 1)
      }
      return days
    },
    dayOptions() {
      const list = [{ value: '', label: 'Not yet' }]
      for (let i = 0; i < this.tripDays.length; i++) {
        const d = new Date(this.tripDays[i] + 'T00:00:00')
        list.push({ value: this.tripDays[i], label: 'Day ' + (i + 1) + ' · ' + d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) })
      }
      return list
    },
    cityOptions() {
      const list = []
      for (const d of this.destinations) list.push({ value: d, label: d.split(', ')[0], icon: this.flagFor(d), description: d.split(', ').slice(1).join(', ') })
      return list
    },
    // The shared wishlist (saved together with the itinerary)
    wishlist() {
      return trip.wishlist
    },

    shownWishlist() {
      const list = []
      for (const w of this.wishlist) {
        if (this.matches(w.name, !w.outdoor)) list.push(w)
      }
      return list
    },

    // One section per destination, with the search + filter applied
    sections() {
      const result = []
      for (const d of this.destinations) {
        const st = this.status[d] || { loading: true, error: '', shown: 12 }
        const list = []
        for (const p of this.popularByDest[d] || []) {
          if (this.kindFilter[d] && p.type !== this.kindFilter[d]) continue
          if (this.matches(p.name, p.indoor)) list.push(p)
        }
        result.push({
          dest: d,
          city: d.split(', ')[0],
          flag: this.flagFor(d),
          list,
          loading: st.loading,
          error: st.error,
          shown: st.shown
        })
      }
      return result
    },

    // Rows in the "Find a place" dropdown: popular matches, search results (chains grouped), then "add your own"
    rows() {
      const q = this.form.name.trim()
      if (q.length < 2) return []
      const rows = []
      const names = []

      // 1. Popular places in this destination: shown instantly (no waiting for the search), best match first
      const popular = []
      for (const p of this.popularByDest[this.searchIn] || []) {
        const score = matchScore(q, p.name)
        if (score > 0 && !this.isAdded(p)) popular.push({ p, score })
      }
      popular.sort((a, b) => b.score - a.score)
      for (const m of popular.slice(0, 4)) {
        const p = m.p
        rows.push({ key: 'p-' + p.name, kind: 'popular', name: p.name, note: '★ Popular', sub: placeStyle(p.type).label, icon: placeStyle(p.type).icon, place: p })
        names.push(plain(p.name))
      }

      // 2. Search results
      for (const g of this.found) {
        if (names.includes(plain(g.name)) || this.isAdded(g)) continue
        const icon = placeStyle(g.type).icon
        if (g.branches.length === 1) {
          const far = this.kmText(g.branches[0].km)
          rows.push({ key: 'f-' + g.name, kind: 'place', name: g.name, note: g.kind, sub: g.branches[0].address + (far ? ' · ' + far : ''), icon, group: g, branch: g.branches[0] })
        } else {
          const far = this.kmText(g.km)
          rows.push({ key: 'c-' + g.name, kind: 'chain', name: g.name, note: g.kind, sub: 'See ' + g.branches.length + ' locations' + (far ? ' · nearest ' + far : ''), icon, group: g })
          if (this.openChain === g.name) {
            for (const b of g.branches) {
              const bFar = this.kmText(b.km)
              rows.push({ key: 'b-' + g.name + b.address, kind: 'branch', name: b.address + (bFar ? ' · ' + bFar : ''), note: '', sub: '', icon: '📍', group: g, branch: b })
            }
          }
        }
      }

      // 3. Not found? Add exactly what was typed
      rows.push({ key: 'own', kind: 'own', name: 'Add "' + q + '" as your own place', note: '', sub: this.form.address.trim() || '', icon: '＋' })
      return rows
    }
  },

  methods: {
    placeStyle,

    // Split a name into the bit that matches what was typed and the rest: "Phewa Lake" + "phew" -> [Phew][a Lake]
    highlight(name) {
      const q = plain(this.form.name.trim())
      const n = plain(name)
      // Prefer a match at the start of a word ("lake" in "Phewa Lake"), else anywhere
      let at = -1
      for (let i = 0; i < n.length && at < 0; i++) {
        if (n.startsWith(q, i) && (i === 0 || /[\s\-,('’]/.test(n.charAt(i - 1)))) at = i
      }
      if (at < 0) at = n.indexOf(q)
      if (at < 0 || !q) return [{ text: name, hit: false }]
      const chars = Array.from(name)
      return [
        { text: chars.slice(0, at).join(''), hit: false },
        { text: chars.slice(at, at + q.length).join(''), hit: true },
        { text: chars.slice(at + q.length).join(''), hit: false }
      ]
    },
    // 2.4 -> "2.4 km from the centre" (nothing for a country-wide search or no distance)
    kmText(km) {
      if (km == null || this.searchIn.split(', ').length < 2) return ''
      return (km < 1 ? 'under 1 km' : km < 10 ? km.toFixed(1) + ' km' : Math.round(km) + ' km') + ' from the centre'
    },

    lengthText(h) {
      if (h >= 8) return 'Full day'
      if (h >= 4) return 'Half day'
      return h + ' h'
    },
    dayNumber(date) {
      return this.tripDays.indexOf(date) + 1
    },

    openTour() {
      this.tour = emptyTour()
      this.tour.name = this.form.name.trim() // carry over whatever was typed in "Find a place"
      this.tourError = ''
      this.tourOpen = true
      this.$nextTick(() => this.$refs.tourName && this.$refs.tourName.focus())
    },
    // Pasting a GetYourGuide / Klook... link picks the site for you
    guessProvider() {
      const link = this.tour.link.toLowerCase()
      const sites = [['getyourguide', 'GetYourGuide'], ['tripadvisor', 'Tripadvisor'], ['viator', 'Viator'], ['klook', 'Klook'], ['airbnb', 'Airbnb Experiences']]
      for (const site of sites) {
        if (link.includes(site[0])) this.tour.bookedVia = site[1]
      }
    },
    saveTour() {
      const t = this.tour
      const name = t.name.trim()
      if (!name) return
      let link = t.link.trim()
      if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link
      if (link && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(link)) {
        this.tourError = 'That booking link doesn\'t look right. Check it or leave it empty.'
        return
      }
      const item = {
        id: newId('w'), name, address: t.address.trim() || null, outdoor: t.outdoor, type: 'tour',
        city: this.searchIn || null, votes: [], duration: t.duration, bookedVia: t.bookedVia || null, link: link || null
      }
      trip.wishlist.push(item)
      // A booked date + time: put it straight on that day, locked so nothing moves it
      if (t.date && t.time) {
        const parts = t.time.split(':')
        const hour = Math.min(23.75, Number(parts[0]) + Number(parts[1]) / 60)
        trip.stops.push(runtimeStop({ id: newId('s'), name, address: item.address, date: t.date, hour, duration: t.duration, outdoor: t.outdoor, locked: true }))
      }
      this.form.name = ''
      this.tourOpen = false
    },

    // Indoor/Outdoor filter
    matches(name, indoor) {
      if (this.filter === 'indoor' && !indoor) return false
      if (this.filter === 'outdoor' && indoor) return false
      return true
    },

    // First part of the address, e.g. "13 Okazaki Park" (skipped if it is just the place's name)
    streetOf(w) {
      if (!w.address) return ''
      const first = w.address.split(',')[0].trim()
      if (first.toLowerCase() === w.name.toLowerCase()) return ''
      if (w.city && first.toLowerCase() === w.city.split(', ')[0].toLowerCase()) return '' // just the city again
      return first
    },

    showMore(dest) {
      this.status[dest].shown += 12
      this.$nextTick(this.loadPhotos)
    },

    // ---------- photos and icons ----------
    // Photos come from /api/places/photos (Wikipedia, Wikidata and Wikimedia Commons), asked per city
    cityOf(place) {
      return place.city || this.destinations[0] || ''
    },
    photoTitle(place) {
      return place.name + '|' + this.cityOf(place)
    },
    photoOf(place) {
      return this.photos[this.photoTitle(place)] || null
    },
    // Ask for photos of everything on screen that we haven't asked about yet (up to 40 per request)
    async loadPhotos() {
      const places = this.wishlist.slice()
      for (const sec of this.sections) {
        for (const p of sec.list.slice(0, sec.shown)) places.push(p)
      }
      const byCity = {} // city -> names still to ask about
      for (const p of places) {
        const key = this.photoTitle(p)
        if (key in this.photos) continue
        this.photos[key] = '' // looking
        const city = this.cityOf(p)
        if (!byCity[city]) byCity[city] = []
        byCity[city].push(p.name)
      }
      for (const city in byCity) {
        const names = byCity[city]
        for (let i = 0; i < names.length; i += 40) {
          const batch = names.slice(i, i + 40)
          try {
            const res = await axios.get('/api/places/photos', { params: { city, names: batch.join('|') } })
            for (const n of batch) this.photos[n + '|' + city] = res.data[n] || null
          } catch (err) {
            for (const n of batch) delete this.photos[n + '|' + city] // try again next time
          }
        }
      }
    },
    // No photo: the card glows in a colour from the palette that fits the kind of place
    tintFor(type) {
      const tints = { museum: '#00798c', gallery: '#00798c', heritage: '#d1495b', park: '#66a182', zoo: '#66a182', aquarium: '#00798c',
        viewpoint: '#edae49', theme_park: '#edae49', food: '#edae49', shop: '#d1495b', tour: '#edae49' }
      return tints[type] || '#edae49'
    },
    // A simple line icon for each kind of place
    iconFor(type) {
      const icons = { museum: 'landmark', gallery: 'image', heritage: 'landmark', viewpoint: 'camera', park: 'trees', zoo: 'leaf', aquarium: 'leaf',
        theme_park: 'sparkles', food: 'utensils', shop: 'tag', transport: 'train', tour: 'ticket', attraction: 'map-pin' }
      return icons[type] || 'map-pin'
    },
    // For the dropdown: "All places (77)", then "Museum (47)", "Attraction (21)"...
    kindOptions(dest) {
      const options = [{ value: '', label: 'All places', description: (this.popularByDest[dest] || []).length + ' places' }]
      for (const k of this.kindsOf(dest)) {
        options.push({ value: k.type, label: k.label, description: k.count + (k.count === 1 ? ' place' : ' places'), icon: placeStyle(k.type).icon })
      }
      return options
    },
    // The kinds of places in a destination, most common first, e.g. [{ type: 'museum', label: 'Museum', count: 5 }]
    kindsOf(dest) {
      const kinds = []
      for (const p of this.popularByDest[dest] || []) {
        let k = kinds.find((x) => x.type === p.type)
        if (!k) {
          k = { type: p.type, label: placeStyle(p.type).label, count: 0 }
          kinds.push(k)
        }
        k.count++
      }
      kinds.sort((a, b) => b.count - a.count)
      return kinds
    },

    async loadPopular(dest) {
      this.status[dest] = { loading: true, error: '', shown: 12 }
      try {
        const res = await axios.get('/api/places/attractions', { params: { destination: dest } })
        // Remember which city each place is in
        const list = []
        for (const p of res.data) list.push({ ...p, city: dest })
        this.popularByDest[dest] = list
        this.$nextTick(this.loadPhotos)
      } catch (err) {
        this.status[dest].error = (err.response && err.response.data && err.response.data.message) || 'Could not load popular places. Is the server running?'
      }
      this.status[dest].loading = false
    },

    togglePopular(p) {
      if (!this.isAdded(p)) {
        this.addPopular(p)
        return
      }
      const w = this.wishlist.find((x) => x.name.toLowerCase() === p.name.toLowerCase())
      if (w) this.remove(w)
    },
    isAdded(p) {
      for (const w of this.wishlist) {
        if (w.name.toLowerCase() === p.name.toLowerCase()) return true
      }
      return false
    },

    addPopular(p) {
      if (this.isAdded(p)) return
      trip.wishlist.push({ id: newId('w'), name: p.name, address: p.address || null, outdoor: !p.indoor, type: p.type, city: p.city || null, votes: [] })
      this.clearForm()
    },

    // Typing: wait until the user pauses, then search (keeps us within Photon's fair-use limits)
    onType() {
      this.active = -1
      this.openChain = null
      clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(this.runSearch, 300)
    },

    async runSearch() {
      const q = this.form.name.trim()
      if (q.length < 2 || !this.searchIn) {
        this.found = []
        this.searchError = ''
        return
      }
      this.searching = true
      this.searchError = ''
      try {
        const res = await axios.get('/api/places/search', { params: { q, near: this.searchIn } })
        if (q === this.form.name.trim()) this.found = res.data // ignore answers to older typing
      } catch (err) {
        if (err.response && err.response.status === 429) this.searchError = 'Searching too fast. Wait a moment.'
        else this.searchError = "Couldn't search places just now."
      }
      this.searching = false
    },

    choose(row) {
      if (row.kind === 'chain') {
        // Show or hide this chain's branches
        this.openChain = this.openChain === row.name ? null : row.name
        return
      }
      if (row.kind === 'popular') this.addPopular(row.place)
      else if (row.kind === 'place' || row.kind === 'branch') this.addFound(row.group, row.branch)
      else this.addOwn()
    },

    // Enter / the + Add button: the highlighted row, otherwise add what was typed
    chooseActive() {
      if (this.active >= 0 && this.rows[this.active]) this.choose(this.rows[this.active])
      else this.addOwn()
    },

    addFound(group, branch) {
      trip.wishlist.push({ id: newId('w'), name: group.name, address: branch.address, outdoor: !group.indoor, type: group.type, city: this.searchIn || null, votes: [] })
      this.clearForm()
    },

    addOwn() {
      const name = this.form.name.trim()
      if (!name) return
      trip.wishlist.push({ id: newId('w'), name, address: this.form.address.trim() || null, outdoor: false, type: 'custom', city: this.searchIn || null, votes: [] })
      this.clearForm()
    },

    clearForm() {
      this.form = { name: '', address: '' }
      this.found = []
      this.active = -1
      this.openChain = null
    },

    onKeydown(e) {
      const count = this.rows.length
      if (!count) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.active = (this.active + 1) % count
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.active = (this.active - 1 + count) % count
      } else if (e.key === 'Escape') {
        this.showSuggest = false
      }
    },

    remove(w) {
      trip.wishlist = trip.wishlist.filter((x) => x.id !== w.id)
      if (this.editId === w.id) this.editId = null
    },

    startEdit(w) {
      this.editId = w.id
      this.editForm = { name: w.name, address: w.address || '', link: w.link || '', isTour: w.type === 'tour' }
      // The form sits under all the cards: bring it into view and put the cursor in Name
      this.$nextTick(() => {
        const panel = this.$refs.editPanel
        if (!panel) return
        panel.scrollIntoView({ behavior: this.smoothScroll(), block: 'center' })
        const box = panel.querySelector('#wl-edit-name')
        if (box) box.focus({ preventScroll: true })
      })
    },

    cancelEdit() {
      this.backToCard(this.editId)
      this.editId = null
    },

    // After Save or Cancel: scroll back up to the card that was being edited
    backToCard(id) {
      this.$nextTick(() => {
        const card = this.$el.querySelector('[data-wish="' + id + '"]')
        if (!card) return
        card.scrollIntoView({ behavior: this.smoothScroll(), block: 'center' })
        const pencil = card.querySelector('.wl-round[title="Edit"]')
        if (pencil) pencil.focus({ preventScroll: true })
      })
    },

    smoothScroll() {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    },

    saveEdit() {
      const name = this.editForm.name.trim()
      if (!name) return
      for (const w of trip.wishlist) {
        if (w.id === this.editId) {
          w.name = name
          w.address = this.editForm.address.trim() || null
          if (this.editForm.isTour) {
            let link = this.editForm.link.trim()
            if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link
            w.link = link || null
          }
        }
      }
      this.backToCard(this.editId)
      this.editId = null
    },

    flagFor(d) {
      return flagEmoji(codeForDestination(d))
    }
  }
}
</script>

<style scoped>
/* ---------- Toolbar ---------- */
.wl-toolbar {
  margin-bottom: 24px;
}
.wl-search {
  position: relative;
  display: flex;
  align-items: center;
  background: #fbf5ea;
  border: 1.5px solid #e2dacb;
  border-radius: 999px;
  height: 52px;
  padding: 0 8px 0 18px;
}
.wl-search:focus-within {
  border-color: var(--app-primary, #00798c);
  box-shadow: 0 0 0 4px rgba(0, 121, 140, 0.12);
}
.wl-search-icon {
  opacity: 0.6;
  margin-right: 10px;
}
.wl-search input {
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 16px;
}
.wl-filter-btn {
  border: 0;
  background: transparent;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 20px;
  color: #3b6fd4;
}
.wl-filter-btn.on,
.wl-filter-btn:hover {
  background: #eef3ff;
}
.wl-filters {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.wl-chip {
  border: 1px solid #e2dacb;
  background: #fbf5ea;
  border-radius: 999px;
  padding: 7px 16px;
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
}
.wl-chip.active {
  background: var(--app-ink, #003d5b);
  border-color: var(--app-ink, #003d5b);
  color: #fff;
}

.wl-heading {
  font-family: var(--font-display);
  font-size: 1.4rem;
  margin-bottom: 14px;
}
.wl-count {
  font-family: var(--font-body);
  font-size: 0.85rem;
  background: #fbefd9;
  color: #004e5a;
  border-radius: 999px;
  padding: 2px 10px;
  vertical-align: middle;
}
.wl-empty {
  color: var(--app-muted, #5a6b78);
  background: #fbf5ea;
  border: 1px dashed #e2dacb;
  border-radius: 20px;
  padding: 24px;
  text-align: center;
}

/* ---------- Cards: a photo (or a simple icon on navy), the name over it, and quick actions ---------- */
.wl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 16px;
}
.wl-card {
  --tint: #edae49;
  position: relative;
  aspect-ratio: 4 / 5;
  border-radius: 22px;
  overflow: hidden;
  /* Without a photo: a soft glow in the place's colour, faint contour lines, on navy */
  background:
    radial-gradient(circle at 50% 32%, color-mix(in srgb, var(--tint) 45%, transparent), transparent 58%),
    repeating-radial-gradient(circle at 50% 32%, rgba(255, 255, 255, 0.06) 0 1px, transparent 1px 16px),
    linear-gradient(160deg, #0b3550, #001d2c);
  color: #fff;
  box-shadow: 0 6px 18px rgba(0, 29, 44, 0.12);
  transition: transform 0.25s cubic-bezier(.2, .8, .2, 1), box-shadow 0.25s;
}
.wl-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 18px 34px rgba(0, 29, 44, 0.22);
}
.wl-photo {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: center / cover no-repeat;
  transition: transform 0.6s cubic-bezier(.2, .8, .2, 1);
}
.wl-card:hover .wl-photo {
  transform: scale(1.07);
}
/* Loading placeholders: a light shimmer, without the photo shading */
.wl-card.skeleton {
  background: linear-gradient(90deg, #efe8dc 25%, #f7f2ea 50%, #efe8dc 75%);
  background-size: 200% 100%;
  box-shadow: none;
}
.wl-card.skeleton::after {
  display: none;
}
/* Darkens the bottom so the name always reads */
.wl-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 29, 44, 0.35) 0%, rgba(0, 29, 44, 0) 30%, rgba(0, 29, 44, 0) 45%, rgba(0, 29, 44, 0.88) 100%);
  pointer-events: none;
}
.wl-ph-icon {
  margin-bottom: 30%;
  padding: 18px;
  box-sizing: content-box;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #fff;
}
/* Still looking for a photo: a gentle shimmer */
.wl-photo.loading {
  background-image: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.12) 50%, transparent 70%);
  background-size: 200% 100%;
  animation: wl-shimmer 1.3s linear infinite;
}
.wl-photo.loading .wl-ph-icon {
  opacity: 0.4;
}
@keyframes wl-shimmer {
  to { background-position: -200% 0; }
}
.wl-type,
.wl-actions,
.wl-heart,
.wl-info {
  z-index: 1;
}
.wl-type {
  position: absolute;
  top: 12px;
  left: 12px;
  max-width: calc(100% - 70px);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 29, 44, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wl-card.mine .wl-type {
  max-width: calc(100% - 100px); /* leave room for the edit and heart buttons */
}
.wl-info {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 14px;
}
.wl-name {
  margin: 0 0 2px;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
  color: #fff;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.wl-sub {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wl-votes {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 2px 9px;
  border-radius: 999px;
  background: #edae49;
  color: #001d2c;
  font-size: 11px;
  font-weight: 700;
}
.wl-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 6px;
}
.wl-heart,
.wl-round {
  width: 34px;
  height: 34px;
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: #d1495b;
  text-decoration: none;
  transition: transform 0.15s, background 0.15s;
}
.wl-round {
  color: #001d2c;
  font-size: 14px;
  font-weight: 700;
}
.wl-heart:hover,
.wl-round:hover {
  transform: scale(1.1);
}
.wl-tap .wl-heart {
  position: absolute;
  top: 10px;
  right: 10px;
  color: #8a959c;
}
.wl-heart.filled {
  color: #d1495b;
}
/* Saving: the heart pops and the card gets a gold ring */
.wl-tap .wl-heart.filled {
  color: #d1495b;
  animation: wl-pop 0.4s cubic-bezier(.2, .8, .2, 1);
}
@keyframes wl-pop {
  40% { transform: scale(1.35); }
}
.wl-card.saved {
  box-shadow: 0 0 0 3px #edae49, 0 12px 26px rgba(0, 29, 44, 0.2);
}
.wl-card.saved .wl-sub {
  color: #ffe1a1;
  font-weight: 700;
}
.wl-tap {
  cursor: pointer;
}
.wl-tap:active {
  transform: scale(0.98);
}
.wl-tap:focus-visible {
  outline: 3px solid rgba(237, 174, 73, 0.7);
  outline-offset: 3px;
}
/* "Show [All places ▾]" above the popular places */
.wl-kinds {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.wl-kinds-label {
  font-size: 14px;
  font-weight: 600;
  color: #5b6b75;
}
.wl-heart:focus-visible,
.wl-round:focus-visible,
.wl-chip:focus-visible {
  outline: 3px solid rgba(0, 121, 140, 0.45);
  outline-offset: 2px;
}

/* ---------- Add + edit ---------- */
.wl-add {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}
.wl-add-name {
  flex: 2 1 240px;
}
.wl-add-address {
  flex: 2 1 200px;
}
.wl-input {
  border-radius: 999px;
  height: 46px;
  padding: 0 18px;
}
.wl-pill-btn {
  border-radius: 999px;
  padding: 0 22px;
  height: 46px;
  font-weight: 600;
}
.btn-sm.wl-pill-btn {
  height: auto;
  padding: 6px 16px;
}
.wl-card.editing {
  outline: 3px solid #edae49;
  outline-offset: 3px;
}
.wl-panel {
  background: #fbf5ea;
  border: 1px solid #e2dacb;
  border-radius: 20px;
  padding: 16px 18px;
  margin-top: 16px;
}
.wl-suggest {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  list-style: none;
  margin: 0;
  padding: 6px;
  background: #fbf5ea;
  border: 1px solid #e2dacb;
  border-radius: 18px;
  box-shadow: 0 14px 30px rgba(0, 40, 62, 0.14);
  max-height: 360px;
  overflow-y: auto;
}
.wl-suggest li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 12px;
  cursor: pointer;
}
.wl-in {
  flex: 0 0 150px;
}
.wl-hit {
  padding: 0;
  background: none;
  color: inherit;
  text-decoration: underline;
  text-decoration-color: #edae49;
  text-decoration-thickness: 3px;
  text-underline-offset: 2px;
}
.wl-row-text {
  flex: 1;
  min-width: 0;
}
.wl-row-note {
  margin-left: 6px;
  color: var(--app-muted, #5a6b78);
  font-size: 13px;
}
.wl-row-icon {
  width: 28px;
  text-align: center;
  flex-shrink: 0;
}
.wl-row-arrow {
  color: var(--app-muted, #5a6b78);
  font-size: 18px;
}
.wl-suggest li.wl-row-branch {
  padding-left: 40px;
  font-size: 14px;
}
.wl-suggest li.wl-row-branch strong {
  font-weight: 500;
}
.wl-suggest li.wl-row-own {
  border-top: 1px solid #efe9df;
  color: #00798c;
}
.wl-searching {
  position: absolute;
  right: 16px;
  top: 12px;
  margin: 0;
  pointer-events: none;
}
.wl-search-msg {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: #fbf5ea;
  border: 1px solid #e2dacb;
  border-radius: 14px;
  box-shadow: 0 12px 28px rgba(0, 29, 44, 0.12);
  font-size: 14px;
  color: #003d5b;
}
.wl-search-retry {
  flex: none;
  padding: 5px 12px;
  border: 1.5px solid #003d5b;
  border-radius: 999px;
  background: transparent;
  color: #003d5b;
  font-weight: 700;
  font-size: 13px;
}
.wl-search-retry:hover {
  background: #003d5b;
  color: #fff;
}
.wl-suggest li.active {
  background: #fbefd9;
}

/* ---------- Loading + animations ---------- */
.skeleton {
  background: linear-gradient(90deg, #efe9df 25%, #f9f6f0 50%, #efe9df 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}
@keyframes shimmer {
  to { background-position: -200% 0; }
}
.card-enter-active,
.card-leave-active,
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.card-enter-from,
.card-leave-to {
  opacity: 0;
  transform: scale(0.94);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ---------- Tour / activity ---------- */
.wl-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  margin-right: 6px;
}
.wl-tour-btn {
  border: 1.5px solid #003d5b;
  color: #003d5b;
  background: #fbf5ea;
}
.wl-tour-btn:hover,
.wl-tour-btn.on {
  background: #003d5b;
  color: #fff;
}
.wl-tour {
  margin-top: 16px;
  background: #fbf5ea;
  border: 1px solid #e2dacb;
  border-radius: 22px;
  padding: 18px 20px;
  max-width: 720px;
  box-shadow: 0 10px 28px rgba(0, 40, 62, 0.08);
}
.wl-tour-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 1.05rem;
}
.wl-tour-x {
  border: 0;
  background: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #5a6b78;
}
.wl-tour-x:hover {
  background: #f1f4f3;
}
.wl-tour-label {
  display: block;
  margin: 14px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: #003d5b;
}
.wl-opt {
  font-weight: 400;
  color: #5a6b78;
}
.wl-tour-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.wl-seg {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  background: #f1f4f3;
  border-radius: 999px;
}
.wl-seg button {
  border: 0;
  background: transparent;
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #5a6b78;
  transition: background 0.15s, color 0.15s;
}
.wl-seg button.on {
  background: #003d5b;
  color: #fff;
}
.wl-tour-note {
  margin: 14px 0 12px;
  font-size: 13px;
  color: #5a6b78;
}
.wl-tour-x:focus-visible,
.wl-seg button:focus-visible {
  outline: 3px solid rgba(0, 121, 140, 0.45);
  outline-offset: 2px;
}

@media (max-width: 576px) {
  .wl-tour-row { grid-template-columns: 1fr; gap: 0; }
  .wl-tour { padding: 16px; }
  .wl-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .wl-name { font-size: 0.95rem; }
}
@media (prefers-reduced-motion: reduce) {
  .wl-card,
  .card-enter-active,
  .card-leave-active,
  .fade-enter-active,
  .fade-leave-active { transition: none; }
  .wl-card:hover, .wl-card:hover .wl-photo { transform: none; }
  .wl-photo, .wl-photo.loading, .wl-tap .wl-heart.filled { transition: none; animation: none; }
  .skeleton { animation: none; }
}
</style>
