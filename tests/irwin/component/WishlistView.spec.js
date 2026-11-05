// @vitest-environment jsdom
/* WishlistView.spec.js — COMPONENT test (by Irwin)

 WHAT:  src/components/WishlistView.vue — the shared wishlist: saved places, the Indoor / Outdoor filter,
        removing a place, and "Add a tour" (a tour or activity someone booked, with its booking link).
        Network (popular places, city centres, photos) is faked so nothing leaves the test.
 WHY:   The wishlist is what the group votes on and plans from. A tour with a broken booking link, a tour
        dropped into the wrong day, or the filter hiding the wrong places all mislead the whole group.

 | Case | User does                                                   | Expected                                              |
 |------|-------------------------------------------------------------|-------------------------------------------------------|
 | H1   | Adds tour "Tea ceremony", link "klook.com/activity/123"      | saved as a tour, link fixed to https://..., no votes  |
 | H2   | Adds a tour with Day 2 + 14:30                               | also put on Day 2 at 14:30, locked                    |
 | H3   | Indoor / Outdoor filter                                     | only indoor / only outdoor places shown               |
 | H4   | Removes a place                                             | gone from the shared wishlist                         |
 | U1   | Tour link "not a link"                                      | error "booking link doesn't look right", not saved    |
 | U2   | Tour with no name                                           | Save is disabled, nothing saved                       |
 | U3   | Tour with a day but no time                                 | saved to the wishlist, but NOT put in the itinerary   |
*/

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('axios', () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }))
vi.mock('../../../src/services/cityCentre.js', () => ({ cityCentre: () => Promise.resolve(null) }))

import { mount, flushPromises } from '@vue/test-utils'
import WishlistView from '../../../src/components/WishlistView.vue'
import { trip } from '../../../src/itineraryStore.js'

async function mountWishlist() {
  const w = mount(WishlistView, {
    props: { destinations: ['Kyoto, Japan'], startDate: '2026-03-01', endDate: '2026-03-03' },
    global: {
      stubs: {
        AppIcon: true, DoodleIcon: true, CustomDropdown: true, PlaceInput: true,
        NotebookModal: { props: ['open'], template: '<div v-if="open"><slot /></div>' } // just show the form
      }
    }
  })
  await flushPromises()
  return w
}
async function openTourForm(w, name, link) {
  await w.findAll('button').find((b) => b.text().includes('Add a tour')).trigger('click')
  await w.get('#wl-tour-name').setValue(name)
  if (link) await w.get('#wl-tour-link').setValue(link)
}
const savedNames = (w) => w.findAll('[data-testid="wishlist"] .wl-name').map((n) => n.text())

beforeEach(() => {
  trip.stops = []
  trip.wishlist = [
    { id: 'w1', name: 'Kyoto National Museum', type: 'museum', outdoor: false, votes: [] },
    { id: 'w2', name: 'Arashiyama Bamboo Grove', type: 'park', outdoor: true, votes: ['Irwin'] }
  ]
})

describe('Component · WishlistView — saved places, Indoor/Outdoor filter, removing, and adding booked tours', () => {

  describe('happy paths', () => {
    it('H1: a booked tour is saved to the wishlist, with "https://" added to its booking link', async () => {
      const w = await mountWishlist()
      await openTourForm(w, 'Tea ceremony', 'klook.com/activity/123')
      await w.get('form[aria-label="Add a tour or activity"]').trigger('submit')

      const tour = trip.wishlist.find((p) => p.name === 'Tea ceremony')
      expect(tour).toMatchObject({ type: 'tour', link: 'https://klook.com/activity/123', votes: [], city: 'Kyoto, Japan' })
      expect(savedNames(w)).toContain('Tea ceremony')
      expect(trip.stops).toHaveLength(0) // no date: not in the itinerary yet
    })

    it('H2: a tour with a day and a start time is also put on that day, locked', async () => {
      const w = await mountWishlist()
      await openTourForm(w, 'Gion night walk')
      w.vm.tour.date = '2026-03-02' // "Day 2" in the day dropdown
      w.vm.tour.time = '14:30'
      await w.get('form[aria-label="Add a tour or activity"]').trigger('submit')

      expect(trip.stops).toHaveLength(1)
      expect(trip.stops[0]).toMatchObject({ name: 'Gion night walk', date: '2026-03-02', hour: 14.5, locked: true })
    })

    it('H3: the Indoor / Outdoor filter shows only the matching places', async () => {
      const w = await mountWishlist()
      const chip = (label) => w.findAll('.wl-chip').find((b) => b.text().includes(label))

      await chip('Indoor').trigger('click')
      expect(savedNames(w)).toEqual(['Kyoto National Museum'])
      await chip('Outdoor').trigger('click')
      expect(savedNames(w)).toEqual(['Arashiyama Bamboo Grove'])
      await chip('All').trigger('click')
      expect(savedNames(w)).toHaveLength(2)
    })

    it('H4: removing a place takes it off the shared wishlist', async () => {
      const w = await mountWishlist()
      await w.get('button[aria-label="Remove Kyoto National Museum from wishlist"]').trigger('click')
      expect(trip.wishlist.map((p) => p.name)).toEqual(['Arashiyama Bamboo Grove'])
      expect(savedNames(w)).toEqual(['Arashiyama Bamboo Grove'])
    })
  })

  describe('unhappy paths', () => {
    it('U1: a booking link that isn\'t a web address is refused with a clear message', async () => {
      const w = await mountWishlist()
      await openTourForm(w, 'Sake tasting', 'not a link')
      await w.get('form[aria-label="Add a tour or activity"]').trigger('submit')

      expect(w.get('[role="alert"]').text()).toBe('That booking link doesn\'t look right. Check it or leave it empty.')
      expect(trip.wishlist.map((p) => p.name)).not.toContain('Sake tasting')
    })

    it('U2: a tour without a name cannot be saved', async () => {
      const w = await mountWishlist()
      await openTourForm(w, '   ')
      expect(w.get('form[aria-label="Add a tour or activity"] button[type="submit"]').attributes('disabled')).toBeDefined()
      await w.get('form[aria-label="Add a tour or activity"]').trigger('submit')
      expect(trip.wishlist).toHaveLength(2)
    })

    it('U3: a tour with a day but no start time goes to the wishlist only, not the itinerary', async () => {
      const w = await mountWishlist()
      await openTourForm(w, 'Kimono rental')
      w.vm.tour.date = '2026-03-02'
      await w.get('form[aria-label="Add a tour or activity"]').trigger('submit')

      expect(trip.wishlist.map((p) => p.name)).toContain('Kimono rental')
      expect(trip.stops).toHaveLength(0)
    })
  })
})
