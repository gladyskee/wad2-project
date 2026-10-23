<template>
  <div class="pk">
    <!-- ===== Trip details the list is built from ===== -->
    <section v-if="editing" class="pk-setup" aria-labelledby="pk-setup-title">
      <h3 id="pk-setup-title" class="pk-setup-title">{{ hasProfile ? 'Edit trip details' : 'Tell us about your trip' }}</h3>

      <!-- What you'll do: a tile grid (like Airbnb's amenity picker) -->
      <fieldset class="pk-block">
        <legend class="pk-legend">What will you do?</legend>
        <div class="pk-tiles">
          <button v-for="o in ACTIVITIES" :key="o.key" type="button" class="pk-tile" :class="{ on: profile.activities.includes(o.key) }"
            :aria-pressed="profile.activities.includes(o.key)" :title="o.label" @click="toggleOption(profile.activities, o.key)">
            <Icon3D class="pk-tile-icon" :emoji="o.icon" :size="44" />
            <span class="pk-tile-label">{{ o.short || o.label }}</span>
          </button>
        </div>
      </fieldset>

      <!-- Weather and extras sit side by side on wide screens -->
      <div class="pk-pair">
      <!-- Weather: one segmented bar (you can pick more than one) -->
      <fieldset class="pk-block">
        <legend class="pk-legend">Weather</legend>
        <div class="pk-seg">
          <button v-for="o in WEATHER" :key="o.key" type="button" :class="{ on: profile.weather.includes(o.key) }"
            :aria-pressed="profile.weather.includes(o.key)" @click="toggleOption(profile.weather, o.key)">
            <Icon3D :emoji="o.icon" :size="22" /> {{ o.label }}
          </button>
        </div>
      </fieldset>

      <!-- Extras: quiet switch rows (like iOS Settings) -->
      <fieldset class="pk-block">
        <legend class="pk-legend">Good to know</legend>
        <div class="pk-switches">
          <button v-for="o in EXTRAS" :key="o.key" type="button" role="switch" class="pk-switch-row"
            :aria-checked="profile.extras.includes(o.key)" @click="toggleOption(profile.extras, o.key)">
            <span class="pk-switch-text pk-switch-icon"><Icon3D :emoji="o.icon" :size="26" /> {{ o.label }}</span>
            <span class="pk-switch" aria-hidden="true"><span class="pk-knob"></span></span>
          </button>
        </div>
      </fieldset>
      </div>

      <div class="pk-setup-foot">
        <button type="button" class="btn pk-btn-dark" @click="editing = false" data-testid="packing-build">
          {{ hasProfile ? 'Update my list' : 'Build my list' }} →
        </button>
      </div>
    </section>

    <template v-else>
      <!-- ===== Progress ===== -->
      <div class="pk-top">
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between align-items-baseline mb-2">
            <strong class="pk-progress-text" aria-live="polite" data-testid="packing-progress">
              {{ packedCount }} of {{ items.length }} packed
            </strong>
            <span v-if="packedCount === items.length && items.length" class="pk-done"><AppIcon name="check-circle" :size="15" /> All packed!</span>
          </div>
          <div class="pk-bar" role="progressbar" :aria-valuenow="packedCount" aria-valuemin="0" :aria-valuemax="items.length" aria-label="Packing progress">
            <div class="pk-bar-fill" :style="{ width: percent + '%' }"></div>
          </div>
        </div>
      </div>

      <!-- The forecast says something different from what was picked: one tap to use it -->
      <p v-if="forecastDiffers" class="pk-forecast small" data-testid="packing-forecast">
        The forecast for your dates says
        <span v-for="t in forecastTags" :key="t.key" class="pk-tag"><Icon3D :emoji="t.icon" :size="16" /> {{ t.label }}</span>
        <button type="button" class="pk-link" @click="useForecast">Use the forecast</button>
      </p>

      <!-- Built from: tap Edit to change -->
      <div class="pk-profile">
        <span class="pk-muted small">Built for {{ days }} day{{ days === 1 ? '' : 's' }}<span v-if="profileTags.length">:</span></span>
        <span v-for="t in profileTags" :key="t.key" class="pk-tag"><Icon3D :emoji="t.icon" :size="18" /> {{ t.label }}</span>
        <button type="button" class="pk-link" @click="editing = true"><AppIcon name="pencil" :size="14" /> Edit trip details</button>
        <label class="pk-hide ms-auto">
          <input v-model="hidePacked" type="checkbox"> Hide packed
        </label>
      </div>

      <!-- ===== Categories ===== -->
      <section v-for="cat in groups" :key="cat.key" class="pk-cat" :aria-labelledby="'pk-cat-' + cat.key">
        <button type="button" class="pk-cat-head" :aria-expanded="!collapsed[cat.key]" @click="collapsed[cat.key] = !collapsed[cat.key]">
          <span class="pk-cat-icon"><Icon3D :emoji="cat.icon" :size="30" /></span>
          <h3 :id="'pk-cat-' + cat.key" class="pk-cat-title">{{ cat.label }}</h3>
          <span class="pk-cat-count" :class="{ full: cat.packed === cat.items.length }">{{ cat.packed }}/{{ cat.items.length }}</span>
          <span class="pk-chevron" aria-hidden="true">{{ collapsed[cat.key] ? '›' : '⌄' }}</span>
        </button>

        <div v-show="!collapsed[cat.key]">
          <ul class="pk-list">
            <li v-for="it in cat.shown" :key="it.id" class="pk-item" :class="{ packed: packing.checked[it.id] }">
              <label class="pk-check">
                <input type="checkbox" :checked="!!packing.checked[it.id]" @change="toggleChecked(it.id)" data-testid="packing-check">
                <span class="pk-box" aria-hidden="true">✓</span>
                <span class="pk-name">
                  {{ it.name }}
                  <small class="d-block pk-muted">{{ it.why }}</small>
                </span>
              </label>
              <div class="pk-qty" role="group" :aria-label="'Amount of ' + it.name">
                <button type="button" :aria-label="'Fewer ' + it.name" :disabled="it.qty <= 1" @click="changeQty(it, -1)">−</button>
                <span aria-live="polite">{{ it.qty }}</span>
                <button type="button" :aria-label="'More ' + it.name" :disabled="it.qty >= 99" @click="changeQty(it, 1)">+</button>
              </div>
              <button type="button" class="pk-remove" :aria-label="'Remove ' + it.name" title="Remove" @click="removeItem(it)"><AppIcon name="x" :size="15" /></button>
            </li>
          </ul>
          <p v-if="!cat.shown.length" class="pk-muted small px-3 mb-2">Everything here is packed ✓</p>

          <!-- Add an item to this category -->
          <form class="pk-add" @submit.prevent="addItem(cat.key)">
            <label :for="'pk-add-' + cat.key" class="visually-hidden">Add an item to {{ cat.label }}</label>
            <input :id="'pk-add-' + cat.key" v-model="newItem[cat.key]" class="form-control" maxlength="80" :placeholder="'+ Add to ' + cat.label.toLowerCase()">
            <button type="submit" class="btn btn-sm pk-btn-dark" :disabled="!(newItem[cat.key] || '').trim()">Add</button>
          </form>
        </div>
      </section>

      <div class="d-flex flex-wrap gap-3 align-items-center mt-3">
        <button v-if="packing.removed.length" type="button" class="pk-link" @click="packing.removed = []">
          ↺ Bring back {{ packing.removed.length }} removed item{{ packing.removed.length === 1 ? '' : 's' }}
        </button>
        <button v-if="packedCount" type="button" class="pk-link" @click="packing.checked = {}">Untick everything</button>
        <span class="pk-muted small ms-auto" role="status">{{ saveStatus }}</span>
      </div>
    </template>
  </div>
