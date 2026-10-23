<template>
  <!-- Trip Crew: everyone on the trip, their arrival, food needs and balance, plus invites -->
  <div class="cw">
    <!-- ===== Header & quick invite ===== -->
    <header class="cw-head">
      <div>
        <h3 class="cw-title">{{ city }} Crew</h3>
        <p class="cw-sub">
          {{ people.length }} traveller{{ people.length === 1 ? '' : 's' }}
          · {{ activeCount }} active<template v-if="pending.length"> · {{ pending.length }} pending</template>
        </p>
      </div>
      <div class="cw-actions">
        <button type="button" class="cw-primary" :class="{ done: copied }" @click="copyLink" data-testid="crew-copy">
          <AppIcon :name="copied ? 'check' : 'link'" :size="15" /> {{ copied ? 'Link copied' : 'Copy invite link' }}
        </button>
        <button v-if="!demo" type="button" class="cw-ghost" @click="$emit('invite')">+ Add member</button>
      </div>
    </header>

    <!-- ===== Profile cards ===== -->
    <div class="cw-grid">
      <article v-for="p in people" :key="p.name" class="cw-card" :class="{ me: p.name === me, editing: editing === p.name }">
        <template v-if="editing !== p.name">
          <div class="cw-id">
            <span class="cw-avatar" :style="{ background: colorFor(p.name) }" aria-hidden="true">
              {{ p.name.charAt(0).toUpperCase() }}
              <span v-if="p.kind !== 'guest'" class="cw-dot" :class="{ on: p.activeNow }"></span>
            </span>
            <div class="cw-who">
              <span class="cw-name">{{ p.name }}<span v-if="p.name === me" class="cw-you"> (you)</span></span>
              <span class="cw-status">{{ p.statusText }}</span>
            </div>
            <span class="cw-role" :class="'r-' + p.kind" :title="roleHelp[p.kind]">{{ roleNames[p.kind] }}</span>
          </div>

          <p v-if="p.profile.persona" class="cw-persona"><AppIcon name="tag" :size="13" /> "{{ p.profile.persona }}"</p>
          <button v-else-if="p.canEdit" type="button" class="cw-persona add" @click="startEdit(p)"><AppIcon name="tag" :size="13" /> Add a crew title</button>

          <div class="cw-pills">
            <span class="cw-pill" :class="{ empty: !p.flight.flight && !p.flight.arrival }">
              <AppIcon name="plane" :size="14" /> <template v-if="p.flight.flight || p.flight.arrival">{{ p.flight.flight || 'Arrives' }}<template v-if="p.flight.arrival"> · Lands {{ arrivalText(p.flight.arrival) }}</template></template>
              <template v-else>No flight added</template>
            </span>
            <span v-if="p.flightWith.length" class="cw-pill"><AppIcon name="users" :size="13" /> Same flight as {{ p.flightWith.join(', ') }}</span>
            <template v-if="p.diets.length">
              <span v-for="d in p.diets" :key="d.key" class="cw-pill" :class="d.allergy ? 'allergy' : 'diet'">{{ d.icon }} {{ d.label }}</span>
            </template>
            <span v-else-if="p.hasProfile" class="cw-pill"><AppIcon name="check" :size="13" /> No restrictions</span>
            <span v-else class="cw-pill empty"><AppIcon name="utensils" :size="13" /> Food needs not added</span>
          </div>

          <div class="cw-foot">
            <button type="button" class="cw-balance" :class="p.balance > 0.009 ? 'pos' : p.balance < -0.009 ? 'neg' : ''"
              :title="'See ' + p.name + ' in Expenses'" @click="$emit('go', 'expenses', p.name)">
              <template v-if="p.balance === null">No expenses yet</template>
              <template v-else-if="p.balance > 0.009">Gets back {{ money(p.balance, home) }}</template>
              <template v-else-if="p.balance < -0.009">Owes {{ money(-p.balance, home) }}</template>
              <template v-else>All settled</template>
            </button>
            <span class="cw-links">
              <a v-if="p.profile.phone" class="cw-link" :href="'https://wa.me/' + p.profile.phone.replace(/[^\d]/g, '')"
                target="_blank" rel="noopener" :aria-label="'WhatsApp ' + p.name">Message</a>
              <button v-if="p.canEdit" type="button" class="cw-link" :aria-label="'Edit ' + p.name" @click="startEdit(p)">Edit</button>
            </span>
          </div>
        </template>

        <!-- Editing a card -->
        <CrewDetailsForm v-else :title="p.name === me ? 'Your details' : 'Details for ' + p.name" :profile="p.profile"
          :flight-buddies="flightBuddies(p.name)" :show-contact="!p.fromSettings && (demo ? p.name !== me : true)"
          :settings-note="p.name === me" :saving="saving" :error="error"
          @save="saveEdit(p, $event)" @cancel="editing = null" />
      </article>

      <!-- Pending invites: ghost cards -->
      <article v-for="inv in pending" :key="'inv-' + inv.id" class="cw-card ghost">
        <div class="cw-id">
          <span class="cw-avatar ghost" aria-hidden="true">{{ (inv.name || '?').charAt(0).toUpperCase() }}</span>
          <div class="cw-who">
            <span class="cw-name">{{ inv.name }} <small class="cw-handle">@{{ inv.username }}</small></span>
            <span class="cw-status">Invited by {{ inv.invitedBy === me ? 'you' : inv.invitedBy }} · waiting to join</span>
          </div>
          <span class="cw-role r-pending">Pending</span>
        </div>
        <div v-if="canManage(inv)" class="cw-form-btns mt-3">
          <button type="button" class="cw-ghost" :disabled="busy === inv.id" @click="resend(inv)"><AppIcon :name="resent === inv.id ? 'check' : 'refresh'" :size="14" /> {{ resent === inv.id ? 'Sent again' : 'Resend invite' }}</button>
          <button type="button" class="cw-ghost danger" :disabled="busy === inv.id" @click="revoke(inv)">Revoke</button>
        </div>
      </article>
    </div>

    <!-- ===== Group snapshot ===== -->
    <section class="cw-summary" aria-label="Group snapshot">
      <div class="cw-sum-item">
        <span class="cw-sum-label"><AppIcon name="utensils" :size="14" /> Food needs</span>
        <span class="cw-sum-value">{{ dietSummary || 'No restrictions shared' }}</span>
      </div>
      <div class="cw-sum-item">
        <span class="cw-sum-label"><AppIcon name="plane" :size="14" /> Arrivals</span>
        <span class="cw-sum-value">
          <template v-if="arrivals.length">Earliest {{ arrivalText(arrivals[0]) }}<template v-if="arrivals.length > 1"> · Latest {{ arrivalText(arrivals[arrivals.length - 1]) }}</template></template>
          <template v-else>No flights added yet</template>
        </span>
      </div>
    </section>

    <div v-if="toast" class="cw-toast" role="status">{{ toast }}</div>
  </div>
