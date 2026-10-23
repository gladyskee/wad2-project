<template>
  <!-- Slide-over for one stop: its crowds, its weather, and moving it (time, day, or a swap) -->
  <Teleport to="body">
    <transition name="ss-fade">
      <div v-if="open" class="ss-overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
        <transition name="ss-slide" appear>
          <aside ref="panel" class="ss" role="dialog" aria-modal="true" aria-labelledby="ss-title" tabindex="-1">
            <header class="ss-head">
              <div class="ss-titles">
                <h3 id="ss-title" class="ss-title">{{ stop.name }}</h3>
                <p class="ss-sub">{{ dayLabel }} · {{ formatHour(start) }} – {{ formatHour(end) }}<span v-if="stop.locked"> · <AppIcon name="lock" :size="13" /> Locked</span></p>
              </div>
              <button type="button" class="ss-x" aria-label="Close" @click="emit('close')"><AppIcon name="x" :size="18" /></button>
            </header>

            <!-- Three tabs keep it short: only one topic on screen at a time -->
            <div class="ss-tabs" role="tablist" aria-label="About this stop">
              <button v-for="t in tabs" :key="t.key" type="button" role="tab" :aria-selected="tab === t.key"
                :class="{ on: tab === t.key }" @click="tab = t.key">
                <span aria-hidden="true">{{ t.icon }}</span> {{ t.label }}<span v-if="t.key === 'notes' && noteCount" class="ss-count">{{ noteCount }}</span>
                <i v-if="t.key === 'crowd' && crowd.tone === 'bad' || t.key === 'weather' && wet" class="ss-dot" aria-label="needs a look"></i>
              </button>
            </div>

            <div class="ss-body">
              <!-- ===== Crowds ===== -->
              <section v-if="tab === 'crowd'" aria-label="Crowds">
                <p class="ss-lead">
                  <template v-if="crowd.value == null">No crowd data for this place.<template v-if="!stop.address"> Add its address under <button type="button" class="ss-link" @click="tab = 'time'">Details</button> to get it.</template></template>
                  <template v-else><span class="ss-badge" :class="crowd.tone">{{ crowd.text }}</span> at {{ formatHour(start) }} · about {{ crowd.value }}% of its busiest</template>
                </p>
                <CrowdChart v-if="hasChart" :forecast="stop.forecast" :day-name="dayName"
                  :planned-hour="Math.floor(start)" :suggest-hour="quieter.length ? Math.floor(quieter[0].hour) : null" />
                <p v-if="crowd.value != null && !hasChart" class="ss-note">Estimate for this kind of place.</p>

                <template v-if="quieter.length">
                  <h4 class="ss-h">Quieter times that fit your day</h4>
                  <div class="ss-picks">
                    <button v-for="q in quieter" :key="q.hour" type="button" class="ss-pick" @click="emit('move-time', q.hour)">
                      <strong>{{ formatHour(q.hour) }}</strong> <small>{{ q.crowd }}% busy</small>
                    </button>
                  </div>
                  <p class="ss-note">Moving it keeps your other stops where they are. You can undo it.</p>
                </template>
                <p v-else-if="crowd.value != null" class="ss-good">✓ This is already one of the quietest times that fits your day.</p>
              </section>

              <!-- ===== Weather ===== -->
              <section v-else-if="tab === 'weather'" aria-label="Weather">
                <template v-if="!blocks.length">
                  <p v-if="typical" class="ss-lead">
                    Usually about <strong>{{ formatTemp(typical.temp) }}</strong> in {{ typical.place }} in {{ typical.month }}<template v-if="typical.rainyDays === 0">, and it's usually dry</template><template v-else-if="typical.rainyDays === 1">,
                    with rain on about 1 day of the month</template><template v-else-if="typical.rainyDays != null">,
                    with rain on about {{ typical.rainyDays }} days of the month</template>.
                  </p>
                  <p class="ss-lead" :class="{ 'ss-muted': typical }">The live forecast for this day appears about 5 days before.</p>
                </template>
                <template v-else>
                  <ol class="ss-hours" aria-label="Forecast for the day">
                    <li v-for="b in blocks" :key="b.time" :class="{ here: b.here, wet: b.rain }"
                      :aria-label="formatHour(b.time) + ': ' + b.condition + (b.temp != null ? ', ' + b.temp + ' degrees' : '') + (b.here ? ' (while you are here)' : '')">
                      <small>{{ shortHour(b.time) }}</small>
                      <span aria-hidden="true">{{ b.icon }}</span>
                      <strong v-if="b.temp != null">{{ b.temp }}°</strong>
                    </li>
                  </ol>

                  <div v-if="wet" class="ss-callout">
                    <strong>🌧️ Rain is likely while you're here, and it's outdoors.</strong>
                    <template v-if="dry.length">
                      <h4 class="ss-h">Move to a dry time</h4>
                      <div class="ss-picks">
                        <button v-for="d in dry" :key="d.hour" type="button" class="ss-pick" @click="emit('move-time', d.hour)">
                          <strong>{{ formatHour(d.hour) }}</strong> <small v-if="d.crowd != null">{{ d.crowd }}% busy</small>
                        </button>
                      </div>
                    </template>
                    <template v-if="canChangeDay && indoorPicks.length">
                      <h4 class="ss-h">Or swap in an indoor saved place</h4>
                      <ul class="ss-swaps">
                        <li v-for="w in indoorPicks" :key="w.id">
                          <span>{{ w.name }}</span>
                          <button type="button" class="ss-btn" @click="emit('swap', w.id)">Swap in</button>
                        </li>
                      </ul>
                      <p class="ss-note">{{ stop.name }} goes back to Saved places, so nothing is lost.</p>
                    </template>
                    <p v-if="!dry.length && !(canChangeDay && indoorPicks.length)" class="ss-note">
                      No dry time fits this day. Try moving it to another day under <button type="button" class="ss-link" @click="tab = 'time'">Details</button>.
                    </p>
                  </div>
                  <p v-else-if="rainWhileHere" class="ss-good">✓ Rain is possible, but this one is indoors.</p>
                  <p v-else class="ss-good">✓ Dry while you're here.</p>
                </template>
              </section>

              <!-- ===== Notes from the crew ===== -->
              <StopNotes v-else-if="tab === 'notes'" :stop-id="stop.id || ''" @count="noteCount = $event" />

              <!-- ===== Time & details ===== -->
              <section v-else aria-label="Time and details">
                <form class="ss-row" @submit.prevent="moveTime">
                  <label for="ss-time" class="ss-label">Start time</label>
                  <input id="ss-time" v-model="timeText" type="time" step="900" class="ss-input">
                  <button type="submit" class="ss-btn" :disabled="!timeChanged">Move</button>
                </form>
                <p v-if="timeError" class="ss-error" role="alert">{{ timeError }}</p>

                <div v-if="canChangeDay && dayOptions.length > 1" class="ss-row">
                  <span class="ss-label" id="ss-day-label">Day</span>
                  <CustomDropdown v-model="dayPick" :options="dayOptions" class="ss-grow" aria-labelledby="ss-day-label" header-text="Move to" />
                  <button type="button" class="ss-btn" :disabled="dayPick === selectedDate" @click="emit('move-day', dayPick)">Move</button>
                </div>
                <p class="ss-note"><AppIcon :name="stop.locked ? 'lock' : 'unlock'" :size="13" /> {{ stop.locked ? 'Locked: Optimize Route won\'t move it.' : 'Tip: lock a stop (the padlock on its card) to keep a booked time.' }}</p>

                <!-- Routes saved in Getting around that end here -->
                <div v-for="route in routes" :key="route.start" class="ss-route">
                  <p class="ss-route-from"><AppIcon name="map-pin" :size="14" /> From <strong>{{ route.start }}</strong></p>
                  <div v-for="opt in route.options" :key="opt.type" class="ss-route-opt">
                    <span>{{ opt.route }}</span>
                    <small><AppIcon name="clock" :size="12" /> ~{{ minutesText(opt.duration) }} · {{ opt.cost === 0 ? 'Free' : '~ ₩' + opt.cost.toLocaleString() }}</small>
                  </div>
                </div>

                <form v-if="canChangeDay" class="ss-details" @submit.prevent="saveDetails">
                  <h4 class="ss-h">Details</h4>
                  <label for="ss-name" class="ss-label">Name</label>
                  <input id="ss-name" v-model="form.name" class="ss-input" maxlength="120" required>
                  <label for="ss-address" class="ss-label">Address <span class="ss-opt">turns on crowds and the map</span></label>
                  <input id="ss-address" v-model="form.address" class="ss-input" maxlength="200">
                  <div class="ss-seg" role="group" aria-label="Indoor or outdoor">
                    <button type="button" :class="{ on: form.outdoor }" :aria-pressed="form.outdoor" @click="form.outdoor = true"><AppIcon name="trees" :size="15" /> Outdoor</button>
                    <button type="button" :class="{ on: !form.outdoor }" :aria-pressed="!form.outdoor" @click="form.outdoor = false"><AppIcon name="landmark" :size="15" /> Indoor</button>
                  </div>
                  <button type="submit" class="ss-btn primary" :disabled="!detailsChanged || !form.name.trim()">Save details</button>
                </form>
              </section>
            </div>
          </aside>
        </transition>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import CrowdChart from './CrowdChart.vue'
