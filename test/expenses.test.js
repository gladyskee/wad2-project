// Expenses: balances stay right when the trip's currency changes
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { balances, toHome } from '../src/expenses.js'

const dinner = { amount: 30, currency: 'SGD', paidBy: 'Amy', splitType: 'equal', people: ['Amy', 'Ben', 'Cat'], exact: {} }
const rates = { SGD: 1, JPY: 110 } // 1 SGD = 110 JPY

test('Ben paid Amy back in SGD: he is settled', () => {
  const paidBack = [{ from: 'Ben', to: 'Amy', amount: 10, currency: 'SGD' }]
  assert.equal(balances(['Amy', 'Ben', 'Cat'], [dinner], paidBack, rates, 'SGD').Ben, 0)
})

test('after switching the trip to JPY, Ben is still settled', () => {
  const paidBack = [{ from: 'Ben', to: 'Amy', amount: 10, currency: 'SGD' }]
  const jpyRates = { JPY: 1, SGD: 1 / 110 } // rates are now per 1 JPY
  const b = balances(['Amy', 'Ben', 'Cat'], [dinner], paidBack, jpyRates, 'JPY')
  assert.ok(Math.abs(b.Ben) < 0.001)
  assert.ok(Math.abs(b.Cat + 1100) < 0.001) // Cat still owes 10 SGD = 1100 JPY
})

test('older payments without a currency count as the trip currency', () => {
  const paidBack = [{ from: 'Ben', to: 'Amy', amount: 10 }]
  assert.equal(balances(['Amy', 'Ben', 'Cat'], [dinner], paidBack, rates, 'SGD').Ben, 0)
})

test('a budget set in SGD converts to JPY', () => {
  assert.equal(toHome(500, 'SGD', { SGD: 1 / 110 }, 'JPY'), 55000)
})
