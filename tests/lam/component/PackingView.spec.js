// @vitest-environment jsdom
/* PackingView.spec.js — COMPONENT test (by Lam)

 WHAT:  src/components/PackingView.vue on its own (no server, no router). The server (axios) is a fake,
        so we can make saving succeed or fail on purpose.
 WHY:   This is where a traveller actually packs: ticks, amounts, own items, removed items, saving.
        Bugs here are invisible to the unit test (e.g. progress counting the wrong items, a save that
        silently fails, quantity going to 0) but they lose people's packing progress.

 | Case | User does                                          | Expected on screen / sent to server                      |
 |------|----------------------------------------------------|----------------------------------------------------------|
 | H1   | Ticks "Passport", then unticks it                  | progress "1 of N packed" → back to "0 of N packed"       |
 | H2   | Types "Travel pillow" in Other and presses Add     | item shows under Other as "Added by you"; N goes up by 1 |
 | H3   | Removes "Passport", then "Bring back 1 removed"    | Passport gone and N − 1; then back again                 |
 | H4   | Ticks an item and waits                            | ONE PUT /api/trips/t1/packing with the tick; "Saved ✓"   |
 | U1   | Tries to add a blank / spaces-only item            | Add button disabled; submitting adds nothing             |
 | U2   | Presses − on an item with amount 1                 | − is disabled; amount stays 1 (never 0)                  |
 | U3   | Server rejects the save                            | the server's message is shown, not "Saved ✓"             |
 | U4   | Ticks an item on the demo trip ("seoul")           | nothing is sent to the server                            |
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('axios', () => ({ default: { put: vi.fn() } }))

import { mount } from '@vue/test-utils'
import axios from 'axios'
import PackingView from '../../../src/components/PackingView.vue'

// A trip with details already chosen, so the list shows straight away (not the "Tell us about your trip" form)
function mountPacking(props = {}) {
  return mount(PackingView, {
    props: { tripId: 't1', days: 3, activities: ['sightseeing'], weather: ['mild'], extras: [], ...props },
    global: { stubs: { AppIcon: true, DoodleIcon: true } }
  })
}
const progress = (w) => w.get('[data-testid="packing-progress"]').text()
const total = (w) => Number(progress(w).match(/of (\d+) packed/)[1])
const row = (w, name) => w.findAll('.pk-item').find((li) => li.find('.pk-name').text().startsWith(name))
const otherSection = (w) => w.get('[aria-labelledby="pk-cat-other"]')

beforeEach(() => {
  vi.useFakeTimers()
  axios.put.mockReset()
  axios.put.mockResolvedValue({ data: { ok: true } })
})
afterEach(() => vi.useRealTimers())

describe('Component · PackingView — tick items, change amounts, add/remove your own items, save progress', () => {

  describe('happy paths', () => {
    it('H1: ticking an item updates the packed count, unticking puts it back', async () => {
      const w = mountPacking()
      const n = total(w)
      expect(progress(w)).toBe('0 of ' + n + ' packed')

      await row(w, 'Passport').get('input[type="checkbox"]').setValue(true)
      expect(progress(w)).toBe('1 of ' + n + ' packed')
      expect(row(w, 'Passport').classes()).toContain('packed')

      await row(w, 'Passport').get('input[type="checkbox"]').setValue(false)
      expect(progress(w)).toBe('0 of ' + n + ' packed')
    })

    it('H2: adding your own item puts it under "Other" marked "Added by you" and counts it', async () => {
      const w = mountPacking()
      const n = total(w)

      await otherSection(w).get('input.pk-add-input').setValue('  Travel pillow  ')
      await otherSection(w).get('form').trigger('submit')

      const mine = row(w, 'Travel pillow')
      expect(mine, 'Travel pillow should be listed').toBeTruthy()
      expect(mine.text()).toContain('Added by you')
      expect(total(w)).toBe(n + 1)
      expect(otherSection(w).get('input.pk-add-input').element.value).toBe('') // input cleared for the next one
    })

    it('H3: removing a suggested item hides it; "Bring back" restores it', async () => {
      const w = mountPacking()
      const n = total(w)

      await row(w, 'Passport').get('button[aria-label="Remove Passport"]').trigger('click')
      expect(row(w, 'Passport')).toBeUndefined()
      expect(total(w)).toBe(n - 1)

      const bringBack = w.findAll('button').find((b) => b.text().includes('Bring back 1 removed item'))
      await bringBack.trigger('click')
      expect(row(w, 'Passport')).toBeTruthy()
      expect(total(w)).toBe(n)
    })

    it('H4: changes are saved once, after a short pause, to MY packing list on this trip', async () => {
      const w = mountPacking()
      await row(w, 'Passport').get('input[type="checkbox"]').setValue(true)
      await row(w, 'Underwear').get('input[type="checkbox"]').setValue(true)
      expect(w.get('[role="status"]').text()).toBe('Saving…')

      await vi.advanceTimersByTimeAsync(700)
      expect(axios.put).toHaveBeenCalledTimes(1) // two quick ticks = one save, not two
      const [url, body] = axios.put.mock.calls[0]
      expect(url).toBe('/api/trips/t1/packing')
      expect(body.packing.checked).toEqual({ passport: true, underwear: true })
      expect(body.activities).toEqual(['sightseeing'])
      expect(w.get('[role="status"]').text()).toBe('Saved ✓')
    })
  })

  describe('unhappy paths', () => {
    it('U1: a blank or spaces-only item cannot be added', async () => {
      const w = mountPacking()
      const n = total(w)
      const input = otherSection(w).get('input.pk-add-input')
      const addBtn = otherSection(w).get('button.pk-add-btn')

      expect(addBtn.attributes('disabled')).toBeDefined()
      await input.setValue('    ')
      expect(addBtn.attributes('disabled')).toBeDefined()
      await otherSection(w).get('form').trigger('submit') // e.g. pressing Enter anyway
      expect(total(w)).toBe(n)
    })

    it('U2: an amount can never go below 1 (the − button is disabled at 1)', async () => {
      const w = mountPacking()
      const minus = row(w, 'Passport').get('button[aria-label="Fewer Passport"]')
      expect(row(w, 'Passport').get('.pk-qty span').text()).toBe('1')
      expect(minus.attributes('disabled')).toBeDefined()

      // and + then − goes 1 → 2 → 1
      await row(w, 'Passport').get('button[aria-label="More Passport"]').trigger('click')
      expect(row(w, 'Passport').get('.pk-qty span').text()).toBe('2')
      await row(w, 'Passport').get('button[aria-label="Fewer Passport"]').trigger('click')
      expect(row(w, 'Passport').get('.pk-qty span').text()).toBe('1')
    })

    it('U3: when the server rejects the save, its message is shown (the user is not told "Saved")', async () => {
      axios.put.mockRejectedValue({ response: { data: { message: 'Some packing details are invalid.' } } })
      const w = mountPacking()
      await row(w, 'Passport').get('input[type="checkbox"]').setValue(true)
      await vi.advanceTimersByTimeAsync(700)

      expect(w.get('[role="status"]').text()).toBe('Some packing details are invalid.')

      // no message from the server (e.g. offline) → a generic one
      axios.put.mockRejectedValue(new Error('Network Error'))
      await row(w, 'Underwear').get('input[type="checkbox"]').setValue(true)
      await vi.advanceTimersByTimeAsync(700)
      expect(w.get('[role="status"]').text()).toBe('Could not save. Check your connection.')
    })

    it('U4: the demo trip ("seoul") is never saved to the server', async () => {
      const w = mountPacking({ tripId: 'seoul' })
      await row(w, 'Passport').get('input[type="checkbox"]').setValue(true)
      await vi.advanceTimersByTimeAsync(700)
      expect(axios.put).not.toHaveBeenCalled()
    })
  })
})
