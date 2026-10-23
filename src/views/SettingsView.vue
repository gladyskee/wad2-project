<template>
  <div class="st-page">
    <button type="button" class="st-back" @click="goBack">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
      Go back
    </button>

    <section class="st" aria-labelledby="st-title">
      <!-- Header + auto-save status -->
      <header class="st-head">
        <div>
          <h1 id="st-title" class="st-title">Settings</h1>
          <p class="st-sub">Changes save automatically.</p>
        </div>
        <span class="st-status" :class="status" role="status" aria-live="polite">
          <span class="st-status-dot" aria-hidden="true"></span>
          {{ statusText }}
        </span>
      </header>

      <!-- Came from the new-account prompt on Home: say where to start -->
      <div v-if="welcome" class="st-welcome" role="status">
        <span class="st-welcome-icon" aria-hidden="true">👋</span>
        <div>
          <strong>Welcome! Start with My Information.</strong>
          <p>Add your food needs and WhatsApp: your crew sees them on every trip you join. Then check your base currency and trip pacing.</p>
        </div>
        <button type="button" class="st-primary" @click="router.push('/home')">Done, show my trips</button>
      </div>

      <LoadingSkeleton v-if="loading" variant="list" :count="3" dark label="Loading your settings…" />
      <div v-else class="st-cols">
        <!-- Left column on wide screens -->
        <div class="st-col">
        <!-- ===== My information ===== -->
        <h2 class="st-group-title">My Information</h2>
        <div class="st-group" :class="{ 'st-spot': welcome }">
          <div class="st-row">
            <label class="st-row-label" for="st-email">Email</label>
            <input id="st-email" v-model="email" type="email" class="st-input" maxlength="120" autocomplete="email"
              :aria-invalid="!!emailError" aria-describedby="st-email-err" @blur="saveEmail" @keydown.enter.prevent="saveEmail">
          </div>
          <p v-if="emailError" id="st-email-err" class="st-err" role="alert">{{ emailError }}</p>
          <div class="st-row stack">
            <label class="st-row-label" for="st-diet">Food needs</label>
            <DietTagsInput id="st-diet" v-model="diet" />
          </div>
          <div class="st-row stack">
            <label class="st-row-label" for="st-phone">WhatsApp</label>
            <PhoneInput id="st-phone" v-model="phone" />
          </div>
        </div>

        <!-- ===== Session & account ===== -->
        <h2 class="st-group-title">Session & Account</h2>
        <div class="st-group">
          <div class="st-row">
            <span class="st-who">
              <span class="st-avatar" aria-hidden="true">{{ initial }}</span>
              <span class="st-row-text">
                <span class="st-row-label">@{{ user.username }}</span>
                <span class="st-row-hint">{{ savedEmail }}</span>
              </span>
            </span>
            <button type="button" class="st-logout" @click="handleLogout">Log out</button>
          </div>
          <!-- Change password: opens a small form right here -->
          <div class="st-row">
            <span class="st-row-text">
              <span class="st-row-label">Password</span>
              <span class="st-row-hint">{{ pwDone ? '✓ Changed' : 'At least 8 characters' }}</span>
            </span>
            <button type="button" class="st-logout" :aria-expanded="pwOpen" aria-controls="st-pw-form" @click="togglePassword">
              {{ pwOpen ? 'Cancel' : 'Change' }}
            </button>
          </div>
          <form v-if="pwOpen" id="st-pw-form" class="st-row stack st-form" @submit.prevent="changePassword">
            <label class="st-field">
              <span>Current password</span>
              <input v-model="pw.current" type="password" class="st-input full" autocomplete="current-password" required>
            </label>
            <label class="st-field">
              <span>New password</span>
              <input v-model="pw.next" type="password" class="st-input full" autocomplete="new-password" minlength="8" required>
            </label>
            <label class="st-field">
              <span>New password again</span>
              <input v-model="pw.again" type="password" class="st-input full" autocomplete="new-password" required>
            </label>
            <p v-if="pwError" class="st-err left" role="alert">{{ pwError }}</p>
            <button type="submit" class="st-primary" :disabled="pwSaving">{{ pwSaving ? 'Saving…' : 'Change password' }}</button>
          </form>
        </div>

        <!-- ===== Delete account (asks for the password first) ===== -->
        <h2 class="st-group-title">Delete Account</h2>
        <div class="st-group">
          <div class="st-row">
            <span class="st-row-text">
              <span class="st-row-label">Delete my account</span>
              <span class="st-row-hint">This can't be undone</span>
            </span>
            <button type="button" class="st-danger" :aria-expanded="delOpen" aria-controls="st-del-form" @click="toggleDelete">
              {{ delOpen ? 'Cancel' : 'Delete…' }}
            </button>
          </div>
          <form v-if="delOpen" id="st-del-form" class="st-row stack st-form" @submit.prevent="deleteAccount">
            <ul class="st-warn">
              <li>Trips you organise go to the next person who joined. Trips only you are on are deleted.</li>
              <li>On trips you joined, your name stays as a traveller, so the expenses still add up.</li>
              <li>Your friends list and family groups you own are removed.</li>
            </ul>
            <label class="st-field">
              <span>Type your password to confirm</span>
              <input v-model="delPassword" type="password" class="st-input full" autocomplete="current-password" required>
            </label>
            <p v-if="delError" class="st-err left" role="alert">{{ delError }}</p>
            <button type="submit" class="st-danger solid" :disabled="!delPassword || deleting">{{ deleting ? 'Deleting…' : 'Delete my account' }}</button>
          </form>
        </div>
        </div>

        <!-- Right column on wide screens -->
        <div class="st-col">
        <!-- ===== Trip preferences ===== -->
        <h2 class="st-group-title">Trip Preferences</h2>
        <div class="st-group">
          <div class="st-row">
            <span class="st-row-text">
              <span class="st-row-label" id="st-cur-label">Base currency</span>
              <span class="st-row-hint">For new trips' expenses</span>
            </span>
            <CustomDropdown id="st-currency" v-model="settings.currency" :options="currencyChoices" size="sm"
              header-text="Base currency" aria-label="Base currency" />
          </div>
          <div class="st-row">
            <span class="st-row-text">
              <span class="st-row-label" id="st-units-label">Distance & weather</span>
            </span>
            <div class="st-seg" role="radiogroup" aria-labelledby="st-units-label" :class="{ right: settings.units === 'imperial' }">
              <span class="st-seg-thumb" aria-hidden="true"></span>
              <button v-for="u in UNITS" :key="u.value" type="button" role="radio" :aria-checked="settings.units === u.value"
                :tabindex="settings.units === u.value ? 0 : -1" :class="{ on: settings.units === u.value }"
                @click="settings.units = u.value" @keydown="onSegKey">{{ u.label }}</button>
            </div>
          </div>
        </div>

        <!-- ===== Pacing: how the itinerary planner times your days ===== -->
        <h2 id="pacing" class="st-group-title">Trip Pacing</h2>
        <div class="st-group">
          <div class="st-row">
            <span class="st-row-text">
              <span class="st-row-label">Day starts</span>
              <span class="st-row-hint">Earliest first stop</span>
            </span>
            <CustomDropdown id="st-day-start" v-model="pace.dayStart" :options="startChoices" size="sm" header-text="Day starts" aria-label="Day starts" />
          </div>
          <div class="st-row">
            <span class="st-row-text">
              <span class="st-row-label">Day ends</span>
              <span class="st-row-hint">Back at the hotel by</span>
            </span>
            <CustomDropdown id="st-day-end" v-model="pace.dayEnd" :options="endChoices" size="sm" header-text="Day ends" aria-label="Day ends" />
          </div>
          <div class="st-row">
            <span class="st-row-text">
              <span class="st-row-label">Crowds bother me</span>
              <span class="st-row-hint">More = avoid busy times harder</span>
            </span>
            <CustomDropdown id="st-crowd" v-model="pace.crowdSensitivity" :options="crowdChoices" size="sm" header-text="Crowds bother me" aria-label="Crowds bother me" />
          </div>
          <div class="st-row">
            <span class="st-row-text">
              <span class="st-row-label">Travel buffer</span>
              <span class="st-row-hint">Free time kept between stops</span>
            </span>
            <CustomDropdown id="st-buffer" v-model="pace.travelBuffer" :options="bufferChoices" size="sm" header-text="Travel buffer" aria-label="Travel buffer" />
          </div>
          <p v-if="paceError" class="st-err" role="alert">{{ paceError }}</p>
        </div>

        <!-- ===== Safety & notifications ===== -->
        <h2 class="st-group-title">Safety & Notifications</h2>
        <div class="st-group">
          <div class="st-row">
            <span class="st-row-text">
              <span class="st-row-label" id="st-haz-label">Hazard advisories</span>
              <span class="st-row-hint">Earthquake and storm warnings near your trip</span>
            </span>
            <button type="button" role="switch" class="st-switch" :aria-checked="settings.hazardAlerts" aria-labelledby="st-haz-label"
              @click="settings.hazardAlerts = !settings.hazardAlerts"><span class="st-knob"></span></button>
          </div>
          <div class="st-row">
            <span class="st-row-text">
              <span class="st-row-label" id="st-exp-label">Expense activity</span>
              <span class="st-row-hint">New bill splits and settle-ups</span>
            </span>
            <button type="button" role="switch" class="st-switch" :aria-checked="settings.expenseAlerts" aria-labelledby="st-exp-label"
              @click="settings.expenseAlerts = !settings.expenseAlerts"><span class="st-knob"></span></button>
          </div>
        </div>

        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'
