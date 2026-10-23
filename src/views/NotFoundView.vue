<template>
  <main class="nf container text-center">
    <p class="nf-code" aria-hidden="true">404</p>
    <h1 class="h3">This page doesn't exist</h1>
    <p class="nf-muted">The link may be old, or the trip may have been deleted.</p>
    <router-link :to="auth.token ? '/home' : '/'" class="btn btn-primary">{{ auth.token ? 'Back to my trips' : 'Go to the home page' }}</router-link>
  </main>
</template>

<script setup>
import { auth } from '../auth.js'
</script>

<style scoped>
.nf {
  padding: 96px 16px;
}

.nf-code {
  font-size: 64px;
  font-weight: 800;
  margin: 0;
  color: var(--app-muted, #5a6b78);
}

.nf-muted {
  color: var(--app-muted, #5a6b78);
}
</style>