</template>

<script>
import axios from 'axios'
import { balances, money } from '../expenses.js'
import { dietTag } from '../crewOptions.js'
import CrewDetailsForm from './CrewDetailsForm.vue'
import AppIcon from './AppIcon.vue'

const COLORS = ['#00798c', '#30638e', '#d0662e', '#7a5bd6', '#c2477d', '#2b8c99']

// Example crew for the Seoul demo trip: 3 active travellers and 1 pending invite
const DEMO = {
  members: [
    { id: 'd1', name: 'Sarah', role: 'owner', lastSeenAt: new Date().toISOString() },
    { id: 'd2', name: 'John', role: 'member', lastSeenAt: new Date(Date.now() - 3 * 3600000).toISOString() },
    { id: 'd3', name: 'Amy', role: 'member', lastSeenAt: new Date(Date.now() - 20 * 60000).toISOString() }
  ],
  pending: [{ id: 'd4', name: 'Ben Lim', username: 'benlim', invitedBy: 'Sarah' }],
  crew: {
    Sarah: { persona: 'Chief Foodie', flight: 'SQ600', arrival: '2026-10-12T07:55', diet: ['shellfish-allergy'], phone: '+65 9123 4567' },
    John: { persona: 'Navigator', flight: 'KE644', arrival: '2026-10-12T14:00', diet: [], phone: '' },
    Amy: { persona: 'Photographer', sameFlightAs: 'Sarah', diet: ['vegetarian', 'No spicy food'], phone: '+65 9876 5432' }
  }
}

