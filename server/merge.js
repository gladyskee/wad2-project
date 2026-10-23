// Merging two people's changes to the same trip.
// "base" = the list as this person last loaded it, "mine" = what they are saving now,
// "latest" = what is in the database now (someone else may have saved in between).
// Only what THIS person changed since base is applied on top of latest, so nobody's changes get lost.

// Packing progress: { checked: {}, qty: {}, removed: [], custom: [{ id, name, qty }] }
export function mergePacking(latest, base, mine) {
  const out = { checked: { ...latest.checked }, qty: { ...latest.qty }, removed: latest.removed.slice(), custom: latest.custom.slice() }
  for (const field of ['checked', 'qty']) {
    const keys = new Set(Object.keys(base[field]).concat(Object.keys(mine[field])))
    for (const k of keys) {
      if (base[field][k] === mine[field][k]) continue // I didn't touch it
      if (mine[field][k] === undefined) delete out[field][k]
      else out[field][k] = mine[field][k]
    }
  }
  for (const id of mine.removed) if (!base.removed.includes(id) && !out.removed.includes(id)) out.removed.push(id)
  for (const id of base.removed) if (!mine.removed.includes(id)) out.removed = out.removed.filter((x) => x !== id)
  for (const c of mine.custom) {
    const before = base.custom.find((x) => x.id === c.id)
    const i = out.custom.findIndex((x) => x.id === c.id)
    if (!before && i < 0) out.custom.push(c) // I added it
    else if (before && i >= 0 && (before.name !== c.name || before.qty !== c.qty)) out.custom[i] = c // I edited it
  }
  for (const c of base.custom) {
    if (!mine.custom.some((x) => x.id === c.id)) out.custom = out.custom.filter((x) => x.id !== c.id) // I deleted it
  }
  return out
}

// A list of things with an id (wishlist places, photo albums).
// "fields" = what counts as an edit (e.g. ['name', 'icon']); anything else on the item comes from latest.
export function mergeById(latest, base, mine, fields) {
  const out = latest.map((x) => ({ ...x }))
  const same = (a, b) => fields.every((f) => JSON.stringify(a[f] ?? null) === JSON.stringify(b[f] ?? null))
  for (const item of mine) {
    const before = base.find((x) => x.id === item.id)
    const i = out.findIndex((x) => x.id === item.id)
    if (!before && i < 0) out.push(item) // I added it
    else if (before && i >= 0 && !same(before, item)) { // I edited it
      for (const f of fields) out[i][f] = item[f]
    }
  }
  const mineIds = mine.map((x) => x.id)
  return out.filter((x) => !(base.some((b) => b.id === x.id) && !mineIds.includes(x.id))) // I deleted it
}

// Do two stop lists say the same thing? (order doesn't matter)
export function sameStops(a, b) {
  const key = (list) => list.map((s) => [s.id, s.name, s.address, s.date, s.hour, s.duration, !!s.outdoor, !!s.locked].join('|')).sort().join('\n')
  return key(a) === key(b)
}
