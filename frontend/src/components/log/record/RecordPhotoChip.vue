<script setup>
// 드래그 가능한 사진 칩 (S4-LOG-01 기록 뷰). 장소(stop)·미분류 트레이로 끌어 배치한다.
// 포인터 이벤트 기반(useRecordDrag) — 네이티브 DnD 불안정 회피.
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import { startPhotoDrag } from '@/composables/useRecordDrag'

const props = defineProps({
  photoId: { type: Number, required: true },
  alt: { type: String, default: '사진' },
})

function onPointerDown(event) {
  startPhotoDrag(props.photoId, props.alt, event)
}
</script>

<template>
  <div class="chip" :title="alt" @pointerdown="onPointerDown">
    <PhotoThumb :photo-id="photoId" :alt="alt" />
  </div>
</template>

<style scoped>
.chip {
  width: 64px;
  height: 64px;
  flex: 0 0 auto;
  border-radius: 8px;
  overflow: hidden;
  cursor: grab;
  touch-action: none; /* 터치에서 스크롤 대신 드래그 */
  user-select: none;
}
.chip:active {
  cursor: grabbing;
}
</style>
