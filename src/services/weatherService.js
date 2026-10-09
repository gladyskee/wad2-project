// Weather for a destination. The API key lives on the server (/api/weather),
// never in the browser. axios is used so the login token is sent too.
import axios from 'axios'

const RAIN = ['Rain', 'Drizzle', 'Thunderstorm']

// Give either { q: 'Kyoto, Japan' } or { lat, lon }.
// Returns [{ date, time, span, condition, rain, simulated? }] for every forecast day (about 5 days ahead),
// in the destination's local time. Each OpenWeatherMap entry covers a 3-hour block (span: 3).
// If the request fails: throws, unless simulateOnFail is true (demo trip only), which returns fake rain.
export async function fetchWeatherForecast({ q, lat, lon, fallbackDate, simulateOnFail = false }) {
  try {
    const params = q ? { q } : { lat, lon }
    const { data } = await axios.get('/api/weather', { params })
    const offsetSec = data.city.timezone // Seoul = +32400
    return data.list.map((item) => {
      const local = new Date((item.dt + offsetSec) * 1000) // read with getUTC* = destination time
      const condition = item.weather[0].main
      return {
        date: local.toISOString().slice(0, 10),
        time: local.getUTCHours(),
        span: 3,
        condition,
        rain: RAIN.includes(condition) || item.pop >= 0.6
      }
    })
  } catch (err) {
    if (!simulateOnFail) throw err
    console.warn('Using SIMULATED weather (server route or API key unavailable):', err.message)
    return [{ date: fallbackDate, time: 14, span: 3, condition: 'Rain', rain: true, simulated: true }]
  }
}