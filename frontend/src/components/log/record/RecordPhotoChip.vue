<script setup>
// 드래그 가능한 사진 칩 (S4-LOG-01 기록 뷰). 장소(stop)·미분류 트레이로 끌어 배치한다.
// 포인터 이벤트 기반(useRecordDrag) — 네이티브 DnD 불안정 회피.
// 장소에 배치된 사진은 우상단 ✕로 그 장소에서 바로 뺄 수 있다(드래그로 트레이까지 안 끌어도 됨).
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import { startPhotoDrag } from '@/composables/useRecordDrag'

const props = defineProps({
  photoId: { type: Number, required: true },
  alt: { type: String, default: '사진' },
  removable: { type: Boolean, default: false },
})
const emit = defineEmits(['remove'])

function onPointerDown(event) {
  startPhotoDrag(props.photoId, props.alt, event)
}
</script>

<template>
  <div class="chip" :title="alt" @pointerdown="onPointerDown">
    <PhotoThumb :photo-id="photoId" :alt="alt" />
    <button
      v-if="removable"
      class="remove"
      title="이 장소에서 빼기"
      @pointerdown.stop
      @click.stop="emit('remove', photoId)"
    >
      ✕
    </button>
  </div>
</template>

<style scoped>
.chip {
  position: relative;
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
.remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: rgba(20, 20, 20, 0.62);
  color: #fff;
  font-size: 0.6rem;
  line-height: 1;
  cursor: pointer;
}
.remove:hover {
  background: #f04452;
}
</style>
