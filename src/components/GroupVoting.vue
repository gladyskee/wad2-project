<template>
  <div>
    <h4>Group Decision: Day 3 Afternoon Activity</h4>
    <p class="text-muted">Quorum rule: 2 votes required out of 3 travellers.</p>

    <div class="row">
      <div class="col-md-6 mb-3" v-for="option in options" :key="option.id">
        <div class="card p-3">
          <h5>{{ option.name }}</h5>
          <p class="text-muted small">Category: {{ option.category }}</p>
          
          <div class="mb-2">
            <span class="badge me-1" :class="option.votes.Sarah ? 'bg-success' : 'bg-secondary'">Sarah: {{ option.votes.Sarah ? 'Yes' : 'No' }}</span>
            <span class="badge me-1" :class="option.votes.John ? 'bg-success' : 'bg-secondary'">John: {{ option.votes.John ? 'Yes' : 'No' }}</span>
            <span class="badge" :class="option.votes.Amy ? 'bg-success' : 'bg-secondary'">Amy: {{ option.votes.Amy ? 'Yes' : 'No' }}</span>
          </div>

          <div class="d-flex justify-content-between align-items-center mt-2">
            <span class="fw-bold">Total Votes: {{ totalVotes(option.votes) }} / 3</span>
            <button class="btn btn-sm btn-outline-primary" @click="toggleVote(option, 'Sarah')">
              Toggle Sarah's Vote
            </button>
          </div>

          <div class="mt-2 text-success small fw-bold" v-if="totalVotes(option.votes) >= 2">
            Decision Reached!
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      options: [
        {
          id: 1,
          name: 'Namsan Park & Hiking',
          category: 'Outdoor',
          votes: { Sarah: true, John: false, Amy: true }
        },
        {
          id: 2,
          name: 'COEX Mall Shopping',
          category: 'Indoor',
          votes: { Sarah: false, John: true, Amy: true }
        }
      ]
    }
  },
  methods: {
    totalVotes(votes) {
      return Object.values(votes).filter(v => v).length;
    },
    toggleVote(option, person) {
      option.votes[person] = !option.votes[person];
    }
  }
}
</script>