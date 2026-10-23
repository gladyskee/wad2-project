<template>
  <div class="ph">
    <!-- ===== Header & global actions ===== -->
    <header class="ph-head">
      <div>
        <h3 class="ph-title">Shared roll</h3>
        <p class="ph-sub">
          {{ photos.length }} photo{{ photos.length === 1 ? '' : 's' }}
          <template v-if="contributorCount"> · {{ contributorCount }} contributor{{ contributorCount === 1 ? '' : 's' }}</template>
          <template v-if="demo"> · demo trip, photos aren't saved</template>
        </p>
      </div>
      <div class="ph-actions">
        <button v-if="photos.length" type="button" class="ph-ghost" :disabled="zipping" @click="downloadAll" data-testid="photos-zip">
          <span aria-hidden="true">⬇</span> {{ zipping ? zipText : 'Download all (.zip)' }}
        </button>
        <button v-if="photos.length" type="button" class="ph-primary" @click="$refs.picker.click()" data-testid="photos-add">+ Drop photos</button>
        <input ref="picker" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple class="visually-hidden"
          tabindex="-1" aria-hidden="true" @change="onPick">
      </div>
    </header>

    <!-- ===== Spot album switcher ===== -->
    <div class="ph-rail" role="tablist" aria-label="Albums">
      <button type="button" role="tab" class="ph-pill" :class="{ on: album === 'all' }" :aria-selected="album === 'all'" @click="album = 'all'">
        All <span class="ph-n">{{ photos.length }}</span>
      </button>
      <button type="button" role="tab" class="ph-pill" :class="{ on: album === '' }" :aria-selected="album === ''" @click="album = ''">
        <AppIcon name="sparkles" :size="15" /> Highlights <span class="ph-n">{{ countIn('') }}</span>
      </button>
      <button v-for="a in albums" :key="a.id" type="button" role="tab" class="ph-pill" :class="{ on: album === a.id }"
        :aria-selected="album === a.id" @click="album = a.id">
        {{ a.icon }} {{ a.name }} <span class="ph-n">{{ countIn(a.id) }}</span>
      </button>
      <div class="ph-add-wrap">
        <button type="button" class="ph-pill ph-pill-add" :aria-expanded="addingAlbum" @click="addingAlbum = !addingAlbum">+ Add album</button>
      </div>
    </div>

    <!-- New spot album: pick from the wishlist or type a name -->
    <transition name="ph-drop">
      <form v-if="addingAlbum" class="ph-newalbum" @submit.prevent="createAlbum(newAlbumName, '📍')">
        <p class="ph-small mb-2">From your wishlist</p>
        <div class="d-flex flex-wrap gap-2 mb-3">
          <button v-for="s in albumSuggestions" :key="s.name" type="button" class="ph-pill" @click="createAlbum(s.name, s.icon)">
            {{ s.icon }} {{ s.name }}
          </button>
          <span v-if="!albumSuggestions.length" class="ph-small">No wishlist places left to add.</span>
        </div>
        <div class="d-flex gap-2">
          <label for="ph-album-name" class="visually-hidden">Album name</label>
          <input id="ph-album-name" v-model="newAlbumName" class="ph-input" maxlength="60" placeholder="Or type a spot, e.g. Nishiki Market">
          <button type="submit" class="ph-primary" :disabled="!newAlbumName.trim()">Create</button>
          <button type="button" class="ph-ghost" @click="addingAlbum = false">Cancel</button>
        </div>
      </form>
    </transition>

    <!-- ===== Contributor filter ===== -->
    <div v-if="photos.length" class="ph-people" role="group" aria-label="Uploaded by">
      <button type="button" class="ph-chip" :class="{ on: who === '' }" :aria-pressed="who === ''" @click="who = ''">Everyone</button>
      <button v-for="p in contributors" :key="p.name" type="button" class="ph-chip" :class="{ on: who === p.name }"
        :aria-pressed="who === p.name" @click="who = who === p.name ? '' : p.name">
        <span class="ph-av" :style="{ background: colorFor(p.name) }" aria-hidden="true">{{ p.name.charAt(0).toUpperCase() }}</span>
        {{ p.name === me ? 'My photos' : p.name }} <span class="ph-n">{{ p.count }}</span>
      </button>
      <button v-if="currentAlbum" type="button" class="ph-link ms-auto" @click="removeAlbum">Remove "{{ currentAlbum.name }}" album</button>
    </div>

    <!-- ===== Upload staging tray ===== -->
    <transition name="ph-drop">
      <section v-if="uploads.length" class="ph-tray" aria-label="Uploading">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong>{{ uploadsLeft ? 'Adding ' + uploadsLeft + ' photo' + (uploadsLeft === 1 ? '' : 's') + '…' : 'Added ✓' }}</strong>
          <span class="ph-small">to {{ targetLabel }}</span>
        </div>
        <div class="ph-tray-row">
          <figure v-for="u in uploads" :key="u.key" class="ph-tray-item" :class="u.status">
            <img :src="u.preview" alt="">
            <span class="ph-tray-bar" :style="{ width: u.progress + '%' }"></span>
            <span v-if="u.status === 'done'" class="ph-tray-badge" aria-label="Uploaded">✓</span>
            <span v-if="u.status === 'error'" class="ph-tray-badge err" :title="u.error" aria-label="Failed">!</span>
          </figure>
        </div>
        <p v-for="u in failedUploads" :key="'e' + u.key" class="ph-err" role="alert">{{ u.name }}: {{ u.error }}</p>
      </section>
    </transition>

    <p v-if="loadError" class="ph-err" role="alert">{{ loadError }} <button type="button" class="ph-link" @click="loadPhotos">Try again</button></p>

    <!-- ===== Empty state ===== -->
    <button v-if="!loading && !shown.length" type="button" class="ph-empty" @click="$refs.picker.click()">
      <span class="ph-empty-stack" aria-hidden="true"><span><AppIcon name="image" :size="24" /></span><span><AppIcon name="camera" :size="24" /></span><span><AppIcon name="map-pin" :size="24" /></span></span>
      <strong class="ph-empty-title">{{ photos.length ? 'No photos here yet' : 'Start the shared roll' }}</strong>
      <span class="ph-empty-text">Drop photos anywhere on this page, or click to browse.</span>
      <span class="ph-primary mt-2">+ Add the first memories</span>
    </button>

    <!-- ===== Masonry grid ===== -->
    <div v-else class="ph-grid" data-testid="photo-grid">
      <figure v-for="(p, i) in shown" :key="p.id" class="ph-tile" :style="{ aspectRatio: p.width && p.height ? p.width + ' / ' + p.height : '4 / 3' }">
        <img v-if="thumbs[p.id]" :src="thumbs[p.id]" :alt="'Photo by ' + p.uploadedBy" loading="lazy">
        <span v-else class="ph-tile-skel" aria-hidden="true"></span>

        <!-- Uploader -->
        <span class="ph-by" :title="'Added by ' + p.uploadedBy">
          <span class="ph-av" :style="{ background: colorFor(p.uploadedBy) }" aria-hidden="true">{{ p.uploadedBy.charAt(0).toUpperCase() }}</span>
          <span class="ph-by-name">{{ p.uploadedBy }}</span>
        </span>

        <button type="button" class="ph-expand" :aria-label="'Open photo ' + (i + 1)" @click="openAt(i)">⤢</button>

        <!-- Reactions: counts always visible, adding shows on hover / focus -->
        <div class="ph-reacts">
          <button v-for="e in REACTIONS" :key="e" type="button" class="ph-react"
            :class="{ has: (p.reactions[e] || []).length, mine: (p.reactions[e] || []).includes(me) }"
            :aria-pressed="(p.reactions[e] || []).includes(me)" :aria-label="e + ' ' + (p.reactions[e] || []).length"
            :title="(p.reactions[e] || []).join(', ')" @click.stop="react(p, e)">
            {{ e }}<span v-if="(p.reactions[e] || []).length">{{ p.reactions[e].length }}</span>
          </button>
        </div>
        <button type="button" class="ph-tile-hit" tabindex="-1" aria-hidden="true" @click="openAt(i)"></button>
      </figure>
    </div>

    <!-- ===== Whole-page drop overlay ===== -->
    <Teleport to="body">
      <transition name="ph-fade">
        <div v-if="dragging" class="ph-dropzone" @dragover.prevent @dragleave.self="dragging = false" @drop.prevent="onDrop">
          <div class="ph-dropzone-card">
            <span class="ph-dropzone-icon" aria-hidden="true"><AppIcon name="upload" :size="34" /></span>
            <strong>Drop to add to {{ targetLabel }}</strong>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- ===== Lightbox ===== -->
    <Teleport to="body">
      <transition name="ph-fade">
        <div v-if="open" class="ph-lb" role="dialog" aria-modal="true" aria-label="Photo viewer" tabindex="-1" ref="lightbox"
          @keydown.esc="open = null" @keydown.left="step(-1)" @keydown.right="step(1)" @click.self="open = null">
          <button type="button" class="ph-lb-close" aria-label="Close" @click="open = null"><AppIcon name="x" :size="20" /></button>
          <button v-if="shown.length > 1" type="button" class="ph-lb-nav prev" aria-label="Previous photo" @click="step(-1)">‹</button>
          <img :src="fullUrl || thumbs[open.id]" class="ph-lb-img" :alt="'Photo by ' + open.uploadedBy">
          <button v-if="shown.length > 1" type="button" class="ph-lb-nav next" aria-label="Next photo" @click="step(1)">›</button>

          <aside class="ph-lb-info">
            <div class="d-flex align-items-center gap-2">
              <span class="ph-av lg" :style="{ background: colorFor(open.uploadedBy) }" aria-hidden="true">{{ open.uploadedBy.charAt(0).toUpperCase() }}</span>
              <div>
                <strong>{{ open.uploadedBy }}</strong>
                <span class="d-block ph-small">{{ when(open.createdAt) }} · {{ openIndex + 1 }} of {{ shown.length }}</span>
              </div>
            </div>
            <div class="ph-reacts static">
              <button v-for="e in REACTIONS" :key="e" type="button" class="ph-react"
                :class="{ has: (open.reactions[e] || []).length, mine: (open.reactions[e] || []).includes(me) }"
                :aria-pressed="(open.reactions[e] || []).includes(me)" :title="(open.reactions[e] || []).join(', ')" @click="react(open, e)">
                {{ e }}<span v-if="(open.reactions[e] || []).length">{{ open.reactions[e].length }}</span>
              </button>
            </div>
            <label class="ph-small" for="ph-move">Album</label>
            <CustomDropdown id="ph-move" :model-value="open.album || ''" :options="albumOptions" block header-text="Move to album"
              @update:model-value="move(open, $event)" />
            <div class="d-flex gap-2 mt-auto flex-wrap">
              <button type="button" class="ph-ghost" @click="downloadOne(open)">⬇ Original</button>
              <button v-if="!confirmDelete" type="button" class="ph-ghost danger" @click="confirmDelete = true">Delete</button>
              <template v-else>
                <button type="button" class="ph-ghost danger" @click="remove(open)">Delete for everyone</button>
                <button type="button" class="ph-ghost" @click="confirmDelete = false">Keep</button>
              </template>
            </div>
          </aside>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script>