import CustomDropdown from './CustomDropdown.vue'
import { formatHour } from '../crowd.js'
import { formatTemp } from '../userSettings.js'
import AppIcon from './AppIcon.vue'
import StopNotes from './StopNotes.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  stop: { type: Object, default: () => ({}) },          // the stop (with its crowd forecast)
  start: { type: Number, default: 0 },                  // planned start, e.g. 13.5
  duration: { type: Number, default: 1 },
  section: { type: String, default: 'crowd' },          // which tab to open: crowd | weather | time | notes
  dayName: { type: String, default: '' },
  dayLabel: { type: String, default: '' },
  selectedDate: { type: String, default: '' },
  dayOptions: { type: Array, default: () => [] },
  weather: { type: Array, default: () => [] },
  typical: { type: Object, default: null },               // { month, place, temp, rainyDays } when there's no forecast yet          // [{ time, span, condition, rain, temp, icon }]
  crowd: { type: Object, default: () => ({}) },         // { value, text, tone }
  wet: { type: Boolean, default: false },               // outdoors in the rain
  quieter: { type: Array, default: () => [] },          // [{ hour, crowd }]
  dry: { type: Array, default: () => [] },
  indoorPicks: { type: Array, default: () => [] },
  canChangeDay: { type: Boolean, default: true },
  routes: { type: Array, default: () => [] }            // saved routes ending at this stop
})
const emit = defineEmits(['close', 'move-time', 'move-day', 'swap', 'edit'])

