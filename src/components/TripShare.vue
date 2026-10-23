<template>
  <!-- "Invite people" panel: link + quick share + who's on the trip -->
  <!-- inline = shown inside a page (trip setup) instead of as a pop-up -->
  <div :class="inline ? 'ts-inline' : 'ts-backdrop'" @click.self="inline || $emit('close')">
    <section class="ts" :class="{ flat: inline }" :role="inline ? null : 'dialog'" :aria-modal="inline ? null : 'true'"
      :aria-labelledby="inline ? null : 'ts-title'" tabindex="-1" ref="box" @keydown.esc="inline || $emit('close')">
      <header v-if="!inline" class="ts-head">
        <div>
          <h2 id="ts-title" class="ts-title">Invite to {{ tripName }}</h2>
          <p class="ts-muted mb-0">Invite friends by username, or send them a link.</p>
        </div>
        <button type="button" class="btn-close" aria-label="Close" @click="$emit('close')"></button>
      </header>

      <!-- My friends: one tap to invite -->
      <div v-if="friendList.length" class="ts-friends">
        <label for="ts-friend-filter" class="ts-label">Your friends <span class="ts-muted small fw-normal">{{ friendList.length }}</span></label>
        <!-- Lots of friends: type to narrow the list -->
        <div v-if="friendList.length > 5" class="ts-search ts-friend-search">
          <svg class="ts-at" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input id="ts-friend-filter" v-model="friendFilter" type="search" autocomplete="off" spellcheck="false" placeholder="Search your friends">
        </div>
        <p v-if="!shownFriends.length" class="ts-muted small mb-0">No friends match "{{ friendFilter.trim() }}".</p>
        <ul v-else class="ts-friend-list" aria-label="Your friends">
          <li v-for="f in shownFriends" :key="f.id" class="ts-friend">
            <span class="ts-av sm" :style="{ background: colorForFriend(f.name) }" aria-hidden="true">
              {{ f.name.charAt(0).toUpperCase() }}<span v-if="f.online" class="ts-online-dot"></span>
            </span>
            <span class="ts-friend-name">
              <strong>{{ f.name }}</strong>
              <span class="ts-muted small">{{ f.online ? 'Online' : '@' + f.username }}</span>
            </span>
            <span v-if="friendStatus(f) === 'member'" class="ts-muted small">On this trip</span>
            <span v-else-if="friendStatus(f) === 'invited'" class="ts-muted small">Invited ✓</span>
            <button v-else type="button" class="ts-invite" :disabled="inviting === f.id"
              :aria-label="'Invite ' + f.name" @click="inviteUser(f)">{{ inviting === f.id ? 'Inviting…' : 'Invite' }}</button>
          </li>
        </ul>
      </div>

      <!-- Invite someone who already has an account -->
      <div class="ts-find">
        <label for="ts-user" class="ts-label">Invite by username</label>
        <div class="ts-search">
          <span class="ts-at" aria-hidden="true">@</span>
          <input id="ts-user" v-model="query" autocomplete="off" spellcheck="false" autocapitalize="none" placeholder="username"
            role="combobox" aria-autocomplete="list" aria-controls="ts-results" :aria-expanded="results.length > 0" @input="onType" data-testid="invite-username">
          <span v-if="searching" class="ts-muted small me-2" aria-hidden="true">…</span>
        </div>
        <ul v-if="results.length" id="ts-results" class="ts-results">
          <li v-for="u in results" :key="u.id">
            <!-- Not invited yet: the whole row is the Invite button -->
            <button v-if="!u.status" type="button" class="ts-result clickable" :disabled="inviting === u.id"
              :aria-label="'Invite ' + u.name + ' (@' + u.username + ')'" @click="inviteUser(u)" data-testid="invite-user">
              <span class="ts-av sm" :style="{ background: '#30638e' }" aria-hidden="true">{{ u.name.charAt(0).toUpperCase() }}</span>
              <span class="flex-grow-1">
                <strong>{{ u.name }}</strong> <span class="ts-muted small">@{{ u.username }}</span>
              </span>
              <span class="ts-invite" aria-hidden="true">{{ inviting === u.id ? 'Inviting…' : 'Invite' }}</span>
            </button>
            <div v-else class="ts-result">
              <span class="ts-av sm" :style="{ background: '#30638e' }" aria-hidden="true">{{ u.name.charAt(0).toUpperCase() }}</span>
              <span class="flex-grow-1">
                <strong>{{ u.name }}</strong> <span class="ts-muted small">@{{ u.username }}</span>
              </span>
              <span class="ts-muted small">{{ u.status === 'member' ? 'On this trip' : 'Invited ✓' }}</span>
            </div>
          </li>
        </ul>
        <p v-else-if="isMe" class="ts-muted small mt-2 mb-0">That's you. Type a friend's username.</p>
        <p v-else-if="query.replace('@', '').trim().length >= 3 && !searching && searched" class="ts-muted small mt-2 mb-0">
          No account starts with "@{{ query.replace('@', '').trim() }}". Send them the link instead.
        </p>
        <p v-else-if="query && query.replace('@', '').trim().length < 3" class="ts-muted small mt-2 mb-0">Type at least 3 letters.</p>
        <p v-if="inviteMsg" class="ts-ok" role="status">{{ inviteMsg }}</p>
      </div>

      <div class="ts-or"><span>or share the link</span></div>

      <!-- Link -->
      <div class="ts-link" :class="{ copied }">
        <span class="ts-link-icon" aria-hidden="true"><AppIcon name="link" :size="17" /></span>
        <label for="ts-url" class="visually-hidden">Invite link</label>
        <input id="ts-url" :value="link || 'Making a link…'" readonly @focus="$event.target.select()">
        <button type="button" class="ts-copy" :disabled="!link" @click="copy" data-testid="invite-copy">
          {{ copied ? 'Copied ✓' : 'Copy link' }}
        </button>
      </div>
      <p v-if="error" class="ts-error" role="alert">{{ error }}</p>


      <!-- Quick share -->
      <div class="ts-share">
        <a class="ts-app" :href="'https://wa.me/?text=' + encodeURIComponent(message)" target="_blank" rel="noopener">
          <span class="ts-app-icon" style="background:#25d366" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg></span>WhatsApp
        </a>
        <a class="ts-app" :href="'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(shortMessage)" target="_blank" rel="noopener">
          <span class="ts-app-icon" style="background:none" aria-hidden="true"><svg viewBox="0 0 24 24" width="36" height="36" fill="#26a5e4" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg></span>Telegram
        </a>
        <a class="ts-app" :href="'mailto:?subject=' + encodeURIComponent('Join ' + tripName + ' on Chui-se Your Trip') + '&body=' + encodeURIComponent(message)">
          <span class="ts-app-icon" style="background:#5a6b78" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span>Email
        </a>
        <button v-if="canNativeShare" type="button" class="ts-app" @click="nativeShare">
          <span class="ts-app-icon" style="background:#003d5b" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></span>More
        </button>
      </div>

      <!-- People -->
      <h3 class="ts-sub">On this trip <span class="ts-count">{{ members.length }} joined<template v-if="pending.length"> · {{ pending.length }} invited</template> · {{ guests.length }} not yet</span></h3>
      <ul class="ts-people">
        <li v-for="m in members" :key="m.id" class="ts-person">
          <span class="ts-av" :style="{ background: colorFor(m.name) }" aria-hidden="true">{{ m.name.charAt(0).toUpperCase() }}</span>
          <span class="flex-grow-1">
            <strong>{{ m.name }}</strong><span v-if="m.name === me" class="ts-muted"> (you)</span>
            <span class="d-block ts-muted small">{{ m.role === 'owner' ? 'Organiser' : 'Joined' }}</span>
          </span>
          <span v-if="m.role === 'owner'" class="ts-badge">Organiser</span>
          <template v-else-if="role === 'owner' && m.name !== me">
            <button v-if="confirmRemove !== m.id" type="button" class="ts-text-btn" @click="confirmRemove = m.id">Remove</button>
            <span v-else class="d-flex gap-1">
              <button type="button" class="ts-text-btn danger" @click="removeMember(m)">Remove {{ m.name }}</button>
              <button type="button" class="ts-text-btn" @click="confirmRemove = null">Keep</button>
            </span>
          </template>
        </li>
        <li v-for="p in pending" :key="'p-' + p.id" class="ts-person">
          <span class="ts-av invited" aria-hidden="true">{{ (p.name || '?').charAt(0).toUpperCase() }}</span>
          <span class="flex-grow-1">
            <strong>{{ p.name }}</strong> <span class="ts-muted small">@{{ p.username }}</span>
            <span class="d-block ts-muted small">Invited by {{ p.invitedBy === me ? 'you' : p.invitedBy }} · waiting for them to join</span>
          </span>
          <button v-if="role === 'owner' || String(p.invitedById) === String(myId)" type="button" class="ts-text-btn" @click="cancelInvite(p)">Cancel invite</button>
        </li>
        <li v-for="g in guests" :key="'g-' + g" class="ts-person guest">
          <span class="ts-av guest" aria-hidden="true">{{ g.charAt(0).toUpperCase() }}</span>
          <span class="flex-grow-1">
            <strong>{{ g }}</strong>
            <span class="d-block ts-muted small">No account yet · can still be in expenses and votes</span>
          </span>
          <button type="button" class="ts-text-btn" :aria-label="'Remove ' + g" @click="removeGuest(g)">Remove</button>
        </li>
      </ul>

      <!-- Someone going who won't make an account -->
      <form v-if="addingGuest" class="ts-guest-form" @submit.prevent="addGuest">
        <label for="ts-guest" class="visually-hidden">Their name</label>
        <input id="ts-guest" ref="guestInput" v-model="guestName" class="ts-guest-input" maxlength="40" placeholder="Their name, e.g. Mum">
        <button type="submit" class="ts-invite" :disabled="!guestName.trim()">Add</button>
        <button type="button" class="ts-text-btn" @click="addingGuest = false">Cancel</button>
      </form>
      <button v-else type="button" class="ts-text-btn mt-2" @click="openGuestForm">+ Add someone without an account</button>
      <p v-if="guestError" class="ts-error" role="alert">{{ guestError }}</p>

      <footer class="ts-foot">
        <template v-if="role === 'owner'">
          <button v-if="!confirmReset" type="button" class="ts-text-btn" @click="confirmReset = true">Reset link</button>
          <span v-else class="d-flex align-items-center gap-2 flex-wrap">
            <span class="small ts-muted">The old link will stop working.</span>
            <button type="button" class="ts-text-btn danger" @click="resetLink">Reset</button>
            <button type="button" class="ts-text-btn" @click="confirmReset = false">Cancel</button>
          </span>
        </template>
        <template v-else>
          <button v-if="!confirmLeave" type="button" class="ts-text-btn danger" @click="confirmLeave = true">Leave trip</button>
          <span v-else class="d-flex align-items-center gap-2 flex-wrap">
            <span class="small ts-muted">You'll need a new invite to come back.</span>
            <button type="button" class="ts-text-btn danger" @click="leave">Leave</button>
            <button type="button" class="ts-text-btn" @click="confirmLeave = false">Stay</button>
          </span>
        </template>
        <button v-if="!inline" type="button" class="ts-done ms-auto" @click="$emit('close')">Done</button>
      </footer>
    </section>
  </div>
