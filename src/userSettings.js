// The logged-in user's Settings (base currency, units, alerts), shared by every page.
// Same idea as preferences.js: Settings edits this object, other pages read it.
import { reactive } from 'vue'
import axios from 'axios'

export const userSettings = reactive({ currency: 'SGD', units: 'metric', hazardAlerts: true, expenseAlerts: true })

// Load from the server (call this when a page opens; keeps the defaults if it fails)
export async function loadUserSettings() {
  try {
    const res = await axios.get('/api/auth/me')
    Object.assign(userSettings, res.data.settings || {})
  } catch (err) {
    // defaults
  }
}

// 24 -> "24°C" or "75°F" (short: "24°" / "75°")
export function formatTemp(celsius, short = false) {
  const imperial = userSettings.units === 'imperial'
  const value = Math.round(imperial ? celsius * 9 / 5 + 32 : celsius)
  return value + (short ? '°' : imperial ? '°F' : '°C')
}

// 0.42 -> "400 m" / "1,400 ft", 3.2 -> "3.2 km" / "2.0 mi"
export function formatDistance(km) {
  if (userSettings.units === 'imperial') {
    const miles = km * 0.621371
    return miles < 0.2 ? (Math.round(km * 3281 / 50) * 50).toLocaleString() + ' ft' : miles.toFixed(1) + ' mi'
  }
  return km < 1 ? Math.round(km * 1000 / 50) * 50 + ' m' : km.toFixed(1) + ' km'
}
