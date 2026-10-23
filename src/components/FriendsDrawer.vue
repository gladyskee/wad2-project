<template>
  <!-- Friends drawer (opened from the profile menu): add friends by username, answer requests,
       see who's online, invite a friend to one of your trips, or remove them. -->
  <Teleport to="body">
    <transition name="fd-fade">
      <div v-if="friends.open" class="fd-backdrop" @click.self="close">
        <aside ref="panelEl" class="fd" role="dialog" aria-modal="true" aria-labelledby="fd-title" @keydown="onKey">
          <header class="fd-head">
            <div class="fd-head-text">
              <h2 id="fd-title" class="fd-title">Friends</h2>
              <p class="fd-sub">
                {{ list.length }} friend{{ list.length === 1 ? '' : 's' }}<template v-if="onlineCount"> · <span class="fd-green">{{ onlineCount }} online</span></template>
              </p>
            </div>
            <button type="button" class="fd-close" aria-label="Close friends" @click="close">
              <AppIcon name="x" :size="18" />
            </button>
          </header>

          <div class="fd-body">
            <!-- ===== Add a friend ===== -->
            <label for="fd-search" class="fd-label">Add a friend</label>
            <div class="fd-search">
              <AppIcon name="search" :size="16" class="fd-search-icon" />
              <input id="fd-search" ref="searchEl" v-model="query" type="search" class="fd-input" placeholder="Search by username"
                autocomplete="off" spellcheck="false" autocapitalize="none" @input="onType">
            </div>
            <ul v-if="results.length" class="fd-list fd-results" aria-label="Search results">
              <li v-for="u in results" :key="u.id" class="fd-row">
                <span class="fd-avatar sm" :style="{ background: colourFor(u.name) }" aria-hidden="true">{{ initials(u.name) }}</span>
                <span class="fd-who">
                  <strong class="fd-name">{{ u.name }}</strong>
                  <span class="fd-muted">@{{ u.username }}</span>
                </span>
                <button v-if="u.status === 'none'" type="button" class="fd-btn primary" :disabled="busy === u.id" @click="sendRequest(u)">
                  <AppIcon name="user-plus" :size="15" />Add
                </button>
                <button v-else-if="u.status === 'incoming'" type="button" class="fd-btn primary" :disabled="busy === u.id" @click="accept(u)">
                  <AppIcon name="check" :size="15" />Accept
                </button>
                <button v-else-if="u.status === 'outgoing'" type="button" class="fd-btn" :disabled="busy === u.id"
                  :aria-label="'Cancel request to ' + u.name" @click="cancelRequest(u)">Requested · Cancel</button>
                <span v-else class="fd-tag"><AppIcon name="check" :size="13" />Friends</span>
              </li>
            </ul>
            <p v-else-if="hint" class="fd-hint">{{ hint }}</p>
            <p class="fd-msg" :class="{ bad: msgBad }" role="status" aria-live="polite">{{ msg }}</p>

            <!-- ===== Tabs ===== -->
            <div class="fd-tabs" role="tablist" aria-label="Friends and requests">
              <button type="button" role="tab" class="fd-tab" :class="{ on: tab === 'friends' }" :aria-selected="tab === 'friends'" @click="tab = 'friends'">
                Friends <span class="fd-count">{{ list.length }}</span>
              </button>
              <button type="button" role="tab" class="fd-tab" :class="{ on: tab === 'requests' }" :aria-selected="tab === 'requests'" @click="tab = 'requests'">
                Requests <span class="fd-count" :class="{ hot: incoming.length }">{{ incoming.length + outgoing.length }}</span>
              </button>
            </div>

            <LoadingSkeleton v-if="loading && !loaded" variant="list" :count="4" dark label="Loading your friends…" />
            <p v-else-if="loadError" class="fd-msg bad" role="alert">{{ loadError }}</p>

            <!-- ===== Friends ===== -->
            <div v-else-if="tab === 'friends'" role="tabpanel">
              <div v-if="!list.length" class="fd-empty">
                <AppIcon name="users" :size="28" />
                <p><strong>No friends yet</strong><br>Search a username above, or share yours so they can add you.</p>
              </div>
              <ul v-else class="fd-list" aria-label="Your friends">
                <li v-for="f in list" :key="f.id" class="fd-friend">
                  <div class="fd-row">
                    <span class="fd-avatar" :style="{ background: colourFor(f.name) }" aria-hidden="true">
                      {{ initials(f.name) }}<span v-if="f.online" class="fd-dot"></span>
                    </span>
                    <span class="fd-who">
                      <strong class="fd-name">{{ f.name }}</strong>
                      <span class="fd-muted">
                        <span :class="{ 'fd-green': f.online }">{{ lastActiveText(f) }}</span>
                        <template v-if="f.sharedTrips"> · {{ f.sharedTrips }} trip{{ f.sharedTrips === 1 ? '' : 's' }} together</template>
                      </span>
                    </span>
                    <template v-if="removing === f.id">
                      <span class="fd-confirm">Remove?</span>
                      <button type="button" class="fd-btn danger" :disabled="busy === f.id" @click="unfriend(f)">Yes</button>
                      <button type="button" class="fd-btn" @click="removing = null">No</button>
                    </template>
                    <template v-else>
                      <button type="button" class="fd-btn" :class="{ on: invitingFor === f.id }" :aria-expanded="invitingFor === f.id"
                        :aria-label="'Invite ' + f.name + ' to a trip'" @click="toggleInvite(f)">
                        <AppIcon name="plane" :size="15" />Invite
                      </button>
                      <button type="button" class="fd-icon-btn" :aria-label="'Remove ' + f.name + ' from friends'" title="Remove friend" @click="removing = f.id">
                        <AppIcon name="user-x" :size="16" />
                      </button>
                    </template>
                  </div>

                  <!-- Quick invite: pick one of your upcoming trips -->
                  <div v-if="invitingFor === f.id" class="fd-trips">
                    <LoadingSkeleton v-if="trips === null" variant="list" :count="2" dark label="Loading your trips…" />
                    <p v-else-if="!upcomingTrips.length" class="fd-hint">No upcoming trips to invite {{ f.name }} to.</p>
                    <ul v-else class="fd-trip-list">
                      <li v-for="t in upcomingTrips" :key="t.id" class="fd-trip">
                        <span class="fd-trip-text">
                          <strong>{{ t.name }}</strong>
                          <small>{{ tripDates(t) }}</small>
                        </span>
                        <span v-if="tripStatus(t, f) === 'member'" class="fd-tag">On this trip</span>
                        <span v-else-if="tripStatus(t, f) === 'invited'" class="fd-tag"><AppIcon name="check" :size="13" />Invited</span>
                        <button v-else type="button" class="fd-btn primary" :disabled="busy === f.id + t.id" @click="inviteToTrip(f, t)">Invite</button>
                      </li>
                    </ul>
                  </div>
                </li>
              </ul>
            </div>

            <!-- ===== Requests ===== -->
            <div v-else role="tabpanel">
              <div v-if="!incoming.length && !outgoing.length" class="fd-empty">
                <AppIcon name="user-plus" :size="28" />
                <p><strong>No requests right now</strong><br>When someone adds you, it shows up here.</p>
              </div>
              <template v-if="incoming.length">
                <h3 class="fd-group">Waiting for you</h3>
                <ul class="fd-list">
                  <li v-for="u in incoming" :key="u.id" class="fd-row">
                    <span class="fd-avatar" :style="{ background: colourFor(u.name) }" aria-hidden="true">{{ initials(u.name) }}</span>
                    <span class="fd-who">
                      <strong class="fd-name">{{ u.name }}</strong>
                      <span class="fd-muted">@{{ u.username }}</span>
                    </span>
                    <button type="button" class="fd-btn primary" :disabled="busy === u.id" @click="accept(u)">Accept</button>
                    <button type="button" class="fd-btn" :disabled="busy === u.id" :aria-label="'Decline ' + u.name" @click="decline(u)">Decline</button>
                  </li>
                </ul>
              </template>
              <template v-if="outgoing.length">
                <h3 class="fd-group">Sent</h3>
                <ul class="fd-list">
                  <li v-for="u in outgoing" :key="u.id" class="fd-row">
                    <span class="fd-avatar" :style="{ background: colourFor(u.name) }" aria-hidden="true">{{ initials(u.name) }}</span>
                    <span class="fd-who">
                      <strong class="fd-name">{{ u.name }}</strong>
                      <span class="fd-muted">@{{ u.username }} · waiting</span>
                    </span>
                    <button type="button" class="fd-btn" :disabled="busy === u.id" :aria-label="'Cancel request to ' + u.name" @click="cancelRequest(u)">Cancel</button>
                  </li>
                </ul>
              </template>
            </div>
          </div>

          <!-- My username, to share -->
          <footer class="fd-foot">
            <span class="fd-muted">Your username</span>
            <code class="fd-handle">@{{ myUsername }}</code>
            <button type="button" class="fd-btn" :class="{ done: copied }" @click="copyMine">
              <AppIcon :name="copied ? 'check' : 'copy'" :size="15" />{{ copied ? 'Copied' : 'Copy' }}
            </button>
          </footer>
        </aside>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { localDate } from '../dates.js'
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { auth } from '../auth.js'
import { friends, lastActiveText, copyText } from '../friends.js'
import AppIcon from './AppIcon.vue'
import LoadingSkeleton from './LoadingSkeleton.vue'

