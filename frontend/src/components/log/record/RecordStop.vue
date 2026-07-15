<script setup>
// 일정의 한 장소(stop) + 그 장소에 배치된 사진 (S4-LOG-01 기록 뷰).
// 사진을 끌어다 놓으면 이 장소로 배치된다(드롭 타깃). 드롭 판정은 useRecordDrag 가
// data-stop-id 로 한다 — 여기선 드롭 영역 표시(data 속성)와 하이라이트만.
// variant: 'card'(기본, CardPhotoPicker) / 'timeline'(RecordPlacementBody, logs-mockup ①).
// 두 화면의 stop 표현을 이 컴포넌트 하나로 단일화하되 각 화면의 기존 디자인은 유지한다(#147).
import { computed } from 'vue'
import RecordPhotoChip from './RecordPhotoChip.vue'
import { useRecordDrag } from '@/composables/useRecordDrag'
import { TYPE_ICON } from './recordShared.js'

const props = defineProps({
  stop: { type: Object, required: true },
  photos: { type: Array, default: () => [] },
  variant: { type: String, default: 'card' }, // 'card' | 'timeline'
})
const emit = defineEmits(['remove'])

const { drag } = useRecordDrag()
const over = computed(() => drag.active && drag.overStopId === props.stop.id)
const stopType = computed(() => props.stop.place?.category || props.stop.place?.categoryGroup || '')
</script>

<template>
  <!-- timeline: 시간 칼럼 + 레일 위 타임라인 행 (logs-mockup ①) -->
  <div v-if="variant === 'timeline'" class="rec-stop" :class="{ over }" :data-stop-id="stop.id">
    <span class="rec-time">{{ stop.selectedTime || '' }}</span>
    <span class="rec-rail"><span class="rec-dot"></span></span>
    <div class="rec-stop-body">
      <div class="rec-info">
        <span class="rec-ic" aria-hidden="true">{{ TYPE_ICON[stop.place?.placeType] ?? '📍' }}</span>
        <b class="rec-nm">{{ stop.place?.name || '장소' }}</b>
        <span v-if="stopType" class="rec-ty">{{ stopType }}</span>
      </div>
      <div class="rec-photos">
        <RecordPhotoChip
          v-for="p in photos"
          :key="p.id"
          :photo-id="p.id"
          :alt="p.originalFilename || '사진'"
          removable
          @remove="emit('remove', $event)"
        />
        <!-- 사진이 없을 때 화면별 액션(예: 사진 관리 버튼)을 끼워 넣는 자리 -->
        <slot v-if="!photos.length" name="empty-action"></slot>
      </div>
    </div>
  </div>

  <!-- card: 카드형 stop (기본) -->
  <div v-else class="stop" :class="{ over }" :data-stop-id="stop.id">
    <div class="head">
      <span class="num">{{ stop.sortOrder }}</span>
      <span class="icon" aria-hidden="true">{{ TYPE_ICON[stop.place?.placeType] ?? '📍' }}</span>
      <b class="name">{{ stop.place?.name ?? '장소' }}</b>
      <span class="time" v-if="stop.selectedTime">{{ stop.selectedTime }}</span>
      <span class="count">사진 {{ photos.length }}</span>
    </div>
    <ul v-if="photos.length" class="photos">
      <li v-for="p in photos" :key="p.id">
        <RecordPhotoChip
          :photo-id="p.id"
          :alt="p.originalFilename || '사진'"
          removable
          @remove="emit('remove', $event)"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* ── card variant ───────────────────────────────────────── */
.stop {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: var(--paper-card);
  transition: border-color 0.12s, background 0.12s;
}
.stop.over {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--paper-card));
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.num {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 99px;
  background: var(--accent);
  color: var(--on-fill);
  font-size: 0.7rem;
  font-weight: 800;
}
.name {
  font-size: 0.9rem;
}
.time {
  color: var(--ink-sub);
  font-size: 0.8rem;
}
.count {
  margin-left: auto;
  color: var(--ink-sub);
  font-size: 0.78rem;
}
.photos {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* ── timeline variant (logs-mockup ① — RecordPlacementBody) ── */
.rec-stop {
  display: grid;
  grid-template-columns: 44px 13px 1fr;
  align-items: flex-start;
  border-radius: 10px;
  transition: background 0.12s;
}
.rec-stop.over {
  background: var(--accent-soft);
}
.rec-time {
  padding: 1px 9px 0 0;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  line-height: 1.5;
}
.rec-rail {
  align-self: stretch;
  display: flex;
  justify-content: center;
  position: relative;
}
.rec-rail::before {
  content: '';
  position: absolute;
  top: 14px;
  bottom: 0;
  width: 1px;
  background: var(--line);
}
.rec-stop:last-child .rec-rail::before {
  display: none;
}
.rec-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  margin-top: 5px;
  z-index: 1;
  box-shadow: 0 0 0 2px var(--paper-card);
}
.rec-stop-body {
  min-width: 0;
  padding: 0 0 16px 10px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.rec-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  padding-top: 1px;
}
.rec-nm {
  font-size: 14px;
  font-weight: 700;
}
.rec-ty {
  font-size: 10px;
  color: var(--ink-sub);
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 1px 6px;
}
.rec-photos {
  flex: none;
  display: flex;
  gap: 5px;
}
</style>
