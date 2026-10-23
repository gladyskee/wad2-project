// =====================================================================
// Day optimizer: puts one day's stops in a better order and time.
//
//   import { optimizeDay, scheduleInOrder } from './dayOptimizer.js'
//   const result = optimizeDay(stops, rainByHour, { dayStart: 9, dayEnd: 21 })
//   result.after.items  -> [{ stop, start, travelMin, mode, reasons: [...] }]
//   result.summary      -> "Saves 38 mins of travel and avoids afternoon rain"
//
// A stop: { id, name, lat, lon, duration (hours), outdoor, locked, hour,
//           crowd: [24 numbers 0-100] or null, popular, open, close }
// rainByHour: 24 numbers, chance of rain 0-1 for each hour of the day.
//
// How it works:
//  1. Travel times between every pair of stops (straight-line distance -> walk or transit minutes).
//  2. For an order of the flexible stops, build the day: each stop starts when you arrive
//     (rounded up to 15 min); locked stops keep their time and the others fit around them.
//  3. Give that day a cost: travel + waiting + crowds (outdoor sights count more) + rain on
//     outdoor stops + being closed / running late. Lower is better.
//  4. Try every order (up to 7 flexible stops = 5040 orders), or 2-opt swaps for longer days,
//     and keep the cheapest. Then explain each stop's time with short "reason" pills.
// =====================================================================

// How much each problem counts (in "minutes of travel" so they can be added up)
export const WEIGHTS = {
  travel: 1,     // per minute travelling
  wait: 0.3,     // per minute waiting for a locked stop
  crowd: 0.5,    // per % busy (outdoor), half for indoor
  rain: 90,      // outdoor stop in certain rain
  dryIndoor: 8,  // small bonus for an indoor stop during rain
  closed: 300,   // visiting outside opening hours
  late: 5,       // per minute late for a locked stop
  overtime: 2    // per minute past the end of the day
}

// ---------- distances ----------
export function haversineKm(a, b) {
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLon = (b.lon - a.lon) * r
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(x))
}

// Short hops are walked; longer ones by public transport (with a few minutes' wait).
// Unknown places (no address) count as 15 min.
export function travelBetween(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return { min: 15, mode: 'unknown', km: null }
  const km = haversineKm(a, b)
  if (km <= 1.3) return { min: Math.max(3, Math.round((km * 1.25) / 4.8 * 60)), mode: 'walk', km }
  return { min: Math.round(8 + (km * 1.3) / 22 * 60), mode: 'transit', km }
}

// Every pair once, so the search doesn't redo the maths.
// known = real travel times we already have, by "fromId>toId" ({ min, mode, source }); they beat the estimate.
export function travelMatrix(stops, known = {}) {
  const matrix = {}
  for (const a of stops) {
    matrix[a.id] = {}
    for (const b of stops) {
      if (a.id === b.id) matrix[a.id][b.id] = { min: 0, mode: 'walk', km: 0 }
      else matrix[a.id][b.id] = { ...travelBetween(a, b), ...(known[a.id + '>' + b.id] || {}) }
    }
  }
  return matrix
}

// ---------- crowds & weather ----------
// Typical crowd curve when we have no real data: outdoor sights peak 11 AM - 3 PM
const OUTDOOR_CURVE = [5, 5, 5, 5, 5, 5, 10, 20, 30, 45, 65, 85, 95, 95, 85, 65, 50, 40, 35, 30, 20, 10, 5, 5]
const INDOOR_CURVE = [5, 5, 5, 5, 5, 5, 5, 10, 20, 35, 50, 60, 70, 70, 65, 60, 50, 40, 35, 25, 15, 10, 5, 5]

export function crowdAt(stop, start) {
  const curve = stop.crowd || (stop.popular === false ? null : stop.outdoor ? OUTDOOR_CURVE : INDOOR_CURVE)
  if (!curve) return 0
  const hours = Math.max(1, Math.round(stop.duration || 1))
  let total = 0
  for (let k = 0; k < hours; k++) total += curve[Math.floor(start + k) % 24] || 0
  return total / hours
}

