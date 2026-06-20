<script setup>
// 드래그 가능한 사진 칩 (S4-LOG-01 기록 뷰). 장소(stop)·미분류 트레이로 끌어 배치한다.
import PhotoThumb from '@/components/log/PhotoThumb.vue'

const props = defineProps({
  photoId: { type: Number, required: true },
  alt: { type: String, default: '사진' },
})

function onDragStart(event) {
  event.dataTransfer.setData('text/plain', String(props.photoId))
  event.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <div class="chip" draggable="true" :title="alt" @dragstart="onDragStart">
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
}
.chip:active {
  cursor: grabbing;
}
</style>