</template>

<script>
import axios from 'axios'
import { ACTIVITIES, WEATHER, EXTRAS } from '../tripOptions.js'
import { CATEGORIES, buildPackingList } from '../packingList.js'
import AppIcon from './AppIcon.vue'
import Icon3D from './Icon3D.vue'

export default {
  components: { AppIcon, Icon3D },
  props: {
    tripId: { type: String, default: '' },
    days: { type: Number, default: 3 },
    activities: { type: Array, default: () => [] },
    weather: { type: Array, default: () => [] },
    extras: { type: Array, default: () => [] },
    initialPacking: { type: Object, default: null },
    hasOutdoorActivity: { type: Boolean, default: false },
    forecastWeather: { type: Array, default: () => [] } // what the forecast / typical weather says, e.g. ['hot', 'rain']
  },

  data() {
    const saved = this.initialPacking || {}
    const profile = { activities: this.activities.slice(), weather: this.weather.slice(), extras: this.extras.slice() }
    const collapsed = {}
    const newItem = {}
    for (const c of CATEGORIES) {
      collapsed[c.key] = false
      newItem[c.key] = ''
    }
    return {
      profile,
      packing: {
        checked: saved.checked || {},
        qty: saved.qty || {},
        removed: saved.removed || [],
        custom: saved.custom || []
      },
      // Nothing chosen when the trip was created? Ask first.
      editing: !profile.activities.length && !profile.weather.length && !profile.extras.length,
      hidePacked: false,
      collapsed,
      newItem,
      ACTIVITIES,
      WEATHER,
      EXTRAS,
      optionGroups: [
        { key: 'activities', label: 'Activities', options: ACTIVITIES },
        { key: 'weather', label: 'Expected weather', options: WEATHER },
        { key: 'extras', label: 'Anything else?', options: EXTRAS }
      ],
      saveTimer: null,
      saveStatus: '',
      lastSaved: '',
      basePacking: null // the list as it was last saved: the server only applies what changed since then
    }
  },

  computed: {
    pickedCount() {
      return this.profile.activities.length + this.profile.weather.length + this.profile.extras.length
    },
    hasProfile() {
      return this.profile.activities.length + this.profile.weather.length + this.profile.extras.length > 0
    },

    // The chosen options with their icons, for the "Built for" line
    profileTags() {
      const tags = []
      for (const g of this.optionGroups) {
        for (const o of g.options) {
          if (this.profile[g.key].includes(o.key)) tags.push(o)
        }
      }
      return tags
    },

    // Suggested items + your own, minus removed ones, with your amounts
    items() {
      const list = []
      const suggested = buildPackingList({ days: this.days, ...this.profile, outdoor: this.hasOutdoorActivity })
      for (const it of suggested.concat(this.packing.custom.map((c) => ({ ...c, why: 'Added by you' })))) {
        if (this.packing.removed.includes(it.id)) continue
        const qty = this.packing.qty[it.id] !== undefined ? this.packing.qty[it.id] : it.qty
        list.push({ ...it, qty })
      }
      return list
    },

    groups() {
      const groups = []
      for (const c of CATEGORIES) {
        const items = []
        const shown = []
        let packed = 0
        for (const it of this.items) {
          if (it.category !== c.key) continue
          items.push(it)
          if (this.packing.checked[it.id]) packed++
          if (!(this.hidePacked && this.packing.checked[it.id])) shown.push(it)
        }
        // Always show "Other" so there's somewhere to add your own things
        if (items.length || c.key === 'other') groups.push({ ...c, items, shown, packed })
      }
      return groups
    },

    packedCount() {
      let count = 0
      for (const it of this.items) {
        if (this.packing.checked[it.id]) count++
      }
      return count
    },

    percent() {
      return this.items.length ? Math.round((this.packedCount / this.items.length) * 100) : 0
    },

    forecastTags() {
      return WEATHER.filter((w) => this.forecastWeather.includes(w.key))
    },
    forecastDiffers() {
      const a = this.forecastWeather.slice().sort().join()
      return !!a && a !== this.profile.weather.slice().sort().join()
    },

    // Everything worth saving, as text (changes whenever something changes)
    saveKey() {
      return JSON.stringify({ ...this.profile, packing: this.packing })
    }
  },

  watch: {
    // Adaptive packing: nobody picked the weather yet, so the forecast picks it (it can still be edited)
    forecastWeather(keys) {
      if (keys.length && !this.profile.weather.length && this.tripId && this.tripId !== 'seoul') this.useForecast()
    },
    saveKey(key) {
      if (!this.tripId || this.tripId === 'seoul' || key === this.lastSaved) return // the demo trip isn't saved
      this.saveStatus = 'Saving…'
      clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(this.save, 600)
    }
  },

  created() {
    this.lastSaved = this.saveKey
    this.basePacking = JSON.parse(JSON.stringify(this.packing))
  },

  // Pick up the group's ticks every 20 s while Packing is open (same as Photos)
  mounted() {
    if (this.tripId && this.tripId !== 'seoul') this.pollTimer = setInterval(this.poll, 20000)
  },

  beforeUnmount() {
    clearInterval(this.pollTimer)
  },

  methods: {
    useForecast() {
      this.profile.weather = this.forecastWeather.slice()
    },

    toggleOption(list, key) {
      const i = list.indexOf(key)
      if (i >= 0) list.splice(i, 1)
      else list.push(key)
    },

    toggleChecked(id) {
      if (this.packing.checked[id]) delete this.packing.checked[id]
      else this.packing.checked[id] = true
    },

    changeQty(it, step) {
      this.packing.qty[it.id] = Math.min(99, Math.max(1, it.qty + step))
    },

    removeItem(it) {
      if (it.id.startsWith('mine-')) {
        this.packing.custom = this.packing.custom.filter((c) => c.id !== it.id)
      } else {
        this.packing.removed.push(it.id)
      }
      delete this.packing.checked[it.id]
    },

    addItem(category) {
      const name = (this.newItem[category] || '').trim()
      if (!name) return
      this.packing.custom.push({ id: 'mine-' + Date.now(), category, name, qty: 1 })
      this.newItem[category] = ''
    },

    async poll() {
      // Only while Packing is on screen, and never over my own unsaved changes
      if (!this.$el.offsetParent || document.hidden || this.saveKey !== this.lastSaved) return
      try {
        const res = await axios.get('/api/trips/' + this.tripId + '/packing')
        if (this.saveKey !== this.lastSaved) return // I changed something while it loaded
        const p = res.data.packing || {}
        this.profile = { activities: res.data.activities, weather: res.data.weather, extras: res.data.extras }
        this.packing = { checked: p.checked || {}, qty: p.qty || {}, removed: p.removed || [], custom: p.custom || [] }
        this.basePacking = JSON.parse(JSON.stringify(this.packing))
        this.lastSaved = this.saveKey
      } catch (err) {
        // try again next time
      }
    },

    // Sends my changes; the server adds them to the latest list (so other people's ticks are kept)
    // and sends the combined list back
    async save() {
      const key = this.saveKey
      const sent = JSON.parse(JSON.stringify(this.packing))
      try {
        const res = await axios.put('/api/trips/' + this.tripId + '/packing', { ...this.profile, packing: sent, base: this.basePacking })
        if (this.saveKey === key && res.data.packing) {
          // Nothing changed while saving: show the combined list, including the group's changes
          this.packing = res.data.packing
          this.basePacking = JSON.parse(JSON.stringify(res.data.packing))
          this.lastSaved = this.saveKey
        } else {
          // I kept editing meanwhile: those edits get sent next, measured from what I just sent
          this.basePacking = sent
          this.lastSaved = key
        }
        this.saveStatus = 'Saved ✓'
      } catch (err) {
        this.saveStatus = (err.response && err.response.data && err.response.data.message) || 'Could not save. Check your connection.'
      }
    }
  }
}
</script>

