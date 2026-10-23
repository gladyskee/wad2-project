<template>
  <div class="trip-page">
    <!-- Loading: a placeholder in the shape of the page -->
    <LoadingSkeleton v-if="loading" variant="page" :count="3" label="Loading your trip…" />

    <div v-else-if="loadError" class="alert alert-warning">
      {{ loadError }} <router-link to="/home">Back to your trips</router-link>
    </div>

    <template v-else>
      <!-- Dark header with the trip photo glowing behind it -->
      <div class="trip-stage" :style="stageStyle" aria-hidden="true"></div>

      <!-- Top bar: back, trip name, every section of the trip. Stays on screen while scrolling. -->
      <nav class="trip-nav" aria-label="Trip sections">
        <router-link to="/home" class="trip-back" data-testid="back-to-trips" title="Back to My Trips">
          <span aria-hidden="true">‹</span><span class="trip-back-text">My Trips</span>
        </router-link>
        <span class="trip-nav-name" :title="headerTitle">{{ headerTitle }}</span>

        <TripTabs :model-value="activeTab" @update:model-value="goToTab" :tabs="shownTabs" :alert-key="shownWarning ? 'safety' : ''" class="trip-tabs" />
      </nav>

      <!-- Trip title -->
      <header class="trip-head">
        <h1 class="trip-title">{{ headerTitle }}</h1>
        <!-- The route, place to place with dotted lines (like a travel journal) -->
        <ol class="trip-route" :aria-label="'Route: ' + itineraryInfo.destinations.map((d) => d.split(', ')[0]).join(', then ')">
          <li v-for="d in itineraryInfo.destinations" :key="d" class="trip-route-stop">
            <span class="trip-route-dot" aria-hidden="true"></span>{{ flagFor(d) }} {{ d.split(', ')[0] }}
          </li>
        </ol>
        <div class="trip-toggle" aria-label="Trip details">
          <span class="trip-toggle-item"><AppIcon name="calendar" :size="15" /> {{ dateText }}</span>
          <span class="trip-toggle-item on"><AppIcon name="users" :size="15" /> {{ itineraryInfo.travellers.length }} traveller{{ itineraryInfo.travellers.length === 1 ? '' : 's' }}</span>
        </div>

        <!-- Who's going: joined people (solid) and not-yet-joined travellers (dashed) + invite -->
        <div class="trip-crew">
          <span class="trip-faces" :aria-label="joinedNames.length + ' joined: ' + joinedNames.join(', ')">
            <span v-for="(n, i) in itineraryInfo.travellers.slice(0, 6)" :key="n" class="trip-face"
              :class="{ guest: !joinedNames.includes(n) }" :style="{ zIndex: 10 - i }" :title="n + (joinedNames.includes(n) ? '' : ' (not joined yet)')">
              {{ n.charAt(0).toUpperCase() }}
            </span>
            <span v-if="itineraryInfo.travellers.length > 6" class="trip-face more">+{{ itineraryInfo.travellers.length - 6 }}</span>
          </span>
          <button v-if="!isDemo" type="button" class="trip-invite" @click="showShare = true" data-testid="invite-btn">+ Invite</button>
          <!-- Organiser: change the name, route and dates (or delete the trip) -->
          <button v-if="!isDemo && trip.role === 'owner'" type="button" class="trip-edit" @click="showEdit = true" data-testid="edit-trip-btn">
            <AppIcon name="pencil" :size="14" /> Edit trip
          </button>
        </div>
      </header>

      <TripShare v-if="showShare" :trip-id="id" :trip-name="trip.name" :members="trip.members || []"
        :travellers="trip.travellers" :role="trip.role || 'member'" :me="myName" :pending-invites="trip.pendingInvites || []"
        @close="showShare = false" @changed="reloadTrip" @left="$router.push('/home')" />
      <TripEditModal v-if="showEdit" :trip="trip" @close="showEdit = false" @saved="tripEdited" />

      <!-- Summary cards: tap one to jump to that section -->
      <div class="trip-cards">
        <!-- The card for the open section grows and gets a tick, so you can see which one is picked -->
        <button type="button" class="trip-card" :class="{ selected: activeTab === 'itinerary' }" :aria-pressed="activeTab === 'itinerary'"
          @click="activeTab = 'itinerary'">
          <transition name="badge-pop"><span v-if="activeTab === 'itinerary'" class="trip-card-badge" aria-hidden="true">✓</span></transition>
          <span class="trip-card-label">Trip length</span>
          <span class="trip-card-big">{{ dayCount || '–' }}<small> / day{{ dayCount === 1 ? '' : 's' }}</small></span>
          <span class="trip-card-sub">{{ stopCount }} stop{{ stopCount === 1 ? '' : 's' }} planned</span>
        </button>
        <button type="button" class="trip-card" :class="{ selected: activeTab === 'places' }" :aria-pressed="activeTab === 'places'"
          @click="openPlaces('vote')">
          <transition name="badge-pop"><span v-if="activeTab === 'places'" class="trip-card-badge" aria-hidden="true">✓</span></transition>
          <span class="trip-card-label">Group picks</span>
          <span class="trip-card-big">{{ pickCount }}<small> / {{ wishCount }} places</small></span>
          <span class="trip-card-sub">{{ wishCount ? 'Vote in Places → Group decisions' : 'Save places to your wishlist first' }}</span>
        </button>
        <button type="button" class="trip-card" :class="{ selected: activeTab === 'crew' }" :aria-pressed="activeTab === 'crew'"
          @click="activeTab = 'crew'">
          <transition name="badge-pop"><span v-if="activeTab === 'crew'" class="trip-card-badge" aria-hidden="true">✓</span></transition>
          <span class="trip-card-label">Travellers</span>
          <span class="trip-card-big">{{ itineraryInfo.travellers.length }}<small> / people</small></span>
          <span class="trip-card-sub text-truncate">{{ itineraryInfo.travellers.join(', ') || 'Just you' }}</span>
        </button>
      </div>

      <p v-if="photoPage" class="trip-credit">
        Photo: <a :href="photoPage" target="_blank" rel="noopener">Wikipedia</a>
      </p>

      <!-- The open section -->
      <main ref="panel" class="trip-panel">
        <div class="trip-panel-head">
          <h2 class="trip-panel-title"><span class="trip-panel-icon"><TabIcon :name="currentTab.key" :size="18" /></span> {{ currentTab.title }}</h2>
        </div>

        <!-- Safety banner: shown on every tab when SafetyLayer reports High/Critical risk -->
        <div v-if="shownWarning" class="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
          <span><AppIcon name="alert" :size="16" /> {{ shownWarning }}</span>
          <button class="btn btn-sm btn-outline-danger" @click="activeTab = 'safety'">View safety</button>
        </div>

        <!-- First trip only: a short guide to the trip page -->
        <transition name="guide">
          <section v-if="showGuide" class="guide mb-4" aria-labelledby="guide-title" data-testid="trip-guide">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <h2 id="guide-title" class="h5 mb-2"><AppIcon name="sparkles" :size="18" /> Your trip is ready! Here's how it works</h2>
              <button type="button" class="btn-close" aria-label="Close guide" @click="showGuide = false"></button>
            </div>
            <ol class="guide-steps">
              <li>
                <strong><AppIcon name="map-pin" :size="15" /> Places</strong> holds your <em>Wishlist</em> and <em>Group decisions</em>.
                Keep saving places and voting there any time.
                <button type="button" class="btn btn-link btn-sm p-0 align-baseline" @click="openPlaces('wishlist')">Open Places</button>
              </li>
              <li>
                <strong>Itinerary</strong>: pick a day and drag your saved places onto it.
                Each stop shows its weather and crowds (tap them for options), and <em><AppIcon name="sparkles" :size="14" /> Optimize Route</em> re-orders the whole day.
              </li>
              <li>The other sections in the top bar cover packing, expenses, photos, safety and getting around.</li>
            </ol>
            <button type="button" class="btn btn-primary btn-sm" @click="showGuide = false">Got it</button>
          </section>
        </transition>

      <!-- Group decisions and expenses are still built around the Seoul demo data -->
      <div v-show="activeTab === 'itinerary'" :id="'pane-itinerary'" role="tabpanel">
        <FlightDelayWidget v-if="isDemo" />
        <!-- editRev: after "Edit trip" the planner starts again from the saved trip (new dates, moved stops) -->
        <ItineraryView
          :key="'itin-' + editRev"
          :trip-id="id"
          :destination="itineraryInfo.destination"
          :destinations="itineraryInfo.destinations"
          :start-date="itineraryInfo.startDate"
          :end-date="itineraryInfo.endDate"
          :initial-stops="itineraryInfo.stops"
          :initial-wishlist="itineraryInfo.wishlist" :initial-version="isDemo ? 0 : trip.version || 0" :travellers="itineraryInfo.travellers"
          @itinerary-change="updatePackingActivities" @set-end-date="setEndDate" @go-places="addFromItinerary"
          @open-transport="activeTab = 'travelOptions'" @weather-change="forecastWeather = $event" />
      </div>
      <!-- Places = Wishlist + Group decisions. Both use the same wishlist, which the itinerary saves. -->
      <div v-show="activeTab === 'places'" :id="'pane-places'" role="tabpanel" :class="{ 'has-return': returnTo }">
        <div class="places-switch mb-4" role="tablist" aria-label="Places">
          <button type="button" role="tab" :aria-selected="placesTab === 'wishlist'" :class="{ active: placesTab === 'wishlist' }"
            @click="placesTab = 'wishlist'" data-testid="places-wishlist"><AppIcon name="heart" :size="15" /> Wishlist</button>
          <button type="button" role="tab" :aria-selected="placesTab === 'vote'" :class="{ active: placesTab === 'vote' }"
            @click="placesTab = 'vote'" data-testid="places-vote"><AppIcon name="thumbs-up" :size="15" /> Group decisions</button>
        </div>
        <!-- Came here from the itinerary's "Add stop": a clear way back, always in view -->
        <transition name="return-bar">
          <div v-if="returnTo && activeTab === 'places'" class="places-return" role="region" aria-label="Adding stops to your itinerary">
            <p class="places-return-text" aria-live="polite">{{ placesTab === 'vote' ? 'Vote yes on places so they become group picks.' : 'Save more places for your wishlist.' }}</p>
            <button type="button" class="places-return-btn" :class="{ ready: newSaved }" @click="backToItinerary">
              <span aria-hidden="true">‹</span> {{ newSaved ? 'Done, back to ' + returnTo.day : 'Back to ' + returnTo.day }}
            </button>
          </div>
        </transition>
        <transition name="guide" mode="out-in">
          <WishlistView v-if="placesTab === 'wishlist'" key="w" :destinations="itineraryInfo.destinations"
            :start-date="itineraryInfo.startDate" :end-date="itineraryInfo.endDate" />
          <PlacesVoting v-else key="v" :trip-id="id" :travellers="itineraryInfo.travellers" :me="myName" :can-vote-for="canVoteFor" @go-wishlist="placesTab = 'wishlist'" @members-changed="reloadTrip" />
        </transition>
      </div>
      <div v-show="activeTab === 'packing'" :id="'pane-packing'" role="tabpanel">
        <PackingView :key="'pack-' + id" :trip-id="id" :days="dayCount || 3"
          :activities="isDemo ? ['sightseeing', 'food'] : trip.activities || []"
          :weather="isDemo ? ['mild', 'rain'] : trip.weather || []"
          :extras="isDemo ? [] : trip.extras || []"
          :initial-packing="isDemo ? null : trip.packing"
          :has-outdoor-activity="hasOutdoorActivity" :forecast-weather="forecastWeather" />
      </div>
      <div v-show="activeTab === 'expenses'" id="pane-expenses" role="tabpanel">
        <ExpensesView :key="'xp-' + id" :trip-id="id" :travellers="itineraryInfo.travellers"
          :start-date="itineraryInfo.startDate" :end-date="itineraryInfo.endDate"
          :initial="isDemo ? null : trip.expenses" :me="myName" @changed="trip.expenses = $event" />
      </div>
      <div v-show="activeTab === 'photos'" :id="'pane-photos'" role="tabpanel">
        <PhotosView :key="'ph-' + id" :trip-id="id" :travellers="itineraryInfo.travellers"
          :wishlist="wishlistPlaces" :initial-albums="isDemo ? [] : trip.photoAlbums || []" :me="myName"
          :filter-who="photoWho" />
      </div>
      <div v-show="activeTab === 'crew'" :id="'pane-crew'" role="tabpanel">
        <CrewView :key="'crew-' + id" :trip-id="id" :city="itineraryInfo.destinations[0].split(', ')[0]"
          :travellers="itineraryInfo.travellers" :members="isDemo ? [] : trip.members || []"
          :pending-invites="isDemo ? [] : trip.pendingInvites || []" :crew="isDemo ? {} : trip.crew || {}"
          :expenses="isDemo ? null : trip.expenses" :role="isDemo ? 'owner' : trip.role" :me="myName"
          :my-id="authUserId" @invite="showShare = true" @go="goFromCrew" @changed="reloadTrip" />
      </div>
      <!-- Recap (after the trip): the trip in numbers with its route on a map -->
      <div v-if="!isDemo && tripPhase === 'after'" v-show="activeTab === 'recap'" id="pane-recap" role="tabpanel">
        <TripRecap :key="'recap-' + id" :trip-id="id" :name="trip.name"
          :destinations="itineraryInfo.destinations" :start-date="itineraryInfo.startDate" :end-date="itineraryInfo.endDate"
          :travellers="itineraryInfo.travellers" :stop-count="stopCount" :phase="tripPhase" />
      </div>
      <!--
        v-show (not v-if) keeps SafetyLayer mounted when you switch tabs. It only starts checking once
        Safety is opened, or straight away while the trip is happening (for the warning banner).
      -->
      <div v-show="activeTab === 'safety'" :id="'pane-safety'" role="tabpanel">
        <SafetyLayer :trip-id="id" :destinations="itineraryInfo.destinations" :start-date="itineraryInfo.startDate"
          :end-date="itineraryInfo.endDate" :stay="isDemo ? null : trip.stay" :stops="safetyStops" :me="myName"
          :active="activeTab === 'safety'" @risk-change="handleRiskChange" @stay-change="trip.stay = $event" />
      </div>

      <div v-show="activeTab === 'travelOptions'" :id="'pane-travelOptions'" role="tabpanel">
        <TransportOptions 
          :destination="itineraryInfo?.destination"
          :stops="transportPlaces"
          :stay="isDemo ? null : trip?.stay"
          :tripId="trip?._id || trip?.id || trip?.tripId || $route.params.id" 
          :start-date="itineraryInfo.startDate"
          :end-date="itineraryInfo.endDate">
        </TransportOptions>  
      </div>

    </main>
    </template>
  </div>
