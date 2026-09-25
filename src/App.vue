<template>
  <div>
    <nav class="navbar navbar-dark bg-dark px-4 py-2 mb-4">
      <router-link to="/" class="navbar-brand fw-bold text-decoration-none text-white">
        TripSync (Adaptive Travel Planner)
      </router-link>
      <span class="text-white-50">Active User: Sarah</span>
    </nav>
    <div class="container">
      <router-view />
    </div>
  </div>
</template>

<script>
export default {
  name: 'App'
}
</script>