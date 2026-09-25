<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h2>Your Trips</h2>
      <button class="btn btn-primary btn-sm" @click="showCreateForm = !showCreateForm">
        {{ showCreateForm ? 'Cancel' : '+ Create New Trip' }}
      </button>
    </div>

    <!-- Inline Form (No Modal) -->
    <div v-if="showCreateForm" class="card p-3 mb-4 bg-white">
      <h5>Create New Trip</h5>
      <div class="mb-2">
        <label class="form-label">Trip Name</label>
        <input type="text" class="form-control" v-model="newTrip.name" placeholder="e.g. Kyoto Adventure">
      </div>
      <div class="mb-2">
        <label class="form-label">Destination</label>
        <input type="text" class="form-control" v-model="newTrip.destination" placeholder="e.g. Kyoto, Japan">
      </div>
      <button class="btn btn-success btn-sm mt-2" @click="createTrip">Save Trip</button>
    </div>

    <div class="row">
      <div class="col-md-4 mb-3">
        <div class="card p-3 bg-white">
          <span class="badge bg-primary mb-2 w-25">South Korea</span>
          <h4>Seoul Trip</h4>
          <p class="text-muted small">12 Oct – 17 Oct | 3 Travellers</p>
          <p class="text-danger small">Weather Warning: Rain expected Day 2.</p>
          <router-link to="/trip/seoul" class="btn btn-outline-primary btn-sm mt-2">Open Trip</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      showCreateForm: false,
      newTrip: { name: '', destination: '' }
    }
  },
  methods: {
    createTrip() {
      alert('Trip created successfully!');
      this.showCreateForm = false;
    }
  }
}
</script>