</template>

<script>
import axios from 'axios'
import ItineraryView from '../components/ItineraryView.vue'
import WishlistView from '../components/WishlistView.vue'
import PlacesVoting from '../components/PlacesVoting.vue'
import GroupVoting from '../components/GroupVoting.vue'
import PackingView from '../components/PackingView.vue'
import PhotosView from '../components/PhotosView.vue'
import ExpensesView from '../components/ExpensesView.vue'
import SafetyLayer from '../components/SafetyLayer.vue'
import FlightDelayWidget from '../components/FlightDelayWidget.vue'
import TransportOptions from '../components/TransportOptions.vue'
import TripShare from '../components/TripShare.vue'
import CrewView from '../components/CrewView.vue'
import TripTabs from '../components/TripTabs.vue'
import TabIcon from '../components/TabIcon.vue'
import { auth } from '../auth.js'
import { trip as store } from '../itineraryStore.js'
import { codeForDestination, flagEmoji } from '../destinations.js'
import AppIcon from '../components/AppIcon.vue'
import LoadingSkeleton from '../components/LoadingSkeleton.vue'
import TripRecap from '../components/TripRecap.vue'
import TripEditModal from '../components/TripEditModal.vue'
import { notify, errorText } from '../notify.js'
import { userSettings, loadUserSettings } from '../userSettings.js'
import { localDate } from '../dates.js'


