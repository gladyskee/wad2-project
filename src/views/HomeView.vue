<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h2>Your Trips</h2>
      <button class="btn btn-primary btn-sm" @click="showCreateForm = !showCreateForm" data-testid="new-trip-btn">
        {{ showCreateForm ? 'Cancel' : '+ Create New Trip' }}
      </button>
    </div>

    <!-- Inline form -->
    <form v-if="showCreateForm" class="card p-3 mb-4 bg-white" @submit.prevent="createTrip" novalidate>
      <h5>Create New Trip</h5>
      <div class="row g-2">
        <div class="col-md-6">
          <label for="trip-name" class="form-label">Trip name</label>
          <input id="trip-name" type="text" class="form-control" v-model="newTrip.name" maxlength="80" placeholder="e.g. Kyoto Adventure" data-testid="trip-name">
        </div>
        <div class="col-md-6">
          <label for="trip-dest" class="form-label">Destination</label>
          <input id="trip-dest" type="text" class="form-control" v-model="newTrip.destination" maxlength="80" placeholder="e.g. Kyoto, Japan" data-testid="trip-destination">
        </div>
        <div class="col-6 col-md-3">
          <label for="trip-start" class="form-label">Start date</label>
          <input id="trip-start" type="date" class="form-control" v-model="newTrip.startDate">
        </div>
        <div class="col-6 col-md-3">
          <label for="trip-end" class="form-label">End date</label>
          <input id="trip-end" type="date" class="form-control" v-model="newTrip.endDate" :min="newTrip.startDate">
        </div>
        <div class="col-md-6">
          <label for="trip-people" class="form-label">Travellers <span class="text-muted small">(names, separated by commas)</span></label>
          <input id="trip-people" type="text" class="form-control" v-model="newTrip.travellers" placeholder="e.g. Sarah, John, Amy">
        </div>
      </div>
      <p v-if="formError" class="text-danger small mt-2 mb-0" role="alert" data-testid="trip-form-error">{{ formError }}</p>
      <div>
        <button type="submit" class="btn btn-success btn-sm mt-3" :disabled="saving" data-testid="trip-save">{{ saving ? 'Saving…' : 'Save Trip' }}</button>
      </div>
    </form>

    <p v-if="loadError" class="alert alert-warning small">{{ loadError }}</p>

    <div class="row">
      <!-- Demo trip (all features are built around this one) -->
      <div class="col-md-4 mb-3">
        <div class="card p-3 bg-white h-100">
          <span class="badge bg-primary mb-2 align-self-start">South Korea · demo</span>
          <h4>Seoul Trip</h4>
          <p class="text-muted small">12 Oct – 17 Oct | 3 Travellers</p>
          <p class="text-danger small">Weather Warning: Rain expected Day 2.</p>
          <router-link to="/trip/seoul" class="btn btn-outline-primary btn-sm mt-auto align-self-start">Open Trip</router-link>
        </div>
      </div>

      <!-- Trips saved by this user -->
      <div v-for="t in trips" :key="t.id" class="col-md-4 mb-3" data-testid="trip-card">
        <div class="card p-3 bg-white h-100">
          <span class="badge bg-secondary mb-2 align-self-start">{{ t.destination }}</span>
          <h4>{{ t.name }}</h4>
          <p class="text-muted small mb-1">{{ dateRange(t) }} | {{ t.travellers.length }} {{ t.travellers.length === 1 ? 'Traveller' : 'Travellers' }}</p>
          <p class="text-muted small">{{ t.travellers.join(', ') }}</p>
          <div class="d-flex gap-2 mt-auto">
            <router-link :to="'/trip/' + t.id" class="btn btn-outline-primary btn-sm">Open Trip</router-link>
            <button class="btn btn-outline-danger btn-sm" @click="removeTrip(t)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="!loading && !trips.length && !loadError" class="text-muted small">Trips you create will appear here.</p>
  </div>
</template>

<script>
import axios from 'axios'

export default {
  data() {
    return {
      trips: [],
      loading: true,
      loadError: '',
      showCreateForm: false,
      saving: false,
      formError: '',
      newTrip: { name: '', destination: '', startDate: '', endDate: '', travellers: '' }
    }
  },
  async mounted() {
    try {
      const res = await axios.get('/api/trips')
      this.trips = res.data
    } catch (err) {
      this.loadError = 'Could not load your trips. Is the server running?'
    }
    this.loading = false
  },
  methods: {
    async createTrip() {
      this.formError = ''
      const name = this.newTrip.name.trim()
      const destination = this.newTrip.destination.trim()
      if (!name || !destination) {
        this.formError = 'Please enter a trip name and destination.'
        return
      }
      if (this.newTrip.startDate && this.newTrip.endDate && this.newTrip.endDate < this.newTrip.startDate) {
        this.formError = 'The end date must be on or after the start date.'
        return
      }
      this.saving = true
      try {
        const res = await axios.post('/api/trips', {
          name,
          destination,
          startDate: this.newTrip.startDate,
          endDate: this.newTrip.endDate,
          travellers: this.newTrip.travellers.split(',')
        })
        this.trips.unshift(res.data)
        this.newTrip = { name: '', destination: '', startDate: '', endDate: '', travellers: '' }
        this.showCreateForm = false
      } catch (err) {
        this.formError = (err.response && err.response.data && err.response.data.message) || 'Could not save the trip. Is the server running?'
      }
      this.saving = false
    },
    async removeTrip(trip) {
      if (!confirm('Delete "' + trip.name + '"? This cannot be undone.')) return
      try {
        await axios.delete('/api/trips/' + trip.id)
        this.trips = this.trips.filter((t) => t.id !== trip.id)
      } catch (err) {
        this.loadError = 'Could not delete that trip. Try again.'
      }
    },
    dateRange(t) {
      if (!t.startDate) return 'Dates not set'
      const fmt = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      return t.endDate ? fmt(t.startDate) + ' – ' + fmt(t.endDate) : 'From ' + fmt(t.startDate)
    }
  }
}
</script>