// Highest chance of rain while you're there
export function rainDuring(rainByHour, start, duration) {
  if (!rainByHour) return 0
  let worst = 0
  for (let h = Math.floor(start); h < Math.ceil(start + (duration || 1)); h++) worst = Math.max(worst, rainByHour[h % 24] || 0)
  return worst
}

const quarter = (h) => Math.ceil(h * 4 - 1e-9) / 4 // round up to the next 15 minutes

// ---------- meals ----------
// from = earliest start, latest = last sensible start, duration in hours
export const MEALS = {
  breakfast: { key: 'breakfast', label: 'Breakfast', icon: '🥐', from: 7, latest: 10, duration: 0.75 },
  lunch: { key: 'lunch', label: 'Lunch', icon: '🍜', from: 11.5, latest: 13.5, duration: 1 },
  dinner: { key: 'dinner', label: 'Dinner', icon: '🍽', from: 17.5, latest: 20, duration: 1.25 }
}
const FOOD_WORDS = ['restaurant', 'market', 'cafe', 'café', 'food', 'ramen', 'sushi', 'izakaya', 'bbq', 'hawker', 'bistro', 'eatery', 'kyoja', 'noodle']

// 'breakfast' | 'lunch' | 'dinner' (named meals), 'food' (somewhere to eat, any meal) or null
export function mealOf(stop) {
  const name = (stop.name || '').toLowerCase()
  if (/breakfast|brunch/.test(name)) return 'breakfast'
  if (/lunch/.test(name)) return 'lunch'
  if (/dinner|supper/.test(name)) return 'dinner'
  for (const w of FOOD_WORDS) if (name.includes(w)) return 'food'
  return null
}

// Which meal breaks the day needs: lunch unless a lunch (or a food place) is planned,
// dinner unless a dinner (or a second food place) is planned. Only meals inside your day count.
// Breakfast is assumed at the hotel. opts.meals === false turns breaks off.
export function mealsNeeded(stops, opts) {
  if (opts.meals === false) return []
  let food = 0
  const named = {}
  for (const s of stops) {
    const m = mealOf(s)
    if (m === 'food') food++
    else if (m) named[m] = true
  }
  const out = []
  if (!named.lunch && food < 1) out.push(MEALS.lunch)
  if (!named.dinner && food < 2) out.push(MEALS.dinner)
  return out.filter((m) => opts.dayStart <= m.latest && opts.dayEnd >= m.from + m.duration)
}

function mealBreak(m, start) {
  return {
    stop: { id: 'meal-' + m.key, name: m.label + ' break', virtual: true, meal: m.key, icon: m.icon, duration: m.duration },
    start, travelMin: 0, mode: 'break', km: 0, waitMin: 0, lateMin: 0
  }
}

// How long a stop usually takes when nothing better is known (hours)
export function defaultDuration(stop) {
  const kind = mealOf(stop)
  if (MEALS[kind]) return MEALS[kind].duration
  if (kind === 'food') return 1
  const name = (stop.name || '').toLowerCase()
  if (/museum|gallery|palace|castle|zoo|aquarium|theme park|disney|universal/.test(name)) return 2
  if (/park|garden|hike|trail|mountain|beach|forest|grove|lake/.test(name)) return 1.5
  if (/temple|shrine|church|mosque|cathedral|-ji|dera|taisha|statue|monument|tower|viewpoint/.test(name)) return 1
  if (/mall|market|shopping|street|outlet/.test(name)) return 1.5
  return 1.5
}