export default {
  components: { LoadingSkeleton, TripRecap, TripEditModal, AppIcon, ItineraryView, WishlistView, PlacesVoting, GroupVoting, PackingView, PhotosView, ExpensesView, SafetyLayer, FlightDelayWidget, TransportOptions, TripShare, CrewView, TripTabs, TabIcon },
  props: { id: { type: String, default: 'seoul' } }, // from the route /trip/:id
  data() {
    return {
      activeTab: 'itinerary',
      placesTab: 'wishlist', // inside Places: 'wishlist' | 'vote'
      returnTo: null, // { date, day } when Places was opened from the itinerary's "Add stop"
      savedAtStart: 0, // wishlist size at that moment, to count the new saves
      // Sections in the top bar (title + desc are shown above the open section)
      tabs: [
        { key: 'itinerary', icon: '🗓', label: 'Itinerary', title: 'Itinerary', desc: 'Your day-by-day plan, with crowd tips and the forecast.' },
        { key: 'places', icon: '📍', label: 'Places', title: 'Places', desc: 'Save places you like, then vote on them together.', testid: 'places-tab' },
        { key: 'packing', icon: '🎒', label: 'Packing', title: 'Packing list', desc: 'Built from your activities, the weather and how long you are away.' },
        { key: 'expenses', icon: '💸', label: 'Expenses', title: 'Expenses & split', desc: 'Log what the group spends and see who owes whom. Press N to add an expense.' },
        { key: 'photos', icon: '📷', label: 'Photos', title: 'Photos', desc: "The group's trip photos in one place." },
        { key: 'safety', icon: '🛡', label: 'Safety', title: 'Safety', desc: 'Live alerts and risk levels near you.', testid: 'safety-tab' },
        { key: 'crew', icon: '👥', label: 'Crew', title: 'Trip crew', desc: '' },
        { key: 'recap', icon: '🗺', label: 'Recap', title: 'Trip recap', desc: 'Your finished trip in numbers, with the route on a map.' },
        { key: 'travelOptions', icon: '🚆', label: 'Getting around', short: 'Transport', title: 'Getting around', desc: 'Ways to travel between your stops.' }
      ],
      // Shown once, after setting up the user's first trip
      showGuide: this.$route.query.welcome === '1',
      hasOutdoorActivity: true,
      safetyWarning: '',
      forecastWeather: [], // packing weather keys from the itinerary's forecast, e.g. ['hot', 'rain']
      trip: null,
      loading: true,
      loadError: '',
      showShare: false,
      showEdit: false, // Edit trip dialog
      editRev: 0,      // goes up after each edit, to reload the itinerary
      photoWho: { name: '', at: 0 }, // set when "Photos" is clicked on a crew card
      stagePhoto: '', // photo of the first destination (Wikipedia); plain dark header until it loads
      photoPage: '',
      stageHeight: 0 // small screens: the dark header ends just above the white panel
    }
  },
  computed: {
    // What the itinerary needs to know about this trip
    itineraryInfo() {
      if (this.isDemo) return { destination: 'Seoul, South Korea', destinations: ['Seoul, South Korea'], travellers: ['Sarah', 'John', 'Amy'], startDate: '2026-10-12', endDate: '2026-10-17', stops: [], wishlist: [] }
      const t = this.trip
      return { destination: t.destination, destinations: t.destinations && t.destinations.length ? t.destinations : [t.destination], travellers: t.travellers || [], startDate: t.startDate, endDate: t.endDate, stops: t.stops || [], wishlist: t.wishlist || [] }
    },
    // The Recap tab only appears once the trip is over
    shownTabs() {
      const list = []
      for (const t of this.tabs) {
        if (t.key === 'recap' && (this.isDemo || this.tripPhase !== 'after')) continue
        list.push(t)
      }
      return list
    },
    currentTab() {
      for (const t of this.tabs) {
        if (t.key === this.activeTab) return t
      }
      return this.tabs[0]
    },
    dateText() {
      const t = this.itineraryInfo
      if (!t.startDate) return 'Dates not set'
      const fmt = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      return t.endDate ? fmt(t.startDate) + ' – ' + fmt(t.endDate) : 'From ' + fmt(t.startDate)
    },
    // 'before' the trip, 'during' it, or 'after' it ended (no dates = before)
    tripPhase() {
      const t = this.itineraryInfo
      if (!t.startDate) return 'before'
      const today = localDate()
      if (today < t.startDate) return 'before'
      if (t.endDate && today > t.endDate) return 'after'
      return 'during'
    },
    dayCount() {
      const t = this.itineraryInfo
      if (!t.startDate || !t.endDate) return 0
      return Math.round((new Date(t.endDate) - new Date(t.startDate)) / 86400000) + 1
    },
    // Live numbers from the shared itinerary store
    stopCount() {
      return store.stops.length
    },
    // My traveller name on this trip (the demo trip pretends you're Sarah)
    myName() {
      return this.isDemo ? 'Sarah' : this.trip.me || this.trip.travellers[0] || ''
    },
    // Whose votes I may change: my own, and (organiser only) people without an account
    canVoteFor() {
      if (this.isDemo) return this.itineraryInfo.travellers
      const list = [this.myName]
      if (this.trip.role === 'owner') {
        for (const t of this.trip.travellers) {
          if (!this.joinedNames.includes(t)) list.push(t)
        }
      }
      return list
    },
    // The risk banner on every tab: only from 2 weeks before the trip until it ends (the Safety tab
    // always shows the details), and not if "Hazard advisories" is off in Settings
    shownWarning() {
      if (!userSettings.hazardAlerts || this.tripPhase === 'after') return ''
      const start = this.itineraryInfo.startDate
      if (start && (new Date(start + 'T00:00:00') - new Date(localDate() + 'T00:00:00')) / 86400000 > 14) return ''
      return this.safetyWarning
    },
    joinedNames() {
      if (this.isDemo) return ['Sarah', 'John', 'Amy']
      return (this.trip.members || []).map((m) => m.name)
    },
    // Itinerary stops for the safety radar
    safetyStops() {
      return store.stops
    },
    transportPlaces() {
      return store.stops
    },
    wishlistPlaces() {
      return store.wishlist
    },
    wishCount() {
      return store.wishlist.length
    },
    pickCount() {
      const needed = Math.floor(this.itineraryInfo.travellers.length / 2) + 1
      let count = 0
      for (const w of store.wishlist) {
        if (this.itineraryInfo.travellers.length && (w.votes || []).length >= needed) count++
      }
      return count
    },
    isDemo() {
      return this.id === 'seoul'
    },
    // Places saved since "Add stop" opened Places
    newSaved() {
      return this.returnTo ? Math.max(0, store.wishlist.length - this.savedAtStart) : 0
    },
    authUserId() {
      return auth.user && auth.user.id ? String(auth.user.id) : ''
    },
    stageStyle() {
      const style = {}
      if (this.stagePhoto) style['--trip-photo'] = 'url(' + this.stagePhoto + ')'
      if (this.stageHeight) style.height = this.stageHeight + 'px'
      return style
    },
    headerTitle() {
      return this.isDemo ? 'Seoul, South Korea' : this.trip.name
    },
    headerSubtitle() {
      if (this.isDemo) return '12 Oct – 17 Oct | Travellers: Sarah, John, Amy'
      const t = this.trip
      const fmt = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      const dates = t.startDate ? (t.endDate ? fmt(t.startDate) + ' – ' + fmt(t.endDate) : 'From ' + fmt(t.startDate)) : 'Dates not set'
      const places = t.destinations && t.destinations.length ? t.destinations.join(' → ') : t.destination
      return places + ' | ' + dates + ' | Travellers: ' + t.travellers.join(', ')
    }
  },
  watch: {
    // Left Places some other way: the "Back to Day 2" bar isn't needed any more
    activeTab(tab) {
      if (tab !== 'places') this.returnTo = null
    },
    // The photo credit line appears once the photo loads, which moves the panel down a little
    photoPage() {
      this.$nextTick(this.fitStage)
    }
  },
  async mounted() {
    // Remove "?welcome=1" from the address so the guide doesn't come back on refresh
    if (this.showGuide) this.$router.replace({ query: {} })
    loadUserSettings() // units, base currency, alerts (in the background)
    if (!this.isDemo) {
      try {
        const res = await axios.get('/api/trips/' + this.id)
        this.trip = res.data
      } catch (err) {
        this.loadError = err.response && err.response.status === 404 ? 'That trip could not be found.' : 'Could not load this trip. Is the server running?'
      }
    }
    this.loading = false
    this.loadPhoto()
    // Shared trips: pick up who joined, crew cards and the hotel every 30 seconds
    if (!this.isDemo) this.pollTimer = setInterval(() => { if (!document.hidden) this.reloadTrip() }, 30000)
    window.addEventListener('resize', this.fitStage)
    this.$nextTick(this.fitStage)
  },
  beforeUnmount() {
    clearInterval(this.pollTimer)
    window.removeEventListener('resize', this.fitStage)
  },
  methods: {
    // On small screens the header is shorter than 610px, so stop the dark background
    // 16px above the white panel instead of letting the two overlap
    fitStage() {
      const panel = this.$refs.panel
      if (!panel || window.innerWidth > 900) {
        this.stageHeight = 0
        return
      }
      this.stageHeight = Math.max(200, panel.offsetTop - 16)
    },
    // Planner added or removed a day (or undid that): save the trip's new end date
    async setEndDate(endDate) {
      if (this.isDemo || !this.trip.startDate || !endDate) return
      const before = this.trip.endDate
      this.trip.endDate = endDate // show it straight away
      try {
        const res = await axios.put('/api/trips/' + this.id + '/dates', { endDate })
        this.trip.endDate = res.data.endDate
      } catch (err) {
        this.trip.endDate = before // couldn't save: put it back
        notify(errorText(err, 'Could not change the trip dates.'))
      }
    },
    // A crew card asked to open another tab (Expenses, or Photos filtered to one person)
    goFromCrew(tab, name) {
      if (tab === 'photos') this.photoWho = { name: name || '', at: Date.now() }
      this.goToTab(tab)
    },
    // Switch tab and bring the content panel up just under the sticky nav
    goToTab(tab) {
      this.activeTab = tab
      this.$nextTick(() => {
        const panel = this.$refs.panel
        if (!panel) return
        const nav = this.$el.querySelector('.trip-nav')
        const gap = nav ? nav.offsetHeight + 24 : 90
        const top = panel.getBoundingClientRect().top + window.scrollY - gap
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' })
      })
    },
    // After someone is removed: fetch the trip again
    // Saved in "Edit trip": load the trip again, restart the planner, and say what happened
    async tripEdited(saved) {
      this.showEdit = false
      await this.reloadTrip()
      this.editRev++
      this.loadPhoto() // the first destination may have changed
      let text = 'Trip updated.'
      if (saved && saved.movedStops) {
        const days = Math.abs(saved.shiftDays) + (Math.abs(saved.shiftDays) === 1 ? ' day' : ' days')
        text = 'Trip updated. ' + saved.movedStops + (saved.movedStops === 1 ? ' stop' : ' stops') + ' moved ' + days + (saved.shiftDays > 0 ? ' later.' : ' earlier.')
      }
      notify(text, null, 'ok')
    },
    async reloadTrip() {
      try {
        const res = await axios.get('/api/trips/' + this.id)
        this.trip = res.data
      } catch (err) {
        // keep what we have
      }
    },
    // A photo of the first destination for the header
    async loadPhoto() {
      const first = this.itineraryInfo.destinations[0]
      if (!first) return
      try {
        const res = await axios.get('/api/places/photo', { params: { destination: first } })
        if (!res.data.url) return
        // Only swap once the image has downloaded, so the header never flashes empty
        const img = new Image()
        img.onload = () => {
          this.stagePhoto = res.data.url
          this.photoPage = res.data.page
        }
        img.src = res.data.url
      } catch (err) {
        // Keep the default photo
      }
    },
    flagFor(d) {
      return flagEmoji(codeForDestination(d))
    },
    openPlaces(tab) {
      this.activeTab = 'places'
      this.placesTab = tab
    },
    // Itinerary's "Add stop": open Places, remembering which day to come back to
    addFromItinerary(info) {
      this.placesTab = info && info.tab === 'vote' ? 'vote' : 'wishlist'
      this.goToTab('places')
      this.returnTo = info && info.day ? info : { day: 'your itinerary' }
      this.savedAtStart = store.wishlist.length
    },
    backToItinerary() {
      this.returnTo = null
      this.goToTab('itinerary')
    },
    updatePackingActivities(activities) {
      this.hasOutdoorActivity = activities.some((activity) => activity.outdoor)
    },
    /*
      handleRiskChange()
      Listens to the "risk-change" event from SafetyLayer.
      When the risk score is 50+ (High/Critical), it shows a banner on
      every tab so the group knows to rethink outdoor activities.
    */
    handleRiskChange(risk) {
      if (risk.score >= 50) {
        this.safetyWarning = `${risk.label} risk near ${risk.location?.city || 'you'}. Consider swapping outdoor activities.`
      } else {
        this.safetyWarning = ''
      }
    }
  }
}
</script>