import axios from 'axios'
import { placeStyle } from '../placeStyle.js'
import { makeZip } from '../zip.js'
import CustomDropdown from './CustomDropdown.vue'
import AppIcon from './AppIcon.vue'
import { notify, errorText } from '../notify.js'

const REACTIONS = ['❤️', '🔥', '😂', '😍', '👏']
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const AVATAR_COLORS = ['#00798c', '#30638e', '#d0662e', '#7a5bd6', '#c2477d', '#2b8c99']

export default {
  components: { AppIcon, CustomDropdown },
  props: {
    tripId: { type: String, default: '' },
    travellers: { type: Array, default: () => [] },
    wishlist: { type: Array, default: () => [] },       // for album suggestions
    initialAlbums: { type: Array, default: () => [] },
    me: { type: String, default: '' }, // my traveller name: photos and reactions are added as me
    filterWho: { type: Object, default: null } // { name, at } from the Crew tab: show only this person's photos
  },

  data() {
    return {
      REACTIONS,
      demo: this.tripId === 'seoul',
      albums: this.initialAlbums.slice(),
      albumBase: this.initialAlbums.slice(), // the albums as last loaded (so the server can merge everyone's changes)
      photos: [],
      thumbs: {},          // photo id -> object URL
      loading: true,
      loadError: '',
      album: 'all',        // 'all' | '' (highlights) | album id
      who: '',
      addingAlbum: false,
      newAlbumName: '',
      uploads: [],         // staging tray
      dragging: false,
      open: null,          // photo shown in the lightbox
      fullUrl: '',
      confirmDelete: false,
      zipping: false,
      zipText: ''
    }
  },

  computed: {
    albumOptions() {
      const list = [{ value: '', label: 'Highlights', icon: '✨' }]
      for (const a of this.albums) list.push({ value: a.id, label: a.name, icon: a.icon })
      return list
    },
    contributors() {
      const list = []
      for (const name of this.travellers) {
        let count = 0
        for (const p of this.photos) {
          if (p.uploadedBy === name && (this.album === 'all' || p.album === this.album)) count++
        }
        if (count) list.push({ name, count })
      }
      return list
    },
    contributorCount() {
      const names = []
      for (const p of this.photos) if (!names.includes(p.uploadedBy)) names.push(p.uploadedBy)
      return names.length
    },
    shown() {
      const list = []
      for (const p of this.photos) {
        if (this.album !== 'all' && p.album !== this.album) continue
        if (this.who && p.uploadedBy !== this.who) continue
        list.push(p)
      }
      return list
    },
    currentAlbum() {
      return this.albums.find((a) => a.id === this.album) || null
    },
    // Where new photos go: the open album, or Highlights when viewing All
    target() {
      return this.album === 'all' ? '' : this.album
    },
    targetLabel() {
      return this.currentAlbum ? this.currentAlbum.icon + ' ' + this.currentAlbum.name : '✨ Highlights'
    },
    albumSuggestions() {
      const list = []
      for (const w of this.wishlist) {
        if (!this.albums.some((a) => a.name.toLowerCase() === w.name.toLowerCase())) list.push({ name: w.name, icon: placeStyle(w.type).icon })
      }
      return list.slice(0, 12)
    },
    uploadsLeft() {
      return this.uploads.filter((u) => u.status === 'waiting' || u.status === 'uploading').length
    },
    failedUploads() {
      return this.uploads.filter((u) => u.status === 'error')
    },
    openIndex() {
      return this.open ? this.shown.findIndex((p) => p.id === this.open.id) : -1
    }
  },

  watch: {
    filterWho(value) {
      if (!value) return
      this.album = 'all'
      this.who = value.name
    },
    // Load the full-size photo when the lightbox opens or moves
    async open(photo) {
      if (this.fullUrl) URL.revokeObjectURL(this.fullUrl)
      this.fullUrl = ''
      this.confirmDelete = false
      if (!photo) return
      this.$nextTick(() => this.$refs.lightbox && this.$refs.lightbox.focus())
      const blob = await this.fetchBlob(photo, false)
      if (blob && this.open && this.open.id === photo.id) this.fullUrl = URL.createObjectURL(blob)
    }
  },

  created() {
    this.loadPhotos()
  },

  // Dragging files anywhere on the screen (while Photos is open) shows the drop overlay
  mounted() {
    window.addEventListener('dragenter', this.onDragEnter)
    window.addEventListener('dragover', this.onDragOver)
    // Pick up the group's new photos and reactions every 20 s while Photos is open
    if (!this.demo) this.pollTimer = setInterval(this.poll, 20000)
  },

  beforeUnmount() {
    window.removeEventListener('dragenter', this.onDragEnter)
    window.removeEventListener('dragover', this.onDragOver)
    clearInterval(this.pollTimer)
    for (const id in this.thumbs) URL.revokeObjectURL(this.thumbs[id])
    if (this.fullUrl) URL.revokeObjectURL(this.fullUrl)
  },

  methods: {
    url(photo, thumb) {
      return '/api/trips/' + this.tripId + '/photos/' + photo.id + '/file' + (thumb ? '?size=thumb' : '')
    },

    async loadPhotos() {
      this.loading = true
      this.loadError = ''
      if (this.demo) {
        this.loading = false
        return
      }
      try {
        const res = await axios.get('/api/trips/' + this.tripId + '/photos')
        for (const p of res.data) p.reactions = p.reactions || {}
        this.photos = res.data
        this.loadThumbs()
      } catch (err) {
        this.loadError = 'Could not load photos.'
      }
      this.loading = false
    },

    async poll() {
      if (!this.$el.offsetParent || document.hidden || this.uploadsLeft) return
      try {
        const [res, albums] = await Promise.all([
          axios.get('/api/trips/' + this.tripId + '/photos'),
          axios.get('/api/trips/' + this.tripId + '/albums')
        ])
        this.setAlbums(albums.data.albums)
        const list = []
        for (const p of res.data) {
          const old = this.photos.find((x) => x.id === p.id)
          p.reactions = p.reactions || {}
          list.push(old ? Object.assign(old, p) : p)
        }
        this.photos = list
        this.loadThumbs()
        if (this.open && !list.some((p) => p.id === this.open.id)) this.open = null // someone deleted it
      } catch (err) {
        // try again next time
      }
    },

    // Thumbnails need the login token, so they are fetched as files (4 at a time)
    async loadThumbs() {
      const queue = this.photos.filter((p) => !this.thumbs[p.id])
      const worker = async () => {
        while (queue.length) {
          const p = queue.shift()
          const blob = await this.fetchBlob(p, true)
          if (blob) this.thumbs[p.id] = URL.createObjectURL(blob)
        }
      }
      await Promise.all([worker(), worker(), worker(), worker()])
    },

    async fetchBlob(photo, thumb) {
      if (photo.localBlob) return thumb && photo.localThumb ? photo.localThumb : photo.localBlob // demo trip
      try {
        const res = await axios.get(this.url(photo, thumb), { responseType: 'blob' })
        return res.data
      } catch (err) {
        return null
      }
    },

    countIn(albumId) {
      let count = 0
      for (const p of this.photos) if (p.album === albumId) count++
      return count
    },

    colorFor(name) {
      const i = Math.max(0, this.travellers.indexOf(name))
      return AVATAR_COLORS[i % AVATAR_COLORS.length]
    },

    when(date) {
      return date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Just now'
    },

    // ---------- albums ----------
    async saveAlbums() {
      if (this.demo) return
      try {
        const res = await axios.put('/api/trips/' + this.tripId + '/albums', { albums: this.albums, base: this.albumBase })
        this.setAlbums(res.data.albums)
      } catch (err) {
        notify(errorText(err, 'Could not save your albums.'), () => this.saveAlbums())
      }
    },

    // The albums from the server (with everyone's changes)
    setAlbums(list) {
      this.albums = list.slice()
      this.albumBase = list.slice()
      if (this.album !== 'all' && this.album !== '' && !list.some((a) => a.id === this.album)) this.album = 'all' // someone deleted it
    },

    async createAlbum(name, icon) {
      name = (name || '').trim()
      if (!name) return
      const existing = this.albums.find((a) => a.name.toLowerCase() === name.toLowerCase())
      if (existing) {
        this.album = existing.id
      } else {
        const a = { id: 'a' + Date.now(), name, icon }
        this.albums.push(a)
        this.album = a.id
        await this.saveAlbums()
      }
      this.addingAlbum = false
      this.newAlbumName = ''
    },

    async removeAlbum() {
      const id = this.album
      this.albums = this.albums.filter((a) => a.id !== id)
      for (const p of this.photos) if (p.album === id) p.album = '' // photos go back to Highlights
      this.album = 'all'
      await this.saveAlbums()
    },

    // ---------- adding photos ----------
    hasFiles(e) {
      return this.$el.offsetParent !== null && e.dataTransfer && e.dataTransfer.types.includes('Files')
    },

    onDragEnter(e) {
      if (this.hasFiles(e)) this.dragging = true
    },

    // Stops the browser from opening a dropped photo in the tab
    onDragOver(e) {
      if (this.hasFiles(e)) e.preventDefault()
    },

    onDrop(e) {
      this.dragging = false
      this.addFiles(e.dataTransfer.files)
    },

    onPick(e) {
      this.addFiles(e.target.files)
      e.target.value = ''
    },

    addFiles(fileList) {
      const fresh = []
      for (const file of fileList) {
        const item = { key: Math.random().toString(36).slice(2), name: file.name, file, preview: URL.createObjectURL(file), status: 'waiting', progress: 0, error: '' }
        if (!TYPES.includes(file.type)) {
          item.status = 'error'
          item.error = file.type === 'image/heic' ? 'HEIC photos are not supported, export as JPEG' : 'Not a JPEG, PNG, WebP or GIF'
        } else if (file.size > 10 * 1024 * 1024) {
          item.status = 'error'
          item.error = 'Bigger than 10 MB'
        }
        fresh.push(item)
      }
      // Keep finished ones from earlier batches out of the tray
      this.uploads = this.uploads.filter((u) => u.status === 'uploading' || u.status === 'waiting').concat(fresh)
      this.runUploads()
    },

    // Two uploads at a time
    async runUploads() {
      if (this.running) return
      this.running = true
      const worker = async () => {
        let next = this.uploads.find((u) => u.status === 'waiting')
        while (next) {
          next.status = 'uploading'
          await this.uploadOne(next)
          next = this.uploads.find((u) => u.status === 'waiting')
        }
      }
      await Promise.all([worker(), worker()])
      this.running = false
      // Tidy the tray a little after everything is in
      setTimeout(() => {
        if (!this.uploadsLeft && !this.failedUploads.length) this.uploads = []
      }, 2500)
    },

    // Small JPEG preview (max 480px) for the grid, plus the photo's size
    async makeThumb(file) {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
      return { blob, width: bitmap.width, height: bitmap.height }
    },

    async uploadOne(u) {
      try {
        const t = await this.makeThumb(u.file)
        if (this.demo) {
          const photo = { id: 'demo-' + u.key, album: this.target, uploadedBy: this.me, fileName: u.name, width: t.width, height: t.height,
            reactions: {}, createdAt: new Date().toISOString(), localBlob: u.file, localThumb: t.blob }
          this.photos.unshift(photo)
          this.thumbs[photo.id] = URL.createObjectURL(t.blob)
          u.progress = 100
          u.status = 'done'
          return
        }
        const params = { album: this.target, name: u.name, w: t.width, h: t.height }
        const res = await axios.post('/api/trips/' + this.tripId + '/photos', u.file, {
          params,
          headers: { 'Content-Type': u.file.type },
          onUploadProgress: (e) => { u.progress = e.total ? Math.round((e.loaded / e.total) * 90) : 50 }
        })
        const photo = res.data
        photo.reactions = photo.reactions || {}
        await axios.put('/api/trips/' + this.tripId + '/photos/' + photo.id + '/thumb', t.blob, { headers: { 'Content-Type': 'image/jpeg' } })
        this.photos.unshift(photo)
        this.thumbs[photo.id] = URL.createObjectURL(t.blob)
        u.progress = 100
        u.status = 'done'
      } catch (err) {
        u.status = 'error'
        u.error = (err.response && err.response.data && err.response.data.message) || 'Upload failed'
      }
    },

    // ---------- photo actions ----------
    async react(photo, emoji) {
      // Update straight away, then save
      const before = photo.reactions
      const people = photo.reactions[emoji] || []
      photo.reactions = { ...photo.reactions, [emoji]: people.includes(this.me) ? people.filter((p) => p !== this.me) : people.concat(this.me) }
      if (!photo.reactions[emoji].length) delete photo.reactions[emoji]
      if (this.demo) return
      try {
        const res = await axios.post('/api/trips/' + this.tripId + '/photos/' + photo.id + '/react', { emoji })
        photo.reactions = res.data.reactions || {}
      } catch (err) {
        photo.reactions = before // put it back so what you see is what's saved
        notify(errorText(err, 'Could not save your reaction.'), () => this.react(photo, emoji))
      }
    },

    async move(photo, albumId) {
      const before = photo.album
      photo.album = albumId
      if (this.demo) return
      try {
        await axios.patch('/api/trips/' + this.tripId + '/photos/' + photo.id, { album: albumId })
      } catch (err) {
        photo.album = before
        notify(errorText(err, 'Could not move the photo.'), () => this.move(photo, albumId))
      }
    },

    async remove(photo) {
      const i = this.openIndex
      if (!this.demo) {
        try {
          await axios.delete('/api/trips/' + this.tripId + '/photos/' + photo.id)
        } catch (err) {
          notify(errorText(err, 'Could not delete the photo.'), () => this.remove(photo))
          return // keep it showing: it wasn't deleted
        }
      }
      this.photos = this.photos.filter((p) => p.id !== photo.id)
      if (this.thumbs[photo.id]) URL.revokeObjectURL(this.thumbs[photo.id])
      delete this.thumbs[photo.id]
      this.open = this.shown.length ? this.shown[Math.min(i, this.shown.length - 1)] : null
    },

    openAt(i) {
      this.open = this.shown[i]
    },

    step(dir) {
      const n = this.shown.length
      if (!n) return
      this.open = this.shown[(this.openIndex + dir + n) % n]
    },

    save(blob, name) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    },

    async downloadOne(photo) {
      const blob = await this.fetchBlob(photo, false)
      if (blob) this.save(blob, photo.fileName || 'photo.jpg')
    },

    // Originals of the photos on screen, in one .zip
    async downloadAll() {
      this.zipping = true
      const files = []
      const list = this.shown
      for (let i = 0; i < list.length; i++) {
        this.zipText = 'Zipping ' + (i + 1) + ' / ' + list.length + '…'
        const blob = await this.fetchBlob(list[i], false)
        if (blob) files.push({ name: list[i].fileName || 'photo-' + (i + 1) + '.jpg', blob })
      }
      const zip = await makeZip(files)
      const albumName = this.currentAlbum ? this.currentAlbum.name : this.album === '' ? 'Highlights' : 'All photos'
      this.save(zip, 'Chui-se ' + albumName + '.zip')
      this.zipping = false
    }
  }
}
</script>

