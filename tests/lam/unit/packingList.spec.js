/* packingList.spec.js — UNIT test (by Lam)

 WHAT:  buildPackingList(trip) in src/packingList.js — the rules that turn a trip's length, weather,
        activities and extras into the suggested packing list (name, category, quantity, reason).
 WHY:   Every number on the Packing tab comes from these rules. A wrong rule doesn't crash anything,
        it just quietly tells people to pack 30 T-shirts, or forget their swimwear — so we pin the rules down.

 | Case | Input                                             | Expected                                              |
 |------|---------------------------------------------------|-------------------------------------------------------|
 | H1   | 5 days, no extras                                 | 5 tops / underwear / socks, 2 pants, essentials x1    |
 | H2   | 14 days; with laundry / carry-on / neither        | daily clothes capped at 4 / 5 / 10                    |
 | H3   | Hot + beach (both suggest sunscreen & sunglasses) | each item listed once, not twice                      |
 | H4   | Cold weather + snow (both suggest thermals)       | one "Thermal innerwear" with the BIGGER amount        |
 | H5   | Every activity, weather and extra at once         | every item has a known category and a unique id       |
 | U1   | days missing / not a number                       | treated as a 3-day trip, no crash                     |
 | U2   | days negative, 1000, 4.7 (and 0)                  | clamped to 1..30, rounded down; 0 = unknown → 3 days  |
 | U3   | unknown activity keys, missing lists              | ignored; only the always-packed basics                |
 | U4   | outdoor stops but cold weather                    | NO sunscreen (it's only added for warm outdoor trips) |
*/

import { describe, it, expect } from 'vitest'
import { buildPackingList, CATEGORIES } from '../../../src/packingList.js'

// Find one item by its name (fails clearly if it's missing)
function item(list, name) {
  const found = list.find((it) => it.name === name)
  if (!found) throw new Error('Expected "' + name + '" in the list, got: ' + list.map((it) => it.name).join(', '))
  return found
}
const names = (list) => list.map((it) => it.name)

describe('Unit · buildPackingList — suggested packing items from trip length, weather, activities and extras', () => {

  describe('happy paths', () => {
    it('H1: a 5-day trip gets one top/underwear/socks per day, 1 pants per 3 days, and the essentials once', () => {
      const list = buildPackingList({ days: 5 })
      expect(item(list, 'T-shirts / tops').qty).toBe(5)
      expect(item(list, 'Underwear').qty).toBe(5)
      expect(item(list, 'Socks (pairs)').qty).toBe(5)
      expect(item(list, 'Pants / shorts').qty).toBe(2) // ceil(5 / 3)
      expect(item(list, 'Passport').qty).toBe(1)
      expect(item(list, 'Passport').category).toBe('docs')
    })

    it('H2: on a 14-day trip daily clothes are capped at 4 with laundry, 5 with carry-on only, 10 otherwise', () => {
      const tops = (extras) => item(buildPackingList({ days: 14, extras }), 'T-shirts / tops').qty
      expect(tops(['laundry'])).toBe(4)
      expect(tops(['carryon'])).toBe(5)
      expect(tops([])).toBe(10)
      // laundry wins when both are ticked (you can wash, so you need the fewest)
      expect(tops(['laundry', 'carryon'])).toBe(4)
    })

    it('H3: an item suggested for two reasons (hot weather AND beach) is listed only once', () => {
      const list = buildPackingList({ days: 3, weather: ['hot'], activities: ['beach'] })
      expect(names(list).filter((n) => n === 'Sunscreen')).toHaveLength(1)
      expect(names(list).filter((n) => n === 'Sunglasses')).toHaveLength(1)
      expect(item(list, 'Swimwear').qty).toBe(2)
    })

    it('H4: when two reasons suggest different amounts (cold vs snow thermals), the bigger amount is kept', () => {
      // 2 days: cold weather wants max(1, ceil(2/2)) = 1 thermal, snow wants max(2, 1) = 2
      const list = buildPackingList({ days: 2, weather: ['cold'], activities: ['snow'] })
      expect(names(list).filter((n) => n === 'Thermal innerwear')).toHaveLength(1)
      expect(item(list, 'Thermal innerwear').qty).toBe(2)
    })

    it('H5: with every option ticked, every item has a known category and a unique id (else the UI drops it)', () => {
      const list = buildPackingList({
        days: 7,
        activities: ['sightseeing', 'food', 'shopping', 'beach', 'hiking', 'snow', 'themepark', 'nightlife', 'business', 'camping'],
        weather: ['hot', 'mild', 'cold', 'rain'],
        extras: ['laundry', 'carryon', 'kids', 'flight'],
        outdoor: true
      })
      const categoryKeys = CATEGORIES.map((c) => c.key)
      for (const it of list) {
        expect(categoryKeys, it.name + ' has unknown category "' + it.category + '"').toContain(it.category)
        expect(it.qty, it.name + ' quantity').toBeGreaterThanOrEqual(1)
      }
      const ids = list.map((it) => it.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe('unhappy paths (bad or missing input)', () => {
    it('U1: missing or non-numeric days fall back to a 3-day trip instead of crashing', () => {
      for (const days of [undefined, null, '', 'abc', NaN]) {
        expect(item(buildPackingList({ days }), 'T-shirts / tops').qty, 'days = ' + String(days)).toBe(3)
      }
    })

    it('U2: days are clamped to 1..30 and rounded down (-4 → 1, 4.7 → 4, 1000 → 30 → max 10 tops; 0 = unknown → 3)', () => {
      const tops = (days) => item(buildPackingList({ days }), 'T-shirts / tops').qty
      expect(tops(0)).toBe(3) // 0 days means "not set yet", same as missing
      expect(tops(-4)).toBe(1)
      expect(tops(4.7)).toBe(4)
      expect(tops(1000)).toBe(10)
      expect(item(buildPackingList({ days: 1000, activities: ['hiking'] }), 'Quick-dry activewear').qty).toBe(10) // ceil(30 / 3)
    })

    it('U3: unknown activity keys and missing lists are ignored — only the always-packed basics remain', () => {
      const basics = names(buildPackingList({ days: 3 }))
      const withJunk = names(buildPackingList({ days: 3, activities: ['skydiving', 42, null], weather: undefined, extras: null }))
      expect(withJunk).toEqual(basics)
      expect(withJunk).not.toContain('Sunscreen')
    })

    it('U4: outdoor stops add sunscreen only when it is NOT cold', () => {
      expect(names(buildPackingList({ days: 3, outdoor: true }))).toContain('Sunscreen')
      expect(names(buildPackingList({ days: 3, outdoor: true, weather: ['cold'] }))).not.toContain('Sunscreen')
    })
  })
})
