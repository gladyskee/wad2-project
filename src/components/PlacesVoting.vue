<template>
  <div>
    <!-- Error: nothing in the wishlist yet -->
    <div v-if="!places.length" class="pv-error" role="alert" data-testid="vote-error">
      <div class="pv-error-icon">!</div>
      <div class="flex-grow-1">
        <strong>Your wishlist is empty.</strong>
        <div>Add at least one place to the wishlist before the group can vote.</div>
      </div>
      <button type="button" class="btn btn-danger pv-pill" @click="$emit('go-wishlist')">← Go to wishlist</button>
    </div>

    <template v-else>
    <!-- How it works -->
    <div class="pv-intro">
      <div>
        <strong>Vote on your wishlist together.</strong>
        A place becomes a <strong>group pick</strong>
        when {{ needed }} of {{ travellers.length }} want to go.
        <template v-if="canVoteFor.length > 1">As organiser, you can also vote for people without an account.</template>
      </div>
      <span class="pv-summary" data-testid="vote-summary">✓ {{ picks }} group pick{{ picks === 1 ? '' : 's' }}</span>
    </div>

    <!-- Quick vote: the whole list in one tap. Shows where you're at, and every bulk vote can be undone. -->
    <section v-if="voter" class="pv-quick" :class="{ done: !leftFor(voter) }" aria-labelledby="pv-quick-title">
      <span class="pv-quick-icon" aria-hidden="true"><AppIcon :name="leftFor(voter) ? 'thumbs-up' : 'check'" :size="24" /></span>
      <div class="pv-quick-text">
        <h3 id="pv-quick-title" class="pv-quick-title">{{ leftFor(voter) ? 'Like everything on the list?' : "You've voted on every place" }}</h3>
        <p class="pv-quick-sub">
          <template v-if="leftFor(voter)">
            You've said yes to {{ places.length - leftFor(voter) }} of {{ places.length }} places. Vote yes on the rest in one tap, then remove any you don't want.
          </template>
          <template v-else>Changed your mind? Tap your name on any card below to take that vote back.</template>
        </p>
        <!-- Organiser: the same for people without an account -->
        <div v-if="others.length" class="pv-quick-others">
          <span class="pv-quick-for">Also vote for:</span>
          <button v-for="person in others" :key="person" type="button" class="pv-voter" :class="{ yes: !leftFor(person) }"
            :disabled="!leftFor(person)" @click="voteAll(person)">
            <AppIcon :name="leftFor(person) ? 'thumbs-up' : 'check'" :size="14" /> {{ leftFor(person) ? 'Yes to all · ' + person : person }}
          </button>
        </div>
      </div>
      <button v-if="leftFor(voter)" type="button" class="pv-quick-btn" @click="voteAll(voter)" data-testid="vote-all">
        <AppIcon name="thumbs-up" :size="18" /> Yes to {{ leftFor(voter) === places.length ? 'all ' + places.length : 'the other ' + leftFor(voter) }}
      </button>
      <p v-if="undoInfo" class="pv-quick-undo" role="status">
        ✓ {{ undoInfo.text }}
        <button type="button" class="pv-undo-btn" @click="undoAll">Undo</button>
      </p>
    </section>

    <div class="pv-tools">
      <CustomDropdown v-model="sortBy" :options="sortOptions" size="sm" header-text="Sort by" aria-label="Sort by" />
    </div>

    <section v-for="g in groups" :key="g.key" class="pv-section" :aria-labelledby="'pv-h-' + g.key">
    <h3 :id="'pv-h-' + g.key" class="pv-heading">{{ g.title }} <span class="pv-count-pill">{{ g.list.length }}</span></h3>
    <p v-if="!g.list.length" class="pv-empty">{{ g.empty }}</p>
    <transition-group name="pv" tag="div" class="pv-list" data-testid="vote-list">
      <article v-for="w in g.list" :key="w.id" class="pv-card" :class="{ picked: isPick(w) }">
        <span class="pv-icon" :style="{ background: placeStyle(w.type).color }" aria-hidden="true">{{ placeStyle(w.type).icon }}</span>

        <div class="pv-body">
          <div class="d-flex flex-wrap align-items-center gap-2">
            <h4 class="pv-name">{{ w.name }}</h4>
          </div>
          <p v-if="whereOf(w)" class="pv-where"><AppIcon name="map-pin" :size="13" /> {{ whereOf(w) }}</p>

          <!-- Progress towards a group pick -->
          <div class="pv-progress" role="progressbar" :aria-valuenow="count(w)" aria-valuemin="0" :aria-valuemax="travellers.length"
            :aria-label="count(w) + ' of ' + travellers.length + ' votes'">
            <div class="pv-progress-fill" :style="{ width: (count(w) / Math.max(travellers.length, 1) * 100) + '%' }"></div>
          </div>

          <!-- One button per traveller -->
          <div class="pv-voters" role="group" :aria-label="'Votes for ' + w.name">
            <template v-for="person in travellers" :key="person">
              <!-- Your own vote (and, for the organiser, people without an account) -->
              <button v-if="canVoteFor.includes(person)" type="button" class="pv-voter" :class="{ yes: w.votes.includes(person), mine: person === me }"
                :aria-pressed="w.votes.includes(person)" @click="toggle(w, person)" data-testid="vote-btn">
                <AppIcon :name="w.votes.includes(person) ? 'thumbs-up' : 'plus'" :size="14" /> {{ person === me ? 'You' : person }}
              </button>
              <!-- Everyone else: shown, but only they can change it -->
              <span v-else class="pv-voter readonly" :class="{ yes: w.votes.includes(person) }"
                :title="person + (w.votes.includes(person) ? ' wants to go' : ' has not voted yet')">
                <AppIcon v-if="w.votes.includes(person)" name="thumbs-up" :size="14" /><span v-else aria-hidden="true">…</span> {{ person }}
                <span class="visually-hidden">{{ w.votes.includes(person) ? 'wants to go' : "hasn't voted" }}</span>
              </span>
            </template>
          </div>
        </div>

        <span class="pv-count" :aria-hidden="true">{{ count(w) }}/{{ travellers.length }}</span>
      </article>
    </transition-group>
    </section>
    </template>
  </div>
