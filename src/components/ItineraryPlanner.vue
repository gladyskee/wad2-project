<template>
  <section class="ip" aria-label="Itinerary planner">
    <!-- ===== Day navigator =====
         Where you are ("Day 8 of 15"), ‹ › to step, a scrolling strip that keeps the open day in view
         (faded edges = more days that way), "All days" grid to jump anywhere, and Add/Remove that never scroll away. -->
    <div class="ip-daynav">
      <div class="ip-daynav-top">
        <p class="ip-daynav-where" aria-live="polite">
          <template v-if="dayList.length && dayShown"><strong>Day {{ dayIndex + 1 }}</strong> of {{ dayList.length }} · {{ longDate(dayShown) }}</template>
          <template v-else>No days yet</template>
        </p>
        <div class="ip-daynav-actions">
          <div class="ip-allwrap">
            <button type="button" class="ip-small" :aria-expanded="gridOpen" aria-haspopup="dialog" @click.stop="gridOpen = !gridOpen">
              <span aria-hidden="true">▦</span> All days
            </button>
            <!-- Grid of every day: jump straight to one -->
            <div v-if="gridOpen" class="ip-grid" role="dialog" aria-label="All days" @click.stop @keydown.esc="gridOpen = false">
              <p class="ip-grid-key"><span class="ip-load"><i style="width: 60%"></i></span> how full · <i class="ip-flag inline"></i> something to check</p>
              <button v-for="(d, n) in dayList" :key="d" type="button" class="ip-grid-day" :class="{ on: d === dayShown, today: isTodayDate(d) }"
                :aria-current="d === dayShown ? 'date' : null" @click="pickDay(d); gridOpen = false">
                <strong>{{ n + 1 }}</strong>
                <span>{{ weekday(d) }} {{ dayOfMonth(d) }}</span>
                <small>{{ countFor(d) ? countFor(d) + ' stop' + (countFor(d) === 1 ? '' : 's') : '—' }}</small>
                <span class="ip-load" :title="loadText(d)"><i :class="{ over: loadOf(d) > 1 }" :style="{ width: Math.min(100, loadOf(d) * 100) + '%' }"></i></span>
                <i v-if="issuesOn(d)" class="ip-flag" :aria-label="issuesOn(d) + ' to check'"></i>
              </button>
            </div>
          </div>
          <button v-if="sampleMode || canAddDay" type="button" class="ip-small add" title="Add a day at the end of the trip" @click="askAddDay">+ Add day</button>
          <button v-if="(sampleMode || canAddDay) && dayList.length > 1" type="button" class="ip-small remove"
            :title="'Remove the last day (Day ' + dayList.length + ')'" :aria-label="'Remove the last day, Day ' + dayList.length" @click="askRemoveDay">− Day {{ dayList.length }}</button>
        </div>
      </div>

      <div class="ip-strip-row">
        <button type="button" class="ip-arrow" :disabled="dayIndex <= 0" aria-label="Previous day" @click="stepDay(-1)">‹</button>
        <div class="ip-strip-wrap" :class="{ 'fade-l': fadeL, 'fade-r': fadeR }">
          <div ref="stripEl" class="ip-days" role="tablist" aria-label="Trip days" @scroll.passive="updateFades" @keydown="onDayKey">
            <button v-for="(d, n) in dayList" :key="d" :ref="(el) => { if (el) dayEls[d] = el }" type="button" role="tab" class="ip-day"
              :class="{ on: d === dayShown, today: isTodayDate(d), weekend: isWeekend(d), flagged: issuesOn(d) }" :aria-selected="d === dayShown"
              :tabindex="d === dayShown ? 0 : -1" :title="longDate(d) + (countFor(d) ? ' · ' + countFor(d) + ' stops' : ' · nothing planned') + (issuesOn(d) ? ' · ' + issuesOn(d) + ' to check' : '')"
              @click="pickDay(d)">
              <small>{{ weekday(d) }}</small>
              <strong>{{ dayOfMonth(d) }}</strong>
              <span class="ip-day-n">Day {{ n + 1 }}</span>
              <span class="ip-day-dots" aria-hidden="true">
                <i v-for="k in Math.min(countFor(d), 4)" :key="k"></i>
              </span>
            </button>
          </div>
        </div>
        <button type="button" class="ip-arrow" :disabled="dayIndex >= dayList.length - 1" aria-label="Next day" @click="stepDay(1)">›</button>
      </div>
    </div>

    <!-- Confirm before adding or removing a day (says exactly what will happen) -->
    <transition name="ip-fade">
      <div v-if="confirm" class="ip-overlay" @click.self="confirm = null" @keydown.esc="confirm = null">
        <div ref="dialogEl" class="ip-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ip-dialog-title" :aria-describedby="confirm.lines.length ? 'ip-dialog-body' : null" tabindex="-1">
          <span class="ip-dialog-icon" :class="{ danger: confirm.danger }" aria-hidden="true"><AppIcon :name="confirm.danger ? 'trash' : confirm.kind === 'city' ? 'compass' : 'calendar'" :size="22" /></span>
          <h3 id="ip-dialog-title" class="ip-dialog-title">{{ confirm.title }}</h3>
          <ul v-if="confirm.lines.length" id="ip-dialog-body" class="ip-dialog-list">
            <li v-for="(line, k) in confirm.lines" :key="k">{{ line }}</li>
          </ul>
          <div class="ip-dialog-btns">
            <button type="button" class="ip-outline" @click="confirm = null">Cancel</button>
            <button ref="confirmBtn" type="button" class="ip-cta" :class="{ danger: confirm.danger }" @click="doConfirm">{{ confirm.button }}</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Done message with Undo -->
    <transition name="ip-fade">
      <div v-if="toast" class="ip-toast" role="status">
        <span>{{ toast.text }}</span>
        <button v-if="toast.undo" type="button" class="ip-toast-undo" @click="runUndo">Undo</button>
        <button type="button" class="ip-toast-x" aria-label="Close" @click="toast = null"><AppIcon name="x" :size="16" /></button>
      </div>
    </transition>

    <!-- ===== Actions ===== -->
    <div class="ip-bar">
      <button type="button" class="ip-cta" :class="{ busy: phase }" :disabled="!!phase || stopRows.length < 2" @click="optimize" data-testid="optimize-route">
        <span v-if="phase" class="ip-spin" aria-hidden="true"></span><AppIcon v-else name="sparkles" :size="16" />
        {{ phaseText }}
      </button>
      <span class="ip-totals" title="Getting between today's stops">
        <span><AppIcon name="footprints" :size="15" /> {{ totals.walkKm }} km</span>
        <span><AppIcon name="train" :size="15" /> {{ totals.transitMin }} min</span>
      </span>
      <!-- Only shows up when something on this day needs a look -->
      <div v-if="issues.length" class="ip-issues-wrap">
        <button type="button" class="ip-issues-btn" :aria-expanded="issuesOpen" aria-haspopup="dialog" @click.stop="issuesOpen = !issuesOpen">
          <AppIcon name="alert" :size="15" /> {{ issues.length }} to check
        </button>
        <div v-if="issuesOpen" class="ip-issues" role="dialog" aria-label="Things to check" @click.stop @keydown.esc="issuesOpen = false">
          <p class="ip-issues-title">Things to check on Day {{ dayIndex + 1 }}</p>
          <ul>
            <li v-for="x in issues" :key="x.key">
              <span class="ip-issue-icon" aria-hidden="true"><AppIcon v-if="lineIcon(x.icon)" :name="lineIcon(x.icon)" :size="15" /><template v-else>{{ x.icon }}</template></span>
              <button type="button" class="ip-issue-text" :title="'Open ' + x.it.stop.name" @click="openSheet(x.it, x.section)">
                <strong>{{ x.it.stop.name }}</strong>
                <small>{{ x.text }}</small>
              </button>
              <button type="button" class="ip-issue-fix" @click="x.fix">{{ x.fixLabel }}</button>
            </li>
          </ul>
          <button v-if="stopRows.length > 1" type="button" class="ip-outline small ip-issues-all" @click="issuesOpen = false; optimize()"><AppIcon name="sparkles" :size="15" /> Let Optimize Route sort these out</button>
        </div>
      </div>
      <!-- List or map of this day's stops (the sliding highlight shows which one you're on) -->
      <div class="ip-views" :class="{ right: view === 'map' }" role="group" aria-label="Show this day as">
        <span class="ip-views-thumb" aria-hidden="true"></span>
        <button type="button" :class="{ on: view === 'list' }" :aria-pressed="view === 'list'" title="See the day as a timeline" @click="view = 'list'">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" />
          </svg>
          List
        </button>
        <button type="button" :class="{ on: view === 'map' }" :aria-pressed="view === 'map'" title="See the day's stops on a map" @click="view = 'map'">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14.1 5.6a2 2 0 0 0 1.8 0l3.6-1.8A1 1 0 0 1 21 4.6v12.8a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.6 1.8A1 1 0 0 1 3 19.4V6.6a1 1 0 0 1 .6-.9l4.5-2.3a2 2 0 0 1 1.8 0z" /><path d="M15 5.8v15M9 3.2v15" />
          </svg>
          Map
        </button>
      </div>
    </div>
    <p v-if="sampleMode" class="ip-sample">Sample Kyoto day · not saved · <button type="button" class="ip-link" @click="leaveSample">Back to my trip</button></p>
    <p class="visually-hidden" role="status" aria-live="polite">{{ phase ? phaseText : liveText }}</p>

    <!-- ===== Optimize preview ===== -->
    <transition name="ip-pop">
      <div v-if="preview" class="ip-preview" :class="{ same: !preview.better }">
        <p class="mb-0 fw-semibold">{{ preview.summary }}</p>
        <div class="ip-preview-btns">
          <button v-if="preview.better" type="button" class="ip-cta small" @click="applyPreview">Apply</button>
          <button type="button" class="ip-outline small" @click="preview = null">{{ preview.better ? 'Dismiss' : 'OK' }}</button>
        </div>
      </div>
    </transition>

    <div class="ip-body" :class="{ 'drawer-closed': !drawerOpen }">
      <div class="ip-main">
        <!-- ===== List: numbered timeline ===== -->
        <template v-if="view === 'list'">
          <p v-if="!stopRows.length && unscheduled.length" class="ip-empty">
            Nothing planned for this day. Drag a saved place here, or tap its <strong>+</strong>.
          </p>

          <p v-if="stopRows.length > 1 && !previewing" class="ip-reorder-hint">
            <AppIcon name="swap" :size="14" /> Drag a stop by its dots, or use the arrows, to change the order. Times update by themselves.
          </p>
          <ol class="ip-list" :class="{ dragging: !!drag }">
            <template v-for="(it, i) in timeline" :key="it.stop.id">
              <!-- Between stops: how to get there, or a drop slot while dragging -->
              <li class="ip-gap" :class="{ active: dropAt === i, first: i === 0 }"
                @dragover.prevent="dropAt = i" @dragleave="dropAt = null" @drop.prevent="dropInto(slotOf(i))">
                <span v-if="drag" class="ip-drop">Drop here</span>
                <span v-else-if="i > 0 && legText(it)" class="ip-leg"><AppIcon :name="it.mode === 'walk' ? 'footprints' : it.mode === 'transit' ? 'train' : 'map-pin'" :size="13" /> {{ legText(it) }}</span>
              </li>

              <!-- Lunch / dinner break (kept free when no meal is planned) -->
              <li v-if="it.stop.virtual" class="ip-stop ip-meal-row">
                <span class="ip-num meal" aria-hidden="true">{{ it.stop.icon }}</span>
                <div class="ip-meal">
                  <span class="ip-when">{{ formatHour(it.start) }} <small>· {{ durationText(it.stop.duration) }}</small></span>
                  <strong class="ip-meal-name">{{ it.stop.name }}</strong>
                  <button type="button" class="ip-link" @click="openEat(it, i)">Find somewhere to eat</button>
                </div>
              </li>

              <li v-else class="ip-stop" :class="{ moving: drag && drag.item.id === it.stop.id, 'menu-open': durFor === it.stop.id }">
                <span class="ip-num" :style="{ background: numberColor(numberOf(it)) }" aria-hidden="true">{{ numberOf(it) + 1 }}</span>

                <article class="ip-card" :class="{ locked: it.stop.locked, moved: wasAt(it) !== null, 'rain-warning-card': isRainAffected(it) }"
                  :draggable="!it.stop.locked && !previewing" @dragstart="startDrag($event, 'stop', it.stop)" @dragend="endDrag"
                  @dragover.prevent="overCard($event, i)" @drop.prevent="dropInto(slotOf(dropAt == null ? i : dropAt))">
                  <!-- Move: drag the dots, or tap the arrows (works on phones and keyboards too) -->
                  <div v-if="!it.stop.locked && !previewing" class="ip-move">
                    <button type="button" class="ip-move-btn" :disabled="numberOf(it) === 0"
                      :aria-label="'Move ' + it.stop.name + ' earlier'" title="Move earlier" @click="moveStop(numberOf(it), numberOf(it) - 1)">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
                    </button>
                    <span class="ip-handle" title="Drag to move" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
                    </span>
                    <button type="button" class="ip-move-btn" :disabled="numberOf(it) === stopRows.length - 1"
                      :aria-label="'Move ' + it.stop.name + ' later'" title="Move later" @click="moveStop(numberOf(it), numberOf(it) + 1)">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                  </div>
                  <span v-else-if="it.stop.locked" class="ip-move ip-move-locked" title="Locked to its time: unlock to move it" aria-hidden="true">
                    <AppIcon name="lock" :size="14" />
                  </span>

                  <div class="ip-thumb" :class="'cat-' + categoryOf(it.stop).key" :style="thumbStyle(it.stop)" aria-hidden="true">
                    <span v-if="!photos[photoKey(it.stop)]">{{ categoryOf(it.stop).icon }}</span>
                  </div>

                  <div class="ip-info">
                    <span class="ip-when">
                      {{ formatHour(it.start) }}
                      <!-- Tap the duration to change it; the rest of the day re-times -->
                      <span class="ip-dur-wrap">
                        <button type="button" class="ip-dur" :disabled="previewing" :aria-expanded="durFor === it.stop.id"
                          :aria-label="'How long at ' + it.stop.name + ': ' + durationText(it.stop.duration) + '. Change'"
                          title="Change how long you stay" @click.stop="toggleDur(it.stop.id)">
                          <AppIcon name="clock" :size="13" /> {{ durationText(it.stop.duration) }} <span aria-hidden="true">▾</span>
                        </button>
                        <span v-if="durFor === it.stop.id" class="ip-dur-menu" role="dialog" :aria-label="'Time at ' + it.stop.name" @click.stop @keydown.esc="durFor = null">
                          <span class="ip-dur-step">
                            <button type="button" aria-label="15 minutes less" :disabled="(it.stop.duration || 1) <= 0.25" @click="setDuration(it.stop, (it.stop.duration || 1) - 0.25)">−</button>
                            <strong>{{ durationText(it.stop.duration) }}</strong>
                            <button type="button" aria-label="15 minutes more" @click="setDuration(it.stop, (it.stop.duration || 1) + 0.25)">+</button>
                          </span>
                          <span class="ip-dur-picks">
                            <button v-for="h in DURATION_PICKS" :key="h.value" type="button" :class="{ on: Math.abs((it.stop.duration || 1) - h.value) < 0.01 }"
                              @click="setDuration(it.stop, h.value); durFor = null">{{ h.label }}</button>
                          </span>
                        </span>
                      </span>
                      <small v-if="wasAt(it) !== null" class="ip-was">was {{ formatHour(wasAt(it)) }}</small>
                    </span>
                    <h4 class="ip-name">{{ it.stop.name }}</h4>
                    <div class="ip-chips">
                      <span v-if="live && live.id === it.stop.id" class="ip-live-badge" :class="live.state">{{ live.state === 'now' ? '● Now' : 'Up next' }}</span>
                      <span class="ip-chip">{{ categoryOf(it.stop).label }}</span>
                      <!-- Weather and crowds at this stop's time: tap for the details and options -->
                      <template v-if="!previewing">
                        <button type="button" class="ip-sig" :class="weatherOf(it).tone" :title="weatherOf(it).title"
                          :aria-label="'Weather at ' + it.stop.name + ': ' + weatherOf(it).title" @click="openSheet(it, 'weather')">
                          <span aria-hidden="true">{{ weatherOf(it).icon }}</span> {{ weatherOf(it).text }}
                        </button>
                        <button type="button" class="ip-sig" :class="crowdOf(it).tone" :title="crowdOf(it).title"
                          :aria-label="'Crowds at ' + it.stop.name + ': ' + crowdOf(it).title" @click="openSheet(it, 'crowd')">
                          <AppIcon name="users" :size="14" /> {{ crowdOf(it).text }}
                        </button>
                        <!-- Notes the crew left on this stop -->
                        <button v-if="!sampleMode" type="button" class="ip-sig" :aria-label="'Notes on ' + it.stop.name" @click="openSheet(it, 'notes')">
                          <AppIcon name="message" :size="14" /> Notes
                        </button>
                      </template>
                      <span v-for="(p, k) in cardPills(it)" :key="k" class="ip-pill" :class="p.kind"><AppIcon v-if="lineIcon(p.icon)" :name="lineIcon(p.icon)" :size="13" /><template v-else>{{ p.icon }}</template> {{ p.text }}</span>
                    </div>

                    <!-- Display saved transport option -->
                    <div v-for="route in savedFor(it.stop)" :key="route._id || route.start">
                      <div v-for="opt in route.options" :key="opt._id || opt.type + opt.route + opt.day + opt.time"
                      class="small mt-2 p-2 border rounded bg-white">

                        <div class="fw-semibold d-flex align-items-center gap-2">
                          🚌 How to get here
                          <span v-if="whenText(opt)" class="fw-normal text-muted">· {{ whenText(opt) }}</span>
                          <button type="button" class="btn btn-sm btn-link p-0 text-decoration-none flex-shrink-0 ms-auto"
                          title="Open in Getting there" aria-label="Open in Getting there" @click="openInGettingthere(route, opt)">
                            ✏️
                          </button>
                        </div>
                        <div class="text-muted">From {{ route.start }}</div>

                        <div class="d-flex justify-content-between align-items-center gap-2 mt-1">
                          <div>{{ summarizeRoute(opt.route) }}</div>
                            <span class="badge bg-primary-subtle text-primary-emphasis flex-shrink-0">
                              {{ formatDuration(opt.duration) }}
                            </span>
                        </div>

                        <div v-if="hasValidCost(opt.cost)" class="mt-1">
                          <span class="badge bg-success-subtle text-success-emphasis">{{ formatCost(opt) }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- On the day: finish early or stay longer, and the rest of the day follows -->
                    <div v-if="live && live.id === it.stop.id && live.state === 'now' && !previewing" class="ip-live">
                      <button type="button" class="ip-live-btn done" @click="finishNow(it)"><AppIcon name="check" :size="15" /> I'm done</button>
                      <button type="button" class="ip-live-btn" @click="stayLonger(it)">+15 min</button>
                    </div>
                  </div>

                  <div class="ip-side">
                    <!-- Red circled ✕ = remove from this day (it goes back to Saved places, not deleted) -->
                    <button type="button" class="ip-back" :disabled="previewing" :aria-label="'Remove ' + it.stop.name + ' from this day (back to saved places)'"
                      title="Remove from this day (back to Saved places)" @click="unschedule(it.stop)">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#d1495b" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9.5" /><path d="M9 9l6 6M15 9l-6 6" />
                      </svg>
                    </button>
                    <button type="button" class="ip-lock" :class="{ on: it.stop.locked }" :aria-pressed="it.stop.locked" :disabled="previewing"
                      :aria-label="(it.stop.locked ? 'Unlock ' : 'Lock ') + it.stop.name" :title="it.stop.locked ? 'Fixed time (reservation)' : 'Lock this time'"
                      @click="toggleLock(it.stop)"><AppIcon :name="it.stop.locked ? 'lock' : 'unlock'" :size="17" /></button>
                    <button type="button" class="ip-go" :aria-label="'Show ' + it.stop.name + ' on the map'" title="Show on map" @click="openOnMap(it.stop)">
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    </button>
                  </div>
                </article>
              </li>
            </template>
            <li class="ip-gap end" :class="{ active: dropAt === timeline.length, show: drag }"
              @dragover.prevent="dropAt = timeline.length" @dragleave="dropAt = null" @drop.prevent="dropInto(stopRows.length)">
              <span v-if="drag" class="ip-drop">Drop here</span>
            </li>
          </ol>

          <button type="button" class="ip-add-stop" @click="addPlace">
            <span aria-hidden="true">⊕</span> Add stop
          </button>
        </template>

        <!-- ===== Map: numbered pins, the route, and the picked stop ===== -->
        <div v-else class="ip-mapview">
          <div ref="mapEl" class="ip-map" role="region" aria-label="Map of the day"></div>
          <p v-if="mapError" class="ip-empty">{{ mapError }}</p>
          <p v-else-if="stopRows.length > mapRows.length" class="ip-muted">
            {{ stopRows.length - mapRows.length }} stop{{ stopRows.length - mapRows.length === 1 ? '' : 's' }} without an address {{ stopRows.length - mapRows.length === 1 ? "isn't" : "aren't" }} on the map.
          </p>

          <article v-if="selected" class="ip-detail">
            <div class="ip-detail-photo" :class="'cat-' + categoryOf(selected.stop).key" :style="thumbStyle(selected.stop)">
              <span class="ip-num sm" :style="{ background: numberColor(selectedIndex) }">{{ selectedIndex + 1 }}</span>
              <span v-if="!photos[photoKey(selected.stop)]" class="ip-detail-icon" aria-hidden="true">{{ categoryOf(selected.stop).icon }}</span>
            </div>
            <div class="ip-detail-info">
              <h4 class="ip-detail-name">{{ selected.stop.name }}</h4>
              <p class="ip-detail-line"><AppIcon name="clock" :size="15" /> {{ formatHour(selected.start) }} – {{ formatHour(selected.start + (selected.stop.duration || 1)) }}</p>
              <p v-if="hoursText(selected.stop)" class="ip-detail-line"><AppIcon name="door" :size="15" /> {{ hoursText(selected.stop) }}</p>
              <span class="ip-chip">{{ categoryOf(selected.stop).label }}</span>
              <div class="ip-detail-btns">
                <button type="button" class="ip-step" :disabled="selectedIndex <= 0" aria-label="Previous stop" @click="stepSelected(-1)">‹</button>
                <a class="ip-directions" :href="directionsUrl(selected.stop)" target="_blank" rel="noopener"><AppIcon name="compass" :size="16" /> Get directions</a>
                <button type="button" class="ip-step" :disabled="selectedIndex >= stopRows.length - 1" aria-label="Next stop" @click="stepSelected(1)">›</button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <!-- ===== Saved places (unscheduled) ===== -->
      <aside class="ip-drawer" :class="{ target: drag && drag.kind === 'stop' }" @dragover.prevent @drop.prevent="dropOnDrawer">
        <button type="button" class="ip-drawer-head" :aria-expanded="drawerOpen" @click="drawerOpen = !drawerOpen">
          <span class="ip-drawer-icon" aria-hidden="true"><AppIcon name="map-pin" :size="20" /></span>
          <span class="ip-drawer-title">
            <strong>{{ unscheduled.length }} saved place{{ unscheduled.length === 1 ? '' : 's' }}</strong>
            <small v-if="votingOn && unscheduled.length">{{ picks.length }} ready to add · {{ waiting.length }} waiting for votes</small>
            <small v-else>Not on a day yet</small>
          </span>
          <span class="ip-chev" aria-hidden="true">{{ drawerOpen ? '−' : '+' }}</span>
        </button>
        <div v-show="drawerOpen" class="ip-drawer-body">
          <p v-if="drag && drag.kind === 'stop'" class="ip-unschedule">Drop here to unschedule</p>
          <p v-else-if="!unscheduled.length" class="ip-muted">Places you save in Places → Wishlist wait here.</p>
          <!-- Group trips: only places most of the group voted for can go on a day -->
          <p v-else-if="votingOn" class="ip-vote-rule">
            <AppIcon name="thumbs-up" :size="15" />
            <span>Only <strong>group picks</strong> can go on a day: places {{ needed }} of {{ travellers.length }} travellers voted for.</span>
          </p>
          <!-- One group per destination -->
          <p v-if="votingOn && unscheduled.length && !picks.length && !(drag && drag.kind === 'stop')" class="ip-muted">
            No group picks yet. Vote on the places below, and they can be added once {{ needed }} people say yes.
          </p>
          <section v-for="g in savedGroups" :key="g.city" class="ip-group" :aria-label="'Saved in ' + g.label">
            <h5 class="ip-group-head">
              <span aria-hidden="true">{{ g.flag }}</span> {{ g.label }} <span class="ip-group-count">{{ g.items.length }}</span>
            </h5>
            <div v-for="w in g.items" :key="w.id" class="ip-wish" draggable="true" @dragstart="startDrag($event, 'wish', w)" @dragend="endDrag">
              <div class="ip-thumb sm" :class="'cat-' + categoryOf(w).key" :style="thumbStyle(w)" aria-hidden="true">
                <span v-if="!photos[photoKey(w)]">{{ categoryOf(w).icon }}</span>
              </div>
              <div class="ip-wish-text">
                <span class="ip-wish-name">{{ w.name }}</span>
                <small>{{ categoryOf(w).label }}</small>
              </div>
              <button type="button" class="ip-add" :aria-label="'Add ' + w.name + ' to the end of the day'" title="Add to the end of the day"
                @click="scheduleWish(w, stopRows.length)">+</button>
            </div>
          </section>
          <!-- Not enough votes yet: shown, but can't be added (no drag, no +) -->
          <section v-if="waiting.length && !(drag && drag.kind === 'stop')" class="ip-group ip-waiting" aria-label="Waiting for votes">
            <h5 class="ip-group-head">
              <AppIcon name="clock" :size="13" /> Waiting for votes <span class="ip-group-count">{{ waiting.length }}</span>
            </h5>
            <div v-for="w in waiting" :key="w.id" class="ip-wish waiting">
              <div class="ip-thumb sm" :class="'cat-' + categoryOf(w).key" :style="thumbStyle(w)" aria-hidden="true">
                <span v-if="!photos[photoKey(w)]">{{ categoryOf(w).icon }}</span>
              </div>
              <div class="ip-wish-text">
                <span class="ip-wish-name">{{ w.name }}</span>
                <small>{{ (w.votes || []).length }} of {{ needed }} votes needed</small>
              </div>
              <button type="button" class="ip-vote" :aria-label="'Vote on ' + w.name + ' in Group decisions'" @click="emit('go-vote')">Vote</button>
            </div>
          </section>
        </div>
      </aside>
    </div>
    <!-- Places to eat for a lunch/dinner break -->
    <EatDrawer :open="!!eat" :context="eat || {}" @close="eat = null" @add="addMeal" />
    <StopSheet :open="!!sheetItem" :stop="sheetStop || {}" :start="sheetItem ? sheetItem.start : 0"
      :duration="sheetItem ? sheetItem.stop.duration || 1 : 1" :section="sheet ? sheet.section : 'crowd'"
      :day-name="dayNameShown" :day-label="'Day ' + (dayIndex + 1) + ' · ' + longDate(dayShown)" :selected-date="dayShown"
      :day-options="dayOptions" :weather="dayBlocks" :typical="typical" :crowd="sheetItem ? crowdOf(sheetItem) : {}"
      :wet="sheetItem ? weatherOf(sheetItem).tone === 'bad' : false"
      :quieter="sheetItem ? quieterTimes(sheetItem) : []" :dry="sheetItem ? dryTimes(sheetItem) : []"
      :indoor-picks="indoorPicks" :can-change-day="!sampleMode" :routes="sheetItem ? savedRoutes.filter((r) => r.end === sheetItem.stop.name) : []"
      @close="closeSheet" @move-time="sheetMoveTime" @move-day="sheetMoveDay" @swap="sheetSwap" @edit="sheetEdit" />
  </section>
</template>

<script setup>
// Itinerary planner: day pills, a numbered timeline with photos and commute lines, a map of the day,
// and an "Unscheduled" drawer.
// Drag (HTML5) stops to reorder, wishlist places onto the timeline, or stops back to the drawer.
// Times are worked out by dayOptimizer.js: flexible stops follow each other, locked ones keep their time.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { optimizeDay, scheduleInOrder, scheduleAsIs, travelMatrix, warningsFor, rainFromBlocks, haversineKm, addMealBreaks, defaultDuration, crowdAt, rainDuring } from '../dayOptimizer.js'
import { PLANNER_SAMPLE } from '../dayOptimizerSample.js'
import { loadLeaflet } from '../services/leaflet.js'
import EatDrawer from './EatDrawer.vue'
import StopSheet from './StopSheet.vue'
import { codeForDestination, flagEmoji } from '../destinations.js'
import AppIcon from './AppIcon.vue'
import { transportPrefill } from '../savedRoutes.js'

const props = defineProps({
  days: { type: Array, default: () => [] },
  selectedDate: { type: String, default: '' },
  stops: { type: Array, default: () => [] },            // the selected day's stops (itinerary store)
  wishlist: { type: Array, default: () => [] },         // the trip's wishlist
  scheduledNames: { type: Array, default: () => [] },   // names already on any day (hidden from the drawer)
  dayName: { type: String, default: '' },
  weatherBlocks: { type: Array, default: () => [] },
  typical: { type: Object, default: null }, // { month, place, temp, rainyDays }: usual weather when there's no forecast yet
  prefs: { type: Object, default: () => ({ dayStart: 8, dayEnd: 23 }) },
  canAddDay: { type: Boolean, default: false },
  destinations: { type: Array, default: () => [] },     // the trip's cities (helps place stops on the map)
  dayCounts: { type: Object, default: () => ({}) },      // { '2026-10-22': 3 } stops per day
  dayIssues: { type: Object, default: () => ({}) },     // { '2026-10-22': { issues: 2, load: 0.8 } } for the day strip
  savedRoutes: { type: Array, default: () => [] },      // routes saved in Getting around
  travellers: { type: Array, default: () => [] }        // everyone on the trip (for the majority vote rule)
})
const emit = defineEmits(['select-day', 'add-day', 'remove-day', 'undo-day', 'add-place', 'apply', 'lock', 'schedule', 'unschedule', 'status', 'duration', 'move-day', 'swap', 'edit', 'go-vote', 'open-transport'])

// ---------- sample Kyoto day (local only) ----------
const sampleMode = ref(false)
const sample = ref({ days: [], day: '', stops: [], wishlist: [] })
function startSample() {
  sample.value = {
    days: PLANNER_SAMPLE.days.slice(),
    day: PLANNER_SAMPLE.days[0],
    stops: PLANNER_SAMPLE.stops.map((s) => ({ ...s })),
    wishlist: PLANNER_SAMPLE.wishlist.map((w) => ({ ...w }))
  }
  sampleMode.value = true
  preview.value = null
}
function leaveSample() {
  sampleMode.value = false
  preview.value = null
}

const dayList = computed(() => (sampleMode.value ? sample.value.days : props.days))
const dayShown = computed(() => (sampleMode.value ? sample.value.day : props.selectedDate))
function pickDay(d) {
  preview.value = null
  if (sampleMode.value) sample.value.day = d
  else emit('select-day', d)
}
// ---------- day navigator ----------
const stripEl = ref(null)
const dayEls = {}
const fadeL = ref(false)
const fadeR = ref(false)
const gridOpen = ref(false)
const issuesOpen = ref(false)
function closeGrid() {
  gridOpen.value = false
  issuesOpen.value = false
}
document.addEventListener('click', closeGrid)
onBeforeUnmount(() => document.removeEventListener('click', closeGrid))

function updateFades() {
  const el = stripEl.value
  if (!el) return
  fadeL.value = el.scrollLeft > 4
  fadeR.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
}
// Keep the open day in the middle of the strip
function centerDay(smooth = true) {
  nextTick(() => {
    const el = stripEl.value
    const btn = dayEls[dayShown.value]
    if (!el || !btn) return
    el.scrollTo({ left: Math.max(0, btn.offsetLeft - (el.clientWidth - btn.offsetWidth) / 2), behavior: smooth ? 'smooth' : 'auto' })
    setTimeout(updateFades, smooth ? 350 : 0)
  })
}
watch(dayShown, () => centerDay())
watch(() => dayList.value.length, () => centerDay(false))
onMounted(() => {
  centerDay(false)
  window.addEventListener('resize', updateFades)
})
onBeforeUnmount(() => window.removeEventListener('resize', updateFades))

function stepDay(step) {
  const d = dayList.value[dayIndex.value + step]
  if (d) pickDay(d)
}
// ← → move between days, Home/End jump to the first/last (standard tab keys)
function onDayKey(e) {
  let i = dayIndex.value
  if (e.key === 'ArrowRight') i++
  else if (e.key === 'ArrowLeft') i--
  else if (e.key === 'Home') i = 0
  else if (e.key === 'End') i = dayList.value.length - 1
  else return
  e.preventDefault()
  const d = dayList.value[Math.max(0, Math.min(dayList.value.length - 1, i))]
  pickDay(d)
  nextTick(() => dayEls[d] && dayEls[d].focus())
}

function countFor(d) {
  if (sampleMode.value) {
    let n = 0
    for (const st of sample.value.stops) if (st.date === d) n++
    return n
  }
  return props.dayCounts[d] || 0
}
const weekday = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short' })
const dayOfMonth = (d) => new Date(d + 'T00:00:00').getDate()
const isWeekend = (d) => [0, 6].includes(new Date(d + 'T00:00:00').getDay())
function isTodayDate(d) {
  const t = new Date()
  return d === t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0')
}

// ---------- adding / removing days (confirm first, undo after) ----------
const dayIndex = computed(() => Math.max(0, dayList.value.indexOf(dayShown.value)))
const confirm = ref(null)   // { kind, title, lines, button, danger }
const toast = ref(null)     // { text, undo }
const dialogEl = ref(null)
const confirmBtn = ref(null)
let toastTimer = null
let sampleUndo = null

function shiftDate(d, days) {
  const date = new Date(d + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
function longDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })
}

