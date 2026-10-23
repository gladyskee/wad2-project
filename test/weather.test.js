// Adaptive packing: the weather to pack for comes from the forecast (or the usual weather that month)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { packingWeather, simulatedForecast } from '../src/services/weatherService.js'

test('a hot, rainy forecast -> pack for hot and rain', () => {
  const blocks = [
    { date: '2026-12-01', temp: 31, rain: false, pop: 0.1 },
    { date: '2026-12-01', temp: 29, rain: true, pop: 0.8 }
  ]
  assert.deepEqual(packingWeather({ blocks, dates: ['2026-12-01'] }), ['hot', 'rain'])
})

test('days past the forecast use the usual weather for that month', () => {
  const temp = new Array(12).fill(20)
  temp[11] = 4 // December
  const climate = [{ temp, rain: new Array(12).fill(2) }]
  assert.deepEqual(packingWeather({ climate, dates: ['2026-12-20'] }), ['cold'])
})

test('blocks for other dates are ignored', () => {
  const blocks = [{ date: '2026-11-01', temp: 35, rain: true }]
  assert.deepEqual(packingWeather({ blocks, dates: ['2026-12-01'] }), [])
})

test('the demo weather still covers every trip day it knows', () => {
  const days = simulatedForecast(['2026-12-01', '2026-12-02'])
  assert.ok(days.some((b) => b.date === '2026-12-02'))
  assert.ok(days.every((b) => b.simulated))
})