import { auth, logout, saveLogin } from '../auth.js'
import { userSettings } from '../userSettings.js'
import { CURRENCIES } from '../expenses.js'
import { prefs, loadPreferences, savePreferences } from '../preferences.js'
import { formatHour } from '../crowd.js'
import CustomDropdown from '../components/CustomDropdown.vue'
import DietTagsInput from '../components/DietTagsInput.vue'
import PhoneInput from '../components/PhoneInput.vue'
import LoadingSkeleton from '../components/LoadingSkeleton.vue'

const router = useRouter()
const route = useRoute()
const welcome = computed(() => route.query.welcome === '1') // opened from the new-account prompt

const UNITS = [
  { value: 'metric', label: 'km · °C' },
  { value: 'imperial', label: 'mi · °F' }
]

// "SGD ($)", "JPY (¥)" ...
const currencyChoices = []
for (const c of CURRENCIES) {
  let symbol = ''
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol' }).formatToParts(0)
    for (const p of parts) if (p.type === 'currency') symbol = p.value
  } catch (err) {
    symbol = ''
  }
  currencyChoices.push({ value: c, label: symbol && symbol !== c ? c + ' (' + symbol + ')' : c })
}

// ----- State -----
const loading = ref(true)
const email = ref('')
const savedEmail = ref('')
const emailError = ref('')
const diet = ref([])
const phone = ref('')
const settings = userSettings // shared: other pages follow these straight away