</template>

<script>
import axios from 'axios'
import { auth } from '../auth.js'
import AppIcon from './AppIcon.vue'

const AVATAR_COLORS = ['#00798c', '#30638e', '#d0662e', '#7a5bd6', '#c2477d', '#2b8c99']

export default {
  components: { AppIcon },
  props: {
    tripId: { type: String, required: true },
    tripName: { type: String, default: '' },
    members: { type: Array, default: () => [] },     // [{ id, name, role }]
    travellers: { type: Array, default: () => [] },
    role: { type: String, default: 'member' },       // my role
    pendingInvites: { type: Array, default: () => [] }, // [{ id, name, username, invitedBy, invitedById }]
    inline: { type: Boolean, default: false },
    me: { type: String, default: '' }
  },
  emits: ['close', 'changed', 'left'],

  data() {
    return {
      code: '',
      copied: false,
      error: '',
      confirmRemove: null,
      confirmReset: false,
      confirmLeave: false,
      canNativeShare: typeof navigator !== 'undefined' && !!navigator.share,
      pending: this.pendingInvites.slice(),
      people: this.travellers.slice(), // everyone going (updated when guests are added/removed)
      addingGuest: false,
      guestError: '',
      guestName: '',
      query: '',
      results: [],
      searching: false,
      searched: false,
      searchTimer: null,
      inviting: null,
      inviteMsg: '',
      friendList: [], // my friends (from the Friends list), for one-tap invites
      friendFilter: ''
    }
  },

  computed: {
    // Typed my own username (the search leaves me out)
    isMe() {
      return !!auth.user && this.query.replace('@', '').trim().toLowerCase() === (auth.user.username || '').toLowerCase()
    },
    // Friends whose name or username contains what's typed
    shownFriends() {
      const q = this.friendFilter.replace('@', '').trim().toLowerCase()
      if (!q) return this.friendList
      const out = []
      for (const f of this.friendList) {
        if (f.name.toLowerCase().includes(q) || f.username.includes(q)) out.push(f)
      }
      return out
    },
    myId() {
      return auth.user ? auth.user.id : ''
    },
    link() {
      return this.code ? window.location.origin + '/join/' + this.code : ''
    },
    // Travellers who haven't joined with an account
    guests() {
      const names = this.members.map((m) => m.name)
      return this.people.filter((t) => !names.includes(t))
    },
    shortMessage() {
      return 'Join our trip "' + this.tripName + '" on Chui-se Your Trip'
    },
    message() {
      return this.shortMessage + ': ' + this.link
    }
  },

  async created() {
    this.loadFriends()
    await this.getLink(false)
  },

  mounted() {
    if (!this.inline) this.$refs.box.focus()
  },

  methods: {
    // My friends, online first (the server already sorts them)
    async loadFriends() {
      try {
        const res = await axios.get('/api/friends')
        this.friendList = res.data.friends
      } catch (err) {
        this.friendList = [] // no friends list: the username search below still works
      }
    },
    friendStatus(f) {
      for (const m of this.members) if (String(m.id) === String(f.id)) return 'member'
      for (const p of this.pending) if (String(p.id) === String(f.id)) return 'invited'
      return ''
    },
    colorForFriend(name) {
      let sum = 0
      for (const ch of name) sum += ch.charCodeAt(0)
      return AVATAR_COLORS[sum % AVATAR_COLORS.length]
    },

    colorFor(name) {
      const i = Math.max(0, this.people.indexOf(name))
      return AVATAR_COLORS[i % AVATAR_COLORS.length]
    },

    async getLink(reset) {
      this.error = ''
      try {
        const res = await axios.post('/api/trips/' + this.tripId + '/invite', { reset })
        this.code = res.data.code
      } catch (err) {
        this.error = (err.response && err.response.data && err.response.data.message) || 'Could not make a link. Is the server running?'
      }
    },

    async copy() {
      try {
        await navigator.clipboard.writeText(this.link)
      } catch (err) {
        // Older browsers: select the text so the user can copy it
        document.getElementById('ts-url').select()
        document.execCommand('copy')
      }
      this.copied = true
      setTimeout(() => { this.copied = false }, 2000)
    },

    nativeShare() {
      navigator.share({ title: this.tripName, text: this.shortMessage, url: this.link }).catch(() => {})
    },

    // Wait until typing pauses, then look up usernames
    onType() {
      this.inviteMsg = ''
      this.searched = false
      clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(this.search, 250)
    },

    async search() {
      const q = this.query.replace('@', '').trim().toLowerCase()
      if (q.length < 3) {
        this.results = []
        return
      }
      this.searching = true
      try {
        const res = await axios.get('/api/invites/users', { params: { q, trip: this.tripId } })
        if (q === this.query.replace('@', '').trim().toLowerCase()) this.results = res.data // ignore older answers
      } catch (err) {
        this.results = []
      }
      this.searching = false
      this.searched = true
    },

    async inviteUser(u) {
      this.inviting = u.id
      this.error = ''
      try {
        const res = await axios.post('/api/trips/' + this.tripId + '/invites', { userId: u.id })
        this.pending = res.data
        u.status = 'invited'
        this.inviteMsg = '✓ Invited ' + u.name + '. They\'ll see it on their home page.'
        // Done with this search: empty the box and close the list (the message below stays)
        this.query = ''
        this.results = []
        this.searched = false
      } catch (err) {
        this.error = (err.response && err.response.data && err.response.data.message) || 'Could not send the invite.'
      }
      this.inviting = null
    },

    async cancelInvite(p) {
      try {
        const res = await axios.delete('/api/trips/' + this.tripId + '/invites/' + p.id)
        this.pending = res.data
        for (const r of this.results) if (r.id === p.id) r.status = ''
      } catch (err) {
        this.error = (err.response && err.response.data && err.response.data.message) || 'Could not cancel the invite.'
      }
    },

    openGuestForm() {
      this.addingGuest = true
      this.$nextTick(() => this.$refs.guestInput.focus())
    },

    async addGuest() {
      this.guestError = ''
      try {
        const res = await axios.post('/api/trips/' + this.tripId + '/guests', { name: this.guestName })
        this.people = res.data.travellers
        this.guestName = ''
        this.addingGuest = false
        this.$emit('changed')
      } catch (err) {
        this.guestError = (err.response && err.response.data && err.response.data.message) || 'Could not add them.'
      }
    },

    async removeGuest(name) {
      this.guestError = ''
      try {
        const res = await axios.delete('/api/trips/' + this.tripId + '/guests/' + encodeURIComponent(name))
        this.people = res.data.travellers
        this.$emit('changed')
      } catch (err) {
        this.guestError = (err.response && err.response.data && err.response.data.message) || 'Could not remove them.'
      }
    },

    async resetLink() {
      await this.getLink(true)
      this.confirmReset = false
    },

    async removeMember(m) {
      try {
        await axios.delete('/api/trips/' + this.tripId + '/members/' + m.id)
        this.confirmRemove = null
        this.$emit('changed')
      } catch (err) {
        this.error = (err.response && err.response.data && err.response.data.message) || 'Could not remove them.'
      }
    },

    async leave() {
      try {
        await axios.delete('/api/trips/' + this.tripId + '/members/' + auth.user.id)
        this.$emit('left')
      } catch (err) {
        this.error = (err.response && err.response.data && err.response.data.message) || 'Could not leave the trip.'
      }
    }
  }
}
</script>

