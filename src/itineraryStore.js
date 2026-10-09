// Shared itinerary state, same idea as auth.js and preferences.js.
// FlightDelayWidget (Day 1, demo only) and ItineraryView both use this.
import { reactive } from 'vue'

// Day 1 (Mon 12 Oct) of the Seoul demo: arrival day. Hours are decimals: 13.5 = 1:30 PM.
// latestStart = last time the stop can still start (e.g. tour check-in closes).
export function makeDay1() {
  return [
    { id: 'd1-flight', type: 'flight', name: 'Flight KE621 arrives (ICN)', start: 13, duration: 0, buffer: 0.5 },
    { id: 'd1-transfer', type: 'transfer', name: 'Airport transfer', start: 13.5, duration: 0.5 },
    { id: 'd1-hotel', type: 'hotel', name: 'Hotel check-in', start: 14, duration: 0.5 },
    { id: 'd1-tour', type: 'tour', name: 'Gyeongbokgung Palace Tour', start: 15, duration: 2, latestStart: 15.5, latestNote: 'tour check-in closes at 3:30 PM' }
  ]
}

export function newId(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// Turn a saved stop into a live one (adds the fields the screen needs)
export function runtimeStop(s) {
  return {
    id: s.id, name: s.name, date: s.date, hour: s.hour,
    duration: s.duration ?? null,
    address: s.address || null,
    outdoor: !!s.outdoor,
    locked: !!s.locked,
    forecast: null, bestTime: null, loading: false, error: '', highlight: false, dataFrom: '',
    transitToNext: null, transitSecs: 0, replacedFrom: null
  }
}

export const trip = reactive({
  day1: makeDay1(),
  stops: [],     // every stop of the open trip, all days (each has a date)
  wishlist: []   // [{ id, name, address, outdoor: false }]
})

export function resetDay1() {
  trip.day1 = makeDay1()
}

// The Seoul demo trip (Day 2 = Tue 13 Oct 2026)
export function loadDemo() {
  const d = '2026-10-13'
  trip.stops = [
    runtimeStop({ id: 'd2-breakfast', date: d, hour: 10, duration: 1, name: 'Korean Street Food Breakfast', address: null, outdoor: false }),
    runtimeStop({ id: 'd2-palace', date: d, hour: 12, duration: null, name: 'Gyeongbokgung Palace', address: '161 Sajik-ro, Jongno-gu, Seoul, South Korea', outdoor: true }),
    runtimeStop({ id: 'd2-namsan', date: d, hour: 14, duration: null, name: 'Namsan Park (Outdoor)', address: '231 Samil-daero, Jung-gu, Seoul, South Korea', outdoor: true }),
    runtimeStop({ id: 'd2-dinner', date: d, hour: 18, duration: 1.5, name: 'Dinner Reservation (Myeongdong Kyoja)', address: null, outdoor: false, locked: true }),
    runtimeStop({ id: 'd2-itaewon', date: d, hour: 20, duration: null, name: 'Itaewon Street', address: 'Itaewon-ro, Yongsan-gu, Seoul, South Korea', outdoor: true })
  ]
  trip.wishlist = [
    { id: 'w-starfield', name: 'Starfield Library (Indoor Mall)', address: '513 Yeongdong-daero, Gangnam-gu, Seoul', outdoor: false },
    { id: 'w-museum', name: 'National Museum of Korea', address: '137 Seobinggo-ro, Yongsan-gu, Seoul', outdoor: false },
    { id: 'w-lotte', name: 'Lotte World Indoor Adventure', address: '240 Olympic-ro, Songpa-gu, Seoul', outdoor: false }
  ]
}

// A saved trip from the server
export function loadFromServer(saved) {
  trip.stops = (saved.stops || []).map(runtimeStop)
  trip.wishlist = (saved.wishlist || []).map((w) => ({ id: w.id, name: w.name, address: w.address || null, outdoor: false }))
}

// Only the fields worth saving (no crowd data, loading flags, etc.)
export function savedShape() {
  return {
    stops: trip.stops.map((s) => ({ id: s.id, name: s.name, address: s.address, date: s.date, hour: s.hour, duration: s.duration, outdoor: s.outdoor, locked: s.locked })),
    wishlist: trip.wishlist.map((w) => ({ id: w.id, name: w.name, address: w.address }))
  }
}