const user = computed(() => auth.user || { name: '', username: '' })
const initial = computed(() => (user.value.name || '?').charAt(0).toUpperCase())

// ----- Auto-save -----
// Changes are collected for a moment, then sent together (fewer requests while typing)
const status = ref('saved') // 'saving' | 'saved' | 'error'
const statusText = computed(() => ({ saving: 'Saving…', saved: 'Saved', error: 'Not saved' })[status.value])
let pending = {}
let timer = null

function queueSave(patch) {
  pending = { ...pending, ...patch }
  status.value = 'saving'
  clearTimeout(timer)
  timer = setTimeout(flush, 500)
}

async function flush() {
  const body = pending
  pending = {}
  try {
    const res = await axios.put('/api/auth/me', body)
    if (body.email) {
      savedEmail.value = res.data.email
      saveLogin(auth.token, { ...auth.user, email: res.data.email }) // keep the saved login up to date
    }
    if (!Object.keys(pending).length) status.value = 'saved'
  } catch (err) {
    status.value = 'error'
    const message = (err.response && err.response.data && err.response.data.message) || 'Could not save.'
    if (body.email) emailError.value = message
  }
}

// Load, then start watching (so loading doesn't trigger saves)
async function load() {
  try {
    const res = await axios.get('/api/auth/me')
    email.value = res.data.email || ''
    savedEmail.value = res.data.email || ''
    diet.value = res.data.diet || []
    phone.value = res.data.phone || ''
    Object.assign(settings, res.data.settings || {})
  } catch (err) {
    status.value = 'error'
  }
  loading.value = false
  watch(diet, (v) => queueSave({ diet: v }))
  watch(phone, (v) => queueSave({ phone: v }))
  watch(settings, () => queueSave({ settings: { ...settings } }))
}
load()