export default {
  components: { AppIcon, CrewDetailsForm },
  props: {
    tripId: { type: String, required: true },
    city: { type: String, default: 'Trip' },
    travellers: { type: Array, default: () => [] },
    members: { type: Array, default: () => [] },
    pendingInvites: { type: Array, default: () => [] },
    crew: { type: Object, default: () => ({}) },
    expenses: { type: Object, default: null },
    role: { type: String, default: 'member' },
    me: { type: String, default: '' },
    myId: { type: String, default: '' }
  },
  emits: ['invite', 'go', 'changed'],

  data() {
    const demo = this.tripId === 'seoul'
    return {
      demo,
      profiles: demo ? { ...DEMO.crew } : { ...this.crew },
      pending: demo ? DEMO.pending.slice() : this.pendingInvites.slice(),
      rates: {},
      copied: false,
      toast: '',
      editing: null,
      saving: false,
      error: '',
      busy: null,
      resent: null,
      roleNames: { owner: 'Admin', member: 'Editor', guest: 'Guest' },
      roleHelp: {
        owner: 'Organiser: can invite, remove people and delete the trip',
        member: 'Joined with an account: can edit the plan, expenses and photos',
        guest: 'No account: the organiser adds their details'
      }
    }
  },

  computed: {
    memberList() {
      return this.demo ? DEMO.members : this.members
    },
    home() {
      return (this.expenses && this.expenses.homeCurrency) || 'SGD'
    },
    balanceMap() {
      const e = this.demo ? null : this.expenses
      if (!e || !e.items || !e.items.length) return null
      return balances(this.travellers, e.items, e.settlements || [], this.rates, this.home)
    },
    // One entry per traveller, with everything the card shows
    people() {
      const names = this.demo ? DEMO.members.map((m) => m.name) : this.travellers
      const list = []
      for (const name of names) {
        const m = this.memberList.find((x) => x.name === name)
        const kind = m ? (m.role === 'owner' ? 'owner' : 'member') : 'guest'
        const seen = m && m.lastSeenAt ? new Date(m.lastSeenAt).getTime() : 0
        const activeNow = !!seen && Date.now() - seen < 5 * 60 * 1000
        let statusText = 'No account yet'
        if (m) statusText = activeNow ? 'Active now' : seen ? 'Active ' + this.ago(seen) : 'Joined'
        let profile = this.profiles[name] || {}
        // People with an account: food needs + WhatsApp come from their Settings
        const fromSettings = !!m && Array.isArray(m.diet)
        if (fromSettings) profile = { ...profile, diet: m.diet, phone: m.phone || '', dietNote: '' }
        const diets = []
        for (const t of profile.diet || []) diets.push(dietTag(t))
        if (profile.dietNote) diets.push(dietTag(profile.dietNote)) // older cards
        diets.sort((a, b) => (b.allergy ? 1 : 0) - (a.allergy ? 1 : 0)) // allergies first
        const flight = this.flightOf(name)
        // Others on the same flight (linked with "Same as", or the same flight number and time)
        const flightWith = []
        if (flight.flight) {
          for (const other of names) {
            if (other === name) continue
            const f = this.flightOf(other)
            if (f.flight === flight.flight && f.arrival === flight.arrival) flightWith.push(other)
          }
        }
        list.push({
          name, kind, activeNow, statusText, profile, diets, flight, flightWith,
          hasProfile: fromSettings ? !!m.contactSaved : !!this.profiles[name],
          fromSettings,
          canEdit: name === this.me || (kind === 'guest' && this.role === 'owner') || this.demo,
          balance: this.balanceMap ? this.balanceMap[name] || 0 : null
        })
      }
      // You first, then active people, then the rest
      list.sort((a, b) => (b.name === this.me) - (a.name === this.me) || (b.activeNow - a.activeNow))
      return list
    },
    activeCount() {
      return this.memberList.length
    },
    // "1 shellfish allergy · 1 vegetarian"
    dietSummary() {
      const counts = {}
      for (const p of this.people) {
        for (const d of p.diets) counts[d.label] = (counts[d.label] || 0) + 1
      }
      const parts = []
      for (const label in counts) parts.push(counts[label] + ' ' + label.toLowerCase())
      return parts.join(' · ')
    },
    arrivals() {
      const list = []
      for (const p of this.people) if (p.flight.arrival) list.push(p.flight.arrival)
      return list.sort()
    }
  },

  watch: {
    // The trip's currency changed (Expenses): balances need rates for the new one
    home() {
      this.loadRates()
    },
    crew(c) {
      if (!this.demo) this.profiles = { ...c }
    },
    pendingInvites(list) {
      if (!this.demo) this.pending = list.slice()
    }
  },

  created() {
    this.loadRates()
  },

  methods: {
    money,

    async loadRates() {
      try {
        const res = await axios.get('/api/rates', { params: { base: this.home } })
        this.rates = res.data.rates
      } catch (err) {
        // balances are shown without converting other currencies
      }
    },

    colorFor(name) {
      const i = Math.max(0, this.travellers.indexOf(name))
      return COLORS[i % COLORS.length]
    },

    ago(ms) {
      const mins = Math.round((Date.now() - ms) / 60000)
      if (mins < 60) return mins + ' min ago'
      if (mins < 1440) return Math.round(mins / 60) + ' h ago'
      return Math.round(mins / 1440) + ' d ago'
    },

    // "2026-10-16T08:30" -> "16 Oct, 08:30"
    arrivalText(a) {
      const [date, time] = a.split('T')
      const d = new Date(date + 'T00:00:00')
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + time
    },

    showToast(text) {
      this.toast = text
      setTimeout(() => { this.toast = '' }, 2500)
    },

    async copyLink() {
      try {
        let link = window.location.origin + '/trip/seoul'
        if (!this.demo) {
          const res = await axios.post('/api/trips/' + this.tripId + '/invite', {})
          link = window.location.origin + '/join/' + res.data.code
        }
        await navigator.clipboard.writeText(link)
        this.copied = true
        this.showToast('Invite link copied. Paste it in your group chat.')
        setTimeout(() => { this.copied = false }, 2500)
      } catch (err) {
        this.showToast('Could not copy the link. Use "+ Add member" instead.')
      }
    },

    // Flight shown on a card: their own, or the one of the person they fly with
    flightOf(name) {
      const pr = this.profiles[name] || {}
      if (pr.sameFlightAs) {
        const other = this.profiles[pr.sameFlightAs] || {}
        if (!other.sameFlightAs) return { flight: other.flight || '', arrival: other.arrival || '' }
      }
      return { flight: pr.flight || '', arrival: pr.arrival || '' }
    },

    // People you can pick in "Same as …": others with their own flight details
    flightBuddies(name) {
      const list = []
      for (const p of this.people) {
        const pr = p.profile
        if (p.name !== name && !pr.sameFlightAs && (pr.flight || pr.arrival)) {
          list.push({ name: p.name, flight: pr.flight || '', arrival: pr.arrival || '' })
        }
      }
      return list
    },

    startEdit(p) {
      this.error = ''
      this.editing = p.name
    },

    async saveEdit(p, form) {
      if (this.demo) {
        this.profiles = { ...this.profiles, [p.name]: { ...this.profiles[p.name], ...form } }
        this.editing = null
        return
      }
      this.saving = true
      this.error = ''
      try {
        const res = await axios.put('/api/trips/' + this.tripId + '/crew/' + encodeURIComponent(p.name), form)
        this.profiles = { ...res.data.crew }
        this.editing = null
        this.$emit('changed')
      } catch (err) {
        this.error = (err.response && err.response.data && err.response.data.message) || 'Could not save.'
      }
      this.saving = false
    },

    canManage(inv) {
      return this.demo || this.role === 'owner' || String(inv.invitedById) === String(this.myId)
    },

    async resend(inv) {
      if (this.demo) {
        this.resent = inv.id
        return
      }
      this.busy = inv.id
      try {
        await axios.post('/api/trips/' + this.tripId + '/invites/' + inv.id + '/resend')
        this.resent = inv.id
        this.showToast('Invite sent again: it is back at the top of ' + inv.name + "'s home page.")
      } catch (err) {
        this.showToast('Could not resend the invite.')
      }
      this.busy = null
    },

    async revoke(inv) {
      if (this.demo) {
        this.pending = this.pending.filter((x) => x !== inv)
        return
      }
      this.busy = inv.id
      try {
        const res = await axios.delete('/api/trips/' + this.tripId + '/invites/' + inv.id)
        this.pending = res.data
        this.$emit('changed')
      } catch (err) {
        this.showToast('Could not revoke the invite.')
      }
      this.busy = null
    }
  }
}
</script>