<style scoped>
.pk-forecast {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
}

.pk-muted {
  color: var(--app-muted, #5a6b78);
}

/* Setup / edit */
.pk-setup {
  background: #f8f4ed;
  border: 1px solid #e6dfd2;
  border-radius: 22px;
  padding: 24px;
}
.pk-pair {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0 24px;
}
.pk-setup-title {
  font-family: var(--font-display);
  font-size: 1.3rem;
  margin-bottom: 14px;
}
.pk-block {
  margin-bottom: 18px;
}
/* Thin lines between the sections */
.pk-block + .pk-pair,
.pk-pair .pk-block + .pk-block {
  border-top: 1px solid #e6dfd2;
  padding-top: 16px;
}
.pk-legend {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--app-muted, #5a6b78);
  margin-bottom: 8px;
  float: none;
}

/* Activity tiles */
.pk-tiles {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.pk-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 104px;
  padding: 10px 6px;
  border: 1.5px solid #e6dfd2;
  border-radius: 16px;
  background: #fbf5ea;
  color: #003d5b;
  transition: border-color 0.15s, background 0.15s, transform 0.12s, box-shadow 0.15s;
}
.pk-tile:hover {
  border-color: #cdbfa6;
}
.pk-tile:active {
  transform: scale(0.97);
}
.pk-tile.on {
  border-color: #00798c;
  background: #fdf3e1;
  box-shadow: 0 0 0 3px rgba(0, 121, 140, 0.1);
}
.pk-tile.on::after {
  content: '✓';
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #00798c;
}
.pk-tile-icon {
  transition: transform 0.25s cubic-bezier(.2, .8, .2, 1);
}
/* The 3D icon bounces up a little on hover and when picked */
.pk-tile:hover .pk-tile-icon,
.pk-tile.on .pk-tile-icon {
  transform: translateY(-3px) scale(1.06);
}
.pk-tile-label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Weather segmented bar */
.pk-seg {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px; /* the 1px gaps show the background through: thin lines between the options */
  border: 1px solid #e5ddcf;
  border-radius: 14px;
  background: #e5ddcf;
  overflow: hidden;
}
.pk-seg button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 0;
  background: #f6f2eb;
  padding: 8px 6px;
  font-size: 14px;
  font-weight: 600;
  color: #4f5f5b;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}
.pk-seg button:hover {
  color: #003d5b;
  background: #fbf5ea;
}
.pk-seg button.on {
  background: #fdf3e1;
  color: #00798c;
  box-shadow: inset 0 0 0 2px #00798c;
}

/* Extras as switch rows */
.pk-switches {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: #fbf5ea;
  border: 1px solid #e6dfd2;
  border-radius: 16px;
  overflow: hidden;
}
.pk-switch-icon {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.pk-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 48px;
  padding: 0 14px;
  border: 0;
  border-bottom: 1px solid #efe9df;
  background: transparent;
  color: #003d5b;
  font-size: 14px;
  text-align: left;
  transition: background 0.15s;
}
.pk-switch-row:nth-child(odd) {
  border-right: 1px solid #efe9df;
}
.pk-switch-row:nth-last-child(-n + 2) {
  border-bottom: 0;
}
.pk-switch-row:hover {
  background: #f8f4ed;
}
.pk-switch {
  position: relative;
  flex: none;
  width: 36px;
  height: 22px;
  border-radius: 999px;
  background: #dcd3c4;
  transition: background 0.2s;
}
.pk-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fbf5ea;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pk-switch-row[aria-checked='true'] .pk-switch {
  background: #00798c;
}
.pk-switch-row[aria-checked='true'] .pk-knob {
  transform: translateX(14px);
}
.pk-setup-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid #e6dfd2;
}
.pk-tile:focus-visible,
.pk-seg button:focus-visible,
.pk-switch-row:focus-visible {
  outline: 3px solid rgba(0, 121, 140, 0.4);
  outline-offset: 2px;
}
@media (max-width: 640px) {
  .pk-setup {
    padding: 18px;
  }
  .pk-tiles {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .pk-seg {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .pk-switches {
    grid-template-columns: 1fr;
  }
  .pk-switch-row:nth-child(odd) {
    border-right: 0;
  }
  .pk-switch-row:nth-last-child(2) {
    border-bottom: 1px solid #efe9df;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pk-tile,
  .pk-knob {
    transition: none;
  }
}
.pk-btn-dark {
  background: #003d5b;
  color: #edae49;
  border-radius: 999px;
  padding: 8px 20px;
  font-weight: 600;
}
.pk-btn-dark:hover {
  background: #00798c;
  color: #fff;
}

/* Progress */
.pk-top {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 14px;
}
.pk-progress-text {
  font-size: 1.1rem;
}
.pk-done {
  color: #00798c;
  font-weight: 600;
}
.pk-bar {
  height: 10px;
  border-radius: 999px;
  background: #e8eeec;
  overflow: hidden;
}
.pk-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #00798c, #f3c26f);
  transition: width 0.3s ease;
}
.pk-profile {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 18px;
}
.pk-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #f5eee2;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 13px;
}
.pk-link {
  border: 0;
  background: none;
  color: #00798c;
  font-weight: 600;
  font-size: 14px;
  padding: 2px 4px;
}
.pk-link:hover {
  text-decoration: underline;
}
.pk-hide {
  font-size: 14px;
  display: flex;
  gap: 6px;
  align-items: center;
}

/* Categories */
.pk-cat {
  border: 1px solid #e6dfd2;
  border-radius: 20px;
  margin-bottom: 12px;
  overflow: hidden;
  background: #fbf5ea;
}
.pk-cat-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: #f8f4ed;
  padding: 12px 16px;
  text-align: left;
}
.pk-cat-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: none;
  border-radius: 12px;
  background: #f3ece0;
}
.pk-cat-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
  flex: 1;
}
.pk-cat-count {
  font-size: 13px;
  font-weight: 600;
  background: #fbf5ea;
  border: 1px solid #e6dfd2;
  border-radius: 999px;
  padding: 2px 10px;
}
.pk-cat-count.full {
  background: #00798c;
  border-color: #00798c;
  color: #fff;
}
.pk-chevron {
  width: 16px;
  color: #5a6b78;
}
.pk-list {
  list-style: none;
  margin: 0;
  padding: 6px 8px;
}
.pk-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 14px;
  transition: opacity 0.2s;
}
.pk-item:hover {
  background: #f8f4ed;
}
.pk-item.packed {
  opacity: 0.55;
}
.pk-item.packed .pk-name {
  text-decoration: line-through;
}
.pk-check {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
  margin: 0;
}
.pk-check input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.pk-box {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid #b9c7c3;
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  font-weight: 700;
  transition: background 0.15s, border-color 0.15s;
}
.pk-check input:checked + .pk-box {
  background: #00798c;
  border-color: #00798c;
  color: #fff;
}
.pk-check input:focus-visible + .pk-box {
  outline: 3px solid rgba(0, 121, 140, 0.45);
  outline-offset: 2px;
}
.pk-name {
  min-width: 0;
}
.pk-qty {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #f4efe6;
  border-radius: 999px;
  padding: 2px;
}
.pk-qty button {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: #fbf5ea;
  font-weight: 700;
}
.pk-qty button:disabled {
  opacity: 0.4;
}
.pk-qty span {
  min-width: 22px;
  text-align: center;
  font-weight: 600;
}
.pk-remove {
  border: 0;
  background: none;
  color: #8a99a5;
  width: 30px;
  height: 30px;
  border-radius: 50%;
}
.pk-remove:hover {
  background: #fbe7ea;
  color: #d1495b;
}
.pk-add {
  display: flex;
  gap: 8px;
  padding: 4px 16px 14px;
}
.pk-add .form-control {
  border-radius: 999px;
}