<style scoped>
.ph {
  --mint: #edae49;
  --glass: rgba(255, 255, 255, 0.08);
  --text: #f6efe3;
  --muted: rgba(245, 238, 226, 0.62);
  background: linear-gradient(180deg, #121b19, #022538);
  color: var(--text);
  border: 1px solid var(--glass);
  border-radius: 24px;
  padding: 22px;
  min-height: 360px;
}
.ph-small {
  font-size: 13px;
  color: var(--muted);
}
.ph-n {
  font-size: 12px;
  opacity: 0.7;
  margin-left: 2px;
  font-variant-numeric: tabular-nums;
}

/* Header */
.ph-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}
.ph-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  margin: 0;
}
.ph-sub {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}
.ph-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ph-as {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
  margin: 0;
}
.ph-as select,
.ph-input {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  border: 1px solid var(--glass);
  border-radius: 12px;
  padding: 7px 10px;
}
.ph-input {
  flex: 1;
  width: 100%;
}
.ph-as option,
.ph-input option {
  color: #003d5b;
}
.ph-primary {
  display: inline-block;
  background: var(--mint);
  color: #00283c;
  border: 0;
  border-radius: 999px;
  padding: 9px 18px;
  font-weight: 700;
  box-shadow: 0 6px 20px rgba(237, 174, 73, 0.25);
  transition: transform 0.15s, box-shadow 0.15s;
}
.ph-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 26px rgba(237, 174, 73, 0.35);
}
.ph-primary:disabled {
  opacity: 0.5;
}
.ph-ghost {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  border: 1px solid var(--glass);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 14px;
}
.ph-ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}
.ph-ghost.danger {
  color: #ff8f8f;
}
.ph-link {
  border: 0;
  background: none;
  color: var(--mint);
  font-size: 13px;
  font-weight: 600;
  padding: 0;
}