<style scoped>
.cw {
  --bg: #00283c;
  --card: #0a3550;
  --line: rgba(255, 255, 255, 0.08);
  --mint: #edae49;
  --text: #e9f1ee;
  --muted: rgba(233, 241, 238, 0.62);
  position: relative;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 22px;
}

/* Header */
.cw-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.cw-title {
  font-family: var(--font-display);
  font-size: 1.6rem;
  margin: 0;
}
.cw-sub {
  margin: 0;
  font-size: 14px;
  color: var(--muted);
}
.cw-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.cw-primary {
  border: 0;
  border-radius: 999px;
  background: var(--mint);
  color: #00283c;
  font-weight: 700;
  padding: 9px 18px;
  box-shadow: 0 6px 20px rgba(237, 174, 73, 0.25);
  transition: transform 0.15s, background 0.15s;
}
.cw-primary:hover:not(:disabled) {
  transform: translateY(-1px);
}
.cw-primary.done {
  background: #f8deb0;
}
.cw-primary:disabled {
  opacity: 0.6;
}
.cw-ghost {
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  border-radius: 999px;
  padding: 8px 16px;
  font-weight: 600;
  font-size: 14px;
}
.cw-ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}
.cw-ghost.danger {
  color: #f09aa5;
}

/* Cards */
.cw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}
.cw-card {
  background: rgba(10, 53, 80, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.cw-card:hover {
  transform: translateY(-3px);
  border-color: rgba(237, 174, 73, 0.35);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
}
.cw-card.me {
  border-color: rgba(237, 174, 73, 0.45);
}
.cw-card.editing {
  transform: none;
  grid-column: 1 / -1;
}
.cw-card.ghost {
  background: transparent;
  border: 1.5px dashed rgba(255, 255, 255, 0.2);
}
.cw-id {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cw-avatar {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  color: #fff;
  font-weight: 800;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: inset 0 -6px 12px rgba(0, 0, 0, 0.2);
}
.cw-avatar.ghost {
  background: transparent;
  border: 2px dashed rgba(255, 255, 255, 0.3);
  color: var(--muted);
  box-shadow: none;
}
.cw-dot {
  position: absolute;
  right: 0;
  bottom: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #4b5563;
  border: 3px solid var(--card);
}
.cw-dot.on {
  background: var(--mint);
}
.cw-who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.cw-name {
  font-weight: 700;
  font-size: 1.05rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cw-you,
.cw-handle {
  font-weight: 400;
  color: var(--muted);
}
.cw-status {
  font-size: 12px;
  color: var(--muted);
}
.cw-role {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 999px;
  padding: 3px 10px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
}
.cw-role.r-owner {
  background: rgba(237, 174, 73, 0.16);
  color: var(--mint);
}
.cw-role.r-member {
  background: rgba(57, 135, 229, 0.18);
  color: #9cc4f5;
}
.cw-role.r-pending {
  background: rgba(255, 176, 32, 0.15);
  color: #ffd38a;
}
.cw-persona {
  margin: 0;
  font-weight: 600;
  color: #fff;
}
.cw-persona.add {
  text-align: left;
  border: 0;
  background: none;
  color: var(--mint);
  font-weight: 600;
  padding: 0;
}
.cw-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cw-pill {
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--line);
}
.cw-pill.empty {
  color: var(--muted);
  font-weight: 400;
  border-style: dashed;
}
.cw-pill.allergy {
  background: rgba(209, 73, 91, 0.16);
  border-color: rgba(209, 73, 91, 0.45);
  color: #f6c4cb;
}
.cw-pill.diet {
  background: rgba(237, 174, 73, 0.1);
  border-color: rgba(237, 174, 73, 0.3);
  color: #f8deb0;
}
.cw-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.cw-balance {
  border: 0;
  background: none;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
  cursor: pointer;
}
.cw-balance:hover {
  text-decoration: underline;
}
.cw-balance.pos {
  color: var(--mint);
}
.cw-balance.neg {
  color: #ec8a97;
}
.cw-links {
  display: flex;
  gap: 14px;
}
.cw-link {
  border: 0;
  background: none;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-decoration: none;
  cursor: pointer;
}
.cw-link:hover {
  color: var(--mint);
}

/* Edit form */
.cw-form-btns {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}

/* Summary strip */
.cw-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin-top: 18px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
}
.cw-sum-item {
  background: var(--card);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  border: 0;
  color: var(--text);
}
.cw-sum-label {
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
}
.cw-sum-value {
  font-size: 14px;
  font-weight: 600;
}
.cw-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 1080;
  background: #0a3550;
  color: #fff;
  border: 1px solid rgba(237, 174, 73, 0.5);
  border-radius: 999px;
  padding: 10px 18px;
  font-size: 14px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
  animation: cw-in 0.2s ease;
}

/* Keyboard focus */
.cw-primary:focus-visible,
.cw-ghost:focus-visible,
.cw-link:focus-visible,
.cw-balance:focus-visible,
.cw-persona.add:focus-visible {
  outline: 3px solid var(--mint);
  outline-offset: 2px;
}
@keyframes cw-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
}
@media (max-width: 720px) {
  .cw {
    padding: 16px;
  }
  .cw-summary {
    grid-template-columns: 1fr;
  }
  .cw-row {
    grid-template-columns: 1fr;
  }
  .cw-actions {
    width: 100%;
  }
  .cw-actions > * {
    flex: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cw-card, .cw-primary { transition: none; }
  .cw-card:hover { transform: none; }
}

/* Phones and touch screens: every control is at least 40px to tap (WCAG / Apple guidance) */
@media (pointer: coarse), (max-width: 560px) {
  .cw-balance,
  .cw-link {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
  }
}
</style>