// ----- Pacing (its own API: /api/preferences) -----
const startChoices = []
for (let h = 5; h <= 12; h++) startChoices.push({ value: h, label: formatHour(h) })
const endChoices = []
for (let h = 17; h <= 24; h++) endChoices.push({ value: h, label: h === 24 ? 'Midnight' : formatHour(h) })
const crowdChoices = [
  { value: 'low', label: 'A little' },
  { value: 'medium', label: 'Somewhat' },
  { value: 'high', label: 'A lot' }
]
const bufferChoices = [
  { value: 0, label: 'None' },
  { value: 0.25, label: '15 min' },
  { value: 0.5, label: '30 min' },
  { value: 1, label: '1 hour' }
]
const pace = reactive({ ...prefs })
const paceError = ref('')
let paceTimer = null
async function loadPace() {
  try {
    await loadPreferences()
    Object.assign(pace, prefs)
  } catch (err) {
    // keep the defaults
  }
  watch(pace, () => {
    paceError.value = ''
    if (pace.dayEnd - pace.dayStart < 4) {
      paceError.value = 'Your day needs to be at least 4 hours long.'
      return
    }
    status.value = 'saving'
    clearTimeout(paceTimer)
    paceTimer = setTimeout(savePace, 500)
  })
  // Opened from the menu's "Trip pacing": scroll down to it
  if (route.hash === '#pacing') {
    setTimeout(() => {
      const el = document.getElementById('pacing')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 350) // after the page has faded in
  }
}
async function savePace() {
  paceTimer = null
  try {
    await savePreferences({ ...pace })
    status.value = 'saved'
  } catch (err) {
    status.value = 'error'
    paceError.value = (err.response && err.response.data && err.response.data.message) || 'Could not save.'
  }
}
loadPace()

// Email saves when you leave the box (half-typed emails aren't sent)
function saveEmail() {
  const value = email.value.trim().toLowerCase()
  emailError.value = ''
  if (value === savedEmail.value) return
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    emailError.value = 'Please enter a valid email.'
    return
  }
  queueSave({ email: value })
}

// Save anything still waiting when leaving the page
onBeforeUnmount(() => {
  clearTimeout(timer)
  if (paceTimer) {
    clearTimeout(paceTimer)
    savePace()
  }
  if (Object.keys(pending).length) flush()
})

// ----- Controls -----
function onSegKey(e) {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    settings.units = settings.units === 'metric' ? 'imperial' : 'metric'
    const buttons = e.currentTarget.parentElement.querySelectorAll('button')
    buttons[settings.units === 'metric' ? 0 : 1].focus()
  }
}

function goBack() {
  if (window.history.state && window.history.state.back) router.back()
  else router.push('/home')
}

function handleLogout() {
  logout()
  router.push('/login')
}

// ----- Change password -----
const pwOpen = ref(false)
const pw = reactive({ current: '', next: '', again: '' })
const pwError = ref('')
const pwSaving = ref(false)
const pwDone = ref(false)
function togglePassword() {
  pwOpen.value = !pwOpen.value
  pwError.value = ''
  pw.current = ''
  pw.next = ''
  pw.again = ''
}
async function changePassword() {
  pwError.value = ''
  if (pw.next.length < 8) {
    pwError.value = 'The new password must be at least 8 characters.'
    return
  }
  if (pw.next !== pw.again) {
    pwError.value = 'The two new passwords don\'t match.'
    return
  }
  pwSaving.value = true
  try {
    await axios.put('/api/auth/password', { currentPassword: pw.current, newPassword: pw.next })
    togglePassword() // close and clear the form
    pwDone.value = true
  } catch (err) {
    pwError.value = (err.response && err.response.data && err.response.data.message) || 'Could not change the password.'
  }
  pwSaving.value = false
}

// ----- Delete account -----
const delOpen = ref(false)
const delPassword = ref('')
const delError = ref('')
const deleting = ref(false)
function toggleDelete() {
  delOpen.value = !delOpen.value
  delPassword.value = ''
  delError.value = ''
}
async function deleteAccount() {
  delError.value = ''
  deleting.value = true
  try {
    await axios.delete('/api/auth/me', { data: { password: delPassword.value } })
    logout()
    router.push('/')
  } catch (err) {
    delError.value = (err.response && err.response.data && err.response.data.message) || 'Could not delete the account.'
    deleting.value = false
  }
}
</script>