<style scoped>
/* First-trip guide */
.guide {
  background: #fbf5ea;
  border: 1.5px solid #f3d9a8;
  border-radius: 20px;
  padding: 18px 20px;
  box-shadow: 0 8px 24px rgba(0, 121, 140, 0.08);
}
.guide-steps {
  padding-left: 1.2rem;
  margin-bottom: 12px;
}
.guide-steps li {
  margin-bottom: 6px;
}

/* ===== Page layout (dark header in the style of a product page, theme from the home page) ===== */
.trip-page {
  position: relative;
  padding: 12px 0 40px;
}
/* Glowing photo behind the top of the page */
.trip-stage {
  position: absolute;
  inset: 0 0 auto 0;
  height: 610px;
  border-radius: 28px;
  z-index: 0;
  overflow: hidden;
  /* Photo first: the cover photo shows clearly at the top, then fades into navy behind the cards */
  background:
    linear-gradient(180deg, rgba(0, 29, 44, 0.25) 0%, rgba(0, 29, 44, 0.1) 22%, rgba(0, 29, 44, 0.55) 42%, #001d2c 62%),
    var(--trip-photo, none) center 35% / cover no-repeat,
    #003d5b;
}
.trip-credit {
  position: relative;
  z-index: 1;
  text-align: right;
  font-size: 11px;
  color: var(--app-muted, #5a6b78);
  margin: 10px 28px 0;
}
.trip-credit a {
  color: inherit;
}
.trip-loading {
  position: relative;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  padding-top: 160px;
}
.skeleton-bar {
  height: 62px;
  opacity: 0.6;
}

/* Top bar */
.trip-nav {
  position: sticky;
  top: 12px;
  z-index: 50;
  margin: 0 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 20px;
  background: rgba(0, 40, 60, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
}
.trip-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #003d5b;
  text-decoration: none;
  padding: 8px 14px;
  border-radius: 12px;
  background: #fbf5ea;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  font-weight: 700;
  flex-shrink: 0;
}
.trip-back span:first-child {
  font-size: 20px;
  line-height: 1;
}
.trip-back:hover {
  background: #fbf5ea;
  color: #003d5b;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
}
.trip-nav-name {
  color: #fff;
  font-family: var(--font-display);
  font-size: 1.15rem;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trip-tabs {
  margin-left: auto;
}

/* Title */
.trip-head {
  position: relative;
  z-index: 1;
  max-width: 1000px;
  margin: 0 auto;
  text-align: left;
  color: #fff;
  padding: 150px 32px 0;
}
.trip-title {
  font-family: var(--font-display);
  font-size: clamp(2.2rem, 5.4vw, 3.6rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  margin-bottom: 10px;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.35);
}
/* Places joined by dotted lines */
.trip-route {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 0;
  margin: 0 0 18px;
  padding: 0;
  list-style: none;
  font-size: 1.05rem;
  font-weight: 700;
}
.trip-route-stop {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.trip-route-stop + .trip-route-stop::before {
  content: '';
  width: 34px;
  height: 3px;
  margin: 0 10px;
  background-image: radial-gradient(circle, #edae49 1.5px, transparent 1.8px);
  background-size: 7px 3px;
}
.trip-route-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #edae49;
  box-shadow: 0 0 0 3px rgba(237, 174, 73, 0.3);
}
/* Pill like a Monthly / Yearly switch */
.trip-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 6px;
  border-radius: 999px;
  background: rgba(0, 30, 46, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.trip-toggle-item {
  padding: 8px 18px;
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.75);
  font-size: 14px;
}
.trip-toggle-item.on {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* Summary cards */
@media (max-width: 700px) {
  .trip-head { padding: 96px 18px 0; }
  .trip-route-stop + .trip-route-stop::before { width: 20px; margin: 0 6px; }
}
.trip-crew {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.trip-faces {
  display: flex;
}
.trip-face {
  position: relative;
  width: 32px;
  height: 32px;
  margin-left: -8px;
  border-radius: 50%;
  background: #00798c;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #002233;
}
.trip-face:first-child {
  margin-left: 0;
}
.trip-face.guest {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  border: 2px dashed rgba(255, 255, 255, 0.35);
}
.trip-face.more {
  background: rgba(255, 255, 255, 0.15);
  font-size: 11px;
}
.trip-invite {
  border: 0;
  border-radius: 999px;
  background: #edae49;
  color: #00283c;
  font-weight: 700;
  padding: 7px 16px;
  box-shadow: 0 6px 18px rgba(237, 174, 73, 0.3);
  transition: transform 0.15s;
}
.trip-invite:hover {
  transform: translateY(-1px);
}
.trip-invite:focus-visible {
  outline: 3px solid #f3c26f;
  outline-offset: 2px;
}
.trip-edit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-weight: 700;
  padding: 6px 14px;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
}
.trip-edit:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(237, 174, 73, 0.7);
  transform: translateY(-1px);
}
.trip-edit:focus-visible {
  outline: 3px solid #f3c26f;
  outline-offset: 2px;
}
.trip-cards {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  max-width: 1000px;
  margin: 44px auto 0;
  padding: 0 16px;
  align-items: end;
}
.trip-card {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 26px 28px;
  color: #fff;
  background: #062c42;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 22px;
  /* springy grow when picked */
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.25s, border-color 0.25s, box-shadow 0.25s;
  position: relative;
}
.trip-card:hover {
  transform: translateY(-3px);
  border-color: rgba(243, 194, 111, 0.4);
}
.trip-card:active {
  transform: scale(0.98);
}
.trip-card.selected {
  background: #0b3048;
  z-index: 1;
  border-color: rgba(243, 194, 111, 0.55);
  transform: translateY(-14px) scale(1.06);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(237, 174, 73, 0.25);
}
.trip-card.selected:hover {
  transform: translateY(-16px) scale(1.06);
}
/* The tick pops in */
.badge-pop-enter-active {
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
}
.badge-pop-leave-active {
  transition: transform 0.15s, opacity 0.15s;
}
.badge-pop-enter-from,
.badge-pop-leave-to {
  transform: scale(0.4);
  opacity: 0;
}
.trip-card-badge {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid #f3c26f;
  color: #f3c26f;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  box-shadow: 0 0 14px rgba(243, 194, 111, 0.5);
}
.trip-card-label {
  font-weight: 600;
  font-size: 1.05rem;
}
.trip-card-big {
  font-size: 3rem;
  font-weight: 700;
  line-height: 1.1;
  margin-top: 8px;
}
.trip-card-big small,
.trip-card-sub {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 400;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.62);
}
.trip-card-sub {
  max-width: 100%;
}

/* The open section */
.trip-panel {
  position: relative;
  z-index: 1;
  margin-top: 32px;
  background: #fbf5ea;
  border-radius: 28px;
  padding: 32px;
  box-shadow: 0 16px 40px rgba(0, 40, 62, 0.08);
}
.trip-panel-head {
  margin-bottom: 20px;
}
.trip-panel-title {
  font-family: var(--font-display);
  font-size: 1.6rem;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.trip-panel-icon {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(237, 174, 73, 0.14);
  color: #00798c;
}
.trip-panel-desc {
  color: var(--app-muted, #5a6b78);
  margin: 0;
}

/* Wishlist | Group decisions: same pill style as the header switch */
.has-return {
  padding-bottom: 96px; /* room so the bar never covers the last row */
}
.places-return {
  position: fixed;
  left: 50%;
  bottom: 20px;
  z-index: 1050;
  transform: translateX(-50%);
  width: min(640px, calc(100vw - 32px));
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 10px 10px 18px;
  border-radius: 999px;
  background: #003d5b;
  color: #fff;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.28);
}
.places-return-text {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 14px;
  line-height: 1.35;
}
.places-return-btn {
  flex-shrink: 0;
  min-height: 42px;
  padding: 0 18px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  background: transparent;
  color: #fff;
  font-weight: 700;
  white-space: nowrap;
  transition: background 0.15s, transform 0.15s;
}
.places-return-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}
.places-return-btn.ready {
  border-color: #edae49;
  background: #edae49;
  color: #00283c;
}
.places-return-btn.ready:hover {
  transform: translateY(-1px);
}
.places-return-btn:focus-visible {
  outline: 3px solid #edae49;
  outline-offset: 2px;
}
.return-bar-enter-active,
.return-bar-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.return-bar-enter-from,
.return-bar-leave-to {
  opacity: 0;
  transform: translate(-50%, 16px);
}
@media (max-width: 560px) {
  .places-return {
    flex-direction: column;
    align-items: stretch;
    border-radius: 20px;
    padding: 12px;
    gap: 10px;
  }
  .places-return-text {
    text-align: center;
  }
}
@media (prefers-reduced-motion: reduce) {
  .return-bar-enter-active,
  .return-bar-leave-active {
    transition: none;
  }
}
.places-switch {
  display: inline-flex;
  gap: 4px;
  background: #003d5b;
  border-radius: 999px;
  padding: 5px;
}
.places-switch button {
  border: 0;
  background: transparent;
  border-radius: 999px;
  padding: 8px 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.72);
  transition: background 0.2s, color 0.2s;
}
.places-switch button.active {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

/* Keyboard focus is always visible */
.trip-back:focus-visible,
.trip-card:focus-visible,
.places-switch button:focus-visible {
  outline: 3px solid #f3c26f;
  outline-offset: 2px;
}

/* Small screens: tabs get their own scrolling row, cards stack */
@media (max-width: 900px) {
  .trip-nav {
    flex-wrap: wrap;
    margin: 0 8px;
  }
  .trip-tabs {
    order: 3;
    width: 100%;
    margin-left: 0;
  }
  /* Cards become three small tiles so they still fit on the header */
  .trip-cards {
    gap: 8px;
    margin-top: 28px;
    padding: 0 10px;
  }
  .trip-card,
  .trip-card.selected {
    padding: 14px 12px;
    border-radius: 16px;
  }
  .trip-card.selected,
  .trip-card.selected:hover {
    transform: translateY(-6px) scale(1.04);
  }
  .trip-card-label {
    font-size: 13px;
  }
  .trip-card-big {
    font-size: 1.9rem;
    margin-top: 2px;
  }
  .trip-card-big small {
    display: block;
    font-size: 12px;
  }
  .trip-card-sub,
  .trip-card-badge {
    display: none;
  }
  .trip-panel {
    padding: 20px 16px;
    border-radius: 22px;
  }
  .trip-panel-head {
    margin-bottom: 14px;
  }
  .trip-panel-title {
    font-size: 1.3rem;
  }
  .trip-panel-icon {
    width: 30px;
    height: 30px;
  }
}
/* Phones: the sections become one menu button, on the same row as the trip name */
@media (max-width: 640px) {
  .trip-nav {
    flex-wrap: nowrap;
    gap: 10px;
    padding: 8px;
  }
  .trip-nav-name {
    flex: 1;
    min-width: 0;
    max-width: none;
  }
  .trip-tabs {
    order: 0;
    width: auto;
    margin-left: auto;
    flex: 0 1 auto;
    min-width: 0;
  }
}
@media (max-width: 480px) {
  .trip-back-text {
    display: none;
  }
}

.guide-enter-active,
.guide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.guide-enter-from,
.guide-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
@media (prefers-reduced-motion: reduce) {
  .guide-enter-active,
  .guide-leave-active,
  .trip-card,
  .places-switch button { transition: none; }
  .trip-card:hover { transform: none; }
}
</style>
