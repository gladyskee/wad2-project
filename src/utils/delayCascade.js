// Works out what a flight delay does to the stops that follow it.
// stops[0] is the flight arrival; the rest are in order.
// Each stop: { id, name, start, duration, latestStart?, latestNote? } (hours, decimals allowed)

export function formatTime(h) {
  const hh = Math.floor(h + 1e-9)
  const mm = Math.round((h - hh) * 60)
  const suffix = hh % 24 >= 12 ? 'PM' : 'AM'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return h12 + ':' + String(mm).padStart(2, '0') + ' ' + suffix
}

export function computeCascade(stops, delayMin) {
  const [flight, ...rest] = stops
  const newArrival = flight.start + delayMin / 60
  let freeAt = newArrival + (flight.buffer ?? 0.5) // time to clear the airport

  const items = rest.map((s) => {
    const newStart = Math.max(s.start, freeAt)
    const missed = s.latestStart !== undefined && newStart > s.latestStart + 1e-9
    if (!missed) freeAt = newStart + (s.duration || 0.5)
    return {
      ...s,
      newStart: missed ? null : newStart,
      shifted: !missed && newStart > s.start + 1e-9,
      missed
    }
  })
  return { newArrival, items }
}