function openConfirm(c) {
  confirm.value = c
  nextTick(() => confirmBtn.value && confirmBtn.value.focus())
}

function askAddDay() {
  const last = dayList.value[dayList.value.length - 1]
  const next = shiftDate(last, 1)
  openConfirm({
    kind: 'add',
    title: 'Add Day ' + (dayList.value.length + 1) + ' (' + longDate(next) + ')?',
    lines: [],
    button: 'Add Day ' + (dayList.value.length + 1),
    danger: false
  })
}

// Only the last day can be removed, so no other day's date ever changes
function askRemoveDay() {
  const n = dayList.value.length
  const date = dayList.value[n - 1]
  let count = 0
  if (sampleMode.value) {
    for (const s of sample.value.stops) if (s.date === date) count++
  } else {
    count = props.dayCounts[date] || 0
  }
  const lines = []
  if (count) lines.push(count + ' stop' + (count === 1 ? '' : 's') + ' on this day go back to Saved places (nothing is deleted).')
  openConfirm({ kind: 'remove', title: 'Remove Day ' + n + ' (' + longDate(date) + ')?', lines, button: 'Remove Day ' + n, danger: true, date })
}

function doConfirm() {
  const c = confirm.value
  confirm.value = null
  if (c.kind === 'city') return scheduleWish(c.wish, c.slot, true)
  preview.value = null
  if (c.kind === 'add') {
    const n = dayList.value.length + 1
    if (sampleMode.value) {
      sampleUndo = JSON.stringify(sample.value)
      sample.value.days.push(shiftDate(dayList.value[dayList.value.length - 1], 1))
    } else {
      emit('add-day')
    }
    showToast('Day ' + n + ' added')
  } else {
    const n = dayList.value.length
    if (sampleMode.value) {
      sampleUndo = JSON.stringify(sample.value)
      removeSampleDay(c.date)
    } else {
      emit('remove-day', c.date)
    }
    showToast('Day ' + n + ' removed')
  }
}

