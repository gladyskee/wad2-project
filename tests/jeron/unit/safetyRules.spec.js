/* safetyRules.spec.js — UNIT test (by Jeron)

 WHAT:  The safety rules in src/services/safetyService.js:
          computeRiskScore()  one 0–100 risk score + label (Low / Moderate / High / Critical) from travel advice,
                              nearby earthquakes and disaster alerts
          openStatus()        is a hospital / police station open right now, from its opening hours
          EMERGENCY_NUMBERS   the numbers to call in each country
 WHY:   This is the safety tab's brain. Understating a real danger (a strong quake shown as "Low"), saying a
        clinic is open when it's closed, or showing the wrong emergency number could actually hurt someone.

 | Case | Input                                                      | Expected                                       |
 |------|------------------------------------------------------------|------------------------------------------------|
 | H1   | Nothing happening, normal travel advice (level 1)           | 0, Low, clear                                  |
 | H2   | Advice level 3 / level 4 / any Red disaster alert           | at least High / Critical / High                |
 | H3   | M7.2 quake 50 km away 1 h ago; tsunami flag                 | Critical (75+)                                 |
 | H4   | "Mo-Fr 09:00-18:00" on Wed 10:00 / Wed 19:00 / Sat; "24/7"  | open until 18:00 / closed / closed today / open|
 | H5   | Japan / Singapore / unknown country                         | 110 + 119 / 999 + 995 / 112 fallback           |
 | U1   | Old or far quakes (4 days ago; 400 km away)                 | add nothing — Low                              |
 | U2   | Lots of alerts at once                                      | score is capped at 100                         |
 | U3   | No hours / odd hours text ("sunrise-sunset")                | "Hours not listed" / unknown (null), no crash  |
 | U4   | Overnight hours "20:00-02:00" at 01:00                      | open (crosses midnight) — KNOWN BUG, see test  |
*/

import { describe, it, expect } from 'vitest'
import { computeRiskScore, openStatus, EMERGENCY_NUMBERS } from '../../../src/services/safetyService.js'

const hoursAgo = (h) => new Date(Date.now() - h * 3600000)
const quake = (magnitude, distanceKm, ago, tsunami = false) => ({ magnitude, distanceKm, time: hoursAgo(ago), tsunami })
const at = (day, hh, mm = 0) => new Date(2026, 2, day, hh, mm) // March 2026: 4 = Wed, 7 = Sat

describe('Unit · safety rules — risk score and label, "open now" for help nearby, emergency numbers', () => {

  describe('happy paths', () => {
    it('H1: nothing happening and normal travel advice is Low risk', () => {
      expect(computeRiskScore({ advisory: { level: 1 } })).toEqual({ score: 0, label: 'Low', state: 'clear' })
      expect(computeRiskScore({})).toEqual({ score: 0, label: 'Low', state: 'clear' })
    })

    it('H2: official warnings set a minimum: advice level 3 → High, level 4 → Critical, Red alert → High', () => {
      expect(computeRiskScore({ advisory: { level: 3 } }).label).toBe('High')
      expect(computeRiskScore({ advisory: { level: 4 } }).label).toBe('Critical')
      expect(computeRiskScore({ disasters: [{ alertLevel: 'Red' }] }).label).toBe('High')
      expect(computeRiskScore({ disasters: [{ alertLevel: 'Orange' }] }).label).toBe('Moderate')
    })

    it('H3: a major quake nearby, or any recent tsunami warning, is Critical', () => {
      expect(computeRiskScore({ quakes: [quake(7.2, 50, 1)] })).toMatchObject({ label: 'Critical', state: 'critical' })
      expect(computeRiskScore({ quakes: [quake(5, 250, 2, true)] }).label).toBe('Critical')
      expect(computeRiskScore({ quakes: [quake(6.2, 40, 3)] }).label).toBe('High')
    })

    it('H4: opening hours: open with closing time, closed with next opening, closed on days off, 24/7', () => {
      const weekdays = 'Mo-Fr 09:00-18:00'
      expect(openStatus(weekdays, at(4, 10))).toEqual({ open: true, text: 'Open now · until 18:00' })
      expect(openStatus(weekdays, at(4, 7))).toEqual({ open: false, text: 'Closed now · opens 09:00' })
      expect(openStatus(weekdays, at(4, 19))).toEqual({ open: false, text: 'Closed now' })
      expect(openStatus(weekdays, at(7, 10))).toEqual({ open: false, text: 'Closed today' })
      expect(openStatus('24/7', at(7, 3))).toEqual({ open: true, text: 'Open 24 hours' })
    })

    it('H5: the right emergency numbers per country, and 112 for countries not in the list', () => {
      const numbers = (cc) => (EMERGENCY_NUMBERS[cc] || EMERGENCY_NUMBERS.DEFAULT).map((l) => l.number)
      expect(numbers('JP').slice(0, 2)).toEqual(['110', '119'])
      expect(numbers('SG')).toEqual(['999', '995'])
      expect(numbers('ZZ')).toEqual(['112'])
    })
  })

  describe('unhappy paths', () => {
    it('U1: old or far-away quakes add no risk', () => {
      expect(computeRiskScore({ quakes: [quake(6.5, 50, 96)] }).score).toBe(0)   // 4 days ago
      expect(computeRiskScore({ quakes: [quake(6.5, 400, 1)] }).score).toBe(0)   // 400 km away
      expect(computeRiskScore({ quakes: [quake(2.5, 10, 1)] }).score).toBe(0)    // too small to feel
    })

    it('U2: many alerts at once are capped at 100', () => {
      const r = computeRiskScore({
        advisory: { level: 4 },
        quakes: [quake(8, 5, 0.5), quake(7.5, 10, 1)],
        disasters: [{ alertLevel: 'Red' }, { alertLevel: 'Red' }, { alertLevel: 'Red' }]
      })
      expect(r).toEqual({ score: 100, label: 'Critical', state: 'critical' })
    })

    it('U3: missing or unusual opening hours never crash: "Hours not listed" / unknown', () => {
      expect(openStatus('', at(4, 10))).toEqual({ open: null, text: 'Hours not listed' })
      expect(openStatus(null, at(4, 10))).toEqual({ open: null, text: 'Hours not listed' })
      expect(openStatus('sunrise-sunset', at(4, 10))).toEqual({ open: null, text: 'sunrise-sunset' })
    })

    // KNOWN BUG (found by this test): at 01:00 a "20:00-02:00" place is still open from the night before,
    // but openStatus() only checks today's 20:00 start, so it says "Closed now · opens 20:00".
    // it.fails = this case is EXPECTED to fail until the bug is fixed; once fixed, change it.fails back to it.
    it.fails('U4 (KNOWN BUG): hours past midnight (20:00-02:00) should count as open at 01:00', () => {
      expect(openStatus('20:00-02:00', at(4, 1)).open).toBe(true)
      expect(openStatus('20:00-02:00', at(4, 12)).open).toBe(false)
    })
  })
})