/* Album rail */
.ph-rail {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: none;
}
.ph-rail::-webkit-scrollbar {
  display: none;
}
.ph-pill {
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  border: 1px solid var(--glass);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 14px;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}
.ph-pill:hover {
  background: rgba(255, 255, 255, 0.1);
}
.ph-pill.on {
  background: rgba(237, 174, 73, 0.16);
  border-color: rgba(237, 174, 73, 0.6);
  color: #f8deb0;
}
.ph-pill-add {
  border-style: dashed;
  color: var(--mint);
}
.ph-newalbum {
  margin-top: 10px;
  padding: 16px;
  border: 1px solid var(--glass);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

/* Contributor filter */
.ph-people {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 12px 0 16px;
}
.ph-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  color: var(--muted);
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 4px 12px 4px 4px;
  font-size: 13px;
}
.ph-chip:first-child {
  padding-left: 12px;
}
.ph-chip:hover {
  color: var(--text);
}
.ph-chip.on {
  color: var(--text);
  border-color: var(--glass);
  background: rgba(255, 255, 255, 0.08);
}
.ph-av {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(13, 20, 18, 0.9);
  flex-shrink: 0;
}
.ph-av.lg {
  width: 36px;
  height: 36px;
  font-size: 14px;
}

/* Upload tray */
.ph-tray {
  margin: 4px 0 16px;
  padding: 14px;
  border: 1px solid rgba(237, 174, 73, 0.35);
  border-radius: 16px;
  background: rgba(237, 174, 73, 0.06);
}
.ph-tray-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}
.ph-tray-item {
  position: relative;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  margin: 0;
  border-radius: 12px;
  overflow: hidden;
  background: #0b3048;
}
.ph-tray-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ph-tray-item.waiting img {
  opacity: 0.45;
}
.ph-tray-item.error img {
  opacity: 0.35;
  filter: grayscale(1);
}
.ph-tray-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 4px;
  background: var(--mint);
  transition: width 0.2s;
}
.ph-tray-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--mint);
  color: #00283c;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ph-tray-badge.err {
  background: #ff6b6b;
  color: #fff;
}
.ph-err {
  color: #f09aa5;
  font-size: 13px;
  margin: 8px 0 0;
}