</template>

<script>
import { votesNeeded, yesVotes, isGroupPick } from '../voting.js'
import { trip } from '../itineraryStore.js'
import { placeStyle } from '../placeStyle.js'
import CustomDropdown from './CustomDropdown.vue'
import AppIcon from './AppIcon.vue'
import axios from 'axios'
import { notify, errorText } from '../notify.js'

export default {
  components: { AppIcon, CustomDropdown },
  props: {
    travellers: { type: Array, default: () => [] },
    me: { type: String, default: '' },                 // my name on this trip
    canVoteFor: { type: Array, default: () => [] },    // whose votes I may change (me, + guests if organiser)
    tripId: { type: String, default: '' }              // where votes are saved ('' or 'seoul' = not saved)
  },
  emits: ['go-wishlist', 'members-changed'],

  data() {
    return {
      sortBy: 'votes',
      undoInfo: null, // { text, before } after "Yes to all", for the Undo button
      undoTimer: null,
      sortOptions: [{ value: 'votes', label: 'Most votes', icon: '👍' }, { value: 'name', label: 'Name (A–Z)', icon: '🔤' }]
    }
  },

  computed: {
    places() {
      return trip.wishlist
    },
    // More than half the group (2 of 3, 3 of 4, 3 of 5...)
    needed() {
      return votesNeeded(this.travellers)
    },
    // Who the big Quick vote button is for: me (or the first person I can vote for)
    voter() {
      if (this.canVoteFor.includes(this.me)) return this.me
      return this.canVoteFor[0] || ''
    },
    // Organiser: people without an account they can also vote for
    others() {
      return this.canVoteFor.filter((p) => p !== this.voter)
    },
    picks() {
      let count = 0
      for (const w of this.places) {
        if (this.isPick(w)) count++
      }
      return count
    },
    sorted() {
      const list = this.places.slice()
      if (this.sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
      else list.sort((a, b) => this.count(b) - this.count(a))
      return list
    },
    // Group picks first, then everything still being voted on
    groups() {
      const picked = []
      const rest = []
      for (const w of this.sorted) {
        if (this.isPick(w)) picked.push(w)
        else rest.push(w)
      }
      return [
        { key: 'picks', title: '✓ Group picks', list: picked, empty: 'Nothing has enough votes yet.' },
        { key: 'rest', title: 'Still voting', list: rest, empty: 'Every place is a group pick.' }
      ]
    }
  },

  beforeUnmount() {
    clearTimeout(this.undoTimer)
  },

  methods: {
    placeStyle,
    // e.g. "Kyoto · 13 Okazaki Park"
    whereOf(w) {
      const parts = []
      if (w.city) parts.push(w.city.split(', ')[0])
      const street = w.address ? w.address.split(',')[0].trim() : ''
      if (street && street !== w.name && !parts.includes(street)) parts.push(street)
      return parts.join(' · ')
    },
    // Yes votes from people still on the trip
    count(w) {
      return yesVotes(w, this.travellers).length
    },
    isPick(w) {
      return this.travellers.length > 0 && isGroupPick(w, this.travellers)
    },
    // How many places this person hasn't said yes to yet
    leftFor(person) {
      let n = 0
      for (const w of this.places) {
        if (!(w.votes || []).includes(person)) n++
      }
      return n
    },
    // Yes to every place they haven't voted for. Remembers the votes before, so Undo puts them back exactly.
    voteAll(person) {
      const ids = []
      for (const w of this.places) {
        if (!(w.votes || []).includes(person)) ids.push(w.id)
      }
      this.setVotes(ids, person, true)
      const who = person === this.me ? '' : ' for ' + person
      this.undoInfo = { text: 'Voted yes on ' + ids.length + ' place' + (ids.length === 1 ? '' : 's') + who + '.', ids, person }
      clearTimeout(this.undoTimer)
      this.undoTimer = setTimeout(() => { this.undoInfo = null }, 10000)
    },
    // Undo "Yes to all": take back exactly the votes it added
    undoAll() {
      if (!this.undoInfo) return
      this.setVotes(this.undoInfo.ids, this.undoInfo.person, false)
      this.undoInfo = null
      clearTimeout(this.undoTimer)
    },
    toggle(w, person) {
      this.setVotes([w.id], person, !(w.votes || []).includes(person))
    },

    // Show the vote straight away, then save it. Each vote is saved on its own,
    // so two people voting at the same time never undo each other's votes.
    async setVotes(ids, person, yes) {
      if (!ids.length) return
      this.applyVotes(ids, person, yes)
      if (!this.tripId || this.tripId === 'seoul') return // the demo trip isn't saved
      try {
        const res = await axios.post('/api/trips/' + this.tripId + '/votes', { wishIds: ids, person, yes })
        // Everyone's latest votes come back, so new votes from the group show up too
        for (const w of this.places) {
          if (res.data.votes[w.id]) w.votes = res.data.votes[w.id]
        }
      } catch (err) {
        this.applyVotes(ids, person, !yes) // it wasn't saved, so don't pretend it was
        if (err.response && err.response.status === 403) {
          // They joined with their own account since this page loaded, so only they can vote now
          notify(person + ' has joined the trip, so only they can change their votes.')
          this.$emit('members-changed')
          return
        }
        notify(errorText(err, 'Could not save your vote.'), () => this.setVotes(ids, person, yes))
      }
    },
    applyVotes(ids, person, yes) {
      for (const w of this.places) {
        if (!ids.includes(w.id)) continue
        const votes = (w.votes || []).filter((p) => p !== person)
        if (yes) votes.push(person)
        w.votes = votes
      }
    }
  }
}
</script>

<style scoped>
.pv-intro {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  background: #fbf5ea;
  border: 1px solid #e2dacb;
  border-radius: 20px;
  padding: 14px 18px;
  margin-bottom: 12px;
}
.pv-summary {
  background: #fbefd9;
  color: #004e5a;
  font-weight: 700;
  border-radius: 999px;
  padding: 6px 14px;
  white-space: nowrap;
}
.pv-error {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  background: #fbe7ea;
  border: 1px solid #f3b7b7;
  color: #8a1f1f;
  border-radius: 20px;
  padding: 18px 20px;
  animation: pv-shake 0.4s ease;
}
.pv-error-icon {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #d93636;
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
@keyframes pv-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}
.pv-pill {
  border-radius: 999px;
  padding: 8px 20px;
  font-weight: 600;
}
.pv-section + .pv-section {
  margin-top: 28px;
  padding-top: 22px;
  border-top: 1px solid #e2dacb;
}
.pv-heading {
  font-family: var(--font-display);
  font-size: 1.25rem;
  margin-bottom: 12px;
}
.pv-count-pill {
  font-family: var(--font-body);
  font-size: 0.8rem;
  background: #fbefd9;
  color: #004e5a;
  border-radius: 999px;
  padding: 2px 10px;
  vertical-align: middle;
}
.pv-empty {
  color: #5a6b78;
  font-size: 14px;
  margin: 0;
}
.pv-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pv-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #fbf5ea;
  border: 1.5px solid #e6dfd2;
  border-radius: 22px;
  padding: 14px 18px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.pv-card.picked {
  border-color: #f1c47a;
  box-shadow: 0 6px 18px rgba(0, 121, 140, 0.1);
}
.pv-icon {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
}
.pv-body {
  flex: 1;
  min-width: 0;
}
.pv-name {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0;
}
.pv-badge {
  font-size: 12px;
  font-weight: 700;
  background: #00798c;
  color: #fff;
  border-radius: 999px;
  padding: 3px 10px;
}
.pv-where {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--app-muted, #5a6b78);
}
.pv-progress {
  height: 6px;
  background: #efe9df;
  border-radius: 999px;
  margin: 10px 0;
  overflow: hidden;
}
.pv-progress-fill {
  height: 100%;
  background: #edae49;
  border-radius: 999px;
  transition: width 0.3s ease;
}
.pv-voters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pv-tools {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}
.pv-quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px 18px;
  margin-bottom: 14px;
  padding: 18px 20px;
  border-radius: 20px;
  border: 2px solid #edae49;
  background: #fdf3e1;
  box-shadow: 0 6px 18px rgba(0, 40, 62, 0.08);
}
.pv-quick.done {
  border-color: #e2dacb;
  background: #fbf5ea;
  box-shadow: none;
}
.pv-quick-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  background: #edae49;
}
.pv-quick.done .pv-quick-icon {
  background: #fbefd9;
  color: #004e5a;
  font-weight: 800;
}
.pv-quick-text {
  flex: 1;
  min-width: 220px;
}
.pv-quick-title {
  margin: 0 0 2px;
  font-size: 17px;
  font-weight: 800;
}
.pv-quick-sub {
  margin: 0;
  font-size: 14px;
  color: #5a6b78;
}
.pv-quick-btn {
  min-height: 48px;
  padding: 0 22px;
  border: 0;
  border-radius: 999px;
  background: #edae49;
  color: #00283c;
  font-size: 16px;
  font-weight: 800;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 40, 62, 0.15);
  transition: transform 0.15s, box-shadow 0.15s;
}
.pv-quick-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(0, 40, 62, 0.2);
}
.pv-quick-btn:active {
  transform: translateY(0);
}
.pv-quick-btn:focus-visible {
  outline: 3px solid #003d5b;
  outline-offset: 3px;
}
.pv-quick-others {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}
.pv-quick-for {
  font-size: 13px;
  color: #5a6b78;
}
.pv-quick-undo {
  flex-basis: 100%;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid #e2dacb;
  font-size: 14px;
  font-weight: 600;
  color: #004e5a;
}
.pv-undo-btn {
  margin-left: 6px;
  border: 0;
  background: none;
  padding: 0;
  font-weight: 800;
  text-decoration: underline;
  color: #003d5b;
}
@media (max-width: 560px) {
  .pv-quick-btn {
    width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pv-quick-btn {
    transition: none;
  }
}
.pv-voter {
  border: 1.5px solid #e2dacb;
  background: #fbf5ea;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.pv-voter.yes {
  background: #fbefd9;
  border-color: #f1c47a;
  color: #004e5a;
}
.pv-voter:focus-visible {
  outline: 3px solid rgba(0, 121, 140, 0.45);
  outline-offset: 2px;
}
.pv-count {
  font-family: var(--font-display);
  font-size: 1.4rem;
  color: var(--app-muted, #5a6b78);
}
.pv-move,
.pv-enter-active,
.pv-leave-active {
  transition: all 0.3s ease;
}
.pv-enter-from,
.pv-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
@media (max-width: 576px) {
  .pv-icon { width: 48px; height: 48px; font-size: 26px; }
  .pv-count { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .pv-move, .pv-enter-active, .pv-leave-active, .pv-progress-fill { transition: none; }
}
.pv-voter.mine {
  border-width: 2px;
}
.pv-voter.readonly {
  cursor: default;
  opacity: 0.85;
  border-style: dashed;
}
.pv-voter.readonly.yes {
  border-style: solid;
}
</style>
