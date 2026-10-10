// Flight status comes from our server (/api/flights), which holds the Aviationstack key.
import axios from 'axios'

export async function checkFlightStatus(flightNumber = 'KE621') {
  try {
    const { data } = await axios.get('/api/flights', { params: { flight: flightNumber } })
    return data
  } catch (err) {
    // No live data (e.g. the flight isn't active today): fall back to the demo delay
    console.warn('Using demo flight data:', err.message)
    return { flight: flightNumber, status: 'Delayed', delayMinutes: 90 }
  }
}