/* Empty state */
.ph-empty {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 48px 16px;
  margin-top: 8px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text);
  border: 2px dashed rgba(237, 174, 73, 0.35);
  border-radius: 20px;
  transition: background 0.2s, border-color 0.2s;
}
.ph-empty:hover {
  background: rgba(237, 174, 73, 0.05);
  border-color: rgba(237, 174, 73, 0.6);
}
.ph-empty-stack {
  display: flex;
  margin-bottom: 8px;
}
.ph-empty-stack span {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  border-radius: 14px;
  background: #1c2825;
  border: 1px solid var(--glass);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.3);
}
.ph-empty-stack span:nth-child(1) { transform: rotate(-10deg) translateX(10px); }
.ph-empty-stack span:nth-child(2) { transform: translateY(-6px); z-index: 1; }
.ph-empty-stack span:nth-child(3) { transform: rotate(10deg) translateX(-10px); }
.ph-empty-title {
  font-family: var(--font-display);
  font-size: 1.3rem;
}
.ph-empty-text {
  color: var(--muted);
  font-size: 14px;
}

/* Masonry grid: columns keep each photo's own shape */
.ph-grid {
  columns: 240px;
  column-gap: 12px;
}
.ph-tile {
  position: relative;
  margin: 0 0 12px;
  break-inside: avoid;
  border-radius: 16px;
  overflow: hidden;
  background: #0b3048;
  border: 1px solid var(--glass);
}
.ph-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.35s ease;
}
.ph-tile:hover img {
  transform: scale(1.03);
}
.ph-tile-skel {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #0b3048, #22302c, #0b3048);
  background-size: 200% 100%;
  animation: ph-shimmer 1.2s infinite;
}
/* Darken edges on hover so the controls stay readable */
.ph-tile::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.35), transparent 30%, transparent 60%, rgba(0, 0, 0, 0.5));
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}
.ph-tile:hover::after,
.ph-tile:focus-within::after {
  opacity: 1;
}
.ph-tile-hit {
  position: absolute;
  inset: 0;
  border: 0;
  background: transparent;
  z-index: 1;
  cursor: zoom-in;
}
.ph-by {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px 2px 2px;
  border-radius: 999px;
  background: rgba(0, 30, 46, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  font-size: 12px;
  font-weight: 600;
}
/* Name only shows on hover; the avatar is always there */
.ph-by-name {
  max-width: 0;
  overflow: hidden;
  white-space: nowrap;
  transition: max-width 0.25s;
}
.ph-by {
  padding-right: 2px;
}
.ph-tile:hover .ph-by,
.ph-tile:focus-within .ph-by {
  padding-right: 10px;
}
.ph-tile:hover .ph-by-name,
.ph-tile:focus-within .ph-by-name {
  max-width: 120px;
}
.ph-expand {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--glass);
  background: rgba(0, 30, 46, 0.55);
  color: #fff;
  opacity: 0;
  transition: opacity 0.2s;
}
.ph-tile:hover .ph-expand,
.ph-expand:focus-visible {
  opacity: 1;
}
.ph-reacts {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.ph-reacts.static {
  position: static;
  margin: 14px 0;
}
.ph-react {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--glass);
  border-radius: 999px;
  background: rgba(0, 30, 46, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #fff;
  font-size: 13px;
  padding: 3px 9px;
  transition: transform 0.15s, opacity 0.2s;
}
.ph-react:hover {
  transform: scale(1.08);
}
.ph-react.mine {
  border-color: rgba(237, 174, 73, 0.8);
  background: rgba(237, 174, 73, 0.22);
}
/* On the grid: only reactions with counts show until you hover */
.ph-tile .ph-react:not(.has) {
  display: none;
}
.ph-tile:hover .ph-react:not(.has),
.ph-tile:focus-within .ph-react:not(.has) {
  display: inline-flex;
}

/* Drop overlay */
.ph-dropzone {
  position: fixed;
  inset: 0;
  z-index: 1060;
  background: rgba(0, 24, 38, 0.72);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.ph-dropzone-card {
  pointer-events: none;
  width: min(520px, 100%);
  padding: 48px 24px;
  border: 2px dashed #edae49;
  border-radius: 24px;
  background: rgba(237, 174, 73, 0.08);
  color: #f6efe3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 1.1rem;
  animation: ph-pulse 1.4s ease-in-out infinite;
}
.ph-dropzone-icon {
  font-size: 44px;
}

/* Lightbox */
.ph-lb {
  position: fixed;
  inset: 0;
  z-index: 1060;
  background: rgba(5, 9, 8, 0.92);
  display: grid;
  grid-template-columns: 1fr 300px;
  align-items: center;
  outline: none;
}
.ph-lb-img {
  max-width: calc(100% - 120px);
  max-height: 88vh;
  justify-self: center;
  border-radius: 12px;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5);
}
.ph-lb-close,
.ph-lb-nav {
  position: absolute;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-radius: 50%;
  width: 44px;
  height: 44px;
  font-size: 22px;
  z-index: 1;
}
.ph-lb-close {
  top: 16px;
  right: 316px;
  font-size: 16px;
}
.ph-lb-nav {
  top: 50%;
  transform: translateY(-50%);
}
.ph-lb-nav.prev {
  left: 16px;
}
.ph-lb-nav.next {
  right: 316px;
}
.ph-lb-info {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 24px 20px;
  background: #0f1715;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  color: #f6efe3;
}

/* Keyboard focus */
.ph-pill:focus-visible,
.ph-chip:focus-visible,
.ph-primary:focus-visible,
.ph-ghost:focus-visible,
.ph-react:focus-visible,
.ph-empty:focus-visible,
.ph-lb-nav:focus-visible,
.ph-lb-close:focus-visible {
  outline: 3px solid rgba(237, 174, 73, 0.6);
  outline-offset: 2px;
}

/* Transitions */
.ph-fade-enter-active,
.ph-fade-leave-active,
.ph-drop-enter-active,
.ph-drop-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.ph-fade-enter-from,
.ph-fade-leave-to {
  opacity: 0;
}
.ph-drop-enter-from,
.ph-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@keyframes ph-shimmer {
  to { background-position: -200% 0; }
}
@keyframes ph-pulse {
  50% { border-color: rgba(237, 174, 73, 0.4); }
}

@media (max-width: 768px) {
  .ph {
    padding: 16px;
  }
  .ph-grid {
    columns: 2;
    column-gap: 8px;
  }
  .ph-tile {
    margin-bottom: 8px;
  }
  /* Touch screens can't hover: show the controls */
  .ph-expand { opacity: 1; }
  .ph-tile .ph-react:not(.has) { display: none; }
  .ph-lb {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }
  .ph-lb-img {
    max-width: 100%;
    max-height: 60vh;
  }
  .ph-lb-close { right: 16px; }
  .ph-lb-nav.next { right: 16px; }
  .ph-lb-nav { top: 30%; }
  .ph-lb-info {
    height: auto;
    border-left: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ph-tile img,
  .ph-primary,
  .ph-react,
  .ph-by-name { transition: none; }
  .ph-dropzone-card,
  .ph-tile-skel { animation: none; }
}
</style>
