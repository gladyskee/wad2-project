<template>
  <div class="xp">
    <!-- ===== Toolbar ===== -->
    <div class="xp-toolbar">
      <div class="xp-select">
        <span>Show totals in</span>
        <CustomDropdown :model-value="state.homeCurrency" :options="currencyOptions" size="sm" header-text="Home currency"
          aria-label="Home currency" @update:model-value="changeCurrency" />
      </div>
      <span v-if="!demo" class="xp-live" title="Changes from everyone on the trip show up here automatically">
        <span class="xp-live-dot" aria-hidden="true"></span> Synced with the group
      </span>
      <!-- Live rates, or the group's own (click to see and change) -->
      <ExchangeRates :home="home" :live="liveRates" :live-date="ratesDate" :live-error="ratesError" :group="state.groupRates"
        :totals="currencyTotals" :me="me" @set="setGroupRate" @reset="resetGroupRate" />
      <button v-if="state.items.length" type="button" class="btn xp-add" @click="openForm(null)" data-testid="expense-add">
        + Add expense <kbd aria-hidden="true">N</kbd>
      </button>
    </div>

    <!-- ===== Empty state ===== -->
    <div v-if="!state.items.length" class="xp-empty">
      <div class="xp-empty-art" aria-hidden="true"><AppIcon name="receipt" :size="40" /></div>
      <h1 class="xp-h">No expenses yet</h1>
      <button type="button" class="btn xp-add" @click="openForm(null)">+ Add the first expense</button>
    </div>

    <template v-else>
      <!-- ===== Summary tiles ===== -->
      <!-- No exchange rate for some currencies: say so, instead of showing wrong totals -->
      <div v-if="unconverted.count" class="xp-warn" role="status">
        <AppIcon name="alert" :size="16" />
        <span>
          {{ unconverted.count }} expense{{ unconverted.count === 1 ? '' : 's' }} in {{ unconverted.codes.join(', ') }}
          {{ unconverted.count === 1 ? 'is' : 'are' }} left out of the totals and balances: there's no exchange rate yet.
          Set one in <strong>Live rates</strong> above, or try again later.
        </span>
      </div>
      <div class="xp-tiles">
        <div class="xp-tile xp-tile-dark">
          <span class="xp-tile-label">Group spent</span>
          <span class="xp-big" data-testid="expense-total">{{ money(total, home) }}</span>
          <template v-if="state.budget">
            <div class="xp-budget" role="progressbar" :aria-valuenow="Math.round(budgetPct)" aria-valuemin="0" aria-valuemax="100" aria-label="Budget used">
              <div class="xp-budget-fill" :class="{ over: budgetPct > 100 }" :style="{ width: Math.min(100, budgetPct) + '%' }"></div>
            </div>
            <span class="xp-tile-sub">
              {{ Math.round(budgetPct) }}% of {{ money(state.budget, home) }} budget
              <button type="button" class="xp-link-light" @click="editBudget">Edit</button>
            </span>
          </template>
          <button v-else type="button" class="xp-link-light mt-2" @click="editBudget">+ Set a budget</button>
          <form v-if="budgetEditing" class="xp-budget-form" @submit.prevent="saveBudget">
            <label for="xp-budget" class="visually-hidden">Budget in {{ home }}</label>
            <input id="xp-budget" ref="budget" v-model.number="budgetInput" type="number" min="0" class="form-control form-control-sm" :placeholder="'Budget in ' + home">
            <button type="submit" class="btn btn-sm xp-mini">Save</button>
          </form>
        </div>

        <div class="xp-tile">
          <span class="xp-tile-label">Your balance</span>
          <span class="xp-big" :class="myBalance > 0.009 ? 'pos' : myBalance < -0.009 ? 'neg' : ''">
            <AppIcon :name="myBalance > 0.009 ? 'arrow-up' : myBalance < -0.009 ? 'arrow-down' : 'check'" :size="22" :stroke="2.6" />
            {{ money(Math.abs(myBalance), home) }}
          </span>
          <span class="xp-tile-sub">{{ myBalance > 0.009 ? 'The group owes you' : myBalance < -0.009 ? 'You owe the group' : "You're all settled" }}</span>
        </div>

        <div class="xp-tile">
          <span class="xp-tile-label">Your share</span>
          <span class="xp-big">{{ money(myShare, home) }}</span>
          <span class="xp-tile-sub">What you've used of the group's spending</span>
        </div>

        <div class="xp-tile">
          <span class="xp-tile-label">Per day</span>
          <span class="xp-big">{{ money(perDay, home) }}</span>
          <span class="xp-tile-sub">Group average over {{ dayCount }} day{{ dayCount === 1 ? '' : 's' }}</span>
        </div>
      </div>

      <div class="xp-grid">
        <!-- ===== Expense feed ===== -->
        <section class="xp-card xp-feed" aria-labelledby="xp-feed-title">
          <div class="xp-card-head">
            <h3 id="xp-feed-title" class="xp-h">Expenses <span class="xp-count">{{ state.items.length }}</span></h3>
            <div class="xp-search">
              <AppIcon name="search" :size="16" />
              <label for="xp-search" class="visually-hidden">Search expenses</label>
              <input id="xp-search" v-model="search" type="search" placeholder="Search">
            </div>
          </div>
          <div class="xp-filters">
            <CustomDropdown v-model="filterCat" :options="categoryOptions" size="sm" header-text="Category" aria-label="Filter by category" />
          </div>

          <p v-if="!feed.length" class="xp-muted text-center py-4 mb-0">Nothing matches. <button type="button" class="xp-link" @click="search = ''; filterCat = ''">Clear filters</button></p>

          <div v-for="day in feed" :key="day.date" class="xp-day">
            <div class="xp-day-head">
              <span><strong>{{ day.label }}</strong> · {{ longDate(day.date) }}</span>
              <span class="xp-num">{{ money(day.total, home) }}</span>
            </div>
            <ul class="xp-list">
              <li v-for="e in day.items" :key="e.id">
                <button type="button" class="xp-row" @click="openForm(e)" :aria-label="'Edit ' + e.title">
                  <span class="xp-icon" :style="{ background: categoryOf(e.category).color + '22' }" aria-hidden="true">{{ categoryOf(e.category).icon }}</span>
                  <span class="xp-row-main">
                    <span class="xp-row-title">{{ e.title }}</span>
                    <span class="xp-row-sub">
                      {{ e.paidBy === me ? 'You' : e.paidBy }} paid · {{ splitText(e) }}
                      <template v-if="e.addedBy && e.addedBy !== me && e.addedBy !== e.paidBy"> · added by {{ e.addedBy }}</template>
                    </span>
                  </span>
                  <span class="xp-row-right">
                    <span class="xp-num xp-row-amount">{{ money(e.amount, e.currency) }}</span>
                    <span v-if="e.unconverted" class="xp-row-conv xp-unconv">not in totals yet (no {{ e.currency }} rate)</span>
                    <span v-else-if="e.currency !== home" class="xp-row-conv xp-num">≈ {{ money(e.home, home) }}</span>
                    <span v-if="!e.unconverted" class="xp-effect" :class="e.effect > 0.009 ? 'pos' : e.effect < -0.009 ? 'neg' : ''">
                      {{ e.effect > 0.009 ? 'you lent ' + money(e.effect, home) : e.effect < -0.009 ? 'you owe ' + money(-e.effect, home) : 'not involved' }}
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </section>

        <div class="xp-side">
          <!-- ===== Balances + settle up ===== -->
          <section class="xp-card" aria-labelledby="xp-bal-title">
            <h3 id="xp-bal-title" class="xp-h">Balances</h3>
            <ul class="xp-bal">
              <li v-for="b in balanceList" :key="b.name" class="xp-bal-row">
                <span class="xp-avatar" aria-hidden="true">{{ b.name.charAt(0).toUpperCase() }}</span>
                <span class="xp-bal-name">{{ b.name }}{{ b.name === me ? ' (you)' : '' }}</span>
                <!-- Diverging bar: left = owes, right = gets back -->
                <span class="xp-bal-track" aria-hidden="true">
                  <span class="xp-bal-mid"></span>
                  <span class="xp-bal-bar" :class="b.amount >= 0 ? 'pos' : 'neg'"
                    :style="{ width: (Math.abs(b.amount) / maxBalance * 50) + '%', [b.amount >= 0 ? 'left' : 'right']: '50%' }"></span>
                </span>
                <span class="xp-bal-amt xp-num" :class="b.amount > 0.009 ? 'pos' : b.amount < -0.009 ? 'neg' : ''">
                  {{ b.amount > 0.009 ? 'gets ' + money(b.amount, home) : b.amount < -0.009 ? 'owes ' + money(-b.amount, home) : 'settled' }}
                </span>
              </li>
            </ul>

            <h4 class="xp-sub-h">Settle up</h4>
            <p v-if="!payments.length" class="xp-muted small mb-0"><AppIcon name="check-circle" :size="15" /> Everyone is square.</p>
            <ul class="xp-pay">
              <li v-for="p in payments" :key="p.from + p.to" class="xp-pay-row">
                <span class="xp-pay-text">
                  <strong>{{ p.from === me ? 'You' : p.from }}</strong> pay{{ p.from === me ? '' : 's' }}
                  <strong>{{ p.to === me ? 'you' : p.to }}</strong>
                  <span class="d-block xp-num xp-pay-amt">{{ money(p.amount, home) }}</span>
                </span>
                <button type="button" class="btn btn-sm xp-mini" @click="markPaid(p)">Mark paid</button>
              </li>
            </ul>
            <details v-if="state.settlements.length" class="xp-history">
              <summary>Payments made ({{ state.settlements.length }})</summary>
              <ul>
                <li v-for="s in state.settlements" :key="s.id">
                  {{ s.from === me ? 'You' : s.from }} paid {{ s.to === me ? 'you' : s.to }} <span class="xp-num">{{ money(s.amount, home) }}</span>
                  <button type="button" class="xp-link" @click="undoPayment(s.id)">Undo</button>
                </li>
              </ul>
            </details>
          </section>

          <!-- ===== Where the money went ===== -->
          <section class="xp-card" aria-labelledby="xp-cat-title">
            <h3 id="xp-cat-title" class="xp-h">Where it went</h3>
            <div class="xp-stack" role="img" :aria-label="categoryAria">
              <span v-for="c in byCategory" :key="c.key" class="xp-stack-seg" :style="{ width: c.pct + '%', background: c.color }"
                @mouseenter="tip = c.label + ': ' + money(c.amount, home)" @mouseleave="tip = ''"></span>
            </div>
            <p class="xp-tip" aria-hidden="true">{{ tip || ' ' }}</p>
            <!-- Legend + table view: the colours always come with a name and a number -->
            <ul class="xp-legend">
              <li v-for="c in byCategory" :key="c.key">
                <button type="button" class="xp-legend-row" :class="{ on: filterCat === c.key }" @click="filterCat = filterCat === c.key ? '' : c.key">
                  <span class="xp-dot" :style="{ background: c.color }" aria-hidden="true"></span>
                  <span class="flex-grow-1 text-start">{{ c.icon }} {{ c.label }}</span>
                  <span class="xp-num">{{ money(c.amount, home) }}</span>
                  <span class="xp-pct xp-num">{{ Math.round(c.pct) }}%</span>
                </button>
              </li>
            </ul>
          </section>

          <!-- ===== Spending per day ===== -->
          <section v-if="days.length > 1" class="xp-card" aria-labelledby="xp-day-title">
            <div class="d-flex justify-content-between align-items-baseline">
              <h3 id="xp-day-title" class="xp-h">Per day</h3>
              <span class="xp-muted small xp-num">{{ hoverDay ? longDate(hoverDay.date) + ' · ' + money(hoverDay.amount, home) : 'Highest ' + money(maxDay, home) }}</span>
            </div>
            <div class="xp-bars">
              <button v-for="d in days" :key="d.date" type="button" class="xp-bar-hit" :class="{ active: hoverDay && hoverDay.date === d.date }"
                :aria-label="longDate(d.date) + ': ' + money(d.amount, home)"
                @mouseenter="hoverDay = d" @focus="hoverDay = d" @mouseleave="hoverDay = null" @blur="hoverDay = null">
                <span class="xp-bar" :class="{ zero: !d.amount }" :style="{ height: d.amount && maxDay ? Math.max(d.amount / maxDay * 100, 4) + '%' : '2px' }"></span>
              </button>
            </div>
            <div class="d-flex justify-content-between xp-muted small mt-1">
              <span>{{ shortDate(days[0].date) }}</span><span>{{ shortDate(days[days.length - 1].date) }}</span>
            </div>
          </section>
        </div>
      </div>

      <p class="xp-muted small text-end mt-2 mb-0" role="status">{{ saveStatus }}</p>
    </template>

    <!-- Teleport: the panel sits above the whole page, including the sticky top bar -->
    <Teleport to="body">
    <ExpenseForm v-if="showForm" :expense="editing" :travellers="travellers" :me="me" :home-currency="home"
      :last-currency="lastCurrency" :rates="rates" :default-date="defaultDate"
      @save="saveExpense" @delete="deleteExpense" @close="showForm = false" />
    </Teleport>

    <!-- What others just changed (shown for a few seconds) -->
    <Teleport to="body">
      <transition-group name="xp-toast" tag="div" class="xp-toasts" aria-live="polite">
        <div v-for="t in toasts" :key="t.id" class="xp-toast">
          <span class="xp-avatar sm" aria-hidden="true">{{ t.who.charAt(0).toUpperCase() }}</span>
          <span>{{ t.text }}</span>
        </div>
      </transition-group>
    </Teleport>
  </div>
