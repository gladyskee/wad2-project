<template>
  <!-- Notes the crew leave on one stop: add, edit your own, delete your own (the organiser can delete any) -->
  <section class="sn" aria-label="Notes on this stop">
    <p v-if="loading" class="sn-empty">Loading notes…</p>
    <p v-else-if="loadError" class="sn-error" role="alert">
      {{ loadError }} <button type="button" class="sn-link" @click="load">Try again</button>
    </p>
    <template v-else>
      <p v-if="!notes.length" class="sn-empty">
        No notes yet. Leave one for the group, like "book tickets ahead" or "cash only".
      </p>
      <ol v-else class="sn-list">
        <li v-for="n in notes" :key="n.id" class="sn-note" :class="{ mine: n.mine }">
          <span class="sn-avatar" aria-hidden="true">{{ n.name.charAt(0).toUpperCase() }}</span>
          <div class="sn-bubble">
            <p class="sn-meta">
              <strong>{{ n.mine ? 'You' : n.name }}</strong>
              <span>{{ timeAgo(n.at) }}<template v-if="n.editedAt"> · edited</template></span>
            </p>

            <!-- Editing this note -->
            <form v-if="editingId === n.id" class="sn-edit" @submit.prevent="saveEdit(n)">
              <label :for="'sn-edit-' + n.id" class="visually-hidden">Edit your note</label>
              <textarea :id="'sn-edit-' + n.id" ref="editBox" v-model="editText" class="sn-input" rows="2" maxlength="500"
                @keydown.esc.stop="editingId = null"></textarea>
              <div class="sn-actions">
                <button type="submit" class="sn-btn primary" :disabled="!editText.trim() || busy">Save</button>
                <button type="button" class="sn-btn" @click="editingId = null">Cancel</button>
              </div>
            </form>
            <p v-else class="sn-text">{{ n.text }}</p>

            <!-- Deleting: ask once, right on the note -->
            <div v-if="confirmId === n.id" class="sn-confirm" role="alert">
              <span>Delete this note?</span>
              <button type="button" class="sn-btn danger" :disabled="busy" @click="remove(n)">Delete</button>
              <button type="button" class="sn-btn" @click="confirmId = null">Keep</button>
            </div>
            <div v-else-if="editingId !== n.id && (n.mine || n.canDelete)" class="sn-tools">
              <button v-if="n.mine" type="button" class="sn-tool" @click="startEdit(n)">Edit</button>
              <button v-if="n.canDelete" type="button" class="sn-tool" @click="confirmId = n.id">Delete</button>
            </div>
          </div>
        </li>
      </ol>

      <!-- New note -->
      <form class="sn-new" @submit.prevent="add">
        <label for="sn-new-text" class="visually-hidden">Add a note</label>
        <textarea id="sn-new-text" v-model="newText" class="sn-input" rows="2" maxlength="500"
          placeholder="Add a note for the group…" @keydown.enter.exact.prevent="add"></textarea>
        <div class="sn-new-foot">
          <small :class="{ warn: newText.length > 450 }">{{ newText.length }}/500 · Enter to post</small>
          <button type="submit" class="sn-btn primary" :disabled="!newText.trim() || busy">Post</button>
        </div>
      </form>
      <p v-if="error" class="sn-error" role="alert">{{ error }}</p>
    </template>
  </section>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

const props = defineProps({
  stopId: { type: String, default: '' }
})
const emit = defineEmits(['count'])

const route = useRoute()
const notes = ref([])
const loading = ref(true)
const loadError = ref('')
const error = ref('')
const busy = ref(false)
const newText = ref('')
const editingId = ref(null)
const editText = ref('')
const confirmId = ref(null)
const editBox = ref(null)

function url(extra) {
  return '/api/trips/' + route.params.id + '/comments' + (extra || '')
}
function messageOf(err, fallback) {
  return (err.response && err.response.data && err.response.data.message) || fallback
}

async function load() {
  if (!props.stopId) return
  loading.value = true
  loadError.value = ''
  try {
    const res = await axios.get(url(), { params: { stop: props.stopId } })
    notes.value = res.data
    emit('count', notes.value.length)
  } catch (err) {
    loadError.value = messageOf(err, 'Could not load the notes.')
  }
  loading.value = false
}

// Every 20 seconds while the notes are open: pick up the group's new notes (not while I'm editing one)
async function refresh() {
  if (!props.stopId || document.hidden || busy.value || editingId.value) return
  try {
    const res = await axios.get(url(), { params: { stop: props.stopId } })
    notes.value = res.data
    emit('count', notes.value.length)
  } catch (err) {
    // try again next time
  }
}
const timer = setInterval(refresh, 20000)
onBeforeUnmount(() => clearInterval(timer))

