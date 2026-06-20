<script setup>
// 카드 위저드 에디터 단계 — 외곽선 처리 → 에디터(미리보기) (S3-LOG-06 3·5단계).
// 외곽선(전처리)만 끝나면 바로 에디터로 넘어간다. 문구(LLM·크레딧)는 에디터에서 사용자가
// 수동으로 생성한다 — 문구 없이도 카드를 보고 외곽선을 확인할 수 있어야 한다.
import { computed, watch } from 'vue'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import CardEditor from '@/components/log/CardEditor.vue'
import { useOutlinePolling } from '@/composables/useOutlinePolling'
import { useCardStore } from '@/stores/card'

const props = defineProps({
  photoIds: { type: Array, default: () => [] },
})
const emit = defineEmits(['back'])

const card = useCardStore()
const { outlines, summary, timedOut, finished } = useOutlinePolling(props.photoIds)

// 완료된(READY/FAILED) 외곽선을 스토어에 반영 — 에디터(렌더·외곽선 표시) 입력.
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

const done = computed(() => finished.value || timedOut.value)

function statusOf(id) {
  return outlines[id]?.status ?? 'PENDING'
}
function statusLabel(id) {
  const s = statusOf(id)
  return s === 'READY' ? '완료' : s === 'FAILED' ? '실패' : '대기'
}
</script>

<template>
  <!-- 외곽선 처리 중: 사진별 상태(좁은 칼럼) -->
  <div v-if="!done" class="proc">
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
  </div>

  <!-- 외곽선 완료 → 풀스크린 에디터 -->
  <CardEditor v-else :photo-ids="photoIds" @back="emit('back')" />
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
  margin: 0 0 10px;
  color: #4b5563;
}
</style>