const panelEl = ref(null)
const searchEl = ref(null)
const tab = ref('friends')

// The lists (from GET /api/friends)
const list = ref([])
const incoming = ref([])
const outgoing = ref([])
const loading = ref(false)
const loaded = ref(false)
const loadError = ref('')

// Search
const query = ref('')
const results = ref([])
const searched = ref(false)
let searchTimer = null

const busy = ref(null)        // id of the row waiting for the server
const msg = ref('')
const msgBad = ref(false)
const removing = ref(null)    // friend id with "Remove? Yes / No" showing
const invitingFor = ref(null) // friend id with the trip picker open
const trips = ref(null)       // my trips, loaded the first time Invite is pressed
const copied = ref(false)
let pollTimer = null
let copiedTimer = null

const myUsername = computed(() => (auth.user && auth.user.username) || '')
const onlineCount = computed(() => {
  let n = 0
  for (const f of list.value) if (f.online) n++
  return n
})
const cleanQuery = computed(() => query.value.replace('@', '').trim().toLowerCase())
const hint = computed(() => {
  if (!query.value) return ''
  if (cleanQuery.value.length < 3) return 'Type at least 3 letters of their username.'
  if (searched.value) return 'No one with a username starting "' + cleanQuery.value + '".'
  return ''
})

// Trips that haven't ended yet
const upcomingTrips = computed(() => {
  const today = localDate()
  const out = []
  for (const t of trips.value || []) {
    if (!t.endDate || t.endDate >= today) out.push(t)
  }
  return out
})