// ---------- building a day from an order ----------
// order: flexible stops in visiting order. locked: stops with a fixed time.
// opts: { dayStart, dayEnd, buffer (hours kept free between stops, from Preferences),
//         from (stop you're leaving from, for re-planning the rest of a day),
//         allStops (the whole day, so meals already planned earlier still count) }
export function scheduleInOrder(order, locked, matrix, opts) {
  const anchors = locked.slice().sort((a, b) => a.hour - b.hour)
  const items = []
  const queue = order.slice()
  const buffer = opts.buffer || 0
  let time = opts.dayStart
  let prev = opts.from || null
  let li = 0
  const travel = (a, b) => (a ? matrix[a.id][b.id] : { min: 0, mode: 'start', km: 0 })
  // Meal breaks still to fit in (lunch, dinner)
  const breaks = mealsNeeded(opts.allStops || order.concat(locked), opts)
  let bi = 0
  const takeBreak = () => {
    const m = breaks[bi++]
    const start = quarter(Math.max(time, m.from))
    items.push(mealBreak(m, start))
    time = start + m.duration
  }

  while (queue.length || li < anchors.length) {
    const lock = anchors[li]
    while (bi < breaks.length && time > breaks[bi].latest + 1e-9) bi++ // too late for that meal now
    const meal = breaks[bi]
    if (queue.length) {
      const s = queue[0]
      const t = travel(prev, s)
      // Arriving before it opens? Start when it opens (the wait counts against this order)
      const arrive = quarter(time + t.min / 60 + (prev ? buffer : 0))
      const start = s.open != null && arrive < s.open ? quarter(s.open) : arrive
      const end = start + (s.duration || 1)
      // Would this stop run past the latest time to eat? Eat first.
      if (meal && end > meal.latest + 1e-9 && (!lock || Math.max(time, meal.from) + meal.duration <= lock.hour)) {
        takeBreak()
        continue
      }
      // Fits before the next locked stop (including getting there and the buffer)?
      if (!lock || end + travel(s, lock).min / 60 + buffer <= lock.hour + 1e-9) {
        items.push({ stop: s, start, travelMin: t.min, mode: t.mode, km: t.km, source: t.source, label: t.label, waitMin: Math.round((start - arrive) * 60), lateMin: 0 })
        time = end
        prev = s
        queue.shift()
        continue
      }
    }
    if (lock) {
      // Room to eat before a locked stop that starts after the meal window?
      if (meal && lock.hour > meal.latest && Math.max(time, meal.from) + meal.duration + travel(prev, lock).min / 60 <= lock.hour + 1e-9 &&
          !(mealOf(lock) === meal.key)) {
        takeBreak()
        continue
      }
      const t = travel(prev, lock)
      const arrive = time + t.min / 60
      items.push({
        stop: lock, start: lock.hour, travelMin: t.min, mode: t.mode, km: t.km, source: t.source, label: t.label,
        waitMin: Math.max(0, Math.round((lock.hour - arrive) * 60)),
        lateMin: Math.max(0, Math.round((arrive - lock.hour) * 60))
      })
      time = Math.max(arrive, lock.hour) + (lock.duration || 1)
      prev = lock
      li++
    }
  }
  // Always in clock order (a locked stop set before the day starts would otherwise come out of order)
  return items.sort((a, b) => a.start - b.start)
}

// Meal breaks for a timeline that already has times: put each needed meal in the first gap
// that fits it; if the stops run straight through mealtime, flag the stop that's in the way.
export function addMealBreaks(items, stops, opts) {
  const out = items.slice()
  for (const m of mealsNeeded(stops, opts)) {
    let placed = false
    for (let i = 0; i <= out.length && !placed; i++) {
      const before = out[i - 1]
      const after = out[i]
      if (!before && !after) break
      const gapStart = before ? before.start + (before.stop.duration || 1) : opts.dayStart
      const gapEnd = after ? after.start - (after.travelMin || 0) / 60 : opts.dayEnd
      if (!before || !after) continue // only between two stops (not before the day starts / after it ends)
      const start = quarter(Math.max(gapStart, m.from))
      if (start <= m.latest + 1e-9 && start + m.duration <= gapEnd + 1e-9) {
        out.splice(i, 0, mealBreak(m, start))
        placed = true
      }
    }
    if (!placed) {
      // Something is planned right through the meal: say so on that stop
      const mid = m.from + 1
      for (const it of out) {
        if (!it.stop.virtual && it.start <= mid && it.start + (it.stop.duration || 1) >= mid) {
          it.skipsMeal = m.label
          break
        }
      }
    }
  }
  return out
}