const TABS = [
  { key: 'crowd', icon: '👥', label: 'Crowds' },
  { key: 'weather', icon: '⛅', label: 'Weather' },
  { key: 'time', icon: '🕒', label: 'Details' }, // start time, day, name and address
  { key: 'notes', icon: '💬', label: 'Notes' }
]
// Notes need a real trip, so the sample itinerary doesn't get them
const tabs = computed(() => (props.canChangeDay ? TABS : TABS.slice(0, 3)))
const tab = ref('crowd')
const noteCount = ref(0)
const panel = ref(null)
const end = computed(() => props.start + (props.duration || 1))
const hasChart = computed(() => !!(props.stop.forecast && props.stop.forecast.days && props.stop.forecast.days[props.dayName]))

// The day's forecast blocks, marking the ones while you're there
const blocks = computed(() => {
  const list = []
  for (const b of props.weather) {
    const here = b.time < end.value && b.time + (b.span || 3) > props.start
    list.push({ ...b, here })
  }
  list.sort((a, b) => a.time - b.time)
  return list
})
const rainWhileHere = computed(() => blocks.value.some((b) => b.here && b.rain))

function minutesText(min) {
  const h = Math.floor(min / 60)
  return h > 0 ? h + 'h ' + (min % 60) + ' mins' : min + ' mins'
}
function shortHour(h) {
  const n = Math.floor(h) % 24
  if (n === 0) return '12a'
  if (n === 12) return '12p'
  return n < 12 ? n + 'a' : (n - 12) + 'p'
}

// ---------- time & day ----------
const timeText = ref('')
const timeError = ref('')
const dayPick = ref('')
const form = ref({ name: '', address: '', outdoor: false })