async function add() {
  const text = newText.value.trim()
  if (!text || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await axios.post(url(), { stopId: props.stopId, text })
    notes.value.push(res.data)
    newText.value = ''
    emit('count', notes.value.length)
  } catch (err) {
    error.value = messageOf(err, 'Could not post the note.')
  }
  busy.value = false
}

function startEdit(n) {
  editingId.value = n.id
  editText.value = n.text
  confirmId.value = null
  nextTick(() => {
    const box = Array.isArray(editBox.value) ? editBox.value[0] : editBox.value
    if (box) box.focus()
  })
}

async function saveEdit(n) {
  const text = editText.value.trim()
  if (!text) return
  busy.value = true
  error.value = ''
  try {
    const res = await axios.put(url('/' + n.id), { text })
    n.text = res.data.text
    n.editedAt = res.data.editedAt
    editingId.value = null
  } catch (err) {
    error.value = messageOf(err, 'Could not save the note.')
  }
  busy.value = false
}

async function remove(n) {
  busy.value = true
  error.value = ''
  try {
    await axios.delete(url('/' + n.id))
    notes.value = notes.value.filter((x) => x.id !== n.id)
    confirmId.value = null
    emit('count', notes.value.length)
  } catch (err) {
    error.value = messageOf(err, 'Could not delete the note.')
  }
  busy.value = false
}

// "just now", "5 min ago", "3 h ago", "12 Oct"
function timeAgo(at) {
  const min = Math.round((Date.now() - new Date(at).getTime()) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return min + ' min ago'
  if (min < 24 * 60) return Math.round(min / 60) + ' h ago'
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// A different stop opened: start fresh
watch(() => props.stopId, () => {
  notes.value = []
  newText.value = ''
  editingId.value = null
  confirmId.value = null
  error.value = ''
  load()
}, { immediate: true })
</script>

<style scoped>
.sn-empty {
  font-size: 14px;
  color: #5a6b78;
  margin: 0 0 14px;
}
.sn-list {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sn-note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.sn-avatar {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #003d5b;
  color: #fff;
  font-weight: 700;
  font-size: 13px;
}
.sn-note.mine .sn-avatar {
  background: #edae49;
  color: #001d2c;
}
.sn-bubble {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  border-radius: 4px 18px 18px 18px;
  background: #fff;
  border: 1px solid #ece4d6;
  box-shadow: 0 2px 8px rgba(0, 40, 62, 0.05);
}
.sn-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 12px;
  color: #5a6b78;
}
.sn-meta strong {
  color: #003d5b;
  font-size: 13px;
}
.sn-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.sn-tools {
  display: flex;
  gap: 12px;
  margin-top: 6px;
}
.sn-tool {
  border: 0;
  background: none;
  padding: 2px 0;
  font-size: 12px;
  font-weight: 600;
  color: #00798c;
}
.sn-tool:hover {
  text-decoration: underline;
}
.sn-confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
}
.sn-input {
  width: 100%;
  resize: vertical;
  min-height: 52px;
  border: 1.5px solid #e6dfd2;
  border-radius: 14px;
  background: #fff;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  color: #003d5b;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sn-input:focus {
  outline: none;
  border-color: #edae49;
  box-shadow: 0 0 0 3px rgba(237, 174, 73, 0.2);
}
.sn-edit .sn-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.sn-new {
  position: sticky;
  bottom: -28px;
  padding: 12px 0 4px;
  background: #fbf5ea;
}
.sn-new-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.sn-new-foot small {
  font-size: 12px;
  color: #5a6b78;
}
.sn-new-foot small.warn {
  color: #d1495b;
}
.sn-btn {
  border: 1.5px solid #e6dfd2;
  border-radius: 999px;
  background: #fff;
  color: #003d5b;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 700;
  transition: transform 0.15s, opacity 0.15s;
}
.sn-btn.primary {
  border-color: #003d5b;
  background: #003d5b;
  color: #fff;
}
.sn-btn.danger {
  border-color: #d1495b;
  background: #d1495b;
  color: #fff;
}
.sn-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}
.sn-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.sn-btn:focus-visible,
.sn-tool:focus-visible,
.sn-link:focus-visible {
  outline: 3px solid rgba(237, 174, 73, 0.7);
  outline-offset: 2px;
}
.sn-error {
  font-size: 13px;
  color: #d1495b;
  margin: 8px 0 0;
}
.sn-link {
  border: 0;
  background: none;
  padding: 0;
  color: #00798c;
  font-weight: 600;
  text-decoration: underline;
}
@media (prefers-reduced-motion: reduce) {
  .sn-btn {
    transition: none;
  }
}
</style>
