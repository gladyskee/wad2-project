// Popular destinations: shown instantly while the online search loads,
// and used on their own if the online search is unavailable.
export const POPULAR_DESTINATIONS = [
  'Seoul, South Korea', 'Busan, South Korea', 'Jeju, South Korea',
  'Tokyo, Japan', 'Kyoto, Japan', 'Osaka, Japan', 'Sapporo, Japan', 'Fukuoka, Japan',
  'Taipei, Taiwan', 'Hong Kong', 'Macau', 'Shanghai, China', 'Beijing, China',
  'Bangkok, Thailand', 'Chiang Mai, Thailand', 'Phuket, Thailand',
  'Bali, Indonesia', 'Jakarta, Indonesia', 'Kuala Lumpur, Malaysia', 'Penang, Malaysia',
  'Singapore', 'Hanoi, Vietnam', 'Ho Chi Minh City, Vietnam', 'Da Nang, Vietnam',
  'Manila, Philippines', 'Cebu, Philippines', 'Siem Reap, Cambodia',
  'Colombo, Sri Lanka', 'Kandy, Sri Lanka', 'Malé, Maldives', 'Kathmandu, Nepal',
  'Delhi, India', 'Mumbai, India', 'Jaipur, India',
  'Dubai, United Arab Emirates', 'Abu Dhabi, United Arab Emirates', 'Muscat, Oman',
  'Amman, Jordan', 'Petra, Jordan', 'Istanbul, Turkey', 'Cappadocia, Turkey',
  'Cairo, Egypt', 'Giza, Egypt', 'Marrakech, Morocco', 'Cape Town, South Africa',
  'London, United Kingdom', 'Edinburgh, United Kingdom', 'Paris, France', 'Nice, France',
  'Rome, Italy', 'Florence, Italy', 'Venice, Italy', 'Milan, Italy',
  'Barcelona, Spain', 'Madrid, Spain', 'Lisbon, Portugal', 'Porto, Portugal',
  'Amsterdam, Netherlands', 'Berlin, Germany', 'Munich, Germany', 'Prague, Czechia',
  'Vienna, Austria', 'Zurich, Switzerland', 'Interlaken, Switzerland', 'Budapest, Hungary',
  'Athens, Greece', 'Santorini, Greece', 'Reykjavik, Iceland', 'Copenhagen, Denmark',
  'Stockholm, Sweden', 'Oslo, Norway', 'Helsinki, Finland', 'Dublin, Ireland',
  'New York, United States', 'Los Angeles, United States', 'San Francisco, United States',
  'Las Vegas, United States', 'Honolulu, United States', 'Toronto, Canada', 'Vancouver, Canada',
  'Mexico City, Mexico', 'Cancún, Mexico', 'Lima, Peru', 'Cusco, Peru', 'Rio de Janeiro, Brazil',
  'Buenos Aires, Argentina', 'Sydney, Australia', 'Melbourne, Australia', 'Perth, Australia',
  'Auckland, New Zealand', 'Queenstown, New Zealand'
]

// Two-letter country codes, used to show flags
export const COUNTRY_CODES = {
  'South Korea': 'KR', 'Japan': 'JP', 'Taiwan': 'TW', 'Hong Kong': 'HK', 'Macau': 'MO', 'China': 'CN',
  'Thailand': 'TH', 'Indonesia': 'ID', 'Malaysia': 'MY', 'Singapore': 'SG', 'Vietnam': 'VN',
  'Philippines': 'PH', 'Cambodia': 'KH', 'Sri Lanka': 'LK', 'Maldives': 'MV', 'Nepal': 'NP', 'India': 'IN',
  'United Arab Emirates': 'AE', 'Oman': 'OM', 'Jordan': 'JO', 'Turkey': 'TR', 'Egypt': 'EG',
  'Morocco': 'MA', 'South Africa': 'ZA', 'United Kingdom': 'GB', 'France': 'FR', 'Italy': 'IT',
  'Spain': 'ES', 'Portugal': 'PT', 'Netherlands': 'NL', 'Germany': 'DE', 'Czechia': 'CZ',
  'Austria': 'AT', 'Switzerland': 'CH', 'Hungary': 'HU', 'Greece': 'GR', 'Iceland': 'IS',
  'Denmark': 'DK', 'Sweden': 'SE', 'Norway': 'NO', 'Finland': 'FI', 'Ireland': 'IE',
  'United States': 'US', 'Canada': 'CA', 'Mexico': 'MX', 'Peru': 'PE', 'Brazil': 'BR',
  'Argentina': 'AR', 'Australia': 'AU', 'New Zealand': 'NZ',
  // Middle East and Eastern Europe (Discover)
  'Saudi Arabia': 'SA', 'Qatar': 'QA', 'Bahrain': 'BH', 'Kuwait': 'KW', 'Israel': 'IL', 'Lebanon': 'LB', 'Iran': 'IR', 'Poland': 'PL', 'Croatia': 'HR', 'Slovenia': 'SI', 'Slovakia': 'SK', 'Romania': 'RO', 'Bulgaria': 'BG', 'Serbia': 'RS', 'Bosnia and Herzegovina': 'BA', 'Montenegro': 'ME', 'Albania': 'AL', 'North Macedonia': 'MK', 'Estonia': 'EE', 'Latvia': 'LV', 'Lithuania': 'LT', 'Georgia': 'GE', 'Armenia': 'AM', 'Azerbaijan': 'AZ', 'Moldova': 'MD'
}

// "Kyoto, Japan" -> "JP" (the country is the last part; "Singapore" on its own also works)
export function codeForDestination(label) {
  const parts = label.split(', ')
  return COUNTRY_CODES[parts[parts.length - 1]] || ''
}

// The country of a destination: "Kyoto, Japan" -> "Japan". Older trips typed just "Tokyo":
// use the popular list to find its country. Unknown -> '' (better not counted than counted wrong).
export function countryOf(label) {
  const parts = label.split(', ')
  if (parts.length > 1 || COUNTRY_CODES[label]) return parts[parts.length - 1]
  const known = POPULAR_DESTINATIONS.find((d) => d.split(', ')[0].toLowerCase() === label.toLowerCase())
  return known ? countryOf(known) : ''
}

// "JP" -> 🇯🇵 (a flag emoji is two special "regional indicator" letters)
export function flagEmoji(code) {
  if (!code || code.length !== 2) return '📍'
  const A = 0x1F1E6
  return String.fromCodePoint(A + code.charCodeAt(0) - 65, A + code.charCodeAt(1) - 65)
}