</template>

<script>
import axios from 'axios'
import ExpenseForm from './ExpenseForm.vue'
import ExchangeRates from './ExchangeRates.vue'
import CustomDropdown from './CustomDropdown.vue'
import { CATEGORIES, CURRENCIES, currencyOptions, categoryOf, money, toHome, sharesOf, balances, settleUp, demoExpenses } from '../expenses.js'
import AppIcon from './AppIcon.vue'

export default {
  emits: ['changed'],
  components: { AppIcon, ExpenseForm, CustomDropdown, ExchangeRates },
  props: {
    tripId: { type: String, default: '' },
    travellers: { type: Array, default: () => [] },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    initial: { type: Object, default: null }, // saved expenses, or null
    me: { type: String, default: '' }          // my traveller name on this trip
  },

  data() {
    const demo = this.tripId === 'seoul'
    const saved = demo ? demoExpenses() : this.initial || {}
    return {
      CATEGORIES,
      CURRENCIES,
      currencyOptions: currencyOptions(),
      categoryOptions: [{ value: '', label: 'All categories', icon: '🗂' }].concat(CATEGORIES.map((c) => ({ value: c.key, label: c.label, icon: c.icon }))),
      demo,
      state: {
        homeCurrency: saved.homeCurrency || 'SGD',
        budget: saved.budget || null,
        items: saved.items || [],
        settlements: saved.settlements || [],
        groupRates: saved.groupRates || {}
      },
      liveRates: {}, // from /api/rates; the group's own rates (state.groupRates) win, see rates()
      ratesDate: '',
      ratesError: '',
      showForm: false,
      editing: null,
      search: '',
      filterCat: '',
      tip: '',
      hoverDay: null,
      budgetEditing: false,
      budgetInput: null,
      saveStatus: '',
      pollTimer: null,
      toasts: []
    }
  },

  computed: {
    // Rates used for every conversion: live, with the group's own rates on top (if set for this home currency)
    rates() {
      const merged = { ...this.liveRates }
      for (const c in this.state.groupRates || {}) {
        const g = this.state.groupRates[c]
        if (g && g.base === this.home && g.rate > 0) merged[c] = g.rate
      }
      return merged
    },
    // How much was spent in each currency (for the rates panel's "what would change")
    currencyTotals() {
      const totals = {}
      for (const e of this.state.items) totals[e.currency] = (totals[e.currency] || 0) + e.amount
      return totals
    },
    home() {
      return this.state.homeCurrency
    },

    // Every expense with its home-currency amount and what it means for "me"
    items() {
      const list = []
      for (const e of this.state.items) {
        const converted = toHome(e.amount, e.currency, this.rates, this.home)
        if (converted === null) {
          // No rate for this currency yet: leave it out of the totals instead of guessing
          list.push({ ...e, home: 0, mine: 0, effect: 0, unconverted: true })
          continue
        }
        const shares = sharesOf(e)
        const mine = shares[this.me] ? toHome(shares[this.me], e.currency, this.rates, this.home) : 0
        // + = I lent money on this one, - = I owe for it
        const effect = (e.paidBy === this.me ? converted : 0) - mine
        list.push({ ...e, home: converted, mine, effect, unconverted: false })
      }
      return list
    },

    // Expenses in a currency we have no rate for (left out of the totals)
    unconverted() {
      const codes = []
      let count = 0
      for (const e of this.items) {
        if (!e.unconverted) continue
        count++
        if (!codes.includes(e.currency)) codes.push(e.currency)
      }
      return { count, codes }
    },

    total() {
      let sum = 0
      for (const e of this.items) sum += e.home
      return sum
    },

    myShare() {
      let sum = 0
      for (const e of this.items) sum += e.mine
      return sum
    },

    budgetPct() {
      return this.state.budget ? (this.total / this.state.budget) * 100 : 0
    },

    balanceMap() {
      return balances(this.travellers, this.state.items, this.state.settlements, this.rates, this.home)
    },

    myBalance() {
      return this.balanceMap[this.me] || 0
    },

    balanceList() {
      const list = []
      for (const name of this.travellers) list.push({ name, amount: this.balanceMap[name] || 0 })
      list.sort((a, b) => b.amount - a.amount)
      return list
    },

    maxBalance() {
      let max = 0.01
      for (const b of this.balanceList) max = Math.max(max, Math.abs(b.amount))
      return max
    },

    payments() {
      return settleUp(this.balanceMap)
    },

    // Category totals, biggest first
    byCategory() {
      const list = []
      for (const c of CATEGORIES) {
        let amount = 0
        for (const e of this.items) {
          if (e.category === c.key) amount += e.home
        }
        if (amount > 0) list.push({ ...c, amount, pct: this.total ? (amount / this.total) * 100 : 0 })
      }
      return list
    },

    categoryAria() {
      const parts = []
      for (const c of this.byCategory) parts.push(c.label + ' ' + Math.round(c.pct) + '%')
      return 'Spending by category: ' + parts.join(', ')
    },

    // One entry per day of the trip (or of the expenses if the trip has no dates)
    days() {
      const dates = []
      for (const e of this.items) dates.push(e.date)
      dates.sort()
      const first = this.startDate || dates[0]
      const last = this.endDate || dates[dates.length - 1]
      if (!first || !last) return []
      const list = []
      const d = new Date(first + 'T00:00:00Z')
      const end = new Date(last + 'T00:00:00Z')
      while (d <= end && list.length < 60) {
        const date = d.toISOString().slice(0, 10)
        let amount = 0
        for (const e of this.items) {
          if (e.date === date) amount += e.home
        }
        list.push({ date, amount })
        d.setUTCDate(d.getUTCDate() + 1)
      }
      return list
    },

    dayCount() {
      return Math.max(1, this.days.length)
    },

    perDay() {
      return this.total / this.dayCount
    },

    maxDay() {
      let max = 0
      for (const d of this.days) max = Math.max(max, d.amount)
      return max
    },

    // Search + category filter, grouped by day (newest first)
    feed() {
      const q = this.search.trim().toLowerCase()
      const groups = []
      const sorted = this.items.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      for (const e of sorted) {
        if (this.filterCat && e.category !== this.filterCat) continue
        if (q && !e.title.toLowerCase().includes(q) && !e.paidBy.toLowerCase().includes(q)) continue
        let group = groups.find((g) => g.date === e.date)
        if (!group) {
          group = { date: e.date, label: this.dayLabel(e.date), total: 0, items: [] }
          groups.push(group)
        }
        group.items.push(e)
        group.total += e.home
      }
      return groups
    },

    defaultDate() {
      const today = new Date().toISOString().slice(0, 10)
      if (this.startDate && today < this.startDate) return this.startDate
      if (this.endDate && today > this.endDate) return this.endDate
      return today
    },

    lastCurrency() {
      const last = this.state.items[this.state.items.length - 1]
      return last ? last.currency : ''
    }
  },

  created() {
    this.loadRates()
  },

  mounted() {
    window.addEventListener('keydown', this.onKey)
    // Check for other people's changes every 15 s while the tab is open
    if (!this.demo) this.pollTimer = setInterval(this.poll, 15000)
  },

  beforeUnmount() {
    window.removeEventListener('keydown', this.onKey)
    clearInterval(this.pollTimer)
  },

  methods: {
    money,
    categoryOf,

    async loadRates() {
      this.ratesError = ''
      try {
        const res = await axios.get('/api/rates', { params: { base: this.home } })
        this.liveRates = res.data.rates
        this.ratesDate = res.data.date
      } catch (err) {
        this.liveRates = {}
        this.ratesError = 'Live rates unavailable, other currencies are not converted'
      }
    },

    // Press N anywhere (except while typing) to add an expense
    onKey(e) {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName)
      if (e.key.toLowerCase() === 'n' && !typing && !this.showForm && !e.metaKey && !e.ctrlKey && this.$el.offsetParent) {
        e.preventDefault()
        this.openForm(null)
      }
    },

    openForm(expense) {
      this.editing = expense ? this.state.items.find((x) => x.id === expense.id) : null
      this.showForm = true
    },

    // Every change is one small request; the server answers with the latest expenses from everyone
    async send(method, path, body) {
      this.saveStatus = 'Saving…'
      try {
        const res = await axios({ method, url: '/api/trips/' + this.tripId + '/expenses' + path, data: body })
        this.applyServer(res.data, false)
        this.saveStatus = 'Saved ✓'
        return true
      } catch (err) {
        this.saveStatus = (err.response && err.response.data && err.response.data.message) || 'Could not save. Check your connection.'
        return false
      }
    },

    // Take the server's copy. With notify, say what other people added.
    applyServer(data, notify) {
      if (notify) {
        const known = this.state.items.map((x) => x.id)
        for (const x of data.items || []) {
          if (!known.includes(x.id) && x.addedBy && x.addedBy !== this.me) {
            this.toast(x.addedBy, x.addedBy + ' added ' + x.title + ' · ' + money(x.amount, x.currency))
          }
        }
        const knownPay = this.state.settlements.map((x) => x.id)
        for (const p of data.settlements || []) {
          if (!knownPay.includes(p.id) && p.addedBy && p.addedBy !== this.me) {
            this.toast(p.addedBy, p.from + ' paid ' + p.to + ' ' + money(p.amount, data.homeCurrency || this.home))
          }
        }
      }
      if (notify) {
        const mine = this.state.groupRates || {}
        for (const c in data.groupRates || {}) {
          const g = data.groupRates[c]
          if (g && g.by !== this.me && (!mine[c] || mine[c].at !== g.at)) {
            this.toast(g.by, g.by + ' set the group rate: 1 ' + g.base + ' = ' + g.rate + ' ' + c)
          }
        }
      }
      const currencyChanged = data.homeCurrency && data.homeCurrency !== this.state.homeCurrency
      this.state = {
        homeCurrency: data.homeCurrency || 'SGD',
        budget: data.budget || null,
        items: data.items || [],
        settlements: data.settlements || [],
        groupRates: data.groupRates || {}
      }
      if (currencyChanged) this.loadRates()
      this.$emit('changed', this.state) // so Crew's balances update straight away
    },

    async poll() {
      if (!this.$el.offsetParent || this.showForm || document.hidden) return // only while you're looking
      try {
        const res = await axios.get('/api/trips/' + this.tripId + '/expenses')
        this.applyServer(res.data, true)
      } catch (err) {
        // try again next time
      }
    },

    toast(who, text) {
      const t = { id: Math.random(), who, text }
      this.toasts.push(t)
      setTimeout(() => { this.toasts = this.toasts.filter((x) => x !== t) }, 5000)
    },

    async saveExpense(expense) {
      if (this.demo) {
        const i = this.state.items.findIndex((x) => x.id === expense.id)
        if (i >= 0) this.state.items.splice(i, 1, expense)
        else this.state.items.push(expense)
        this.showForm = false
        return
      }
      const exists = this.state.items.some((x) => x.id === expense.id)
      const ok = exists ? await this.send('put', '/items/' + expense.id, expense) : await this.send('post', '/items', expense)
      if (ok) this.showForm = false
    },

    async deleteExpense(id) {
      if (this.demo) this.state.items = this.state.items.filter((x) => x.id !== id)
      else if (!(await this.send('delete', '/items/' + id))) return
      this.showForm = false
    },

    markPaid(p) {
      if (this.demo) this.state.settlements.push({ id: 's' + Date.now(), from: p.from, to: p.to, amount: p.amount, date: new Date().toISOString().slice(0, 10) })
      else this.send('post', '/settlements', { from: p.from, to: p.to, amount: p.amount })
    },

    undoPayment(id) {
      if (this.demo) this.state.settlements = this.state.settlements.filter((s) => s.id !== id)
      else this.send('delete', '/settlements/' + id)
    },

    // The group's own exchange rate (saved for everyone on the trip)
    setGroupRate(code, rate) {
      if (this.demo) {
        this.state.groupRates = { ...this.state.groupRates, [code]: { base: this.home, rate, by: this.me, at: new Date().toISOString() } }
        return
      }
      this.send('put', '/rates/' + code, { rate })
    },
    resetGroupRate(code) {
      if (this.demo) {
        const copy = { ...this.state.groupRates }
        delete copy[code]
        this.state.groupRates = copy
        return
      }
      this.send('delete', '/rates/' + code)
    },

    changeCurrency(code) {
      this.state.homeCurrency = code
      this.loadRates()
      if (!this.demo) this.send('patch', '/settings', { homeCurrency: code })
    },

    editBudget() {
      this.budgetInput = this.state.budget
      this.budgetEditing = true
      this.$nextTick(() => this.$refs.budget && this.$refs.budget.focus())
    },

    saveBudget() {
      this.state.budget = this.budgetInput > 0 ? this.budgetInput : null
      this.budgetEditing = false
      if (!this.demo) this.send('patch', '/settings', { budget: this.state.budget })
    },

    splitText(e) {
      const count = Object.keys(sharesOf(e)).length
      if (e.splitType === 'exact') return 'exact amounts, ' + count + (count === 1 ? ' person' : ' people')
      return count === this.travellers.length ? 'split equally' : 'split ' + count + ' ways'
    },

    // "Day 2" if the date is inside the trip
    dayLabel(date) {
      if (!this.startDate || date < this.startDate || (this.endDate && date > this.endDate)) return 'Before/after trip'
      return 'Day ' + (Math.round((new Date(date) - new Date(this.startDate)) / 86400000) + 1)
    },

    longDate(date) {
      return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    },

    shortDate(date) {
      return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    }
  }
}
</script>

