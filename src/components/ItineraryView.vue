<template>
  <div>
    <h4>Day 2 Itinerary & Adaptive Conflict Engine</h4>
    <div v-if="hasConflict" class="alert alert-warning">
      <strong>Weather Alert:</strong> Heavy rain predicted at 14:00. Namsan Park (Outdoor) is affected.
      <button class="btn btn-sm btn-danger ms-3" @click="resolveConflict">Replace with National Museum (Indoor)</button>
    </div>

    <div class="card p-3 mb-3">
      <div class="mb-2"><strong>10:00 AM</strong> — Korean Street Food Breakfast</div>
      <div class="mb-2 p-2 rounded" :class="isResolved ? 'bg-success-subtle' : 'bg-light'">
        <strong>02:00 PM</strong> — 
        <span v-if="!isResolved">Namsan Park (Outdoor) 🌧️ [Conflict Detected]</span>
        <span v-else class="text-success">National Museum (Indoor) ✨ [Replaced by Adaptive Engine]</span>
      </div>
      <div><strong>06:00 PM</strong> — Dinner Reservation (Myeongdong Kyoja)</div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      hasConflict: true,
      isResolved: false
    }
  },
  methods: {
    resolveConflict() {
      this.hasConflict = false;
      this.isResolved = true;
    }
  }
}
</script>