// ----- Loading -----
async function load() {
  loading.value = true
  try {
    const res = await axios.get('/api/friends', { keep: true })
    list.value = res.data.friends
    incoming.value = res.data.incoming
    outgoing.value = res.data.outgoing
    friends.requests = res.data.incoming.length
    friends.online = onlineCount.value
    loadError.value = ''
    loaded.value = true
  } catch (err) {
    loadError.value = 'Could not load your friends. Is the server running?'
  }
  loading.value = false
}

function onType() {
  msg.value = ''
  searched.value = false
  clearTimeout(searchTimer)
  searchTimer = setTimeout(search, 250)
}
async function search() {
  const q = cleanQuery.value
  if (q.length < 3) {
    results.value = []
    return
  }
  try {
    const res = await axios.get('/api/friends/search', { params: { q } })
    if (q === cleanQuery.value) {
      results.value = res.data // ignore answers to older searches
      searched.value = true
    }
  } catch (err) {
    results.value = []
  }
}

// After any change: refresh the lists and the search statuses
async function refresh() {
  await load()
  if (cleanQuery.value.length >= 3) await search()
}
function say(text, bad = false) {
  msg.value = text
  msgBad.value = bad
}
function errorText(err, fallback) {
  return (err.response && err.response.data && err.response.data.message) || fallback
}