<style scoped>
.xp {
  --ink: #003d5b;
  --muted: #5a6b78;
  --line: #e6dfd2;
  --soft: #f6f2ea;
  --pos: #00798c;
  --neg: #c4472e;
}
.xp-muted {
  color: var(--muted);
}
.xp-num {
  font-variant-numeric: tabular-nums;
}
.xp-h {
  font-family: var(--font-display);
  font-size: 1.15rem;
  margin: 0;
}

/* Toolbar */
.xp-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}
.xp-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--soft);
  border-radius: 999px;
  padding: 4px 6px 4px 14px;
  font-size: 13px;
  color: var(--muted);
  margin: 0;
}
.xp-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--pos);
  font-weight: 600;
}
.xp-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #edae49;
  box-shadow: 0 0 0 0 rgba(237, 174, 73, 0.6);
  animation: xp-pulse 2s infinite;
}
@keyframes xp-pulse {
  70% { box-shadow: 0 0 0 8px rgba(237, 174, 73, 0); }
  100% { box-shadow: 0 0 0 0 rgba(237, 174, 73, 0); }
}
.xp-toasts {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1070;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.xp-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #062c42;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 10px 14px;
  font-size: 14px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
}
.xp-avatar.sm {
  width: 24px;
  height: 24px;
  font-size: 11px;
}
.xp-toast-enter-active,
.xp-toast-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.xp-toast-enter-from,
.xp-toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
.xp-rates {
  font-size: 12px;
  color: var(--muted);
}
.xp-add {
  margin-left: auto;
  background: var(--ink);
  color: #edae49;
  border-radius: 999px;
  padding: 9px 18px;
  font-weight: 600;
}
.xp-add:hover {
  background: var(--pos);
  color: #fff;
}
.xp-add kbd {
  background: rgba(255, 255, 255, 0.14);
  color: inherit;
  font-size: 11px;
  border-radius: 6px;
  padding: 1px 6px;
  margin-left: 6px;
}