function removeSampleDay(date) {
  const s = sample.value
  const keep = []
  for (const stop of s.stops) {
    if (stop.date === date) s.wishlist.push({ id: 'pw-' + stop.id, name: stop.name, outdoor: stop.outdoor, lat: stop.lat, lon: stop.lon, address: stop.address })
    else keep.push(stop.date > date ? { ...stop, date: shiftDate(stop.date, -1) } : stop)
  }
  s.stops = keep
  s.days.pop()
  if (!s.days.includes(s.day)) s.day = s.days[s.days.length - 1]
}

function showToast(text, undo = true) {
  toast.value = { text, undo }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 8000)
}

// Undo in the toast: a time move undoes itself here, day changes are undone by the parent
function runUndo() {
  const u = toast.value && toast.value.undo
  if (typeof u === 'function') {
    toast.value = null
    u()
  } else {
    undoDay()
  }
}

function undoDay() {
  toast.value = null
  if (sampleMode.value) {
    if (sampleUndo) sample.value = JSON.parse(sampleUndo)
    sampleUndo = null
  } else {
    emit('undo-day')
  }
  liveText.value = 'Undone'
}
function addPlace() {
  if (sampleMode.value) drawerOpen.value = true
  else emit('add-place')
}

// ---------- coordinates + photos (fetched once per place, shared by every planner) ----------
const coords = ref({})
const photos = ref({})
const photoKey = (s) => (s.name || '').toLowerCase()

// The trip city a place belongs to, so the lookup searches there (not another place with the same name)
function nearFor(s) {
  if (s.city) return s.city
  const list = sampleMode.value ? sample.value.wishlist : props.wishlist
  const match = list.find((w) => w.name.toLowerCase() === (s.name || '').toLowerCase())
  if (match && match.city) return match.city
  return props.destinations.length === 1 ? props.destinations[0] : ''
}
// What to look a stop up by: its address, or (no address) its name in the trip's city.
// Breaks like "Lunch" are not real places, so they're skipped.
const MEAL_ONLY = /^(breakfast|brunch|lunch|dinner|supper)( break)?$/i
function placeText(s) {
  if (s.address) return s.address
  if (!s.name || MEAL_ONLY.test(s.name.trim())) return ''
  const near = nearFor(s)
  return s.name + (near ? ', ' + near : '')
}
const coordKey = (s) => placeText(s) + '|' + nearFor(s)
function coordsFor(s) {
  return placeText(s) ? coords.value[coordKey(s)] : null
}

function locate(list) {
  for (const s of list) {
    if (!placeText(s) || s.lat != null) continue
    const key = coordKey(s)
    if (coords.value[key] !== undefined) continue
    coords.value = { ...coords.value, [key]: null }
    axios.get('/api/safety/locate', { params: { place: placeText(s), near: nearFor(s) || undefined }, timeout: 15000 })
      .then((res) => { coords.value = { ...coords.value, [key]: { lat: res.data.lat, lon: res.data.lon } } })
      .catch(() => {})
  }
}
function loadPhotos(list) {
  for (const s of list) {
    const key = photoKey(s)
    // Only real places (with an address) get a photo search; "Dinner" etc. keep their icon
    if (!s.address || photos.value[key] !== undefined) continue
    photos.value = { ...photos.value, [key]: null }
    axios.get('/api/places/photo', { params: { destination: s.name.slice(0, 80), size: 'small' } })
      .then((res) => { if (res.data.url) photos.value = { ...photos.value, [key]: res.data.url } })
      .catch(() => {})
  }
}

