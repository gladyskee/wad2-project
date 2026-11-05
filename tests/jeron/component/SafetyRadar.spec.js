// @vitest-environment jsdom
/* SafetyRadar.spec.js — COMPONENT test (by Jeron)

 WHAT:  src/components/SafetyRadar.vue — the "Help nearby" radar: hospitals, police, embassies... drawn by
        distance and compass direction from where you're staying, with a map key to hide / show each kind.
 WHY:   In an emergency people read this at a glance. A police station drawn on the wrong side, a hospital
        10 km away shown as "nearby", or the counts in the key not matching the dots would send people
        the wrong way.

 | Case | Places given (centre: Kyoto Station)                        | Expected                                          |
 |------|-------------------------------------------------------------|---------------------------------------------------|
 | H1   | Police 1 km north, hospital 2 km east                        | "Police: … 1.0 km N", "Hospitals: … 2.0 km E";    |
 |      |                                                             | police dot above the centre, hospital to the right |
 | H2   | Map key counts                                              | Police 1, Hospitals 1, others 0; summary text     |
 | H3   | Tap "Police" in the map key                                 | police dot hidden, button not pressed; tap again = back |
 | U1   | A hospital 10 km away (radar is 3 km)                       | not drawn, not counted                            |
 | U2   | A place with no coordinates                                 | skipped, no crash                                 |
 | U3   | Nothing nearby                                              | summary says "nothing found"                      |
*/

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SafetyRadar from '../../../src/components/SafetyRadar.vue'

const CENTRE = { lat: 34.9858, lon: 135.7588 } // Kyoto Station
const KM_LAT = 1 / 111.2 // 1 km in degrees of latitude
const KM_LON = 1 / (111.32 * Math.cos(CENTRE.lat * Math.PI / 180)) // 1 km in degrees of longitude here

const POLICE_1KM_N = { id: 'p1', kind: 'police', name: 'Shichijo Koban', lat: CENTRE.lat + KM_LAT, lon: CENTRE.lon }
const HOSPITAL_2KM_E = { id: 'h1', kind: 'hospital', name: 'Kyoto City Hospital', lat: CENTRE.lat, lon: CENTRE.lon + 2 * KM_LON }

function mountRadar(places) {
  return mount(SafetyRadar, { props: { center: CENTRE, centerLabel: 'Kyoto Station', places, radiusKm: 3 } })
}
const point = (w, startsWith) => w.findAll('g.sr-pt').find((g) => g.attributes('aria-label').startsWith(startsWith))
const keyChip = (w, label) => w.findAll('.sr-chip').find((b) => b.text().includes(label))

describe('Component · SafetyRadar — help nearby drawn by distance and direction, with a map key', () => {

  describe('happy paths', () => {
    it('H1: each place is labelled with its distance and compass direction, and drawn on the right side', () => {
      const w = mountRadar([POLICE_1KM_N, HOSPITAL_2KM_E])
      expect(point(w, 'Police').attributes('aria-label')).toBe('Police: Shichijo Koban, 1.0 km N')
      expect(point(w, 'Hospitals').attributes('aria-label')).toBe('Hospitals: Kyoto City Hospital, 2.0 km E')

      const dot = (g) => ({ x: Number(g.get('circle.sr-dot').attributes('cx')), y: Number(g.get('circle.sr-dot').attributes('cy')) })
      const C = 160 // centre of the 320px radar
      expect(dot(point(w, 'Police')).y).toBeLessThan(C)       // north = up
      expect(Math.abs(dot(point(w, 'Police')).x - C)).toBeLessThan(1)
      expect(dot(point(w, 'Hospitals')).x).toBeGreaterThan(C) // east = right
    })

    it('H2: the map key counts each kind, and the radar has a spoken summary', () => {
      const w = mountRadar([POLICE_1KM_N, HOSPITAL_2KM_E])
      expect(keyChip(w, 'Police').get('.sr-n').text()).toBe('1')
      expect(keyChip(w, 'Hospitals').get('.sr-n').text()).toBe('1')
      expect(keyChip(w, 'Embassy').get('.sr-n').text()).toBe('0')
      expect(w.get('svg').attributes('aria-label')).toBe('Radar of help within 3 km of Kyoto Station: 1 hospitals, 1 police')
    })

    it('H3: tapping a kind in the map key hides those places, tapping again shows them', async () => {
      const w = mountRadar([POLICE_1KM_N, HOSPITAL_2KM_E])
      await keyChip(w, 'Police').trigger('click')
      expect(keyChip(w, 'Police').attributes('aria-pressed')).toBe('false')
      expect(point(w, 'Police')).toBeUndefined()
      expect(point(w, 'Hospitals')).toBeTruthy()

      await keyChip(w, 'Police').trigger('click')
      expect(point(w, 'Police')).toBeTruthy()
    })
  })

  describe('unhappy paths', () => {
    it('U1: a place outside the radar\'s range (10 km away, range 3 km) is not drawn or counted', () => {
      const far = { id: 'h2', kind: 'hospital', name: 'Far Hospital', lat: CENTRE.lat + 10 * KM_LAT, lon: CENTRE.lon }
      const w = mountRadar([POLICE_1KM_N, far])
      expect(point(w, 'Hospitals')).toBeUndefined()
      expect(keyChip(w, 'Hospitals').get('.sr-n').text()).toBe('0')
    })

    it('U2: a place without coordinates is skipped without breaking the radar', () => {
      const noCoords = { id: 'x', kind: 'police', name: 'Unknown Koban', lat: null, lon: null }
      const w = mountRadar([noCoords, HOSPITAL_2KM_E])
      expect(keyChip(w, 'Police').get('.sr-n').text()).toBe('0')
      expect(point(w, 'Hospitals')).toBeTruthy()
    })

    it('U3: with nothing nearby, the summary says "nothing found"', () => {
      const w = mountRadar([])
      expect(w.get('svg').attributes('aria-label')).toBe('Radar of help within 3 km of Kyoto Station: nothing found')
      expect(w.findAll('g.sr-pt')).toHaveLength(0)
    })
  })
})
