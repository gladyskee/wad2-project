import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import TripView from '../views/TripView.vue'
import LoginView from '../views/LoginView.vue'
import SignupView from '../views/SignupView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView.vue'
import TripSetupView from '../views/TripSetupView.vue'
import JoinView from '../views/JoinView.vue'
import SettingsView from '../views/SettingsView.vue'
import DiscoverView from '../views/DiscoverView.vue'
import LandingView from '../views/LandingView.vue'
import NotFoundView from '../views/NotFoundView.vue'
import { auth } from '../auth.js'

const routes = [
  { path: '/', name: 'Landing', component: LandingView, meta: { hideNav: true } },
  { path: '/home', name: 'Home', component: HomeView, meta: { requiresAuth: true } },
  { path: '/welcome', redirect: '/' }, // old address
  { path: '/discover', name: 'Discover', component: DiscoverView }, // open to guests
  { path: '/settings', name: 'Settings', component: SettingsView, meta: { requiresAuth: true, dark: true } },
  { path: '/trip/:id', name: 'Trip', component: TripView, props: true, meta: { requiresAuth: true } },
  // New trips: step 1 = invite, step 2 = wishlist, step 3 = vote, then the trip page
  { path: '/trip/:id/setup/:step(invite|wishlist|vote)', name: 'TripSetup', component: TripSetupView, props: true, meta: { requiresAuth: true } },
  // Invite links: /join/<code>
  { path: '/join/:code', name: 'Join', component: JoinView, props: true, meta: { requiresAuth: true } },
  { path: '/login', name: 'Login', component: LoginView, meta: { hideNav: true } },
  { path: '/signup', name: 'Signup', component: SignupView, meta: { hideNav: true } },
  { path: '/forgot-password', name: 'ForgotPassword', component: ForgotPasswordView, meta: { hideNav: true } },
  // Any other address
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFoundView }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Before every page change: logged-out users go to /login for pages that need an account
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !auth.token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // Signed in: the landing, login and signup pages go straight to your trips
  if ((to.path === '/' || to.path === '/login' || to.path === '/signup' || to.path === '/forgot-password') && auth.token) {
    return '/home'
  }
})

export default router