// ---------- the day's stops, in the shape the optimizer wants ----------
function crowdCurve(forecast) {
  const day = forecast && forecast.days && forecast.days[props.dayName]
  if (!day || !day.raw) return null
  const curve = new Array(24).fill(0)
  for (let k = 0; k < 24; k++) curve[(k + 6) % 24] = day.raw[k] || 0
  return curve
}
function toWork(s) {
  const c = s.lat != null ? { lat: s.lat, lon: s.lon } : coordsFor(s)
  const day = s.forecast && s.forecast.days && s.forecast.days[props.dayName]
  return {
    id: s.id, name: s.name, address: s.address || null, hour: s.hour, outdoor: !!s.outdoor, locked: !!s.locked,
    // Your own time if you set one, else the place's typical visit time, else a guess from what it is
    duration: s.duration || (s.forecast && s.forecast.durationDefault) || defaultDuration(s),
    lat: c ? c.lat : null, lon: c ? c.lon : null,
    crowd: crowdCurve(s.forecast), popular: !!c || !!s.address, // a place we found on the map gets the typical crowd curve
    open: day && !day.closed ? day.open : null, close: day && !day.closed ? day.close : null
  }
}
const work = computed(() => {
  const list = sampleMode.value ? sample.value.stops.filter((s) => s.date === sample.value.day) : props.stops
  return list.map(toWork)
})
const unscheduled = computed(() => {
  if (sampleMode.value) return sample.value.wishlist
  const taken = props.scheduledNames.map((n) => n.toLowerCase())
  return props.wishlist.filter((w) => !taken.includes(w.name.toLowerCase()))
})
// Saved places grouped by destination (e.g. Tokyo, Kyoto), in the order they first appear.
// Places saved before multi-city trips have no city and go under "Other places".
// ---------- majority vote rule ----------
// On a group trip (2+ travellers), a saved place can only go on a day once more than half voted for it.
// Solo trips skip voting: everything saved can be added.
const votingOn = computed(() => !sampleMode.value && props.travellers.length >= 2)
const needed = computed(() => Math.floor(props.travellers.length / 2) + 1) // 3 travellers -> 2, 4 -> 3
function isPick(w) {
  return !votingOn.value || (w.votes || []).length >= needed.value
}
const picks = computed(() => {
  const list = []
  for (const w of unscheduled.value) if (isPick(w)) list.push(w)
  return list
})
const waiting = computed(() => {
  const list = []
  for (const w of unscheduled.value) if (!isPick(w)) list.push(w)
  return list
})

const savedGroups = computed(() => {
  const groups = []
  for (const w of picks.value) {
    const city = w.city || ''
    let g = groups.find((x) => x.city === city)
    if (!g) {
      g = {
        city,
        label: city ? city.split(', ')[0] : 'Other places',
        flag: city ? flagEmoji(codeForDestination(city)) : '📍',
        items: []
      }
      groups.push(g)
    }
    g.items.push(w)
  }
  // Places without a city go last
  groups.sort((a, b) => (a.city ? 0 : 1) - (b.city ? 0 : 1))
  return groups
})

watch([work, unscheduled], () => {
  const all = props.stops.concat(unscheduled.value)
  locate(all)
  loadPhotos(sampleMode.value ? sample.value.stops.concat(sample.value.wishlist) : all)
}, { immediate: true })

const rain = computed(() => (props.weatherBlocks.length && !sampleMode.value ? rainFromBlocks(props.weatherBlocks) : null))
// Real travel times we already have, by "fromId>toId": a route saved in Getting around wins,
// then Google's transit time to the next stop (ItineraryView asks for those). Other legs are estimated.
const knownLegs = computed(() => {
  const legs = {}
  if (sampleMode.value) return legs
  const sorted = props.stops.slice().sort((a, b) => a.hour - b.hour)
  sorted.forEach((s, i) => {
    if (sorted[i + 1] && s.transitSecs) legs[s.id + '>' + sorted[i + 1].id] = { min: Math.round(s.transitSecs / 60), mode: 'transit', source: 'google' }
  })
  for (const r of props.savedRoutes) {
    const o = r.options && r.options[0]
    if (!o) continue
    const from = props.stops.find((s) => s.name === r.start)
    const to = props.stops.find((s) => s.name === r.end)
    if (from && to) legs[from.id + '>' + to.id] = { min: o.duration, mode: /walk/i.test(o.type) ? 'walk' : 'transit', source: 'saved', label: o.type }
  }
  return legs
})
const legMatrix = (list) => travelMatrix(list, knownLegs.value)
const matrix = computed(() => legMatrix(work.value))
const current = computed(() => scheduleAsIs(work.value, matrix.value))

// ---------- optimize ----------
const preview = ref(null)
const previewing = computed(() => !!(preview.value && preview.value.better))
// stopRows = the real stops in time order; timeline = the same plus lunch/dinner breaks (for showing)
const stopRows = computed(() => (previewing.value ? preview.value.after.items.filter((it) => !it.stop.virtual) : current.value))
const timeline = computed(() => (previewing.value ? preview.value.after.items : addMealBreaks(current.value, work.value, opts.value)))
// Number shown in a stop's circle (meal breaks aren't counted)
function numberOf(it) {
  return stopRows.value.findIndex((x) => x.stop.id === it.stop.id)
}
// A drop slot in the timeline -> position among the real stops
function slotOf(i) {
  let n = 0
  for (let k = 0; k < i; k++) if (!timeline.value[k].stop.virtual) n++
  return n
}
watch(() => dayShown.value + '|' + props.stops.map((s) => s.id + s.hour + s.locked).join(), () => { if (!sampleMode.value) preview.value = null })

const phase = ref('')
const phaseText = computed(() => ({ route: 'Analyzing route…', forecast: 'Checking forecast…', reorder: 'Reordering…' })[phase.value] || 'Optimize Route')
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
// Everything the schedule follows comes from Preferences (day start/end, crowds, travel buffer)
const opts = computed(() => ({
  dayStart: props.prefs.dayStart || 8,
  dayEnd: Math.min(24, props.prefs.dayEnd || 23),
  buffer: props.prefs.travelBuffer || 0,
  crowdWeight: { low: 0.5, medium: 1, high: 2 }[props.prefs.crowdSensitivity] || 1
}))

// ---------- your hours vs the shared plan ----------
// Day start/end (Preferences) are personal, but the plan is shared by the whole group.
// So a day that doesn't fit your hours is only pointed out; Optimize Route fits it when you choose to.
function outsideDay() {
  for (const it of current.value) {
    if (it.stop.locked) continue
    if (it.start < opts.value.dayStart - 0.01 || it.start + (it.stop.duration || 1) > opts.value.dayEnd + 0.01) return true
  }
  return false
}
function noteOutsideDay() {
  if (previewing.value || !outsideDay()) return
  noteChange('Some stops are outside your hours (' + formatHour(opts.value.dayStart) + ' to ' + formatHour(opts.value.dayEnd) + '). Optimize Route fits them in.', 'warn')
}
watch(() => JSON.stringify(opts.value), noteOutsideDay)
watch(dayShown, () => nextTick(noteOutsideDay))

async function optimize() {
  preview.value = null
  phase.value = 'route'
  await pause(350)
  phase.value = 'forecast'
  await pause(350)
  phase.value = 'reorder'
  await pause(250)
  preview.value = optimizeDay(work.value, rain.value, { ...opts.value, known: knownLegs.value })
  phase.value = ''
}
function applyPreview() {
  const summary = preview.value.summary
  save(preview.value.after.items.map((it) => ({ id: it.stop.id, hour: it.start })))
  preview.value = null
  noteChange(summary.replace(/^Route optimized: /, 'Route optimized: '))
}

// ---------- "Find somewhere to eat" (meal break -> slide-over with places nearby) ----------
const eat = ref(null) // { label, icon, start, duration, date, fromName, from, city, slot }
function openEat(breakItem, index) {
  // The stop before the break is where you'll be (or the one after, for a break at the start)
  let before = null
  for (let k = index - 1; k >= 0; k--) if (!timeline.value[k].stop.virtual) { before = timeline.value[k].stop; break }
  if (!before) for (let k = index + 1; k < timeline.value.length; k++) if (!timeline.value[k].stop.virtual) { before = timeline.value[k].stop; break }
  const meal = breakItem.stop.name.replace(/ break$/, '')
  eat.value = {
    label: meal,
    icon: breakItem.stop.icon,
    start: breakItem.start,
    duration: breakItem.stop.duration,
    date: dayShown.value,
    fromName: before ? before.name : '',
    from: before && before.lat != null ? { lat: before.lat, lon: before.lon } : null,
    city: (before && nearFor(before)) || (props.destinations[0] || ''),
    slot: slotOf(index)
  }
}
// Picked a place: it takes the break's spot ("Lunch at …" so it counts as the meal)
function addMeal(place) {
  const c = eat.value
  eat.value = null
  const city = c.city ? c.city.split(', ')[0] : ''
  scheduleWish({
    name: c.label + ' at ' + place.name,
    address: place.name + (place.address ? ', ' + place.address : '') + (city ? ', ' + city : ''),
    outdoor: false,
    city: c.city || null,
    lat: place.lat,
    lon: place.lon,
    duration: c.duration,
    type: 'food'
  }, c.slot, true)
  noteChange(c.label + ' at ' + place.name + ' added at ' + formatHour(c.start))
}

// ---------- how long you stay (tap the ⏱ chip) ----------
const DURATION_PICKS = [
  { value: 0.5, label: '30m' }, { value: 1, label: '1h' }, { value: 1.5, label: '1.5h' },
  { value: 2, label: '2h' }, { value: 3, label: '3h' }, { value: 4, label: 'Half day' }
]
const durFor = ref(null) // stop id whose menu is open
function toggleDur(id) {
  durFor.value = durFor.value === id ? null : id
}
function closeDurMenu() {
  durFor.value = null
}
document.addEventListener('click', closeDurMenu)
onBeforeUnmount(() => document.removeEventListener('click', closeDurMenu))

// New duration -> the rest of the day re-times around it (locked stops stay)
function setDuration(stop, hours) {
  const h = Math.max(0.25, Math.min(12, Math.round(hours * 4) / 4))
  const list = stopRows.value.map((it) => (it.stop.id === stop.id ? { ...it.stop, duration: h } : it.stop))
  const changes = retime(list).map((it) => ({ id: it.stop.id, hour: it.start }))
  saveDuration(stop.id, h, changes)
  explainLocked(retime(list), stop.name + ' now ' + durationText(h))
}

function saveDuration(id, hours, changes) {
  changes = changes.map((c) => ({ ...c, hour: Math.min(c.hour, 23.75) }))
  if (sampleMode.value) {
    const s = sample.value.stops.find((x) => x.id === id)
    if (s) s.duration = hours
    save(changes)
  } else {
    emit('duration', id, hours, changes)
  }
}

// After a change: say what moved, or warn if a locked plan / the end of the day is now tight
function explainLocked(items, what) {
  let late = null
  let over = null
  for (const it of items) {
    if (it.stop.virtual) continue
    if (it.stop.locked && it.lateMin > 0 && !late) late = it
    if (it.start + (it.stop.duration || 1) > opts.value.dayEnd + 0.01) over = it
  }
  if (late) noteChange(what + '. ⚠ ' + late.stop.name + ' at ' + formatHour(late.start) + ' is now tight (' + late.lateMin + ' min late)', 'warn')
  else if (over) noteChange(what + ". ⚠ The day now runs past your end time. Send " + lastFlexible(items) + ' back to Saved places?', 'warn')
  else noteChange(what + '. The rest of the day was re-timed.')
}
function lastFlexible(items) {
  for (let k = items.length - 1; k >= 0; k--) if (!items[k].stop.virtual && !items[k].stop.locked) return items[k].stop.name
  return 'a stop'
}

// ---------- on the day: what's happening now ----------
// The sample day pretends it's 10:30 AM on its first day, so you can try this any time.
const clock = ref(Date.now())
const ticker = setInterval(() => { clock.value = Date.now() }, 60000)
onBeforeUnmount(() => clearInterval(ticker))

