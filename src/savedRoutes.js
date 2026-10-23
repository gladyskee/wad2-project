import { ref } from 'vue';
import axios from 'axios';

export const savedRoutesFromDb = ref([]);
export const transportPrefill = ref(null);   // { start, end, day, time, timeType }

export async function fetchSavedRoutes(tripId) {
  if (!tripId) return;
  if (tripId === 'seoul') return; // the demo trip has no saved routes
  try {
    // axios sends the login token (saved routes are only for people on the trip)
    const res = await axios.get('/api/directions/saved', { params: { tripId } });
    // Directly assign the fresh array from MongoDB
    savedRoutesFromDb.value = res.data;
  } catch (err) {
    console.error('Failed to load saved routes from DB:', err);
  }
}

// zones the user can pick from (value = IANA zone name, handles daylight saving automatically)
export const timeZones = [
    { label: 'Seoul', value: 'Asia/Seoul' },
    { label: 'Japan', value: 'Asia/Tokyo' },
    { label: 'Singapore', value: 'Asia/Singapore' },
    { label: 'Hong Kong', value: 'Asia/Hong_Kong' },
    { label: 'Bangkok', value: 'Asia/Bangkok' },
    { label: 'India', value: 'Asia/Kolkata' },
    { label: 'Dubai', value: 'Asia/Dubai' },
    { label: 'London', value: 'Europe/London' },
    { label: 'Paris / Berlin / Rome', value: 'Europe/Paris' },
    { label: 'New York', value: 'America/New_York' },
    { label: 'Chicago', value: 'America/Chicago' },
    { label: 'Denver', value: 'America/Denver' },
    { label: 'Los Angeles', value: 'America/Los_Angeles' },
    { label: 'Sydney / Melbourne', value: 'Australia/Sydney' },
    { label: 'Auckland', value: 'Pacific/Auckland' },
    { label: 'China/Taiwan', value: 'Asia/Shanghai' },
    // add more as needed
];

// destination name (lowercase) -> IANA zone, used to auto-pick the zone
export const cityZones = {
    'seoul': 'Asia/Seoul',
    'tokyo': 'Asia/Tokyo',
    'singapore': 'Asia/Singapore',
    'hong kong': 'Asia/Hong_Kong',
    'bangkok': 'Asia/Bangkok',
    'london': 'Europe/London',
    'paris': 'Europe/Paris',
    'new york': 'America/New_York',
    'los angeles': 'America/Los_Angeles',
    'sydney': 'Australia/Sydney',
    'japan': 'Asia/Tokyo',
    'osaka': 'Asia/Tokyo',
    'kyoto': 'Asia/Tokyo',
    'china': 'Asia/Shanghai',
    'beijing': 'Asia/Shanghai',
    'shanghai': 'Asia/Shanghai',
    'shenzhen': 'Asia/Shanghai',
    'guangzhou': 'Asia/Shanghai',
    'chengdu': 'Asia/Shanghai',
    // add the cities you support
};
