<template>
  <div>
    <p v-if="loading" class="text-muted">Loading trip…</p>

    <div v-else-if="loadError" class="alert alert-warning">
      {{ loadError }} <router-link to="/">Back to your trips</router-link>
    </div>

    <template v-else>
      <div class="card p-4 mb-4 text-white trip-hero">
        <h2>{{ headerTitle }}</h2>
        <p class="mb-0 text-white-50">{{ headerSubtitle }}</p>
      </div>

      <!-- Safety banner: shown on every tab when SafetyLayer reports High/Critical risk -->
      <div v-if="safetyWarning" class="alert alert-danger d-flex justify-content-between align-items-center">
        <span>⚠️ {{ safetyWarning }}</span>
        <button class="btn btn-sm btn-outline-danger" @click="activeTab = 'safety'">View safety</button>
      </div>

      <ul class="nav nav-pills mb-4">
        <li class="nav-item me-2">
          <button class="btn btn-sm" :class="activeTab === 'itinerary' ? 'btn-primary' : 'btn-outline-secondary'" @click="activeTab = 'itinerary'">Itinerary & Weather</button>
        </li>
        <li class="nav-item me-2">
          <button class="btn btn-sm" :class="activeTab === 'voting' ? 'btn-primary' : 'btn-outline-secondary'" @click="activeTab = 'voting'">Group Decisions</button>
        </li>
        <li class="nav-item me-2">
          <button class="btn btn-sm" :class="activeTab === 'packing' ? 'btn-primary' : 'btn-outline-secondary'" @click="activeTab = 'packing'">Packing List</button>
        </li>
        <li class="nav-item me-2">
          <button class="btn btn-sm" :class="activeTab === 'expenses' ? 'btn-primary' : 'btn-outline-secondary'" @click="activeTab = 'expenses'">Expenses & Split</button>
        </li>
        <li class="nav-item me-2">
          <button class="btn btn-sm" :class="activeTab === 'photos' ? 'btn-primary' : 'btn-outline-secondary'" @click="activeTab = 'photos'">Photos</button>
        </li>
        <li class="nav-item me-2">
          <button class="btn btn-sm" :class="activeTab === 'safety' ? 'btn-primary' : 'btn-outline-secondary'" @click="activeTab = 'safety'" data-testid="safety-tab">Safety</button>
        </li>
        <li class="nav-item me-2">
          <button class="btn btn-sm" :class="activeTab === 'travelOptions' ? 'btn-primary' : 'btn-outline-secondary'" @click="activeTab = 'travelOptions'">Go Options</button>
        </li>
      </ul>

      <!-- Group decisions and expenses are still built around the Seoul demo data -->
      <div v-show="activeTab === 'itinerary'">
        <FlightDelayWidget v-if="isDemo" />
        <ItineraryView
          :trip-id="id"
          :destination="itineraryInfo.destination"
          :start-date="itineraryInfo.startDate"
          :end-date="itineraryInfo.endDate"
          :initial-stops="itineraryInfo.stops"
          :initial-wishlist="itineraryInfo.wishlist"
          @itinerary-change="updatePackingActivities" />
      </div>
      <div v-if="activeTab === 'voting'">
        <GroupVoting v-if="isDemo" />
        <div v-else class="card p-4 text-center text-muted"><h5>No group decisions yet</h5><p class="mb-0">Voting for your own trips is coming soon.</p></div>
      </div>
      <div v-show="activeTab === 'packing'">
        <PackingView :has-outdoor-activity="hasOutdoorActivity" />
      </div>
      <div v-if="activeTab === 'expenses'">
        <ExpensesView v-if="isDemo" />
        <div v-else class="card p-4 text-center text-muted"><h5>No expenses yet</h5><p class="mb-0">Expense splitting for your own trips is coming soon.</p></div>
      </div>
      <div v-show="activeTab === 'photos'">
        <PhotosView />
      </div>
      <!--
        v-show (not v-if) keeps SafetyLayer mounted when you switch tabs,
        so live location tracking and alerts keep running in the background.
      -->
      <div v-show="activeTab === 'safety'">
        <SafetyLayer @risk-change="handleRiskChange" />
      </div>

      <div v-show="activeTab === 'travelOptions'">
        <TransportOptions />
      </div>

    </template>
  </div>
</template>

<script>
import axios from 'axios'
import ItineraryView from '../components/ItineraryView.vue'
import GroupVoting from '../components/GroupVoting.vue'
import PackingView from '../components/PackingView.vue'
import PhotosView from '../components/PhotosView.vue'
import ExpensesView from '../components/ExpensesView.vue'
import SafetyLayer from '../components/SafetyLayer.vue'
import FlightDelayWidget from '../components/FlightDelayWidget.vue'
import TransportOptions from '../components/TransportOptions.vue'


export default {
  components: { ItineraryView, GroupVoting, PackingView, PhotosView, ExpensesView, SafetyLayer, FlightDelayWidget, TransportOptions},
  props: { id: { type: String, default: 'seoul' } }, // from the route /trip/:id
  data() {
    return {
      activeTab: 'itinerary',
      hasOutdoorActivity: true,
      safetyWarning: '',
      trip: null,
      loading: true,
      loadError: ''
    }
  },
  computed: {
    // What the itinerary needs to know about this trip
    itineraryInfo() {
      if (this.isDemo) return { destination: 'Seoul, South Korea', startDate: '2026-10-12', endDate: '2026-10-17', stops: [], wishlist: [] }
      const t = this.trip
      return { destination: t.destination, startDate: t.startDate, endDate: t.endDate, stops: t.stops || [], wishlist: t.wishlist || [] }
    },
    isDemo() {
      return this.id === 'seoul'
    },
    headerTitle() {
      return this.isDemo ? 'Seoul, South Korea' : this.trip.name
    },
    headerSubtitle() {
      if (this.isDemo) return '12 Oct – 17 Oct | Travellers: Sarah, John, Amy'
      const t = this.trip
      const fmt = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      const dates = t.startDate ? (t.endDate ? fmt(t.startDate) + ' – ' + fmt(t.endDate) : 'From ' + fmt(t.startDate)) : 'Dates not set'
      return t.destination + ' | ' + dates + ' | Travellers: ' + t.travellers.join(', ')
    }
  },
  async mounted() {
    if (!this.isDemo) {
      try {
        const res = await axios.get('/api/trips/' + this.id)
        this.trip = res.data
      } catch (err) {
        this.loadError = err.response && err.response.status === 404 ? 'That trip could not be found.' : 'Could not load this trip. Is the server running?'
      }
    }
    this.loading = false
  },
  methods: {
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