// Timeline from the times the stops already have (the "before" picture)
export function scheduleAsIs(stops, matrix) {
  const sorted = stops.slice().sort((a, b) => a.hour - b.hour)
  const items = []
  let prev = null
  let time = null
  for (const s of sorted) {
    const t = prev ? matrix[prev.id][s.id] : { min: 0, mode: 'start', km: 0 }
    const arrive = time === null ? s.hour : time + t.min / 60
    items.push({
      stop: s, start: s.hour, travelMin: t.min, mode: t.mode, km: t.km, source: t.source, label: t.label,
      waitMin: 0, lateMin: Math.max(0, Math.round((arrive - s.hour) * 60))
    })
    time = s.hour + (s.duration || 1)
    prev = s
  }
  return items
}

// ---------- scoring ----------
export function measure(items, rainByHour, opts) {
  const m = { cost: 0, travelMin: 0, waitMin: 0, lateMin: 0, crowd: 0, rainOutdoor: 0, closed: 0, overtimeMin: 0, end: opts.dayStart }
  for (const it of items) {
    const s = it.stop
    if (s.virtual) continue // meal breaks
    const dur = s.duration || 1
    const kind = mealOf(s)
    const offFrom = (meal) => (it.start < meal.from ? meal.from - it.start : it.start > meal.latest ? it.start - meal.latest : 0)
    if (MEALS[kind]) {
      // e.g. "Lunch at …" at 4 PM: costs 2 per minute outside its window
      m.cost += offFrom(MEALS[kind]) * 60 * 2
    } else if (kind === 'food') {
      // A restaurant or food market: best at lunch or dinner time (whichever is closer)
      m.cost += Math.min(offFrom(MEALS.lunch), offFrom(MEALS.dinner)) * 60
    }
    m.travelMin += it.travelMin
    m.waitMin += it.waitMin
    m.lateMin += it.lateMin
    const busy = crowdAt(s, it.start)
    const rain = rainDuring(rainByHour, it.start, dur)
    if (!s.locked) {
      m.crowd += busy * (s.outdoor ? 1 : 0.5)
      if (s.outdoor) m.rainOutdoor += rain
    }
    if ((s.open != null && it.start < s.open) || (s.close != null && it.start + dur > s.close)) m.closed++
    m.end = Math.max(m.end, it.start + dur)
    m.cost += (s.locked ? 0 : busy * WEIGHTS.crowd * (opts.crowdWeight || 1) * (s.outdoor ? 1 : 0.5))
    m.cost += s.outdoor ? rain * WEIGHTS.rain : -rain * WEIGHTS.dryIndoor
  }
  m.overtimeMin = Math.max(0, Math.round((m.end - opts.dayEnd) * 60))
  m.cost += m.travelMin * WEIGHTS.travel + m.waitMin * WEIGHTS.wait + m.lateMin * WEIGHTS.late +
    m.closed * WEIGHTS.closed + m.overtimeMin * WEIGHTS.overtime
  return m
}

// ---------- searching for the best order ----------
function permutations(list) {
  if (list.length <= 1) return [list.slice()]
  const out = []
  for (let i = 0; i < list.length; i++) {
    const rest = list.slice(0, i).concat(list.slice(i + 1))
    for (const p of permutations(rest)) out.push([list[i]].concat(p))
  }
  return out
}