// ----- Actions -----
async function sendRequest(u) {
  busy.value = u.id
  try {
    const res = await axios.post('/api/friends/requests', { userId: u.id })
    say(res.data.message)
    if (res.data.status === 'friend') tab.value = 'friends'
    await refresh()
  } catch (err) {
    say(errorText(err, 'Could not send the request.'), true)
  }
  busy.value = null
}
async function accept(u) {
  busy.value = u.id
  try {
    await axios.post('/api/friends/requests/' + u.id + '/accept')
    say('You and ' + u.name + ' are now friends.')
    await refresh()
  } catch (err) {
    say(errorText(err, 'Could not accept.'), true)
  }
  busy.value = null
}
async function decline(u) {
  busy.value = u.id
  try {
    await axios.delete('/api/friends/requests/' + u.id)
    say('Request from ' + u.name + ' declined.')
    await refresh()
  } catch (err) {
    say(errorText(err, 'Could not decline.'), true)
  }
  busy.value = null
}
async function cancelRequest(u) {
  busy.value = u.id
  try {
    await axios.delete('/api/friends/requests/' + u.id)
    say('Request to ' + u.name + ' cancelled.')
    await refresh()
  } catch (err) {
    say(errorText(err, 'Could not cancel.'), true)
  }
  busy.value = null
}
async function unfriend(f) {
  busy.value = f.id
  try {
    await axios.delete('/api/friends/' + f.id)
    say(f.name + ' was removed from your friends.')
    removing.value = null
    if (invitingFor.value === f.id) invitingFor.value = null
    await refresh()
  } catch (err) {
    say(errorText(err, 'Could not remove.'), true)
  }
  busy.value = null
}

// ----- Quick invite to a trip -----
async function toggleInvite(f) {
  invitingFor.value = invitingFor.value === f.id ? null : f.id
  if (invitingFor.value && trips.value === null) {
    try {
      const res = await axios.get('/api/trips')
      trips.value = res.data
    } catch (err) {
      trips.value = []
      say('Could not load your trips.', true)
    }
  }
}
function tripStatus(t, f) {
  for (const m of t.members || []) if (String(m.id) === String(f.id)) return 'member'
  for (const p of t.pendingInvites || []) if (String(p.id) === String(f.id)) return 'invited'
  return ''
}
async function inviteToTrip(f, t) {
  busy.value = f.id + t.id
  try {
    const res = await axios.post('/api/trips/' + t.id + '/invites', { userId: f.id })
    t.pendingInvites = res.data
    say('Invited ' + f.name + ' to ' + t.name + '. They\'ll see it on their home page.')
  } catch (err) {
    say(errorText(err, 'Could not send the invite.'), true)
  }
  busy.value = null
}
function tripDates(t) {
  if (!t.startDate) return 'Dates not set'
  const fmt = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return t.endDate ? fmt(t.startDate) + ' – ' + fmt(t.endDate) : 'From ' + fmt(t.startDate)
}

async function copyMine() {
  copied.value = await copyText('@' + myUsername.value)
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = false }, 2000)
}

// ----- Looks -----
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/)
  return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase()
}
const COLOURS = ['#00798c', '#d1495b', '#c27c0e', '#2e7d6b', '#5b5fc7', '#9c4f96', '#3a7ca5']
function colourFor(name) {
  let sum = 0
  for (const ch of String(name)) sum += ch.charCodeAt(0)
  return COLOURS[sum % COLOURS.length]
}