function toText(h) {
  const m = Math.round(h * 60)
  return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
}
function textToHour(t) {
  const parts = t.split(':')
  return Number(parts[0]) + Number(parts[1]) / 60
}
const timeChanged = computed(() => !!timeText.value && timeText.value !== toText(props.start))
function moveTime() {
  timeError.value = ''
  const h = textToHour(timeText.value)
  if (h + (props.duration || 1) > 24) {
    timeError.value = 'That would end after midnight. Pick an earlier time.'
    return
  }
  emit('move-time', h)
}

const detailsChanged = computed(() => form.value.name.trim() !== props.stop.name ||
  form.value.address.trim() !== (props.stop.address || '') || form.value.outdoor !== !!props.stop.outdoor)
function saveDetails() {
  emit('edit', { name: form.value.name.trim(), address: form.value.address.trim() || null, outdoor: form.value.outdoor })
}

// Fill everything in each time the sheet opens (or the stop changes underneath it)
function reset() {
  timeText.value = toText(props.start)
  timeError.value = ''
  dayPick.value = props.selectedDate
  form.value = { name: props.stop.name || '', address: props.stop.address || '', outdoor: !!props.stop.outdoor }
}
watch(() => props.open, (open) => {
  if (!open) return
  tab.value = props.section
  noteCount.value = 0
  reset()
  nextTick(() => panel.value && panel.value.focus())
}, { immediate: true })
watch(() => props.section, (s) => { tab.value = s })
watch(() => [props.start, props.stop.name, props.stop.address, props.stop.outdoor], reset)
</script>