<style scoped>
.st-page {
  position: relative;
  max-width: 1080px;
  margin: 0 auto;
  padding-bottom: 48px;
  --mint: #edae49;
  --text: #e6edf3;
  --muted: #8b949e;
}

/* Go back */
.st-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 16px 0 12px;
  margin-bottom: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  font-weight: 600;
  font-size: 14px;
  transition: transform 0.15s, border-color 0.15s, color 0.15s;
}
.st-back svg {
  transition: transform 0.15s;
}
.st-back:hover {
  border-color: rgba(237, 174, 73, 0.5);
  color: var(--mint);
}
.st-back:hover svg {
  transform: translateX(-2px);
}
.st-back:active {
  transform: scale(0.96);
}

/* Card */
.st {
  background: rgba(0, 45, 68, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--text);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 20px;
  padding: 22px;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 24px 60px rgba(0, 0, 0, 0.45);
}
.st-cols {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0 28px;
}
.st-col {
  min-width: 0;
}
@media (min-width: 860px) {
  .st {
    padding: 30px 32px 32px;
  }
  .st-cols {
    grid-template-columns: 1fr 1fr;
  }
}
.st-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 6px;
}
.st-title {
  font-family: var(--font-display);
  font-size: 1.6rem;
  margin: 0;
}
.st-sub {
  color: var(--muted);
  font-size: 13px;
  margin: 2px 0 0;
}

/* Auto-save status */
.st-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mint);
  background: rgba(237, 174, 73, 0.08);
  border: 1px solid rgba(237, 174, 73, 0.2);
}
.st-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 0 rgba(237, 174, 73, 0.6);
  animation: st-pulse 2s infinite;
}
.st-status.saving {
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}
.st-status.saving .st-status-dot {
  animation: st-blink 0.8s infinite alternate;
}
.st-status.error {
  color: #ec8a97;
  background: rgba(209, 73, 91, 0.1);
  border-color: rgba(209, 73, 91, 0.3);
}
.st-status.error .st-status-dot {
  animation: none;
}

