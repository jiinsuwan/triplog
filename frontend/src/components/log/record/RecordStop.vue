<script setup>
// 일정의 한 장소(stop) + 그 장소에 배치된 사진 (S4-LOG-01 기록 뷰).
// 사진을 끌어다 놓으면 이 장소로 배치된다(드롭 타깃). 드롭 판정은 useRecordDrag 가
// data-stop-id 로 한다 — 여기선 드롭 영역 표시(data 속성)와 하이라이트만.
import { computed } from 'vue'
import RecordPhotoChip from './RecordPhotoChip.vue'
import { useRecordDrag } from '@/composables/useRecordDrag'

const props = defineProps({
  stop: { type: Object, required: true },
  photos: { type: Array, default: () => [] },
})
const emit = defineEmits(['remove'])

const TYPE_ICON = { ATTRACTION: '🏛', RESTAURANT: '🍽', CAFE: '☕', LODGING: '🏨' }

const { drag } = useRecordDrag()
const over = computed(() => drag.active && drag.overStopId === props.stop.id)
</script>

<template>
  <div class="stop" :class="{ over }" :data-stop-id="stop.id">
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
    <p v-else class="drop-hint">여기로 사진을 끌어다 놓으세요</p>
  </div>
</template>

<style scoped>
.stop {
  border: 1px solid #e5e8eb;
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: #fff;
  transition: border-color 0.12s, background 0.12s;
}
.stop.over {
  border-color: #3182f6;
  background: #f0f6ff;
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
  background: #3182f6;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
}
.name {
  font-size: 0.9rem;
}
.time {
  color: #8b95a1;
  font-size: 0.8rem;
}
.count {
  margin-left: auto;
  color: #8b95a1;
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
.drop-hint {
  margin: 8px 0 2px;
  color: #b0b8c1;
  font-size: 0.8rem;
}
</style>