// ----- Open / close -----
function close() {
  friends.open = false
}
function onKey(e) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
    return
  }
  // Keep Tab inside the drawer
  if (e.key !== 'Tab' || !panelEl.value) return
  const focusable = panelEl.value.querySelectorAll('button:not([disabled]), input')
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

watch(() => friends.open, async (isOpen) => {
  if (isOpen) {
    document.body.style.overflow = 'hidden'
    tab.value = friends.requests ? 'requests' : 'friends' // new requests? show them first
    msg.value = ''
    load()
    pollTimer = setInterval(load, 30000) // online dots stay fresh while it's open
    await nextTick()
    if (searchEl.value) searchEl.value.focus()
  } else {
    document.body.style.overflow = ''
    clearInterval(pollTimer)
    query.value = ''
    results.value = []
    removing.value = null
    invitingFor.value = null
    trips.value = null
    const back = document.querySelector('.upm-avatar')
    if (back) back.focus()
  }
})

onBeforeUnmount(() => {
  clearInterval(pollTimer)
  clearTimeout(searchTimer)
  clearTimeout(copiedTimer)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.fd-backdrop *,
.fd-backdrop *::before,
.fd-backdrop *::after {
  box-sizing: border-box;
}
.fd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 12, 20, 0.55);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  --fd-line: rgba(255, 255, 255, 0.08);
  --fd-text: #f6f1e7;
  --fd-muted: #9fb3c1;
  --fd-accent: #edae49;
  --fd-green: #4ade80;
  --fd-danger: #fb7185;
}
.fd {
  width: min(440px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(0, 29, 44, 0.93);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border-left: 1px solid var(--fd-line);
  color: var(--fd-text);
  box-shadow: -24px 0 60px rgba(0, 0, 0, 0.4);
}
.fd-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--fd-line);
}
.fd-head-text {
  flex: 1;
  min-width: 0;
}
.fd-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
}
.fd-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--fd-muted);
}
.fd-green {
  color: var(--fd-green);
  font-weight: 700;
}
.fd-close {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid var(--fd-line);
  background: rgba(255, 255, 255, 0.04);
  color: var(--fd-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.fd-close:hover,
.fd-close:focus-visible {
  border-color: var(--fd-accent);
  color: var(--fd-accent);
  outline: none;
}
.fd-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 20px;
}

/* Search */
.fd-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fd-muted);
}
.fd-search {
  position: relative;
}
.fd-search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--fd-muted);
  pointer-events: none;
}
.fd-input {
  width: 100%;
  height: 44px;
  padding: 0 14px 0 40px;
  border-radius: 12px;
  border: 1px solid var(--fd-line);
  background: rgba(255, 255, 255, 0.05);
  color: var(--fd-text);
  font-size: 15px;
}
.fd-input::placeholder {
  color: var(--fd-muted);
}
.fd-input:focus {
  outline: none;
  border-color: rgba(237, 174, 73, 0.6);
  box-shadow: 0 0 0 3px rgba(237, 174, 73, 0.15);
}
.fd-results {
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid var(--fd-line);
  background: rgba(0, 0, 0, 0.18);
}
.fd-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--fd-muted);
}
.fd-msg {
  min-height: 18px;
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--fd-green);
}
.fd-msg.bad {
  color: var(--fd-danger);
}

/* Tabs */
.fd-tabs {
  display: flex;
  gap: 4px;
  margin: 12px 0 6px;
  padding: 4px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}
.fd-tab {
  flex: 1;
  min-height: 38px;
  border: 0;
  border-radius: 9px;
  background: none;
  color: var(--fd-muted);
  font-weight: 700;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.fd-tab.on {
  background: rgba(255, 255, 255, 0.1);
  color: var(--fd-text);
}
.fd-tab:focus-visible {
  outline: 2px solid var(--fd-accent);
}
.fd-count {
  min-width: 22px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  background: rgba(255, 255, 255, 0.1);
}
.fd-count.hot {
  background: var(--fd-accent);
  color: #001d2c;
}

/* Rows */
.fd-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.fd-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
}
.fd-friend,
.fd-list > .fd-row {
  border-bottom: 1px solid var(--fd-line);
}
.fd-results > .fd-row:last-child {
  border-bottom: 0;
}
.fd-avatar {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 800;
  font-size: 14px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14);
}
.fd-avatar.sm {
  width: 32px;
  height: 32px;
  font-size: 12px;
}
.fd-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--fd-green);
  border: 2px solid #001d2c;
}
.fd-who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.fd-name {
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fd-muted {
  font-size: 12.5px;
  color: var(--fd-muted);
}
.fd-group {
  margin: 14px 0 2px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fd-muted);
}
.fd-confirm {
  font-size: 13px;
  font-weight: 700;
  color: var(--fd-danger);
}