<style scoped>
.ss-overlay {
  position: fixed;
  inset: 0;
  z-index: 1290;
  background: rgba(0, 40, 62, 0.35);
}
.ss {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  background: #fbf5ea;
  color: #003d5b;
  box-shadow: -18px 0 40px rgba(0, 40, 62, 0.18);
  outline: none;
}
.ss-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  padding: 20px 20px 12px;
}
.ss-title {
  font-family: var(--font-display);
  font-size: 1.3rem;
  margin: 0;
}
.ss-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: #5a6b78;
}
.ss-x {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: #f4efe6;
  color: #5a6b78;
}
.ss-x:hover {
  background: #e6dfd2;
}
.ss-tabs {
  display: flex;
  gap: 4px;
  margin: 0 20px;
  padding: 4px;
  border-radius: 999px;
  background: #f4efe6;
}
.ss-tabs button {
  position: relative;
  flex: 1;
  border: 0;
  border-radius: 999px;
  background: transparent;
  padding: 8px 6px;
  font-size: 13px;
  font-weight: 600;
  color: #5a6b78;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.ss-tabs button.on {
  background: #003d5b;
  color: #fff;
}
/* Four tabs: they share the row, and scroll sideways on narrow phones */
.ss-tabs {
  overflow-x: auto;
  scrollbar-width: none;
}
.ss-tabs button {
  flex: 1 0 auto;
  padding: 8px 10px;
}
/* Narrow phones: drop the tab icons so all four labels fit */
@media (max-width: 420px) {
  .ss-tabs button > span[aria-hidden='true'] {
    display: none;
  }
}
.ss-count {
  display: inline-block;
  min-width: 18px;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 999px;
  background: #edae49;
  color: #001d2c;
  font-size: 11px;
  line-height: 18px;
}
.ss-dot {
  position: absolute;
  top: 5px;
  right: 10px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d1495b;
}
.ss-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 28px;
}
.ss-lead {
  font-size: 14px;
  margin: 0 0 12px;
}
.ss-badge {
  display: inline-block;
  font-weight: 700;
  font-size: 13px;
  padding: 2px 10px;
  border-radius: 999px;
}
.ss-badge.ok { background: #fbefd9; color: #004e5a; }
.ss-badge.mid { background: #fff3d6; color: #7a4b00; }
.ss-badge.bad { background: #fbe7ea; color: #d1495b; }
.ss-h {
  font-size: 13px;
  font-weight: 700;
  margin: 16px 0 8px;
}
.ss-picks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ss-pick {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 1.5px solid #e6dfd2;
  background: #fbf5ea;
  border-radius: 14px;
  padding: 8px 14px;
  color: #003d5b;
  transition: border-color 0.15s, transform 0.15s;
}
.ss-pick small {
  color: #5a6b78;
}
.ss-pick:hover {
  border-color: #00798c;
  transform: translateY(-1px);
}
.ss-note {
  font-size: 12px;
  color: #5a6b78;
  margin: 10px 0 0;
}
.ss-good {
  font-size: 14px;
  color: #004e5a;
  margin: 12px 0 0;
}
.ss-link {
  border: 0;
  background: none;
  padding: 0;
  color: #00798c;
  font-weight: 600;
  text-decoration: underline;
}
.ss-hours {
  list-style: none;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 0 0 6px;
  margin: 0;
}
.ss-hours li {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 52px;
  padding: 8px 6px;
  border-radius: 14px;
  background: #f6f2ea;
  font-size: 18px;
}
.ss-hours li small {
  font-size: 11px;
  color: #5a6b78;
}
.ss-hours li strong {
  font-size: 13px;
}
.ss-hours li.here {
  background: #fbefd9;
  box-shadow: inset 0 0 0 2px #00798c;
}
.ss-hours li.here.wet {
  background: #fbe7ea;
  box-shadow: inset 0 0 0 2px #d1495b;
}
.ss-callout {
  margin-top: 14px;
  padding: 14px;
  border-radius: 16px;
  background: #fff8ea;
  border: 1px solid #f3dca8;
  font-size: 14px;
}
.ss-swaps {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ss-swaps li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 8px 12px;
  border-radius: 12px;
  background: #fbf5ea;
  border: 1px solid #e6dfd2;
}
.ss-route {
  margin: 12px 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: #f6f2ea;
  font-size: 13px;
}
.ss-route-from {
  margin: 0 0 4px;
  color: #5a6b78;
}
.ss-route-opt {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0;
  border-top: 1px solid #e6dfd2;
}
.ss-route-opt small {
  flex-shrink: 0;
  color: #5a6b78;
}
.ss-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.ss-grow {
  flex: 1;
}
.ss-label {
  display: block;
  min-width: 70px;
  font-size: 13px;
  font-weight: 600;
}
.ss-opt {
  font-weight: 400;
  color: #5a6b78;
}
.ss-input {
  height: 40px;
  border: 1.5px solid #e6dfd2;
  border-radius: 12px;
  padding: 0 12px;
  background: #fbf5ea;
  color: #003d5b;
}
.ss-row .ss-input {
  flex: 1;
}
.ss-details {
  margin-top: 18px;
  padding-top: 6px;
  border-top: 1px solid #e6dfd2;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ss-details .ss-label {
  margin-top: 6px;
}
.ss-seg {
  display: inline-flex;
  align-self: flex-start;
  gap: 4px;
  padding: 4px;
  margin: 8px 0;
  border-radius: 999px;
  background: #f4efe6;
}
.ss-seg button {
  border: 0;
  border-radius: 999px;
  background: transparent;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #5a6b78;
}
.ss-seg button.on {
  background: #003d5b;
  color: #fff;
}
.ss-btn {
  flex-shrink: 0;
  border: 1.5px solid #003d5b;
  background: #fbf5ea;
  color: #003d5b;
  border-radius: 999px;
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 700;
}
.ss-btn:hover:not(:disabled) {
  background: #003d5b;
  color: #fff;
}
.ss-btn.primary {
  align-self: flex-start;
  background: #00798c;
  border-color: #00798c;
  color: #fff;
}
.ss-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ss-error {
  color: #d1495b;
  font-size: 13px;
  margin: -6px 0 10px;
}
.ss-x:focus-visible,
.ss-tabs button:focus-visible,
.ss-pick:focus-visible,
.ss-btn:focus-visible,
.ss-link:focus-visible,
.ss-seg button:focus-visible {
  outline: 3px solid rgba(0, 121, 140, 0.45);
  outline-offset: 2px;
}

.ss-fade-enter-active,
.ss-fade-leave-active {
  transition: opacity 0.2s ease;
}
.ss-fade-enter-from,
.ss-fade-leave-to {
  opacity: 0;
}
.ss-slide-enter-active {
  transition: transform 0.25s ease-out;
}
.ss-slide-enter-from {
  transform: translateX(100%);
}
@media (prefers-reduced-motion: reduce) {
  .ss-fade-enter-active,
  .ss-fade-leave-active,
  .ss-slide-enter-active,
  .ss-pick { transition: none; }
}
.ss-muted {
  font-size: 13px;
  opacity: 0.75;
}
</style>