// Longer days: start from nearest-neighbour, then keep reversing chunks (2-opt) while it helps
function twoOpt(flex, locked, matrix, rain, opts) {
  const order = [flex[0]]
  const left = flex.slice(1)
  while (left.length) {
    const last = order[order.length - 1]
    left.sort((a, b) => matrix[last.id][a.id].min - matrix[last.id][b.id].min)
    order.push(left.shift())
  }
  let best = order
  let bestCost = measure(scheduleInOrder(best, locked, matrix, opts), rain, opts).cost
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const next = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1))
        const c = measure(scheduleInOrder(next, locked, matrix, opts), rain, opts).cost
        if (c < bestCost - 0.01) {
          best = next
          bestCost = c
          improved = true
        }
      }
    }
  }
  return best
}

// ---------- the "why" pills ----------
const fmt = (h) => {
  const hour = Math.floor(h) % 24
  const min = Math.round((h - Math.floor(h)) * 60)
  return (hour % 12 === 0 ? 12 : hour % 12) + (min ? ':' + String(min).padStart(2, '0') : '') + (hour >= 12 ? ' PM' : ' AM')
}

export function reasonsFor(it, index, rainByHour, dayHasRain) {
  const s = it.stop
  const reasons = []
  if (s.virtual) return reasons
  const kind = mealOf(s)
  const inWindow = (meal) => it.start >= meal.from - 0.01 && it.start <= meal.latest + 0.01
  const meal = MEALS[kind] || (kind === 'food' ? [MEALS.lunch, MEALS.dinner].find(inWindow) : null)
  if (meal && inWindow(meal)) reasons.push({ icon: meal.icon, text: meal.label + ' time', kind: 'crowd' })
  if (s.locked) {
    reasons.push({ icon: '🔒', text: 'Fixed time', kind: 'lock' })
  } else {
    const rain = rainDuring(rainByHour, it.start, s.duration)
    const busy = Math.round(crowdAt(s, it.start))
    if (!s.outdoor && rain >= 0.5) reasons.push({ icon: '🌧️', text: fmt(it.start) + ' slot: indoors during predicted rain', kind: 'rain' })
    else if (s.outdoor && dayHasRain && rain < 0.3) reasons.push({ icon: '🌤️', text: 'Dry window for an outdoor visit', kind: 'rain' })
    if (s.outdoor && it.start + (s.duration || 1) <= 11.01) reasons.push({ icon: '☀️', text: 'Morning slot: beats the 11 AM crowd rush', kind: 'crowd' })
    else if (s.outdoor && it.start >= 15) reasons.push({ icon: '🌇', text: 'Late slot: crowds thin out after 3 PM', kind: 'crowd' })
    else if (busy && busy < 45) reasons.push({ icon: '👥', text: 'Quieter time (~' + busy + '% busy)', kind: 'crowd' })
  }
  if (index === 0) reasons.push({ icon: '📍', text: 'First stop of the day', kind: 'travel' })
  else if (it.mode === 'walk') reasons.push({ icon: '🚶', text: it.travelMin + ' min walk from the previous stop', kind: 'travel' })
  else if (it.mode === 'transit') reasons.push({ icon: '🚇', text: it.travelMin + ' min by transit from the previous stop', kind: 'travel' })
  if (it.waitMin >= 20) reasons.push({ icon: '⏳', text: it.waitMin + ' min free before this', kind: 'wait' })
  return reasons
}

// Problems with the current plan, shown before optimizing
export function warningsFor(it, rainByHour, opts) {
  const s = it.stop
  const out = []
  if (s.virtual) return out
  if (it.skipsMeal) out.push({ icon: '🍽', text: 'No time for ' + it.skipsMeal.toLowerCase() })
  const meal = MEALS[mealOf(s)]
  if (meal && (it.start < meal.from - 0.01 || it.start > meal.latest + 0.01)) out.push({ icon: meal.icon, text: 'Not at a usual ' + meal.label.toLowerCase() + ' time' })
  if (opts && it.start + (s.duration || 1) > opts.dayEnd + 0.01) out.push({ icon: '⏰', text: 'Ends after your day ends' })
  if (opts && s.locked && it.start < opts.dayStart - 0.01) out.push({ icon: '🌅', text: 'Before your day starts' })
  if (s.outdoor && rainDuring(rainByHour, it.start, s.duration) >= 0.5) out.push({ icon: '🌧️', text: 'Outdoors during predicted rain' })
  if (!s.locked && crowdAt(s, it.start) >= 80) out.push({ icon: '👥', text: 'Peak crowds at this time' })
  if ((s.open != null && it.start < s.open) || (s.close != null && it.start + (s.duration || 1) > s.close)) out.push({ icon: '🚪', text: 'Closed at this time' })
  if (it.lateMin > 0) out.push({ icon: '⚠️', text: "Can't get here in time from the previous stop" })
  return out
}

