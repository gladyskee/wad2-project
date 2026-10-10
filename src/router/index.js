import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import TripView from '../views/TripView.vue'
import LoginView from '../views/LoginView.vue'
import SignupView from '../views/SignupView.vue'
import { auth } from '../auth.js'

import distanceRoutes from './routes/distance.js'
import flightRoutes from './routes/flights.js'

app.use('/api/distance-matrix', distanceRoutes)
app.use('/api/flights', flightRoutes)

const routes = [
  { path: '/', name: 'Home', component: HomeView, meta: { requiresAuth: true } },
  { path: '/trip/:id', name: 'Trip', component: TripView, props: true, meta: { requiresAuth: true } },
  { path: '/login', name: 'Login', component: LoginView, meta: { hideNav: true } },
  { path: '/signup', name: 'Signup', component: SignupView, meta: { hideNav: true } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Before every page change: send logged-out users to /login
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !auth.token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // Logged-in users don't need the login/signup pages
  if ((to.path === '/login' || to.path === '/signup') && auth.token) {
    return '/'
  }
})

export default router