/* Groups */
.st-group-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 20px 4px 8px;
}
.st-group {
  background: #0b3a56;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  overflow: visible;
}
.st-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 54px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.15s;
}
.st-row:last-child {
  border-bottom: 0;
}
.st-row:first-child {
  border-radius: 14px 14px 0 0;
}
.st-row:last-child {
  border-radius: 0 0 14px 14px;
}
.st-row:only-child {
  border-radius: 14px;
}
.st-row:hover {
  background: rgba(255, 255, 255, 0.02);
}
.st-row.stack {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.st-row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.st-row-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.st-row-hint {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.st-input {
  flex: 1;
  max-width: 280px;
  min-width: 0;
  background: #00283c;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: var(--text);
  font-size: 14px;
  padding: 7px 10px;
  text-align: right;
  color-scheme: dark;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.st-input:focus {
  outline: none;
  text-align: left;
  border-color: var(--mint);
  box-shadow: 0 0 0 3px rgba(237, 174, 73, 0.15);
}
.st-input[aria-invalid='true'] {
  border-color: rgba(209, 73, 91, 0.6);
}
.st-err {
  color: #f09aa5;
  font-size: 12px;
  margin: 0;
  padding: 0 14px 10px;
  text-align: right;
}

/* Segmented km/mi toggle with a sliding thumb */
.st-seg {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: none;
  padding: 3px;
  border-radius: 999px;
  background: #00283c;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.st-seg-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc(50% - 3px);
  border-radius: 999px;
  background: rgba(237, 174, 73, 0.14);
  border: 1px solid rgba(237, 174, 73, 0.35);
  box-shadow: 0 0 12px rgba(237, 174, 73, 0.15);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.st-seg.right .st-seg-thumb {
  transform: translateX(100%);
}
.st-seg button {
  position: relative;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 999px;
  white-space: nowrap;
  transition: color 0.2s;
}
.st-seg button.on {
  color: var(--mint);
}

/* Toggle switch */
.st-switch {
  position: relative;
  flex: none;
  width: 44px;
  height: 26px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #2a323d;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.st-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #cbd5e1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s;
}
.st-switch[aria-checked='true'] {
  background: rgba(237, 174, 73, 0.85);
  border-color: rgba(237, 174, 73, 0.9);
  box-shadow: 0 0 14px rgba(237, 174, 73, 0.3);
}
.st-switch[aria-checked='true'] .st-knob {
  transform: translateX(18px);
  background: #fbf5ea;
}
.st-switch:active .st-knob {
  width: 24px;
}
.st-switch[aria-checked='true']:active .st-knob {
  transform: translateX(14px);
}

/* Account */
.st-who {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.st-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00798c, #edae49);
  color: #fff;
  font-weight: 700;
}
.st-logout {
  flex: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: #cbd5e1;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.st-logout:hover {
  color: #ec8a97;
  border-color: rgba(209, 73, 91, 0.45);
  background: rgba(209, 73, 91, 0.08);
}

/* Welcome note for new accounts */
.st-welcome {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 16px 0 4px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(237, 174, 73, 0.1);
  border: 1px solid rgba(237, 174, 73, 0.35);
  font-size: 14px;
}
.st-welcome-icon {
  font-size: 26px;
}
.st-welcome p {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.st-welcome .st-primary {
  flex: none;
  align-self: center;
  margin-left: auto;
}
.st-spot {
  border-color: rgba(237, 174, 73, 0.6);
  box-shadow: 0 0 0 4px rgba(237, 174, 73, 0.12);
}
@media (max-width: 640px) {
  .st-welcome {
    flex-wrap: wrap;
  }
  .st-welcome .st-primary {
    margin-left: 0;
  }
}

/* Password and delete-account forms */
.st-form {
  gap: 12px;
  padding-top: 4px;
  padding-bottom: 16px;
}
.st-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}
.st-input.full {
  max-width: none;
  text-align: left;
  padding: 10px 12px;
}
.st-err.left {
  text-align: left;
  padding: 0;
}
.st-primary,
.st-danger.solid {
  align-self: flex-start;
  border: 0;
  border-radius: 999px;
  padding: 10px 20px;
  font-weight: 700;
  font-size: 14px;
  transition: transform 0.15s, opacity 0.15s;
}
.st-primary {
  background: #edae49;
  color: #001d2c;
}
.st-primary:hover:not(:disabled),
.st-danger.solid:hover:not(:disabled) {
  transform: translateY(-1px);
}
.st-primary:disabled,
.st-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.st-danger {
  flex: none;
  border: 1px solid rgba(209, 73, 91, 0.45);
  background: transparent;
  color: #ec8a97;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}
.st-danger:hover:not(:disabled) {
  background: rgba(209, 73, 91, 0.12);
}
.st-danger.solid {
  background: #d1495b;
  border: 0;
  color: #fff;
}
.st-warn {
  margin: 0;
  padding: 12px 14px 12px 30px;
  border-radius: 12px;
  background: rgba(209, 73, 91, 0.1);
  border: 1px solid rgba(209, 73, 91, 0.25);
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
}

/* Focus rings */
.st-back:focus-visible,
.st-seg button:focus-visible,
.st-switch:focus-visible,
.st-logout:focus-visible,
.st-primary:focus-visible,
.st-danger:focus-visible {
  outline: 2px solid var(--mint);
  outline-offset: 2px;
}

@keyframes st-pulse {
  0% { box-shadow: 0 0 0 0 rgba(237, 174, 73, 0.55); }
  70% { box-shadow: 0 0 0 6px rgba(237, 174, 73, 0); }
  100% { box-shadow: 0 0 0 0 rgba(237, 174, 73, 0); }
}
@keyframes st-blink {
  from { opacity: 0.3; }
  to { opacity: 1; }
}

@media (max-width: 480px) {
  .st {
    padding: 16px;
    border-radius: 18px;
  }
  .st-row {
    padding: 10px 12px;
  }
  .st-row-hint {
    white-space: normal;
  }
  .st-input {
    max-width: 60%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .st-status-dot,
  .st-seg-thumb,
  .st-knob,
  .st-switch,
  .st-back,
  .st-back svg {
    animation: none;
    transition: none;
  }
}

/* Phones and touch screens: every control is at least 40px to tap (WCAG / Apple guidance) */
@media (pointer: coarse), (max-width: 560px) {
  .st-seg button {
    min-height: 40px;
  }
  /* the switch stays small to look at, but its tap area is 44px */
  .st-switch {
    position: relative;
  }
  .st-switch::after {
    content: '';
    position: absolute;
    inset: -9px -4px;
  }
}
</style>
