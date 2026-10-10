// Shared login state for the whole app.
// reactive() means any component showing auth.user updates automatically.
import { reactive } from 'vue'
import axios from 'axios'

// A corrupted value in localStorage shouldn't crash the whole app on load
function readSavedUser() {
  try {
    return JSON.parse(localStorage.getItem('user'))
  } catch (err) {
      return null
    }
  }


export const auth = reactive({
  token: localStorage.getItem('token'),
  user: readSavedUser()
})

// Send the token with every axios request once logged in
if (auth.token) {
  axios.defaults.headers.common['Authorization'] = 'Bearer ' + auth.token
}

export function saveLogin(token, user) {
  auth.token = token
  auth.user = user
  localStorage.setItem('token', token)
  localStorage.setItem('user', JSON.stringify(user))
  axios.defaults.headers.common['Authorization'] = 'Bearer ' + token
}

export function logout() {
  auth.token = null
  auth.user = null
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  delete axios.defaults.headers.common['Authorization']
}

// If the server says our token is invalid/expired, log out and go to /login.
// (Uses window.location because importing the router here would be a circular import.)
axios.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401 && auth.token) {
      logout()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname)
      }
    }
    return Promise.reject(err)
  }
)