function todayStr() {
  const d = new Date(clock.value)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
const nowHour = computed(() => {
  if (sampleMode.value) return 10.5
  const d = new Date(clock.value)
  return d.getHours() + d.getMinutes() / 60
})
const isToday = computed(() => (sampleMode.value ? dayShown.value === sample.value.days[0] : dayShown.value === todayStr()))
// { id, state: 'now' | 'next' } for the stop you're at (or heading to next)
const live = computed(() => {
  if (!isToday.value) return null
  for (const it of stopRows.value) {
    const end = it.start + (it.stop.duration || 1)
    if (it.start <= nowHour.value && nowHour.value < end) return { id: it.stop.id, state: 'now' }
    if (it.start > nowHour.value) return { id: it.stop.id, state: 'next' }
  }
  return null
})

// Re-plan everything after this stop, starting from when you leave it
function replanFrom(it, newDuration, what) {
  const all = stopRows.value.map((x) => x.stop)
  const i = all.findIndex((x) => x.id === it.stop.id)
  const current = { ...it.stop, duration: newDuration }
  const rest = all.slice(i + 1)
  const leaveAt = it.start + newDuration
  const items = scheduleInOrder(rest.filter((s) => !s.locked), rest.filter((s) => s.locked), legMatrix(all),
    { ...opts.value, dayStart: leaveAt, from: current, allStops: all })
  const changes = [{ id: current.id, hour: it.start }]
  let moved = 0
  for (const x of items) {
    changes.push({ id: x.stop.id, hour: x.start })
    if (!x.stop.virtual && Math.abs(x.start - x.stop.hour) > 0.01) moved++
  }
  saveDuration(current.id, newDuration, changes)
  if (!rest.length) noteChange(what + '. That was the last stop of the day.')
  else if (!moved && rest.every((s) => s.locked)) noteChange(what + '. The next stops are locked, so their times stay.')
  else if (!moved) noteChange(what + '. The next stop was already planned for right after now, so nothing moved.')
  else explainLocked(items, what)
}
function finishNow(it) {
  // Leave now (to the next 5 minutes, not 15, so finishing a little early still moves the rest of the day)
  const hours = Math.ceil((nowHour.value - it.start) * 12) / 12
  replanFrom(it, Math.max(5 / 60, hours), 'Finished ' + it.stop.name + ' early')
}
function stayLonger(it) {
  replanFrom(it, (it.stop.duration || 1) + 0.25, 'Staying 15 min longer at ' + it.stop.name)
}

// ---------- status for the Smart Schedule panel ----------
const lastChange = ref('')
const lastKind = ref('fixed')
let changeTimer = null
function noteChange(text, kind = 'fixed') {
  lastKind.value = kind
  lastChange.value = text
  clearTimeout(changeTimer)
  changeTimer = setTimeout(() => { lastChange.value = '' }, 12000)
}
watch(dayShown, () => { lastChange.value = '' })

const status = computed(() => {
  if (phase.value) return { kind: 'busy', text: phaseText.value }
  if (lastChange.value) return { kind: lastKind.value, text: lastChange.value }
  const problems = []
  for (const it of timeline.value) {
    for (const p of pillsFor(it)) if (p.kind === 'warn') problems.push(it.stop.name + ': ' + p.text.toLowerCase())
  }
  if (problems.length) {
    return { kind: 'warn', text: problems.length + ' thing' + (problems.length === 1 ? '' : 's') + ' to check on this day. Tap ⚠ next to Optimize Route to see them.' }
  }
  if (!stopRows.value.length) return { kind: 'idle', text: 'Add places to this day and the schedule balances itself.' }
  return { kind: 'ok', text: 'All clear: no overlaps, crowd peaks or rain clashes on this day.' }
})
watch(status, (s) => emit('status', s), { immediate: true })

// Write new times (sample: locally, real trip: parent saves)
const liveText = ref('')
function save(changes) {
  // A day can't run past midnight: anything that would is kept at 11:45 PM (and flagged as after your day)
  changes = changes.map((c) => ({ ...c, hour: Math.min(c.hour, 23.75) }))
  if (sampleMode.value) {
    for (const c of changes) {
      const s = sample.value.stops.find((x) => x.id === c.id)
      if (s) s.hour = c.hour
    }
  } else {
    emit('apply', changes)
  }
  liveText.value = 'Day updated'
}
function toggleLock(stop) {
  if (sampleMode.value) {
    const s = sample.value.stops.find((x) => x.id === stop.id)
    if (s) s.locked = !s.locked
  } else {
    emit('lock', stop.id, !stop.locked)
  }
}

// ---------- drag & drop ----------
const drag = ref(null)      // { kind: 'stop' | 'wish', item }
const dropAt = ref(null)    // slot index (0 = before the first stop)
const drawerOpen = ref(true)

function startDrag(e, kind, item) {
  drag.value = { kind, item }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', item.name) // Firefox needs some data to start a drag
}
function endDrag() {
  drag.value = null
  dropAt.value = null
}

// Re-time the day for a new order: the day starts when it already did (or the user's day start)
// Re-time the day for an order: the first flexible stop starts when your day starts (Preferences)
function retime(list) {
  const flex = list.filter((s) => !s.locked)
  const locked = list.filter((s) => s.locked)
  return scheduleInOrder(flex, locked, legMatrix(list), opts.value)
}

function dropInto(slot) {
  const d = drag.value
  endDrag()
  if (!d || previewing.value) return
  if (d.kind === 'wish') {
    if (!isPick(d.item)) return showToast(d.item.name + ' needs ' + needed.value + ' votes before it can go on a day', false)
    return scheduleWish(d.item, slot)
  }
  const list = stopRows.value.map((it) => it.stop)
  const from = list.findIndex((s) => s.id === d.item.id)
  if (from < 0) return
  const [moved] = list.splice(from, 1)
  list.splice(from < slot ? slot - 1 : slot, 0, moved)
  save(retime(list).map((it) => ({ id: it.stop.id, hour: it.start })))
}

// A wishlist place onto the timeline: a new stop, then the day is re-timed around it
// Which city a stop is in: its own city, or the city of the saved place with the same name
function cityOf(stop) {
  if (stop.city) return stop.city
  const list = sampleMode.value ? sample.value.wishlist : props.wishlist
  const match = list.find((w) => w.name.toLowerCase() === (stop.name || '').toLowerCase())
  return match && match.city ? match.city : null
}

// Is this place in a different city from what's already on the day?
// Uses the saved cities when both are known, otherwise the distance (over 40 km apart).
function otherCityOnDay(w) {
  const wCity = w.city || null
  const wPoint = w.lat != null ? w : coordsFor(w)
  for (const it of stopRows.value) {
    const sCity = cityOf(it.stop)
    if (wCity && sCity) {
      if (wCity !== sCity) return sCity
      continue
    }
    if (wPoint && it.stop.lat != null && haversineKm(wPoint, it.stop) > 40) return sCity || 'another city'
  }
  return null
}

function scheduleWish(w, slot, confirmed = false) {
  if (previewing.value) return
  // Two cities on one day? Ask first (travel between cities eats the day)
  const other = confirmed ? null : otherCityOnDay(w)
  if (other) {
    const here = w.city ? w.city.split(', ')[0] : 'a different city'
    openConfirm({
      kind: 'city',
      title: w.name + ' is in ' + here,
      lines: ['Day ' + (dayIndex.value + 1) + ' is planned in ' + other.split(', ')[0] + '. Add it to this day anyway?'],
      button: 'Add anyway',
      danger: false,
      wish: w,
      slot
    })
    return
  }
  const fresh = toWork({ id: '__new', name: w.name, address: w.address || null, outdoor: !!w.outdoor, duration: w.duration || 1.5, lat: w.lat, lon: w.lon, hour: 0 })
  const list = stopRows.value.map((it) => it.stop)
  list.splice(slot, 0, fresh)
  const changes = retime(list).map((it) => ({ id: it.stop.id, hour: it.start }))
  if (sampleMode.value) {
    const id = 'p-' + Date.now().toString(36)
    sample.value.stops.push({ ...w, id, date: sample.value.day, duration: w.duration || 1.5, locked: false, hour: 0 })
    sample.value.wishlist = sample.value.wishlist.filter((x) => x.id !== w.id)
    save(changes.map((c) => (c.id === '__new' ? { ...c, id } : c)))
  } else {
    emit('schedule', w, changes) // the parent creates the stop for '__new'
    liveText.value = w.name + ' added'
  }
}

function dropOnDrawer() {
  const d = drag.value
  endDrag()
  if (d && d.kind === 'stop') unschedule(d.item)
}

// Take a stop off the day and put it back in Saved places (with Undo, in case it was a mistake)
function unschedule(stop) {
  if (previewing.value) return
  if (sampleMode.value) {
    sampleUndo = JSON.stringify(sample.value)
    const s = sample.value.stops.find((x) => x.id === stop.id)
    sample.value.stops = sample.value.stops.filter((x) => x.id !== stop.id)
    if (s) sample.value.wishlist.push({ id: 'pw-' + s.id, name: s.name, city: s.city || null, outdoor: s.outdoor, lat: s.lat, lon: s.lon, address: s.address })
  } else {
    emit('unschedule', stop.id)
  }
  drawerOpen.value = true
  showToast(stop.name + ' moved back to Saved places')
}

// Arrow buttons: swap with the stop before/after, re-time the day, and offer Undo
function moveStop(i, to) {
  if (previewing.value || to < 0 || to >= stopRows.value.length) return
  const before = []
  for (const it of stopRows.value) before.push({ id: it.stop.id, hour: it.start })
  const list = stopRows.value.map((it) => it.stop)
  const [moved] = list.splice(i, 1)
  list.splice(to, 0, moved)
  save(retime(list).map((it) => ({ id: it.stop.id, hour: it.start })))
  showToast(moved.name + ' moved ' + (to < i ? 'earlier' : 'later'), () => save(before))
}
// Dragging over a card: drop above it (top half) or below it (bottom half)
function overCard(e, i) {
  if (!drag.value) return
  const box = e.currentTarget.getBoundingClientRect()
  dropAt.value = e.clientY < box.top + box.height / 2 ? i : i + 1
}

// ---------- display helpers ----------
// Categories, checked in this order (so "People's Park station" is Transport, not Nature)
const CATEGORIES = [
  { key: 'transport', label: 'Transport', icon: '🚉', words: ['station', 'metro', 'subway', 'airport', 'terminal', 'pier', 'ferry', 'bus stop', 'railway', 'mrt'] },
  { key: 'food', label: 'Food', icon: '🍜', words: ['restaurant', 'dinner', 'lunch', 'breakfast', 'brunch', 'cafe', 'café', 'food', 'bar', 'kyoja', 'ramen', 'sushi', 'hawker', 'market'] },
  { key: 'culture', label: 'Culture', icon: '⛩️', words: ['temple', 'shrine', 'museum', 'palace', 'castle', 'gallery', 'dera', 'taisha', 'jinja', 'ji', 'church', 'mosque', 'cathedral', 'monument', 'statue', 'memorial', 'tour', 'pagoda', 'fort'] },
  { key: 'shopping', label: 'Shopping', icon: '🛍️', words: ['mall', 'shop', 'shopping', 'store', 'outlet', 'plaza'] },
  { key: 'nature', label: 'Nature', icon: '🌿', words: ['park', 'garden', 'forest', 'grove', 'bamboo', 'mountain', 'beach', 'lake', 'river', 'hike', 'trail', 'falls', 'waterfall', 'island'] }
]
const SIGHT = { key: 'sight', label: 'Sight', icon: '📍' }
// The type a place was saved with in Places (from OpenStreetMap) beats guessing from the name
const TYPE_TO_CATEGORY = {
  museum: 'culture', gallery: 'culture', heritage: 'culture', food: 'food', shop: 'shopping',
  park: 'nature', zoo: 'nature', transport: 'transport'
}
function categoryOf(s) {
  const list = sampleMode.value ? sample.value.wishlist : props.wishlist
  const saved = s.type ? s : list.find((w) => w.name.toLowerCase() === (s.name || '').toLowerCase())
  const fromType = saved && TYPE_TO_CATEGORY[saved.type]
  if (fromType) return CATEGORIES.find((c) => c.key === fromType)
  // Whole words only ("bar" shouldn't match "Barcelona"; "ji" only as in "Kinkaku-ji")
  const words = (s.name || '').toLowerCase().split(/[^a-z\u00c0-\u024f]+/)
  for (const c of CATEGORIES) {
    for (const w of c.words) {
      if (w.includes(' ') ? (s.name || '').toLowerCase().includes(w) : words.includes(w)) return c
    }
  }
  return SIGHT
}
function thumbStyle(s) {
  const url = photos.value[photoKey(s)]
  return url ? { backgroundImage: 'url(' + url + ')' } : null
}
function formatHour(h) {
  const hour = Math.floor(h) % 24
  const min = Math.round((h - Math.floor(h)) * 60)
  return (hour % 12 === 0 ? 12 : hour % 12) + ':' + String(min).padStart(2, '0') + (hour >= 12 ? ' PM' : ' AM')
}
function shortDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}
function durationText(h) {
  const hrs = h || 1
  if (hrs < 1) return Math.round(hrs * 60) + ' min'
  const whole = Math.floor(hrs)
  const min = Math.round((hrs - whole) * 60)
  if (min === 30) return (whole + 0.5) + ' hrs'
  return whole + (whole === 1 ? ' hr' : ' hrs') + (min ? ' ' + min + 'm' : '')
}
// Status emoji from the optimizer -> the matching line icon (weather and place types stay as pictures)
const LINE_ICONS = { '⏰': 'clock', '⏳': 'clock', '⚠️': 'alert', '⚠': 'alert', '🍽': 'utensils', '👥': 'users', '🔒': 'lock', '🚇': 'train', '🚶': 'footprints', '🚪': 'door', '📍': 'map-pin' }
function lineIcon(emoji) {
  return LINE_ICONS[emoji] || ''
}
function legText(it) {
  if (it.mode === 'break') return ''
  if (it.source === 'saved') return it.travelMin + 'm · ' + it.label + ' (your saved route)'
  if (it.source === 'google') return it.travelMin + 'm by transit'
  if (it.mode === 'walk') return it.travelMin + 'm walk (' + (it.km < 1 ? Math.round(it.km * 1000 / 50) * 50 + ' m' : it.km.toFixed(1) + ' km') + ')'
  if (it.mode === 'transit') return '~' + it.travelMin + 'm by transit (est.)'
  return '~' + it.travelMin + 'm (place not found on the map)'
}
function wasAt(it) {
  if (!previewing.value) return null
  const b = preview.value.before.items.find((x) => x.stop.id === it.stop.id)
  return b && Math.abs(b.start - it.start) > 0.01 ? b.start : null
}
function pillsFor(it) {
  if (previewing.value) return (it.reasons || []).filter((r) => r.kind !== 'travel')
  return warningsFor(it, rain.value, opts.value).map((w) => ({ ...w, kind: 'warn' }))
}
// ---------- weather + crowds at each stop (the small icons on every card) ----------
const WEATHER_ICONS = { Clear: '☀️', Clouds: '⛅', Rain: '🌧️', Drizzle: '🌦️', Thunderstorm: '⛈️', Snow: '❄️' }
function weatherIcon(b) {
  if (b.condition === 'Clear' && (b.time >= 19 || b.time < 6)) return '🌙'
  if (WEATHER_ICONS[b.condition]) return WEATHER_ICONS[b.condition]
  return b.rain ? '🌧️' : '🌫️'
}
// The day's forecast, each 3-hour block with its icon
const dayBlocks = computed(() => {
  const list = []
  if (sampleMode.value) return list
  for (const b of props.weatherBlocks) list.push({ ...b, icon: weatherIcon(b) })
  return list
})
function blockAt(h) {
  for (const b of dayBlocks.value) {
    if (Math.floor(h) >= b.time && Math.floor(h) < b.time + (b.span || 3)) return b
  }
  return null
}

function isRainAffected(it) {
  if (previewing.value) return false
  const w = weatherOf(it)
  return w.tone === 'bad' && w.icon === '🌧️'
}

