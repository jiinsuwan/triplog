<script setup>
import { computed } from 'vue'

import TripStamp from './TripStamp.vue'

const palette = {
  terra: 'var(--t-terra)',
  mustard: 'var(--t-mustard)',
  sage: 'var(--t-sage)',
  blue: 'var(--t-blue)',
  burgundy: 'var(--t-burgundy)',
  khaki: 'var(--t-khaki)',
  plum: 'var(--t-plum)',
}

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  region: {
    type: String,
    default: '',
  },
  dates: {
    type: String,
    default: '날짜 미정',
  },
  serial: {
    type: String,
    default: 'TL-2026',
  },
  tags: {
    type: Array,
    default: () => [],
  },
  color: {
    type: String,
    default: 'mustard',
  },
  dday: {
    type: [Number, String, null],
    default: null,
  },
  ddayLabel: {
    type: String,
    default: 'D-DAY',
  },
  torn: {
    type: Boolean,
    default: false,
  },
  unissued: {
    type: Boolean,
    default: false,
  },
  showBarcode: {
    type: Boolean,
    default: true,
  },
  stampStage: {
    type: Number,
    default: 3,
  },
  stampTitle: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    default: '',
  },
})

const ticketStyle = computed(() => ({
  '--tc': palette[props.color] ?? props.color,
}))

const tagText = computed(() => props.tags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' '))
const ddayText = computed(() => (props.dday === null || props.dday === '' ? '미정' : props.dday))
const isDdayMuted = computed(() => props.dday === null || props.dday === '')
const stampTitle = computed(() => props.stampTitle || props.region || 'TRIP')
</script>

<template>
  <article
    class="ds-ticket"
    :class="{
      'ds-ticket--torn': torn,
      'ds-ticket--unissued': unissued,
      'ds-ticket--no-barcode': !showBarcode,
    }"
    :style="ticketStyle"
  >
    <div class="ds-ticket__stub-left"><span class="ds-ticket__serial">{{ serial }}</span></div>
    <div class="ds-ticket__perf-left"></div>
    <div class="ds-ticket__body">
      <div class="ds-ticket__label">{{ status || 'TRIP TICKET' }}</div>
      <div class="ds-ticket__title">{{ title }}</div>
      <div class="ds-ticket__meta">
        <span>{{ region || '지역 미정' }}</span>
        <span class="ds-ticket__dot">·</span>
        <span>{{ dates }}</span>
      </div>
      <div v-if="tagText" class="ds-ticket__tags">{{ tagText }}</div>
      <div v-if="torn" class="ds-ticket__stamp-slot">
        <TripStamp :stage="stampStage" :title="stampTitle" complete />
      </div>
    </div>
    <div class="ds-ticket__perf-right"></div>
    <div v-if="!torn" class="ds-ticket__stub-right">
      <div v-if="showBarcode" class="ds-ticket__barcode" aria-hidden="true"></div>
      <div class="ds-ticket__dday">
        <div class="ds-ticket__dday-label">{{ ddayLabel }}</div>
        <div class="ds-ticket__dday-value" :class="{ 'is-muted': isDdayMuted }">
          {{ ddayText }}
        </div>
      </div>
    </div>
  </article>
</template>