/* Empty */
.xp-empty {
  text-align: center;
  padding: 48px 16px;
  border: 1.5px dashed var(--line);
  border-radius: 24px;
}
.xp-empty-art {
  font-size: 48px;
  margin-bottom: 8px;
}
.xp-empty .xp-add {
  margin: 16px auto 0;
}

/* Tiles */
.xp-warn {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid #edae49;
  background: #fbefd9;
  color: #6b4a0e;
  font-size: 14px;
  line-height: 1.4;
}
.xp-warn .app-icon {
  margin-top: 2px;
}
.xp-unconv {
  color: #6b4a0e;
  font-style: italic;
}
.xp-tiles {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 18px;
}
.xp-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: #fbf5ea;
}
.xp-tile-dark {
  background: #062c42;
  border-color: #062c42;
  color: #fff;
}
.xp-tile-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}
.xp-tile-dark .xp-tile-label,
.xp-tile-dark .xp-tile-sub {
  color: rgba(255, 255, 255, 0.65);
}
.xp-big {
  font-size: 1.6rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.xp-big.pos {
  color: var(--pos);
}
.xp-big.neg {
  color: var(--neg);
}
.xp-tile-sub {
  font-size: 12px;
  color: var(--muted);
}
.xp-budget {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
  margin: 6px 0 2px;
}
.xp-budget-fill {
  height: 100%;
  border-radius: 999px;
  background: #f3c26f;
}
.xp-budget-fill.over {
  background: #ff8a70;
}
.xp-budget-form {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.xp-link-light {
  border: 0;
  background: none;
  color: #f3c26f;
  font-size: 12px;
  font-weight: 600;
  padding: 0 0 0 4px;
  text-align: left;
}
.xp-link {
  border: 0;
  background: none;
  color: var(--pos);
  font-weight: 600;
  padding: 0 4px;
}
.xp-mini {
  background: var(--ink);
  color: #edae49;
  border-radius: 999px;
  font-weight: 600;
  white-space: nowrap;
}
.xp-mini:hover {
  background: var(--pos);
  color: #fff;
}

/* Layout */
.xp-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.xp-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.xp-card {
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 18px 20px;
  background: #fbf5ea;
}
.xp-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.xp-count {
  font-family: var(--font-body);
  font-size: 12px;
  background: var(--soft);
  border-radius: 999px;
  padding: 2px 8px;
  vertical-align: middle;
}
.xp-search {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--soft);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
}
.xp-search input {
  border: 0;
  background: transparent;
  outline: none;
  width: 120px;
}
.xp-filters {
  margin-bottom: 8px;
}

/* Feed */
.xp-day {
  margin-top: 10px;
}
.xp-day-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--muted);
  padding: 6px 4px;
  border-bottom: 1px solid var(--line);
}
.xp-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.xp-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  background: none;
  text-align: left;
  padding: 10px 6px;
  border-radius: 14px;
  transition: background 0.15s;
}
.xp-row:hover {
  background: var(--soft);
}
.xp-icon {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
.xp-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.xp-row-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.xp-row-sub {
  font-size: 13px;
  color: var(--muted);
}
.xp-row-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}
.xp-row-amount {
  font-weight: 700;
}
.xp-row-conv {
  font-size: 12px;
  color: var(--muted);
}
.xp-effect {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.xp-effect.pos,
.xp-bal-amt.pos {
  color: var(--pos);
}
.xp-effect.neg,
.xp-bal-amt.neg {
  color: var(--neg);
}

/* Balances */
.xp-bal {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
}
.xp-bal-row {
  display: grid;
  grid-template-columns: 30px minmax(50px, 90px) minmax(70px, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}
.xp-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #00798c;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.xp-bal-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.xp-bal-track {
  position: relative;
  height: 10px;
}
.xp-bal-mid {
  position: absolute;
  left: 50%;
  top: -3px;
  bottom: -3px;
  width: 1px;
  background: #d2c8b6;
}
.xp-bal-bar {
  position: absolute;
  top: 0;
  height: 100%;
}
.xp-bal-bar.pos {
  background: var(--pos);
  border-radius: 0 4px 4px 0;
}
.xp-bal-bar.neg {
  background: var(--neg);
  border-radius: 4px 0 0 4px;
}
.xp-bal-amt {
  font-size: 13px;
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
}
.xp-sub-h {
  font-size: 14px;
  font-weight: 700;
  margin: 16px 0 8px;
}
.xp-pay {
  list-style: none;
  padding: 0;
  margin: 0;
}
.xp-pay-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  background: var(--soft);
  border-radius: 14px;
  margin-bottom: 6px;
}
.xp-pay-amt {
  font-weight: 700;
}
.xp-history {
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted);
}
.xp-history ul {
  padding-left: 18px;
  margin: 6px 0 0;
}