.pk-cat-head:focus-visible,
.pk-qty button:focus-visible,
.pk-remove:focus-visible,
.pk-link:focus-visible {
  outline: 3px solid rgba(0, 121, 140, 0.45);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .pk-bar-fill,
  .pk-item { transition: none; }
}
/* Wide screens: all 10 activities in one row; weather + extras side by side */
@media (min-width: 1200px) {
  .pk-tiles {
    grid-template-columns: repeat(10, minmax(0, 1fr));
  }
  .pk-pair {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
    align-items: stretch;
  }
  /* Side by side: a vertical line between Weather and Good to know instead */
  .pk-pair .pk-block + .pk-block {
    border-top: 0;
    padding-top: 0;
    border-left: 1px solid #e6dfd2;
    padding-left: 24px;
  }
  .pk-seg {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .pk-seg button {
    padding: 13px 6px;
  }
}
.pk-seg button:focus-visible {
  outline-offset: -3px; /* inside, so the rounded box doesn't cut it off */
}

/* Phones and touch screens: every control is at least 40px to tap (WCAG / Apple guidance) */
@media (pointer: coarse), (max-width: 560px) {
  .pk-qty button,
  .pk-remove {
    min-width: 40px;
    min-height: 40px;
  }
  .pk-link {
    min-height: 40px;
  }
}
</style>