/* Buttons */
.fd-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px solid var(--fd-line);
  background: rgba(255, 255, 255, 0.05);
  color: var(--fd-text);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.fd-btn:hover:not(:disabled),
.fd-btn:focus-visible,
.fd-btn.on {
  border-color: var(--fd-accent);
  color: var(--fd-accent);
  outline: none;
}
.fd-btn.primary {
  background: var(--fd-accent);
  border-color: var(--fd-accent);
  color: #001d2c;
}
.fd-btn.primary:hover:not(:disabled),
.fd-btn.primary:focus-visible {
  background: #f3c26f;
  color: #001d2c;
  box-shadow: 0 0 0 3px rgba(237, 174, 73, 0.3);
}
.fd-btn.danger {
  border-color: rgba(251, 113, 133, 0.5);
  color: var(--fd-danger);
}
.fd-btn.danger:hover:not(:disabled),
.fd-btn.danger:focus-visible {
  background: rgba(251, 113, 133, 0.12);
  color: var(--fd-danger);
  border-color: var(--fd-danger);
}
.fd-btn.done {
  color: var(--fd-green);
  border-color: rgba(74, 222, 128, 0.5);
}
.fd-btn:disabled {
  opacity: 0.5;
}
.fd-icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: none;
  color: var(--fd-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.fd-icon-btn:hover,
.fd-icon-btn:focus-visible {
  color: var(--fd-danger);
  border-color: rgba(251, 113, 133, 0.4);
  outline: none;
}
.fd-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--fd-line);
  font-size: 12px;
  font-weight: 700;
  color: var(--fd-muted);
  white-space: nowrap;
}

/* Trip picker */
.fd-trips {
  margin: 0 0 12px 50px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid var(--fd-line);
  background: rgba(237, 174, 73, 0.06);
}
.fd-trips .fd-hint {
  margin: 4px 0;
}
.fd-trip-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.fd-trip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}
.fd-trip + .fd-trip {
  border-top: 1px solid var(--fd-line);
}
.fd-trip-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  font-size: 14px;
}
.fd-trip-text small {
  color: var(--fd-muted);
}

/* Empty states */
.fd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 12px;
  text-align: center;
  color: var(--fd-muted);
}
.fd-empty p {
  margin: 0;
  font-size: 13.5px;
}
.fd-empty strong {
  color: var(--fd-text);
}

/* My username */
.fd-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--fd-line);
}
.fd-handle {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--fd-accent);
  font-weight: 700;
  font-size: 14px;
  background: none;
}

/* Slide in from the right */
.fd-fade-enter-active,
.fd-fade-leave-active {
  transition: opacity 0.2s ease;
}
.fd-fade-enter-active .fd,
.fd-fade-leave-active .fd {
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.fd-fade-enter-from,
.fd-fade-leave-to {
  opacity: 0;
}
.fd-fade-enter-from .fd,
.fd-fade-leave-to .fd {
  transform: translateX(100%);
}
@media (max-width: 480px) {
  .fd-head,
  .fd-body,
  .fd-foot {
    padding-left: 16px;
    padding-right: 16px;
  }
  .fd-trips {
    margin-left: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fd-fade-enter-active,
  .fd-fade-leave-active,
  .fd-fade-enter-active .fd,
  .fd-fade-leave-active .fd {
    transition: none;
  }
}
</style>
