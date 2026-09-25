import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import TripView from '../views/TripView.vue'

const routes = [
  { path: '/', name: 'Home', component: HomeView },
  { path: '/trip/:id', name: 'Trip', component: TripView, props: true }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router