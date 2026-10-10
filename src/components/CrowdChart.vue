<template>
  <!-- Hourly crowd chart for one place on one day.
       <CrowdChart :forecast="f" day-name="Tuesday" :planned-hour="14" :suggest-hour="21" /> -->
  <figure class="crowd-chart" data-testid="crowd-chart">
    <figcaption class="crowd-chart-caption">
      <span>{{ forecast.estimated ? 'Estimated crowds' : 'Crowds' }} on {{ dayName }} (hover a bar)</span>
      <span class="crowd-chart-readout" aria-live="polite">{{ readout }}</span>
    </figcaption>

    <div class="crowd-chart-plot">
      <!-- 100% = the busiest hour of this place's week -->
      <div v-for="bar in bars" :key="bar.hour" class="crowd-chart-slot">
        <button type="button" class="crowd-chart-bar" :class="'is-' + bar.kind"
          :style="{ height: Math.max(bar.value, 2) + '%' }"
          :aria-label="bar.label + ', ' + bar.value + '% busy' + (bar.kind !== 'base' ? ' (' + bar.kind + ')' : '')"
          @mouseenter="hovered = bar" @mouseleave="hovered = null"
          @focus="hovered = bar" @blur="hovered = null">
        </button>
      </div>
    </div>

    <!-- Hour labels every 3 hours -->
    <div class="crowd-chart-axis" aria-hidden="true">
      <span v-for="bar in bars" :key="'l' + bar.hour" class="crowd-chart-tick">
        {{ bar.hour % 3 === 0 ? bar.short : '' }}
      </span>
    </div>

    <!-- Legend -->
    <div class="crowd-chart-legend">
      <span v-if="plannedHour !== null"><i class="swatch is-planned"></i>Planned</span>
      <span v-if="suggestHour !== null"><i class="swatch is-suggested"></i>Suggested</span>
    </div>

    <!-- Same data as a table for screen readers -->
    <table class="visually-hidden">
      <caption>Typical crowds by hour on {{ dayName }}</caption>
      <thead>
        <tr><th scope="col">Hour</th><th scope="col">Busyness</th></tr>
      </thead>
      <tbody>
        <tr v-for="bar in bars" :key="'t' + bar.hour"><td>{{ bar.label }}</td><td>{{ bar.value }}%</td></tr>
      </tbody>
    </table>
  </figure>
</template>

<script>
import { busynessAt, formatHour } from '../crowd.js'

export default {
  props: {
    forecast: { type: Object, required: true },
    dayName: { type: String, required: true },
    plannedHour: { type: Number, default: null },
    suggestHour: { type: Number, default: null }
  },
  data() {
    return { hovered: null }
  },
  computed: {
    // One bar per opening hour
    bars() {
      const day = this.forecast.days[this.dayName]
      const list = []
      if (!day || day.closed) return list
      for (let h = Math.floor(day.open); h < Math.ceil(day.close); h++) {
        let kind = 'base'
        if (h === this.plannedHour) kind = 'planned'
        if (h === this.suggestHour) kind = 'suggested'
        const label = formatHour(h)
        list.push({
          hour: h,
          value: busynessAt(this.forecast, this.dayName, h),
          kind,
          label,
          short: label.replace(':00 ', '').replace('AM', 'a').replace('PM', 'p') // "2p"
        })
      }
      return list
    },
    readout() {
      if (this.hovered) return this.hovered.label + ' · ' + this.hovered.value + '%'
      return ''
    }
  }
}
</script>

<style scoped>
.crowd-chart {
  margin: 8px 0 0;
  max-width: 520px;
}
.crowd-chart-caption {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: #495057;
  margin-bottom: 6px;
}
.crowd-chart-readout {
  color: #212529;
  font-weight: 600;
}
.crowd-chart-plot {
  display: flex;
  align-items: flex-end;
  gap: 2px;                 /* surface gap between bars */
  height: 72px;
  border-bottom: 1px solid #dee2e6; /* baseline */
}
.crowd-chart-slot {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.crowd-chart-bar {
  width: 100%;
  max-width: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px 4px 0 0; /* rounded top, square at the baseline */
  background: #cfd6e2;
  cursor: pointer;
}
.crowd-chart-bar:hover,
.crowd-chart-bar:focus-visible {
  filter: brightness(0.9);
  outline: 2px solid #212529;
  outline-offset: 1px;
}
.crowd-chart-bar.is-planned { background: #c2410c; }
.crowd-chart-bar.is-suggested { background: #2f6fed; }

.crowd-chart-axis {
  display: flex;
  gap: 2px;
}
.crowd-chart-tick {
  flex: 1;
  text-align: center;
  font-size: 10px;
  color: #6c757d;
  white-space: nowrap;
  min-width: 0;
}
.crowd-chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: #495057;
  margin-top: 6px;
}
.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 4px;
  vertical-align: -1px;
}
.swatch.is-planned { background: #c2410c; }
.swatch.is-suggested { background: #2f6fed; }
.swatch.is-base { background: #cfd6e2; }
</style>
