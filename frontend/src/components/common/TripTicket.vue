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
  <article class="ticket" :class="{ torn }" :style="ticketStyle">
    <div class="stub-l"><span class="serial">{{ serial }}</span></div>
    <div class="perf-l"></div>
    <div class="body">
      <div class="label">{{ status || 'TRIP TICKET' }}</div>
      <div class="ttl">{{ title }}</div>
      <div class="meta">
        <span>{{ region || '지역 미정' }}</span>
        <span class="dot">·</span>
        <span>{{ dates }}</span>
      </div>
      <div v-if="tagText" class="tags">{{ tagText }}</div>
      <div v-if="torn" class="stamp-slot">
        <TripStamp :stage="stampStage" :title="stampTitle" complete />
      </div>
    </div>
    <div class="perf-r"></div>
    <div v-if="!torn" class="stub-r">
      <div class="barcode" aria-hidden="true"></div>
      <div class="dday">
        <div class="k">{{ ddayLabel }}</div>
        <div class="v" :class="{ muted: isDdayMuted }">{{ ddayText }}</div>
      </div>
    </div>
  </article>
</template>
