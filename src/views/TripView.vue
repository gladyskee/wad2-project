<template>
  <div>
    <div class="card p-4 mb-4 bg-dark text-white">
      <h2>Seoul, South Korea</h2>
      <p class="mb-0 text-white-50">12 Oct – 17 Oct | Travellers: Sarah, John, Amy</p>
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
      <li class="nav-item">
        <button class="btn btn-sm" :class="activeTab === 'expenses' ? 'btn-primary' : 'btn-outline-secondary'" @click="activeTab = 'expenses'">Expenses & Split</button>
      </li>
    </ul>

    <div v-if="activeTab === 'itinerary'">
      <ItineraryView />
    </div>
    <div v-if="activeTab === 'voting'">
      <GroupVoting />
    </div>
    <div v-if="activeTab === 'packing'">
      <PackingView />
    </div>
    <div v-if="activeTab === 'expenses'">
      <ExpensesView />
    </div>
  </div>
</template>

<script>
import ItineraryView from '../components/ItineraryView.vue'
import GroupVoting from '../components/GroupVoting.vue'
import PackingView from '../components/PackingView.vue'
import ExpensesView from '../components/ExpensesView.vue'

export default {
  components: { ItineraryView, GroupVoting, PackingView, ExpensesView },
  data() {
    return {
      activeTab: 'itinerary'
    }
  }
}
</script>