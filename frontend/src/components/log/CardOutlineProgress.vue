<script setup>
// 카드 위저드 에디터 단계 진입 시 외곽선 처리 표시 (S3-LOG-06 3단계).
// 고른 사진들의 외곽선(AI 전처리) 상태를 폴링해 사진별로 보여준다.
// 부분 실패 허용(FAILED 는 외곽선 없이 진행), deadline 시 "그냥 진행" 안내.
// 미리보기·편집(렌더)은 다음 단계에서 이 외곽선 결과를 입력으로 쓴다.
import { watch } from 'vue'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import { useOutlinePolling } from '@/composables/useOutlinePolling'
import { useCardStore } from '@/stores/card'

const props = defineProps({
  photoIds: { type: Array, default: () => [] },
})

const card = useCardStore()
const { outlines, summary, timedOut, finished } = useOutlinePolling(props.photoIds)

// 완료된(READY/FAILED) 외곽선을 스토어에 반영 — 이후 렌더 단계 입력.
watch(
  outlines,
  (val) => {
    for (const id of props.photoIds) {
      const o = val[id]
      if (o && (o.status === 'READY' || o.status === 'FAILED')) card.setOutline(id, o)
    }
  },
  { deep: true },
)

function statusOf(id) {
  return outlines[id]?.status ?? 'PENDING'
}
function statusLabel(id) {
  const s = statusOf(id)
  return s === 'READY' ? '완료' : s === 'FAILED' ? '실패' : '대기'
}
</script>

<template>
  <div class="proc">
    <header class="proc-head">
      <h2>AI가 사진을 처리하는 중…</h2>
      <p class="muted">
        사진에서 피사체 외곽선을 찾고 있습니다 · {{ summary.ready + summary.failed }}/{{ summary.total }} 완료
        <span v-if="summary.failed"> · 실패 {{ summary.failed }}</span>
      </p>
    </header>

    <ul class="grid">
      <li v-for="id in photoIds" :key="id" class="cell">
        <PhotoThumb :photo-id="id" />
        <span class="badge" :class="statusOf(id).toLowerCase()">{{ statusLabel(id) }}</span>
      </li>
    </ul>

    <div v-if="finished" class="note" role="status">
      <p v-if="summary.failed">외곽선을 못 찾은 사진 {{ summary.failed }}장은 외곽선 없이 진행합니다.</p>
      <p>처리 완료 — 미리보기·편집은 다음 단계에서 이어집니다.</p>
    </div>
    <div v-else-if="timedOut" class="note" role="status">
      <p>일부 사진이 아직 처리되지 않았습니다. 그대로 진행할 수 있습니다.</p>
    </div>
  </div>
</template>

<style scoped>
.proc-head h2 {
  margin: 0 0 4px;
  font-size: 1.15rem;
}
.muted {
  color: #8b95a1;
  margin: 0 0 16px;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
}
.cell {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
}
.badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 0.72rem;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}
.badge.ready {
  background: #16c47e;
}
.badge.failed {
  background: #f04452;
}
.badge.pending {
  background: rgba(25, 31, 40, 0.55);
}
.note {
  margin-top: 18px;
  color: #4b5563;
}
.note p {
  margin: 2px 0;
}
</style>
