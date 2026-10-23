// Weather for the itinerary.
// Real: the OpenWeather 5-day forecast through our server (/api/weather, cached 15 minutes; the API key
// stays on the server). Days further ahead show the typical weather for the month instead (ItineraryView).
// Demo: "Simulate weather" in the planner uses the made-up days below (clear, rainy afternoon, ...),
// so the rain warnings can be shown on any trip.
import axios from 'axios'

const RAIN = ['Rain', 'Drizzle', 'Thunderstorm']

// { q: 'Kyoto, Japan', dates, simulate } -> [{ date, time, span, condition, temp, rain, pop, simulated? }]
// Each entry covers a 3-hour block in the destination's local time.
export async function fetchWeatherForecast({ q, dates = [], simulate = false }) {
  if (simulate || !q) return simulatedForecast(dates)
  const { data } = await axios.get('/api/weather', { params: { q } })
  const offsetSec = data.city.timezone // Seoul = +32400
  return data.list.map((item) => {
    const local = new Date((item.dt + offsetSec) * 1000) // read with getUTC* = destination time
    const condition = item.weather[0].main
    return {
      date: local.toISOString().slice(0, 10),
      time: local.getUTCHours(),
      span: 3,
      condition,
      temp: item.main ? Math.round(item.main.temp) : null, // °C
      rain: RAIN.includes(condition) || item.pop >= 0.6,
      pop: item.pop || 0 // chance of rain, 0-1
    }
  })
}

// Packing weather (src/tripOptions.js keys) for the trip's dates.
// blocks = forecast entries; climate = typical weather by month ([{ temp: [12], rain: [12] }]) for days
// further ahead. hot = 28°C+, cold = 10°C or less, mild = in between, rain = a rainy block / 10+ rainy days a month.
export function packingWeather({ blocks = [], climate = [], dates = [] }) {
  const temps = []
  let rain = false
  for (const d of dates) {
    const day = blocks.filter((b) => b.date === d)
    if (day.length) {
      for (const b of day) {
        if (b.temp != null) temps.push(b.temp)
        if (b.rain || b.pop >= 0.5) rain = true
      }
      continue
    }
    const m = Number(d.slice(5, 7)) - 1
    for (const c of climate) {
      if (c.temp && c.temp[m] != null) temps.push(c.temp[m])
      if (c.rain && c.rain[m] >= 10) rain = true
    }
  }
  const keys = []
  if (temps.some((t) => t >= 28)) keys.push('hot')
  if (temps.some((t) => t > 10 && t < 28)) keys.push('mild')
  if (temps.some((t) => t <= 10)) keys.push('cold')
  if (rain) keys.push('rain')
  return keys
}

// Made-up weather for the demo: a different pattern for each of the first days of the trip
export function simulatedForecast(dates = []) {
  const weather = []

  dates.forEach((date, index) => {

    // =========================
    // DAY 1 — CLEAR
    // =========================
    if (index === 0) {
      weather.push(
        {
          date,
          time: 6,
          span: 3,
          condition: 'Clear',
          temp: 24,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 9,
          span: 3,
          condition: 'Clear',
          temp: 26,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 12,
          span: 3,
          condition: 'Clear',
          temp: 28,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 15,
          span: 3,
          condition: 'Clear',
          temp: 27,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 18,
          span: 3,
          condition: 'Clear',
          temp: 25,
          rain: false,
          simulated: true
        }
      )
    }

    // =========================
    // DAY 2 — AFTERNOON RAIN
    // =========================
    else if (index === 1) {
      weather.push(
        {
          date,
          time: 6,
          span: 3,
          condition: 'Clouds',
          temp: 23,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 9,
          span: 3,
          condition: 'Clouds',
          temp: 25,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 12,
          span: 3,
          condition: 'Clouds',
          temp: 24,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 15,
          span: 3,
          condition: 'Rain',
          temp: 22,
          rain: true,
          simulated: true
        },
        {
          date,
          time: 18,
          span: 3,
          condition: 'Clouds',
          temp: 23,
          rain: false,
          simulated: true
        }
      )
    }

    // =========================
    // DAY 3 — CLOUDY
    // =========================
    else if (index === 2) {
      weather.push(
        {
          date,
          time: 6,
          span: 3,
          condition: 'Clouds',
          temp: 22,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 9,
          span: 3,
          condition: 'Clouds',
          temp: 24,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 12,
          span: 3,
          condition: 'Clouds',
          temp: 25,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 15,
          span: 3,
          condition: 'Clouds',
          temp: 24,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 18,
          span: 3,
          condition: 'Clouds',
          temp: 22,
          rain: false,
          simulated: true
        }
      )
    }

    // =========================
    // DAY 4 — CLEAR
    // =========================
    else if (index === 3) {
      weather.push(
        {
          date,
          time: 6,
          span: 3,
          condition: 'Clear',
          temp: 23,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 9,
          span: 3,
          condition: 'Clear',
          temp: 25,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 12,
          span: 3,
          condition: 'Clear',
          temp: 27,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 15,
          span: 3,
          condition: 'Clear',
          temp: 26,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 18,
          span: 3,
          condition: 'Clear',
          temp: 24,
          rain: false,
          simulated: true
        }
      )
    }

    // =========================
    // DAY 5 — MIDDAY RAIN
    // =========================
    else if (index === 4) {
      weather.push(
        {
          date,
          time: 6,
          span: 3,
          condition: 'Clear',
          temp: 23,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 9,
          span: 3,
          condition: 'Clouds',
          temp: 25,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 12,
          span: 3,
          condition: 'Rain',
          temp: 22,
          rain: true,
          simulated: true
        },
        {
          date,
          time: 15,
          span: 3,
          condition: 'Clouds',
          temp: 23,
          rain: false,
          simulated: true
        },
        {
          date,
          time: 18,
          span: 3,
          condition: 'Clear',
          temp: 22,
          rain: false,
          simulated: true
        }
      )
    }

  })

  return weather
}