/* Category stacked bar: 2px surface gap between segments, rounded ends */
.xp-stack {
  display: flex;
  gap: 2px;
  height: 14px;
  margin-top: 14px;
}
.xp-stack-seg:first-child {
  border-radius: 4px 0 0 4px;
}
.xp-stack-seg:last-child {
  border-radius: 0 4px 4px 0;
}
.xp-stack-seg:only-child {
  border-radius: 4px;
}
.xp-tip {
  font-size: 12px;
  color: var(--muted);
  min-height: 18px;
  margin: 4px 0 0;
}
.xp-legend {
  list-style: none;
  padding: 0;
  margin: 0;
}
.xp-legend-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: none;
  padding: 6px 4px;
  border-radius: 10px;
  font-size: 14px;
}
.xp-legend-row:hover,
.xp-legend-row.on {
  background: var(--soft);
}
.xp-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}
.xp-pct {
  width: 40px;
  text-align: right;
  color: var(--muted);
}

/* Per-day bars: hit area is the full column, bar has a 4px rounded top */
.xp-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 110px;
  margin-top: 12px;
  border-bottom: 1px solid var(--line);
}
.xp-bar-hit {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: flex-end;
  border: 0;
  background: none;
  padding: 0;
  border-radius: 6px 6px 0 0;
}
.xp-bar-hit:hover,
.xp-bar-hit.active {
  background: var(--soft);
}
.xp-bar {
  width: 100%;
  background: #00798c;
  border-radius: 4px 4px 0 0;
}
.xp-bar.zero {
  background: #dcd3c4;
}
.xp-bar-hit.active .xp-bar {
  background: #0a5f47;
}

/* Keyboard focus */
.xp-row:focus-visible,
.xp-legend-row:focus-visible,
.xp-bar-hit:focus-visible,
.xp-add:focus-visible,
.xp-mini:focus-visible {
  outline: 3px solid rgba(0, 121, 140, 0.45);
  outline-offset: 2px;
}

@media (max-width: 991px) {
  .xp-tiles {
    grid-template-columns: 1fr 1fr;
  }
  .xp-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 480px) {
  .xp-tiles {
    grid-template-columns: 1fr;
  }
  .xp-add {
    width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .xp-row { transition: none; }
  .xp-live-dot { animation: none; }
}

/* Phones and touch screens: every control is at least 40px to tap (WCAG / Apple guidance) */
@media (pointer: coarse), (max-width: 560px) {
  .xp-link-light {
    min-height: 40px;
    padding: 0 10px;
  }
  .xp-mini {
    min-height: 40px;
  }
}
</style>