// ---------- the main function ----------
export function optimizeDay(stops, rainByHour, opts = {}) {
  const options = { dayStart: 9, dayEnd: 21, ...opts }
  const matrix = travelMatrix(stops, options.known) // known = real travel times (see travelMatrix)
  const locked = stops.filter((s) => s.locked)
  const flex = stops.filter((s) => !s.locked)

  const beforeItems = scheduleAsIs(stops, matrix)
  const before = measure(beforeItems, rainByHour, options)

  let bestOrder = flex
  if (flex.length <= 7) {
    let bestCost = Infinity
    for (const order of permutations(flex)) {
      const c = measure(scheduleInOrder(order, locked, matrix, options), rainByHour, options).cost
      if (c < bestCost) {
        bestCost = c
        bestOrder = order
      }
    }
  } else {
    bestOrder = twoOpt(flex, locked, matrix, rainByHour, options)
  }

  const afterItems = scheduleInOrder(bestOrder, locked, matrix, options)
  const after = measure(afterItems, rainByHour, options)
  const better = after.cost < before.cost - 1
  const dayHasRain = (rainByHour || []).some((p) => p >= 0.5)
  let real = 0
  for (const it of afterItems) {
    it.reasons = reasonsFor(it, real, rainByHour, dayHasRain)
    if (!it.stop.virtual) real++
  }

  return {
    before: { items: beforeItems, ...before },
    after: { items: afterItems, ...after },
    better,
    summary: better ? summarize(before, after) : stillToFix(before)
  }
}

// No better order: say what is still wrong (if anything), so "good order" is never said about a broken day
function stillToFix(m) {
  const left = []
  if (m.closed) left.push(m.closed + (m.closed === 1 ? ' stop is' : ' stops are') + ' closed at the planned time')
  if (m.lateMin) left.push('you can\'t get to a stop in time (' + m.lateMin + ' min late)')
  if (m.overtimeMin) left.push('the day runs ' + m.overtimeMin + ' min past your end time')
  if (!left.length) return 'Your day is already in a good order.'
  return 'No better order found, but ' + left.join(' and ') + '. Try moving a stop to another day.'
}

function summarize(before, after) {
  const parts = []
  const saved = before.travelMin - after.travelMin
  if (saved >= 5) parts.push('saves ' + saved + ' min of travel')
  if (before.rainOutdoor - after.rainOutdoor >= 0.4) parts.push('keeps outdoor stops out of the rain')
  if (before.crowd - after.crowd >= 30) parts.push('dodges the midday crowds')
  if (before.closed > after.closed) parts.push('visits places while they are open')
  if (before.lateMin > after.lateMin) parts.push('gets you to your fixed plans on time')
  if (!parts.length) return 'Your day is already in a good order.'
  parts.splice(3) // the three biggest wins are enough
  const text = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]
  return 'Route optimized: ' + text + '.'
}

// 3-hour forecast blocks ({ time, span, rain }) -> chance of rain for each hour
export function rainFromBlocks(blocks) {
  const hours = new Array(24).fill(0.1)
  for (const b of blocks || []) {
    for (let h = b.time; h < b.time + (b.span || 3) && h < 24; h++) hours[h] = b.rain ? 0.8 : 0.1
  }
  return hours
}