function weatherOf(it) {
  const b = blockAt(it.start)
  if (!b) {
    // Too far ahead for a forecast: show what that month is usually like (marked with ~)
    const t = props.typical
    if (t) {
      const wetMonth = t.rainyDays != null && t.rainyDays >= 12
      return {
        icon: wetMonth ? '🌦️' : t.temp >= 24 ? '☀️' : '⛅', text: '~' + t.temp + '°', tone: 'none',
        title: 'Typical for ' + t.month + ' in ' + t.place + ': about ' + t.temp + '°C' +
          (t.rainyDays != null ? ', rain on about ' + t.rainyDays + ' days of the month' : '') + '. The live forecast shows about 5 days before.'
      }
    }
    return { icon: '🌤️', text: '–', tone: 'none', title: 'No forecast yet (forecasts reach about 5 days ahead)' }
  }
  const wet = it.stop.outdoor && rainDuring(rain.value, it.start, it.stop.duration) >= 0.5
  const temp = b.temp != null ? b.temp + '°' : ''
  return {
    icon: b.icon, text: temp || b.condition, tone: wet ? 'bad' : 'ok',
    title: b.condition + (temp ? ', ' + temp + 'C' : '') + (wet ? ' · outdoors in the rain' : '')
  }
}
function crowdOf(it) {
  const s = it.stop
  if (!s.crowd && !s.popular) return { value: null, text: '–', tone: 'none', title: 'No crowd data (no address)' }
  const c = Math.round(crowdAt(s, it.start))
  const level = c >= 80 ? { text: 'Peak', tone: 'bad' } : c >= 55 ? { text: 'Busy', tone: 'mid' } : { text: 'Quiet', tone: 'ok' }
  return { value: c, text: level.text, tone: level.tone, title: level.text + ' at this time, about ' + c + '% of its busiest' + (s.crowd ? '' : ' (estimate)') }
}
// Rain and crowds already show as the coloured icons, so the card doesn't repeat them as pills
function cardPills(it) {
  const list = []
  for (const p of pillsFor(it)) {
    if (previewing.value || (p.icon !== '🌧️' && p.icon !== '👥')) list.push(p)
  }
  return list
}

// Free times on this day that fit the stop without clashing with the others (best first)
function freeTimes(it, isGood) {
  const s = it.stop
  const dur = s.duration || 1
  const out = []
  for (let h = opts.value.dayStart; h + dur <= opts.value.dayEnd + 0.01; h += 0.5) {
    if (Math.abs(h - it.start) < 0.01) continue
    if (s.open != null && h < s.open) continue
    if (s.close != null && h + dur > s.close) continue
    let clash = false
    for (const o of stopRows.value) {
      if (o.stop.id !== s.id && h < o.start + (o.stop.duration || 1) + 0.25 && h + dur + 0.25 > o.start) clash = true
    }
    if (clash || !isGood(h)) continue
    out.push({ hour: h, crowd: s.crowd || s.popular ? Math.round(crowdAt(s, h)) : null })
  }
  out.sort((a, b) => (a.crowd || 0) - (b.crowd || 0) || a.hour - b.hour)
  return out.slice(0, 3)
}
function quieterTimes(it) {
  if (!it.stop.crowd && !it.stop.popular) return []
  const now = crowdAt(it.stop, it.start)
  return freeTimes(it, (h) => crowdAt(it.stop, h) <= now - 10)
}
function dryTimes(it) {
  if (!rain.value) return []
  return freeTimes(it, (h) => rainDuring(rain.value, h, it.stop.duration) < 0.5)
}

// ---------- things to check (the ⚠ pill next to Optimize Route) ----------
const issues = computed(() => {
  const list = []
  if (previewing.value) return list
  for (const it of timeline.value) {
    for (const w of warningsFor(it, rain.value, opts.value)) {
      const x = { key: it.stop.id + w.icon + w.text, it, icon: w.icon, text: w.text, section: 'time', fixLabel: 'Options', fix: null }
      if (w.icon === '👥') {
        x.section = 'crowd'
        const q = quieterTimes(it)
        if (q.length) {
          x.fixLabel = 'Move to ' + formatHour(q[0].hour)
          x.fix = () => { issuesOpen.value = false; moveTime(it, q[0].hour) }
        }
      } else if (w.icon === '🌧️') {
        x.section = 'weather'
      } else if (w.icon !== '🚪' && stopRows.value.length > 1) {
        x.fixLabel = 'Optimize'
        x.fix = () => { issuesOpen.value = false; optimize() }
      }
      if (!x.fix) x.fix = () => openSheet(it, x.section)
      list.push(x)
    }
  }
  return list
})
watch(issues, (list) => { if (!list.length) issuesOpen.value = false })

// Other days: what the parent worked out (this day uses the live list above)
function issuesOn(d) {
  if (d === dayShown.value) return issues.value.length
  return (props.dayIssues[d] && props.dayIssues[d].issues) || 0
}
function loadOf(d) {
  return (props.dayIssues[d] && props.dayIssues[d].load) || 0
}
function loadText(d) {
  const pct = Math.round(loadOf(d) * 100)
  return pct ? pct + '% of your active hours planned' : 'Nothing planned'
}

// ---------- stop sheet (crowds, weather, time & details) ----------
const sheet = ref(null) // { id, section }
let sheetOpener = null
const sheetItem = computed(() => (sheet.value ? stopRows.value.find((it) => it.stop.id === sheet.value.id) || null : null))
const sheetStop = computed(() => {
  if (!sheet.value) return null
  const list = sampleMode.value ? sample.value.stops : props.stops
  return list.find((s) => s.id === sheet.value.id) || null
})
const dayNameShown = computed(() => (dayShown.value ? new Date(dayShown.value + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' }) : props.dayName))
const dayOptions = computed(() => {
  const list = []
  for (let n = 0; n < dayList.value.length; n++) {
    const d = dayList.value[n]
    list.push({ value: d, label: 'Day ' + (n + 1) + ' · ' + longDate(d), description: d === dayShown.value ? 'This day' : countFor(d) ? countFor(d) + ' stops' : 'Free' })
  }
  return list
})
const indoorPicks = computed(() => picks.value.filter((w) => !w.outdoor).slice(0, 5)) // group picks only

function openSheet(it, section) {
  issuesOpen.value = false
  sheetOpener = document.activeElement
  sheet.value = { id: it.stop.id, section }
}
function closeSheet() {
  sheet.value = null
  nextTick(() => { if (sheetOpener && sheetOpener.focus) sheetOpener.focus() })
}
// A stop gets a new time; the toast can put every stop back where it was
function moveTime(it, hour) {
  const before = []
  for (const x of stopRows.value) before.push({ id: x.stop.id, hour: x.stop.hour })
  save([{ id: it.stop.id, hour }])
  showToast(it.stop.name + ' moved to ' + formatHour(hour), () => save(before))
}
function sheetMoveTime(hour) {
  if (sheetItem.value) moveTime(sheetItem.value, hour)
}
function sheetMoveDay(date) {
  const name = sheetItem.value.stop.name
  emit('move-day', sheet.value.id, date)
  sheet.value = null
  showToast(name + ' moved to Day ' + (dayList.value.indexOf(date) + 1))
}
function sheetSwap(wishId) {
  const pick = unscheduled.value.find((w) => w.id === wishId)
  const name = sheetItem.value.stop.name
  emit('swap', sheet.value.id, wishId)
  sheet.value = null
  showToast((pick ? pick.name : 'An indoor place') + ' swapped in · ' + name + ' is back in Saved places')
}
function sheetEdit(fields) {
  emit('edit', sheet.value.id, fields)
  showToast('Details saved')
}

const totals = computed(() => {
  let walk = 0
  let transit = 0
  for (const it of stopRows.value) {
    if (it.mode === 'walk') walk += it.km || 0
    else if (it.mode !== 'start') transit += it.travelMin
  }
  return { walkKm: walk.toFixed(1), transitMin: transit }
})

// ---------- numbered stops (same colour on the list and the map) ----------
const NUMBER_COLORS = ['#00798c', '#d1495b', '#edae49', '#30638e']
function numberColor(i) {
  return NUMBER_COLORS[i % NUMBER_COLORS.length]
}

// ---------- map view ----------
const view = ref('list')          // 'list' | 'map'
const selectedId = ref(null)      // the stop shown under the map
const mapEl = ref(null)
const mapError = ref('')
let map = null
let layer = null

const mapRows = computed(() => stopRows.value.filter((it) => it.stop.lat != null))
const selected = computed(() => {
  const list = stopRows.value
  return list.find((it) => it.stop.id === selectedId.value) || list[0] || null
})
const selectedIndex = computed(() => stopRows.value.findIndex((it) => selected.value && it.stop.id === selected.value.stop.id))

function openOnMap(stop) {
  selectedId.value = stop.id
  view.value = 'map'
}
function stepSelected(step) {
  const i = selectedIndex.value + step
  if (i >= 0 && i < stopRows.value.length) selectedId.value = stopRows.value[i].stop.id
}

// Which map tiles to use (asked once)
let tilesPromise = null
function tileConfig() {
  if (!tilesPromise) {
    tilesPromise = axios.get('/api/maps/config')
      .then((res) => res.data)
      .catch(() => ({
        tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      }))
  }
  return tilesPromise
}

async function drawMap() {
  if (view.value !== 'map') return
  await nextTick()
  if (!mapEl.value) return
  let L
  try {
    L = await loadLeaflet()
  } catch (err) {
    mapError.value = 'The map could not load. Check your internet connection.'
    return
  }
  mapError.value = ''
  if (!map || map.getContainer() !== mapEl.value) {
    if (map) map.remove()
    map = L.map(mapEl.value, { zoomControl: true, attributionControl: true })
    // Tiles: MapTiler if the server has a key (MAPTILER_KEY in server/.env), otherwise OpenStreetMap
    const tiles = await tileConfig()
    L.tileLayer(tiles.tiles, { maxZoom: 19, attribution: tiles.attribution }).addTo(map)
  }
  if (layer) layer.remove()
  layer = L.layerGroup().addTo(map)
  const points = []
  for (const it of mapRows.value) {
    const i = stopRows.value.indexOf(it)
    const point = [it.stop.lat, it.stop.lon]
    points.push(point)
    const active = selected.value && selected.value.stop.id === it.stop.id
    const icon = L.divIcon({
      className: '',
      html: '<span class="ip-pin' + (active ? ' active' : '') + '" style="background:' + numberColor(i) + '">' + (i + 1) + '</span>',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    })
    L.marker(point, { icon, title: it.stop.name, keyboard: true })
      .on('click', () => { selectedId.value = it.stop.id })
      .addTo(layer)
  }
  if (points.length > 1) L.polyline(points, { color: '#d1495b', weight: 4, opacity: 0.85, dashArray: '1 8', lineCap: 'round' }).addTo(layer)
  if (points.length > 1) L.polyline(points, { color: '#d1495b', weight: 3, opacity: 0.55 }).addTo(layer)
  if (points.length === 1) map.setView(points[0], 15)
  else if (points.length) map.fitBounds(points, { padding: [40, 40] })
  else map.setView([20, 0], 2)
  setTimeout(() => map && map.invalidateSize(), 50)
}
watch([view, () => mapRows.value.map((it) => it.stop.id + it.stop.lat).join(), selectedId], drawMap)
onBeforeUnmount(() => {
  if (map) map.remove()
  map = null
})

function directionsUrl(stop) {
  const dest = stop.lat != null ? stop.lat + ',' + stop.lon : encodeURIComponent(stop.address || stop.name)
  return 'https://www.google.com/maps/dir/?api=1&destination=' + dest
}
function hoursText(stop) {
  if (stop.open == null || stop.close == null) return ''
  return 'Open ' + formatHour(stop.open) + ' – ' + formatHour(stop.close)
}

// transport feature 

// to display the searched day and timing ["Mon 19 Oct, 9:00 AM (departing)"]
function whenText(opt) {
  if (!opt.day || !opt.time) return '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = opt.day.split('-').map(Number);
  const [h, min] = opt.time.split(':').map(Number);
  const weekday = days[new Date(y, m - 1, d).getDay()];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const time = `${h % 12 || 12}:${String(min).padStart(2, '0')} ${ampm}`;
  return `${weekday} ${d} ${months[m - 1]}, ${time} (${opt.timeType === 'arrive' ? 'arriving' : 'departing'})`;
}

// to diplay a short summary ["Bus N51 → N37 (6 stops) · Walk 21 mins"]
function summarizeRoute(route = '') {
  const chain = [];
  let stops = 0, walk = 0, lastLabel = '';

  for (const part of route.split('→').map(s => s.trim())) {
    const w = part.match(/^Walk \((\d+) mins?\)$/);
    if (w) { 
      walk += Number(w[1]); 
      continue; 
    }

    const t = part.match(/^(Bus|Train)\s+(.+?)(?:\s*\((\d+) stops?\))?$/);
    if (t) {
      chain.push(t[1] === lastLabel ? t[2] : `${t[1]} ${t[2]}`);   // repeat "Bus" only when the vehicle changes
      lastLabel = t[1];
      stops += Number(t[3] || 0);
    }
  }

  if (!chain.length) { 
    return route;   // Taxi ("Via ...") and Walk ("On foot") stay as they are
  }

  return chain.join(' → ')
    + (stops ? ` (${stops} stop${stops > 1 ? 's' : ''})` : '')
    + (walk ? ` · Walk ${walk} mins` : '');
}

// display the saved option as at the destination card
function savedFor(item) {
  if (!item || !item.name) return [];
    return props.savedRoutes.filter(route => route.end === item.name);
}

// format to show cost
function formatCost(opt) {
  if (opt.cost === 0) return 'Free';
  if (!opt.currency) return opt.cost.toLocaleString();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: opt.currency }).format(opt.cost);
  } catch {
    return `${opt.currency} ${opt.cost}`;
  }
}

