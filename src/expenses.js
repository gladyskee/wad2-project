// Expenses & Split: the maths, kept out of the page so it is easy to test.
//
// expense    = { id, title, amount, currency, category, paidBy, date: 'YYYY-MM-DD',
//                splitType: 'equal' | 'exact', people: ['Sarah', 'Amy'], exact: { Sarah: 30, Amy: 20 } }
// settlement = { id, from, to, amount, currency, date }   (currency = the home currency when it was paid; older ones have none)
// rates      = { SGD: 1, KRW: 1030.5, ... }      (units of each currency per 1 home currency)

// Category colours: categorical slots 1-6 in fixed order (validated for colour-blind separation)
export const CATEGORIES = [
  { key: 'food', icon: '🍜', label: 'Food & drink', color: '#2a78d6' },
  { key: 'stay', icon: '🏨', label: 'Stay', color: '#eb6834' },
  { key: 'transport', icon: '🚆', label: 'Transport', color: '#1baf7a' },
  { key: 'activities', icon: '🎟', label: 'Activities', color: '#eda100' },
  { key: 'shopping', icon: '🛍', label: 'Shopping', color: '#e87ba4' },
  { key: 'other', icon: '🧾', label: 'Other', color: '#008300' }
]

// Currencies the rates service supports (European Central Bank list)
export const CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'JPY', 'KRW', 'CNY', 'HKD', 'THB', 'MYR', 'IDR', 'PHP', 'INR', 'AUD', 'NZD', 'CAD', 'CHF', 'TRY']

export function categoryOf(key) {
  for (const c of CATEGORIES) {
    if (c.key === key) return c
  }
  return CATEGORIES[CATEGORIES.length - 1]
}

// 1234.5 -> "SGD 1,234.50"  (no decimals for currencies like KRW and JPY)
export function money(amount, currency) {
  const noCents = ['JPY', 'KRW', 'IDR'].includes(currency)
  const text = Math.abs(amount).toLocaleString('en-SG', {
    minimumFractionDigits: noCents ? 0 : 2,
    maximumFractionDigits: noCents ? 0 : 2
  })
  return (amount < 0 ? '−' : '') + currency + ' ' + text
}

// Amount in the home currency, or null when there's no rate for that currency yet
// (never guess 1:1: 54,000 won is not 54,000 dollars)
export function toHome(amount, currency, rates, home) {
  if (home && currency === home) return amount
  const rate = rates && rates[currency]
  return rate ? amount / rate : null
}

// How much each person owes for one expense, in the expense's own currency
export function sharesOf(expense) {
  const shares = {}
  if (expense.splitType === 'exact') {
    for (const name in expense.exact || {}) {
      if (expense.exact[name] > 0) shares[name] = expense.exact[name]
    }
    return shares
  }
  const people = expense.people || []
  if (!people.length) return shares
  const each = expense.amount / people.length
  for (const name of people) shares[name] = each
  return shares
}

// Net balance per person in the home currency: + means others owe them, - means they owe
// (expenses in a currency with no rate yet are left out until a rate is known)
export function balances(travellers, expenses, settlements, rates, home) {
  const result = {}
  for (const name of travellers) result[name] = 0
  for (const e of expenses) {
    const paid = toHome(e.amount, e.currency, rates, home)
    if (paid === null) continue
    if (result[e.paidBy] === undefined) result[e.paidBy] = 0
    result[e.paidBy] += paid
    const shares = sharesOf(e)
    for (const name in shares) {
      if (result[name] === undefined) result[name] = 0
      result[name] -= toHome(shares[name], e.currency, rates, home)
    }
  }
  for (const s of settlements) {
    const amount = toHome(s.amount, s.currency || home, rates, home)
    if (amount === null) continue
    if (result[s.from] !== undefined) result[s.from] += amount
    if (result[s.to] !== undefined) result[s.to] -= amount
  }
  return result
}

// The fewest payments that clear everyone's balance:
// the person who owes the most pays the person owed the most, and repeat.
export function settleUp(balanceMap) {
  const owe = []
  const owed = []
  for (const name in balanceMap) {
    const b = Math.round(balanceMap[name] * 100) / 100
    if (b < -0.009) owe.push({ name, left: -b })
    if (b > 0.009) owed.push({ name, left: b })
  }
  owe.sort((a, b) => b.left - a.left)
  owed.sort((a, b) => b.left - a.left)

  const payments = []
  let i = 0
  let j = 0
  while (i < owe.length && j < owed.length) {
    const amount = Math.min(owe[i].left, owed[j].left)
    payments.push({ from: owe[i].name, to: owed[j].name, amount: Math.round(amount * 100) / 100 })
    owe[i].left -= amount
    owed[j].left -= amount
    if (owe[i].left < 0.01) i++
    if (owed[j].left < 0.01) j++
  }
  return payments
}

// Example data for the Seoul demo trip
export function demoExpenses() {
  return {
    homeCurrency: 'SGD',
    budget: 1500,
    items: [
      { id: 'd1', title: 'Myeongdong dinner', amount: 90000, currency: 'KRW', category: 'food', paidBy: 'Sarah', date: '2026-10-12', splitType: 'equal', people: ['Sarah', 'John', 'Amy'], exact: {} },
      { id: 'd2', title: 'Hotel Gracery (2 nights)', amount: 420, currency: 'SGD', category: 'stay', paidBy: 'John', date: '2026-10-12', splitType: 'equal', people: ['Sarah', 'John', 'Amy'], exact: {} },
      { id: 'd3', title: 'T-money cards', amount: 30000, currency: 'KRW', category: 'transport', paidBy: 'Amy', date: '2026-10-13', splitType: 'equal', people: ['Sarah', 'John', 'Amy'], exact: {} },
      { id: 'd4', title: 'Lotte World tickets', amount: 186000, currency: 'KRW', category: 'activities', paidBy: 'Sarah', date: '2026-10-13', splitType: 'exact', people: [], exact: { Sarah: 62000, John: 62000, Amy: 62000 } },
      { id: 'd5', title: 'Olive Young haul', amount: 54000, currency: 'KRW', category: 'shopping', paidBy: 'Amy', date: '2026-10-14', splitType: 'exact', people: [], exact: { Amy: 54000 } },
      { id: 'd6', title: 'Korean BBQ', amount: 120000, currency: 'KRW', category: 'food', paidBy: 'John', date: '2026-10-14', splitType: 'equal', people: ['Sarah', 'John', 'Amy'], exact: {} }
    ],
    settlements: []
  }
}

// Currency codes with their names, for dropdowns: { value: 'JPY', label: 'JPY', description: 'Japanese Yen' }
export function currencyOptions() {
  let names = null
  try {
    names = new Intl.DisplayNames(['en'], { type: 'currency' })
  } catch (err) {
    names = null
  }
  const list = []
  for (const c of CURRENCIES) {
    list.push({ value: c, label: c, description: names ? names.of(c) : '' })
  }
  return list
}