<style scoped>
.ts-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1050;
  background: rgba(0, 30, 46, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: ts-fade 0.2s ease;
}
.ts {
  width: min(520px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  background: #fbf5ea;
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.25);
  outline: none;
  animation: ts-pop 0.22s ease;
}
.ts-inline .ts.flat {
  width: 100%;
  max-height: none;
  overflow: visible;
  box-shadow: none;
  border: 1px solid #e6dfd2;
  animation: none;
}
.ts-guest-form {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}
.ts-guest-input {
  flex: 1;
  min-width: 0;
  border: 1.5px solid #e6dfd2;
  border-radius: 999px;
  padding: 7px 14px;
  outline: none;
}
.ts-guest-input:focus {
  border-color: #00798c;
}
.ts-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
}
.ts-title {
  font-family: var(--font-display);
  font-size: 1.4rem;
  margin: 0 0 2px;
}
.ts-muted {
  color: #5a6b78;
}
.ts-link {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f6f2ea;
  border: 1.5px solid #e6dfd2;
  border-radius: 999px;
  padding: 5px 5px 5px 14px;
  transition: border-color 0.2s;
}
.ts-link.copied {
  border-color: #00798c;
}
.ts-link input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: #003d5b;
}
.ts-copy {
  border: 0;
  border-radius: 999px;
  background: #003d5b;
  color: #edae49;
  font-weight: 600;
  padding: 8px 16px;
  white-space: nowrap;
}
.ts-link.copied .ts-copy {
  background: #00798c;
  color: #fff;
}
.ts-error {
  color: #d1495b;
  font-size: 13px;
  margin: 8px 4px 0;
}
.ts-share {
  display: flex;
  gap: 8px;
  margin: 12px 0 22px;
}
.ts-friends {
  margin-bottom: 18px;
}
.ts-friend-search {
  margin-bottom: 8px;
}
.ts-friend-list {
  list-style: none;
  margin: 0;
  padding: 4px 12px;
  max-height: 232px;
  overflow-y: auto;
  border: 1px solid #efe9df;
  border-radius: 16px;
}
.ts-friend {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}
.ts-friend + .ts-friend {
  border-top: 1px solid #efe9df;
}
.ts-friend-name {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.ts-av {
  position: relative;
}
.ts-online-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #22c55e;
  border: 2px solid #fff;
}
.ts-invite:disabled {
  opacity: 0.6;
}
.ts-find {
  margin-top: 4px;
}
.ts-label {
  display: block;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 6px;
}
.ts-search {
  display: flex;
  align-items: center;
  border: 1.5px solid #e6dfd2;
  border-radius: 999px;
  padding: 2px 6px 2px 14px;
  transition: border-color 0.15s;
}
.ts-search:focus-within {
  border-color: #00798c;
}
.ts-at {
  color: #5a6b78;
  font-weight: 700;
}
.ts-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  padding: 8px 6px;
  background: transparent;
}
.ts-results {
  list-style: none;
  padding: 6px;
  margin: 6px 0 0;
  border: 1px solid #e6dfd2;
  border-radius: 16px;
  box-shadow: 0 10px 24px rgba(0, 40, 62, 0.08);
}
.ts-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 12px;
}
.ts-result.clickable {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}
.ts-result.clickable:hover {
  background: #f6f2ea;
}
.ts-result.clickable:hover .ts-invite {
  background: #00626f;
}
.ts-result.clickable:focus-visible {
  outline: 3px solid rgba(0, 121, 140, 0.4);
  outline-offset: 1px;
}
.ts-result.clickable:disabled {
  cursor: default;
}
.ts-invite {
  border: 0;
  border-radius: 999px;
  background: #00798c;
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  padding: 6px 14px;
}
.ts-result.clickable:disabled .ts-invite {
  opacity: 0.6;
}
.ts-ok {
  color: #00798c;
  font-size: 13px;
  font-weight: 600;
  margin: 8px 4px 0;
}
.ts-or {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0 12px;
  color: #8a99a5;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ts-or::before,
.ts-or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e6dfd2;
}
.ts-av.sm {
  width: 28px;
  height: 28px;
  font-size: 12px;
}
.ts-av.invited {
  background: #eaf1fb;
  color: #30638e;
  border: 2px solid #30638e;
}
.ts-app {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 4px;
  border: 1px solid #e6dfd2;
  border-radius: 16px;
  background: #fbf5ea;
  color: #003d5b;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.15s, transform 0.15s;
}
.ts-app:hover {
  background: #f6f2ea;
  transform: translateY(-2px);
}
.ts-app-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}
.ts-sub {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 8px;
}
.ts-count {
  font-weight: 400;
  font-size: 13px;
  color: #5a6b78;
  margin-left: 6px;
}
.ts-people {
  list-style: none;
  padding: 0;
  margin: 0;
}
.ts-person {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  border-bottom: 1px solid #efe9df;
}
.ts-person.guest strong {
  color: #5a6b78;
}
.ts-av {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ts-av.guest {
  background: #fbf5ea;
  color: #8a99a5;
  border: 2px dashed #d2c8b6;
}
.ts-badge {
  font-size: 12px;
  font-weight: 600;
  background: #f5eee2;
  color: #00798c;
  border-radius: 999px;
  padding: 3px 10px;
}
.ts-text-btn {
  border: 0;
  background: none;
  color: #00798c;
  font-weight: 600;
  font-size: 13px;
  padding: 4px 6px;
  border-radius: 8px;
}
.ts-text-btn:hover {
  background: #f6f2ea;
}
.ts-text-btn.danger {
  color: #d1495b;
}
.ts-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}
.ts-done {
  border: 0;
  border-radius: 999px;
  background: #003d5b;
  color: #edae49;
  font-weight: 600;
  padding: 9px 22px;
}
.ts-copy:focus-visible,
.ts-app:focus-visible,
.ts-text-btn:focus-visible,
.ts-invite:focus-visible,
.ts-done:focus-visible {
  outline: 3px solid rgba(0, 121, 140, 0.45);
  outline-offset: 2px;
}
@keyframes ts-fade {
  from { opacity: 0; }
}
@keyframes ts-pop {
  from { opacity: 0; transform: scale(0.97) translateY(8px); }
}
@media (max-width: 480px) {
  .ts {
    padding: 18px;
  }
  .ts-share {
    flex-wrap: wrap;
  }
  .ts-app {
    flex: 1 1 40%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ts, .ts-backdrop { animation: none; }
}
</style>