// format to show duration
function formatDuration(min) {
  if (!min) return '0 mins';
  if (min < 60) return `${min} mins`;
  const hour = Math.floor(min / 60);
  const mins = min % 60;
  return mins ? `${hour} hr ${mins} mins` : `${hour} hr`; 
}

// only display cost if available 
function hasValidCost(cost) {
  return typeof cost === 'number' && !isNaN(cost);
}  

// go to Getting there with selected details previously saved
function openInGettingthere(route, opt) {
  transportPrefill.value = {
    start: route.start,
    end: route.end,
    day: opt.day,
    time: opt.time,
    timeType: opt.timeType || 'depart'
  };
  emit('open-transport');   // lets the parent switch to the Go Options page
}

</script>
<style scoped>
.ip {
  --ink: #003d5b;
  --muted: #5a6b78;
  --line: #e6dfd2;
  --primary: #00798c;
  --active: #d1495b;
  margin-bottom: 16px;
  color: var(--ink);
}

/* Day navigator */
.ip-daynav {
  padding: 10px 12px 8px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: #fbf5ea;
}
.ip-daynav-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ip-daynav-where {
  margin: 0;
  font-size: 14px;
  color: var(--muted);
}
.ip-daynav-where strong {
  color: var(--ink);
}
.ip-daynav-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ip-small {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fbf5ea;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.ip-small:hover,
.ip-small[aria-expanded='true'] {
  border-color: var(--primary);
  color: var(--primary);
}
.ip-small.add {
  border-style: dashed;
  color: var(--primary);
}
.ip-small.remove {
  border-style: dashed;
  color: #d1495b;
}
.ip-small.remove:hover {
  border-color: #d1495b;
  background: #fbe7ea;
  color: #d1495b;
}

/* Weather + crowd icons on each card */
.ip-sig {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: #efe9df;
  color: var(--ink);
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.ip-sig:hover {
  border-color: var(--primary);
  transform: translateY(-1px);
}
.ip-sig.ok { background: #fbefd9; color: #004e5a; }
.ip-sig.mid { background: #fff3d6; color: #7a4b00; }
.ip-sig.bad { background: #fbe7ea; color: #d1495b; }
.ip-sig.none { color: var(--muted); }
.ip-sig:focus-visible,
.ip-issues-btn:focus-visible,
.ip-issue-text:focus-visible,
.ip-issue-fix:focus-visible {
  outline: 3px solid rgba(0, 121, 140, 0.45);
  outline-offset: 2px;
}

/* Things to check */
.ip-issues-wrap {
  position: relative;
}
.ip-issues-btn {
  border: 1.5px solid #f0c674;
  background: #fff3d6;
  color: #7a4b00;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 13px;
  font-weight: 700;
  animation: ip-rise 0.2s ease-out;
}
.ip-issues-btn:hover,
.ip-issues-btn[aria-expanded="true"] {
  background: #ffe9b3;
}
.ip-issues {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 45;
  width: min(380px, 86vw);
  padding: 12px;
  border-radius: 16px;
  background: #fbf5ea;
  border: 1px solid var(--line);
  box-shadow: 0 18px 40px rgba(0, 40, 62, 0.18);
  animation: ip-rise 0.18s ease-out;
}
.ip-issues-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
}
.ip-issues ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ip-issues li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border-radius: 12px;
}
.ip-issues li:hover {
  background: #f6f2ea;
}
.ip-issue-icon {
  font-size: 18px;
}
.ip-issue-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 0;
  background: none;
  padding: 0;
  text-align: left;
  color: var(--ink);
}
.ip-issue-text strong {
  font-size: 13px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ip-issue-text small {
  color: var(--muted);
  font-size: 12px;
}
.ip-issue-fix {
  flex-shrink: 0;
  border: 1.5px solid var(--ink);
  background: #fbf5ea;
  color: var(--ink);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.ip-issue-fix:hover {
  background: var(--ink);
  color: #fff;
}
.ip-issues-all {
  width: 100%;
  margin-top: 8px;
}

/* Day strip + grid: how full, and a dot when something needs a look */
.ip-day.flagged {
  position: relative;
}
.ip-day.flagged::after {
  content: '';
  position: absolute;
  top: 6px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #e8a317;
}
.ip-grid-day {
  position: relative;
}
.ip-grid-key {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 2px;
  font-size: 11px;
  color: var(--muted);
}
.ip-load {
  display: block;
  width: 36px;
  height: 4px;
  margin-top: 3px;
  border-radius: 999px;
  background: #efe9df;
  overflow: hidden;
}
.ip-load i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--primary);
}
.ip-load i.over {
  background: #d1495b;
}
.ip-flag {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #e8a317;
}
.ip-flag.inline {
  position: static;
  display: inline-block;
}

/* All-days grid */
.ip-allwrap {
  position: relative;
}
.ip-grid {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 40;
  display: grid;
  grid-template-columns: repeat(7, 64px);
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
  padding: 10px;
  border-radius: 16px;
  background: #fbf5ea;
  border: 1px solid var(--line);
  box-shadow: 0 18px 40px rgba(0, 40, 62, 0.18);
  animation: ip-rise 0.18s ease-out;
}
.ip-grid-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 6px 2px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fbf5ea;
  color: var(--ink);
  font-size: 11px;
  transition: border-color 0.15s, background 0.15s;
}
.ip-grid-day strong {
  font-size: 15px;
}
.ip-grid-day small {
  color: var(--muted);
  font-size: 10px;
}
.ip-grid-day:hover {
  border-color: var(--primary);
}
.ip-grid-day.on {
  background: var(--active);
  border-color: var(--active);
  color: #fff;
}
.ip-grid-day.on small {
  color: rgba(255, 255, 255, 0.85);
}
.ip-grid-day.today:not(.on) {
  border-color: var(--primary);
  box-shadow: inset 0 0 0 1px var(--primary);
}

/* Strip with arrows */
.ip-strip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.ip-arrow {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #fbf5ea;
  color: var(--ink);
  font-size: 20px;
  line-height: 1;
  transition: border-color 0.15s, opacity 0.15s;
}
.ip-arrow:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}
.ip-arrow:disabled {
  opacity: 0.3;
}
.ip-strip-wrap {
  flex: 1;
  min-width: 0;
}
/* Faded edges tell you there are more days that way */
.ip-strip-wrap.fade-r .ip-days {
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 40px), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - 40px), transparent);
}
.ip-strip-wrap.fade-l .ip-days {
  -webkit-mask-image: linear-gradient(to left, #000 calc(100% - 40px), transparent);
  mask-image: linear-gradient(to left, #000 calc(100% - 40px), transparent);
}
.ip-strip-wrap.fade-l.fade-r .ip-days {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 40px, #000 calc(100% - 40px), transparent);
  mask-image: linear-gradient(to right, transparent, #000 40px, #000 calc(100% - 40px), transparent);
}
.ip-days {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
  padding: 2px;
}
.ip-days::-webkit-scrollbar {
  display: none;
}
.ip-day {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 58px;
  padding: 5px 2px 6px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fbf5ea;
  color: var(--ink);
  line-height: 1.15;
  transition: background 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.15s;
}
.ip-day small {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.ip-day strong {
  font-size: 17px;
}
.ip-day-n {
  font-size: 10px;
  color: var(--muted);
}
.ip-day.weekend:not(.on) small {
  color: var(--active);
}
.ip-day:hover {
  transform: translateY(-1px);
  border-color: #d2c8b6;
}
.ip-day.today:not(.on) {
  border-color: var(--primary);
  box-shadow: inset 0 0 0 1px var(--primary);
}
.ip-day.on {
  background: var(--active);
  border-color: var(--active);
  color: #fff;
  box-shadow: 0 6px 14px rgba(209, 73, 91, 0.3);
}
.ip-day.on small,
.ip-day.on .ip-day-n {
  color: rgba(255, 255, 255, 0.85);
}
/* A dot per planned stop (up to 4): busy and empty days at a glance */
.ip-day-dots {
  display: flex;
  gap: 2px;
  height: 5px;
  margin-top: 3px;
}
.ip-day-dots i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--primary);
}
.ip-day.on .ip-day-dots i {
  background: #fbf5ea;
}

/* Actions */
.ip-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.ip-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 999px;
  padding: 9px 18px;
  font-weight: 700;
  background: var(--primary);
  color: #fff;
  box-shadow: 0 6px 16px rgba(0, 121, 140, 0.25);
  transition: transform 0.15s, filter 0.15s;
}
.ip-cta:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.06);
}
.ip-cta:disabled:not(.busy) {
  opacity: 0.45;
  box-shadow: none;
}
.ip-cta.busy {
  background: #fbf5ea;
  color: var(--primary);
  box-shadow: inset 0 0 0 1.5px var(--primary);
}
.ip-cta.small,
.ip-outline.small {
  padding: 6px 16px;
}
.ip-spin {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0, 121, 140, 0.25);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: ip-spin 0.8s linear infinite;
}
.ip-totals {
  display: inline-flex;
  gap: 6px;
  font-size: 12px;
}
.ip-totals span {
  padding: 4px 10px;
  border-radius: 999px;
  background: #fbf5ea;
  border: 1px solid var(--line);
  color: var(--muted);
}
.ip-views {
  position: relative;
  margin-left: auto;
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
  border-radius: 999px;
  background: #ece6dc;
  box-shadow: inset 0 0 0 1px #e2dacb;
}
/* The highlight that slides under the chosen option */
.ip-views-thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(50% - 4px);
  border-radius: 999px;
  background: var(--ink);
  box-shadow: 0 3px 10px rgba(0, 40, 62, 0.25);
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ip-views.right .ip-views-thumb {
  transform: translateX(100%);
}
.ip-views button {
  position: relative; /* above the highlight */
  z-index: 1;
  min-width: 108px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-size: 15px;
  font-weight: 700;
  color: var(--muted);
  transition: color 0.2s;
}
.ip-views button:hover:not(.on) {
  color: var(--ink);
}
.ip-views button.on {
  color: #fff;
}
.ip-views button:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .ip-views-thumb {
    transition: none;
  }
}
.ip-outline {
  border: 1.5px solid var(--primary);
  border-radius: 999px;
  background: transparent;
  color: var(--primary);
  font-weight: 600;
}
.ip-link {
  border: 0;
  background: none;
  padding: 0;
  color: var(--primary);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ip-sample,
.ip-muted,
.ip-empty {
  color: var(--muted);
  font-size: 13px;
  margin: 10px 0 0;
}

/* Preview */
.ip-preview {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  background: #fbefd9;
  border: 1px solid rgba(0, 121, 140, 0.35);
}
.ip-preview.same {
  background: #fbf5ea;
  border-color: var(--line);
}
.ip-preview-btns {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

/* Layout */
.ip-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  margin-top: 16px;
  align-items: start;
}
.ip-body.drawer-closed {
  grid-template-columns: minmax(0, 1fr) 220px;
}

/* Timeline: numbered circles joined by a thin line */
.ip-list {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
}
/* The day's route: a dotted gold line from stop to stop (like a travel journal) */
.ip-list::before {
  content: '';
  position: absolute;
  top: 30px;
  bottom: 40px;
  left: 14px;
  width: 4px;
  background-image: radial-gradient(circle, #edae49 1.6px, transparent 2px);
  background-size: 4px 9px;
  background-repeat: repeat-y;
}
.ip-stop {
  position: relative;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}
.ip-stop.moving {
  opacity: 0.4;
}
.ip-num {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  box-shadow: 0 0 0 4px #fff, 0 4px 10px rgba(0, 40, 62, 0.18);
}
.ip-num.sm {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 26px;
  height: 26px;
  font-size: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.ip-gap {
  min-height: 12px;
  padding-left: 44px;
  display: flex;
  align-items: center;
  transition: min-height 0.15s;
}
.ip-gap.end:not(.show) {
  min-height: 0;
}
.ip-list.dragging .ip-gap {
  min-height: 40px;
}
/* How you get to the next stop: a small pill with the transport icon in a gold circle */
.ip-leg {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 6px 0;
  padding: 3px 12px 3px 3px;
  border-radius: 999px;
  background: #fbf5ea;
  border: 1px solid #ece4d6;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.ip-leg :deep(svg) {
  box-sizing: content-box;
  padding: 4px;
  border-radius: 50%;
  background: #fdf3e0;
  color: #c98a1e;
}
.ip-drop {
  flex: 1;
  margin: 4px 0;
  padding: 7px;
  text-align: center;
  font-size: 12px;
  border-radius: 12px;
  border: 1.5px dashed #d2c8b6;
  color: var(--muted);
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.ip-gap.active .ip-drop {
  background: #fbefd9;
  border-color: var(--primary);
  color: var(--primary);
}

/* Stop card */
.ip-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: #fbf5ea;
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 2px 8px rgba(0, 40, 62, 0.05);
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
}
.ip-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 26px rgba(0, 40, 62, 0.1);
}
.ip-card.locked {
  border-color: rgba(0, 121, 140, 0.35);
}
.ip-card.moved {
  box-shadow: 0 0 0 2px rgba(0, 121, 140, 0.35);
  animation: ip-slide 0.35s ease-out;
}
.ip-move {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin: -4px -4px -4px -2px;
}
.ip-move-locked {
  justify-content: center;
  width: 28px;
  color: #9aa7b1;
}
.ip-move-btn {
  width: 28px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  transition: background 0.15s, color 0.15s;
}
.ip-move-btn:hover:not(:disabled),
.ip-move-btn:focus-visible {
  background: rgba(0, 61, 91, 0.1);
  color: var(--text);
}
.ip-move-btn:disabled {
  opacity: 0.25;
  cursor: default;
}
.ip-handle {
  display: grid;
  place-items: center;
  width: 28px;
  height: 22px;
  color: #9aa7b1;
  cursor: grab;
}
.ip-card:hover .ip-handle {
  color: var(--text);
}
.ip-card[draggable="true"]:active {
  cursor: grabbing;
}
.ip-reorder-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 4px 44px;
  font-size: 13px;
  color: var(--muted);
}
.ip-thumb {
  flex: none;
  width: 124px; /* photo first: a bigger picture of each stop */
  height: 92px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  font-size: 30px;
  background: var(--tint, #efe9df) center / cover no-repeat;
}
.ip-thumb.sm {
  width: 48px;
  height: 48px;
  font-size: 20px;
  border-radius: 12px;
}
.cat-culture { --tint: #fff3d6; }
.cat-food { --tint: #ffe5e3; }
.cat-nature { --tint: #fbefd9; }
.cat-shopping { --tint: #e3edfb; }
.cat-sight { --tint: #efe9df; }
.ip-info {
  flex: 1;
  min-width: 0;
}
.ip-when {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.ip-when small {
  font-weight: 500;
  color: var(--muted);
}
.ip-when .ip-was {
  color: var(--primary);
  font-weight: 600;
  margin-left: 4px;
}
.ip-name {
  font-size: 15px;
  font-weight: 700;
  margin: 2px 0 6px;
  color: var(--ink);
}
.ip-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.ip-chip {
  display: inline-block;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #efe9df;
  color: var(--muted);
}
.ip-pill {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #fbefd9;
  color: #004e5a;
}
.ip-pill.warn {
  background: #fff3d6;
  color: #7a4b00;
}
.ip-pill.lock,
.ip-pill.wait {
  background: #efe9df;
  color: var(--muted);
}
.ip-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.ip-back,
.ip-lock,
.ip-go {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  font-size: 14px;
  color: var(--muted);
  transition: background 0.15s, transform 0.12s, color 0.15s;
}
.ip-go,
.ip-back {
  display: grid;
  place-items: center;
}

.ip-back:hover:not(:disabled),
.ip-lock:hover:not(:disabled),
.ip-go:hover {
  background: #efe9df;
  color: var(--ink);
}
.ip-lock:active:not(:disabled) {
  transform: scale(0.9);
}
.ip-lock.on {
  background: #fbefd9;
}
.ip-back:disabled,
.ip-lock:disabled {
  opacity: 0.4;
}
.ip-add-stop {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 18px;
  padding: 12px;
  border: 1.5px solid var(--primary);
  border-radius: 999px;
  background: transparent;
  color: var(--primary);
  font-weight: 700;
  transition: background 0.15s;
}
.ip-add-stop span {
  font-size: 18px;
  line-height: 1;
}
.ip-add-stop:hover {
  background: #fbefd9;
}

/* Map view */
.ip-map {
  isolation: isolate; /* keeps Leaflet's layers under the detail card */
  height: 420px;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: #efe9df;
}
.ip-map :deep(.ip-pin) {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #fff;
  font: 700 14px/1 Inter, Arial, sans-serif;
  border: 3px solid #fff;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s;
}
.ip-map :deep(.ip-pin.active) {
  transform: scale(1.25);
}
.ip-detail {
  display: flex;
  gap: 14px;
  margin-top: -36px;
  position: relative;
  z-index: 500;
  padding: 14px;
  background: #fbf5ea;
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 16px 34px rgba(0, 40, 62, 0.14);
}
.ip-detail-photo {
  position: relative;
  flex: none;
  width: 140px;
  min-height: 130px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--tint, #efe9df) center / cover no-repeat;
}
.ip-detail-icon {
  font-size: 40px;
}
.ip-detail-info {
  flex: 1;
  min-width: 0;
}
.ip-detail-name {
  font-size: 17px;
  font-weight: 700;
  margin: 2px 0 6px;
}
.ip-detail-line {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--muted);
}
.ip-detail-btns {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.ip-directions {
  flex: 1;
  text-align: center;
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  font-weight: 700;
  text-decoration: none;
  transition: filter 0.15s;
}
.ip-directions:hover {
  color: #fff;
  filter: brightness(1.15);
}
.ip-step {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #fbf5ea;
  font-size: 20px;
  line-height: 1;
  color: var(--ink);
}
.ip-step:disabled {
  opacity: 0.35;
}

/* Saved places drawer */
.ip-drawer {
  position: sticky;
  top: 90px;
  background: #fbf5ea;
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0, 40, 62, 0.05);
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ip-drawer.target {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(0, 121, 140, 0.15);
}
.ip-drawer-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  color: var(--ink);
  padding: 12px 14px;
  text-align: left;
}
.ip-drawer-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #fff3d6;
  font-size: 18px;
}
.ip-drawer-title {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.ip-drawer-title small {
  color: var(--muted);
  font-size: 12px;
}
.ip-chev {
  color: var(--muted);
  font-size: 20px;
  line-height: 1;
}
.ip-drawer-body {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ip-unschedule {
  margin: 0;
  padding: 14px;
  text-align: center;
  border: 1.5px dashed var(--primary);
  border-radius: 12px;
  color: var(--primary);
  font-size: 13px;
}
.ip-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ip-group + .ip-group {
  margin-top: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.ip-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.ip-group-count {
  font-size: 11px;
  font-weight: 600;
  padding: 0 7px;
  border-radius: 999px;
  background: #efe9df;
  letter-spacing: 0;
}
.ip-wish {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px;
  border-radius: 14px;
  border: 1px solid var(--line);
  cursor: grab;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}
.ip-wish:hover {
  transform: translateX(2px);
  box-shadow: 0 6px 14px rgba(0, 40, 62, 0.08);
}
.ip-wish-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ip-wish-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ip-wish-text small {
  font-size: 11px;
  color: var(--muted);
}
.ip-vote-rule {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(237, 174, 73, 0.14);
  color: var(--text);
  font-size: 13px;
  line-height: 1.4;
}
.ip-vote-rule svg {
  flex: none;
  margin-top: 1px;
  color: #c98a1e;
}
.ip-waiting {
  margin-top: 6px;
}
.ip-wish.waiting {
  cursor: default;
  border-style: dashed;
}
.ip-wish.waiting .ip-thumb,
.ip-wish.waiting .ip-wish-name {
  opacity: 0.65;
}
.ip-vote {
  flex: none;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1.5px solid #edae49;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  transition: background 0.15s;
}
.ip-vote:hover,
.ip-vote:focus-visible {
  background: #edae49;
  color: #001d2c;
}
.ip-add {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1.5px solid var(--primary);
  background: transparent;
  color: var(--primary);
  font-size: 18px;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.ip-add:hover {
  background: var(--primary);
  color: #fff;
}
.ip button:focus-visible,
.ip a:focus-visible {
  outline: 3px solid rgba(0, 121, 140, 0.4);
  outline-offset: 2px;
}

/* Animations */
.ip-pop-enter-active {
  transition: opacity 0.2s ease-out, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.ip-pop-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}
.ip-pop-enter-from,
.ip-pop-leave-to {
  opacity: 0;
  transform: scale(0.97) translateY(-6px);
}
@keyframes ip-spin {
  to { transform: rotate(360deg); }
}
@keyframes ip-slide {
  from { transform: translateY(-6px); opacity: 0.6; }
}

/* Tablets and phones: saved places above, everything in one column */
@media (max-width: 900px) {
  .ip-body,
  .ip-body.drawer-closed {
    grid-template-columns: 1fr;
  }
  .ip-drawer {
    position: static;
    order: -1;
  }
}
@media (max-width: 560px) {
  .ip-views {
    margin-left: 0;
  }
  .ip-thumb {
    width: 76px;
    height: 68px;
  }
  .ip-map {
    height: 320px;
  }
  .ip-detail {
    flex-direction: column;
  }
  .ip-detail-photo {
    width: 100%;
    min-height: 140px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ip-dialog,
  .ip-spin,
  .ip-card.moved {
    animation: none;
  }
  .ip-card,
  .ip-day,
  .ip-grid-day,
  .ip-wish,
  .ip-gap,
  .ip-pop-enter-active,
  .ip-pop-leave-active {
    transition: none;
  }
}
/* Remove-from-day turns red on hover, so it reads as "take off" */
.ip-side .ip-back:hover:not(:disabled) {
  color: #d1495b;
  background: #fbe7ea;
}
/* Lunch / dinner break rows */
.ip-num.meal {
  background: #fbf5ea;
  border: 2px dashed #d2c8b6;
  font-size: 15px;
  box-shadow: 0 0 0 4px #fff;
}
.ip-meal {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  padding: 12px 14px;
  border: 1.5px dashed #d2c8b6;
  border-radius: 16px;
  color: var(--muted);
}
.ip-meal-name {
  color: var(--ink);
}
.ip-meal .ip-when {
  display: inline;
}
.ip-meal .ip-link {
  margin-left: auto;
  font-size: 13px;
}
/* Duration chip + its menu */
.ip-dur-wrap {
  position: relative;
  display: inline-block;
}
.ip-dur {
  border: 1px solid transparent;
  border-radius: 999px;
  background: #efe9df;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  padding: 2px 9px;
  margin-left: 4px;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.ip-dur span {
  font-size: 9px;
  opacity: 0.7;
}
.ip-dur:hover:not(:disabled),
.ip-dur[aria-expanded='true'] {
  border-color: var(--primary);
  color: var(--primary);
  background: #fbf5ea;
}
.ip-dur-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 220px;
  padding: 10px;
  border-radius: 14px;
  background: #fbf5ea;
  border: 1px solid var(--line);
  box-shadow: 0 16px 34px rgba(0, 40, 62, 0.18);
  font-weight: 400;
  animation: ip-rise 0.18s ease-out;
}
.ip-dur-step {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ip-dur-step button {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #fbf5ea;
  color: var(--ink);
  font-size: 18px;
  line-height: 1;
}
.ip-dur-step button:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}
.ip-dur-step button:disabled {
  opacity: 0.35;
}
.ip-dur-step strong {
  font-size: 15px;
  color: var(--ink);
}
.ip-dur-picks {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.ip-dur-picks button {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fbf5ea;
  padding: 6px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}
.ip-dur-picks button:hover {
  border-color: var(--primary);
}
.ip-dur-picks button.on {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

/* Live: what's happening now */
.ip-live-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  background: #efe9df;
  color: var(--muted);
}
.ip-live-badge.now {
  background: var(--active);
  color: #fff;
  animation: ip-pulse 2s infinite;
}
.ip-live {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.ip-live-btn {
  border: 1.5px solid var(--primary);
  border-radius: 999px;
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  font-weight: 700;
  padding: 4px 12px;
  transition: background 0.15s, color 0.15s;
}
.ip-live-btn.done {
  background: var(--primary);
  color: #fff;
}
.ip-live-btn:hover {
  filter: brightness(1.05);
  background: #fbefd9;
}
.ip-live-btn.done:hover {
  background: var(--primary);
}
@keyframes ip-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(209, 73, 91, 0.45); }
  60% { box-shadow: 0 0 0 6px rgba(209, 73, 91, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .ip-live-badge.now,
  .ip-dur-menu {
    animation: none;
  }
}
.ip-stop.menu-open {
  z-index: 20; /* keep the duration menu above the next card */
}
@media (max-width: 560px) {
  .ip-grid {
    grid-template-columns: repeat(4, 62px);
  }
  .ip-arrow {
    width: 30px;
    height: 30px;
  }
}
/* Confirm dialog (add / remove a day, two cities on one day) */
.ip-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 40, 62, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.ip-dialog {
  width: min(420px, 100%);
  padding: 22px;
  border-radius: 22px;
  background: #fbf5ea;
  color: var(--ink);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
  animation: ip-rise 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.ip-dialog:focus {
  outline: none;
}
.ip-dialog-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: #fbefd9;
  font-size: 22px;
}
.ip-dialog-icon.danger {
  background: #fbe7ea;
}
.ip-dialog-title {
  font-family: var(--font-display);
  font-size: 1.3rem;
  margin: 12px 0 8px;
}
.ip-dialog-list {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  color: var(--ink);
}
.ip-dialog-list li + li {
  margin-top: 4px;
}
.ip-dialog-btns {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
.ip-dialog-btns .ip-outline {
  padding: 8px 18px;
}
.ip-cta.danger {
  background: #d1495b;
  box-shadow: 0 6px 16px rgba(192, 57, 43, 0.25);
}

/* Undo bar */
.ip-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 1250;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: calc(100vw - 32px);
  padding: 10px 12px 10px 18px;
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  font-size: 14px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
}
.ip-toast-undo {
  border: 0;
  border-radius: 999px;
  padding: 5px 14px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-weight: 700;
}
.ip-toast-undo:hover {
  background: rgba(255, 255, 255, 0.25);
}
.ip-toast-x {
  border: 0;
  background: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}
.ip-fade-enter-active,
.ip-fade-leave-active {
  transition: opacity 0.18s;
}
.ip-fade-enter-from,
.ip-fade-leave-to {
  opacity: 0;
}
/* Red highlight border for rain-affected outdoor stops */
.ip-card.rain-warning-card {
  border: 2px solid #ef4444 !important;
  background-color: #fef2f2 !important;
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.2) !important;
  transition: all 0.2s ease-in-out;
}

.ip-card.rain-warning-card:hover {
  border-color: #dc2626 !important;
  box-shadow: 0 8px 20px rgba(220, 38, 38, 0.3) !important;
}

@keyframes ip-rise {
  from { transform: translateY(10px) scale(0.97); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .ip-dialog {
    animation: none;
  }
}

/* Phones and touch screens: every control is at least 40px to tap (WCAG / Apple guidance) */
@media (pointer: coarse), (max-width: 560px) {
  .ip-arrow {
    min-width: 40px;
    min-height: 40px;
  }
}
</style>
