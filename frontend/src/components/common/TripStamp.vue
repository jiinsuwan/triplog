<script setup>
import { computed } from 'vue'

const props = defineProps({
  stage: {
    type: Number,
    default: 1,
    validator: (value) => [1, 2, 3].includes(value),
  },
  title: {
    type: String,
    default: 'JEJU',
  },
  startDate: {
    type: String,
    default: '2026.07.05',
  },
  endDate: {
    type: String,
    default: '2026.07.07',
  },
  complete: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
    default: 'TRIP',
  },
})

const stageClass = computed(() => `stage-${props.stage}`)
const showDetails = computed(() => props.stage >= 2)
const showComplete = computed(() => props.complete || props.stage === 3)
</script>

<template>
  <span :class="stageClass">
    <svg class="stamp-svg" viewBox="0 0 200 200" role="img" :aria-label="`${title} 여행 스탬프`">
      <circle v-if="showComplete" class="bg" cx="100" cy="100" r="88" />
      <circle class="ring" cx="100" cy="100" r="88" stroke-width="2.5" />
      <circle
        v-if="showDetails"
        class="ring"
        cx="100"
        cy="100"
        r="77"
        stroke-width="1.2"
        stroke-dasharray="1.5 4"
      />
      <text class="glyph" x="100" y="54" text-anchor="middle" font-size="19" font-weight="800">
        {{ label }}
      </text>
      <text x="100" y="92" text-anchor="middle" font-size="23" font-weight="800">
        {{ title }}
      </text>
      <text v-if="showDetails" class="glyph" x="42" y="87" text-anchor="middle" font-size="14">
        IN
      </text>
      <text v-if="showDetails" class="glyph" x="158" y="87" text-anchor="middle" font-size="14">
        OUT
      </text>
      <text x="100" y="121" text-anchor="middle" font-size="11.5" letter-spacing="0.5">
        {{ startDate }}
      </text>
      <text x="100" y="135" text-anchor="middle" font-size="12.5" letter-spacing="0.5">~</text>
      <text x="100" y="149" text-anchor="middle" font-size="11.5" letter-spacing="0.5">
        {{ endDate }}
      </text>
      <g v-if="showComplete" transform="rotate(-12 100 100)">
        <rect class="complete-box" x="42" y="158" width="116" height="23" rx="4" stroke-width="2" />
        <text
          class="complete"
          x="100"
          y="173"
          text-anchor="middle"
          font-size="13.5"
          font-weight="800"
          letter-spacing="3"
        >
          COMPLETE
        </text>
      </g>
    </svg>
  </span>
</template>
