// @vitest-environment jsdom
/* TripRecap.spec.js — COMPONENT test (by Lam)

 WHAT:  src/components/TripRecap.vue — the Recap tab: the trip's numbers as stamps (days, stops, cities,
        countries, travellers, photos, km between cities) and the "Spent together" receipt.
        The server (axios) is a fake that returns photos, expenses and city coordinates we choose.
 WHY:   The recap is the trip's "final score". Its numbers are worked out in the browser, so a slip
        (counting a JPY bill as SGD, counting Tokyo and Osaka as 2 countries, an off-by-one in days)
        shows the group wrong numbers with no error anywhere.

 | Case | Trip / server data                                         | Expected on screen                               |
 |------|------------------------------------------------------------|--------------------------------------------------|
 | H1   | 1–3 Mar, Tokyo → Osaka → Seoul, 2 travellers, 5 stops,      | 3 Days, 5 Stops planned, 3 Cities, 2 Countries,  |
 |      | 2 photos                                                   | 2 Travellers, 2 Photos                           |
 | H2   | Singapore → Kuala Lumpur coordinates                       | about 316 "km between cities"                    |
 | H3   | Expenses S$100 + S$50.40 + ¥3000 (home currency SGD)       | receipt "S$ 150" + "1 expense in other currencies"|
 | H4   | 1 city, 1 traveller, 1 photo, 1-day trip                   | singular labels: Day, City, Country, Traveller, Photo |
 | U1   | Photos and expenses requests fail (server down)            | Photos shows 0, no receipt, recap still renders  |
 | U2   | No dates, no cities, city lookup fails                     | Days shows "–", no km stamp, no crash            |
 | U3   | All expenses in a foreign currency (nothing in SGD)        | no receipt (S$ 0 would be misleading)            |
*/

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('axios', () => ({ default: { get: vi.fn() } }))

import { mount, flushPromises } from '@vue/test-utils'
import axios from 'axios'
import TripRecap from '../../../src/components/TripRecap.vue'

// Fake server: answers per URL, or fails if the answer is an Error
function fakeServer({ photos = [], expenses = { homeCurrency: 'SGD', items: [] }, cities = [] } = {}) {
  axios.get.mockImplementation((url) => {
    let answer
    if (url.endsWith('/photos')) answer = photos
    else if (url.endsWith('/expenses')) answer = expenses
    else if (url === '/api/discover/cities') answer = cities
    if (answer instanceof Error || answer === undefined) return Promise.reject(answer || new Error('unknown url ' + url))
    return Promise.resolve({ data: answer })
  })
}

async function mountRecap(props = {}) {
  const w = mount(TripRecap, {
    props: { tripId: 't1', name: 'Test trip', phase: 'after', ...props },
    global: { stubs: { TravelMap: true, AppIcon: true } }
  })
  await flushPromises()
  return w
}

// The stamps as { label: value }, e.g. { Days: '3', Cities: '3', ... }
function stamps(w) {
  const out = {}
  for (const li of w.findAll('.tr-stamp')) out[li.get('span').text()] = li.get('b').text()
  return out
}

beforeEach(() => {
  axios.get.mockReset()
})

describe('Component · TripRecap — trip numbers (days, cities, countries, photos, km) and money spent together', () => {

  describe('happy paths', () => {
    it('H1: counts days (inclusive), stops, cities, countries (not cities), travellers and photos', async () => {
      fakeServer({ photos: [{ id: 'p1' }, { id: 'p2' }] })
      const w = await mountRecap({
        startDate: '2026-03-01', endDate: '2026-03-03',
        destinations: ['Tokyo, Japan', 'Osaka, Japan', 'Seoul, South Korea'],
        travellers: ['Lam', 'Irwin'], stopCount: 5
      })
      expect(stamps(w)).toMatchObject({
        Days: '3', 'Stops planned': '5', Cities: '3', Countries: '2', Travellers: '2', Photos: '2'
      })
      expect(w.get('.tr-caption').text()).toBe('Tokyo → Osaka → Seoul')
    })

    it('H2: adds up the straight-line distance between cities in travel order', async () => {
      fakeServer({
        cities: [
          { label: 'Singapore, Singapore', lat: 1.3521, lon: 103.8198 },
          { label: 'Kuala Lumpur, Malaysia', lat: 3.139, lon: 101.6869 }
        ]
      })
      const w = await mountRecap({ destinations: ['Singapore, Singapore', 'Kuala Lumpur, Malaysia'] })
      const km = Number(stamps(w)['km between cities'].replace(/,/g, ''))
      expect(km).toBeGreaterThan(300)
      expect(km).toBeLessThan(330) // real distance ≈ 316 km
    })

    it('H3: "Spent together" totals only home-currency expenses and notes the others separately', async () => {
      fakeServer({
        expenses: {
          homeCurrency: 'SGD',
          items: [
            { amount: 100, currency: 'SGD' },
            { amount: '50.40', currency: 'SGD' }, // amounts may arrive as text
            { amount: 3000, currency: 'JPY' }     // must NOT be added as S$3000
          ]
        }
      })
      const w = await mountRecap()
      expect(w.get('.tr-receipt-total').text()).toBe('S$ 150')
      expect(w.get('.tr-receipt-note').text()).toBe('+ 1 expense in other currencies')
    })

    it('H4: uses singular labels for one of something (1 Day, 1 City, 1 Country, 1 Traveller, 1 Photo)', async () => {
      fakeServer({ photos: [{ id: 'p1' }] })
      const w = await mountRecap({
        startDate: '2026-03-01', endDate: '2026-03-01',
        destinations: ['Tokyo, Japan'], travellers: ['Lam'], stopCount: 1
      })
      expect(stamps(w)).toMatchObject({ Day: '1', Stop: '1', City: '1', Country: '1', Traveller: '1', Photo: '1' })
    })
  })

  describe('unhappy paths', () => {
    it('U1: if photos and expenses cannot be loaded, Photos shows 0 and there is no receipt (no crash)', async () => {
      fakeServer({ photos: new Error('500'), expenses: new Error('500') })
      const w = await mountRecap({ destinations: ['Tokyo, Japan'] })
      expect(stamps(w).Photos).toBe('0')
      expect(w.find('.tr-receipt').exists()).toBe(false)
      expect(w.get('#tr-title').text()).toBe('Test trip')
    })

    it('U2: a trip with no dates and no cities shows "–" for days, no km stamp, and the trip name as caption', async () => {
      fakeServer({ cities: new Error('offline') })
      const w = await mountRecap({ destinations: [] })
      expect(stamps(w).Days).toBe('–')
      expect(stamps(w)).not.toHaveProperty('km between cities')
      expect(w.get('.tr-caption').text()).toBe('Test trip')
    })

    it('U3: with only foreign-currency expenses there is no "S$ 0" receipt', async () => {
      fakeServer({ expenses: { homeCurrency: 'SGD', items: [{ amount: 3000, currency: 'JPY' }] } })
      const w = await mountRecap()
      expect(w.find('.tr-receipt').exists()).toBe(false)
    })
  })
})
