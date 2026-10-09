// Travel time between two places, via our server (the Google key stays on the server,
// and Google's API can't be called straight from the browser anyway).
// Throws on failure so the caller can show "(est)".
import axios from 'axios'

export async function fetchTravelTime(origin, destination, mode = 'transit') {
  const { data } = await axios.get('/api/distance-matrix', { params: { origin, destination, mode } })
  return data // { durationText: '24 mins', durationValue: 1440 }
}