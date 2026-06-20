<script setup>
// 미분류 사진 트레이 (S4-LOG-01 기록 뷰). 아직 장소에 배치 안 된 사진들 — 끌어서 장소로 배치한다.
// 여기로 다시 끌어다 놓으면 배치 해제(useRecordDrag 가 data-record-tray 로 판정).
import { computed } from 'vue'
import RecordPhotoChip from './RecordPhotoChip.vue'
import { useRecordDrag } from '@/composables/useRecordDrag'

defineProps({
  photos: { type: Array, default: () => [] },
})

const { drag } = useRecordDrag()
const over = computed(() => drag.active && drag.overTray)
</script>

<template>
  <section class="tray" :class="{ over }" data-record-tray>
    <div class="head">
      <b>미분류 사진</b>
      <span class="count">{{ photos.length }}장 · 장소로 끌어 배치</span>
    </div>
    <ul v-if="photos.length" class="photos">
      <li v-for="p in photos" :key="p.id">
        <RecordPhotoChip :photo-id="p.id" :alt="p.originalFilename || '사진'" />
      </li>
    </ul>
    <p v-else class="empty">미분류 사진이 없습니다. (여기로 끌어다 놓으면 배치가 해제됩니다.)</p>
  </section>
</template>

<style scoped>
.tray {
  border: 1px dashed #c9d2db;
  border-radius: 12px;
  padding: 12px 14px;
  background: #fafbfc;
  transition: border-color 0.12s, background 0.12s;
}
.tray.over {
  border-color: #3182f6;
  background: #f0f6ff;
}
.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}
.count {
  color: #8b95a1;
  font-size: 0.8rem;
}
.photos {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.empty {
  margin: 0;
  color: #b0b8c1;
  font-size: 0.85rem;
}
</style>
