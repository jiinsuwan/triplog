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
  tripId: { type: [Number, String], default: null },
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

// 배치 화면에서 전처리 폴링이 이미 모든 사진을 끝내(card.outlines 시드) 두면 대기 없이 바로 에디터.
const preReady = computed(
  () =>
    props.photoIds.length > 0 &&
    props.photoIds.every((id) => ['READY', 'FAILED'].includes(card.outlines[id]?.status)),
)
const done = computed(() => preReady.value || finished.value || timedOut.value)

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
  <div v-if="!done" class="proc-wrap">
    <section class="proc-card" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true" />
      <header class="proc-head">
        <h2>AI가 사진을 처리하는 중입니다</h2>
        <p class="muted">
          외곽선 찾기 · {{ summary.ready + summary.failed }}/{{ summary.total }} 완료
          <span v-if="summary.failed"> · 실패 {{ summary.failed }}</span>
        </p>
      </header>
      <ul class="grid">
        <li v-for="id in photoIds" :key="id" class="cell">
          <PhotoThumb :photo-id="id" />
          <span class="badge" :class="statusOf(id).toLowerCase()">{{ statusLabel(id) }}</span>
        </li>
      </ul>
    </section>
  </div>

  <!-- 외곽선 완료 → 풀스크린 에디터 -->
  <CardEditor v-else :photo-ids="photoIds" :trip-id="tripId" @back="emit('back')" />
</template>

<style scoped>
.proc-wrap {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--bg);
}
.proc-card {
  width: min(440px, 100%);
  max-height: min(640px, calc(100vh - 48px));
  padding: 24px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper-card);
  box-shadow: var(--shadow-pop);
}
.spinner {
  width: 34px;
  height: 34px;
  margin: 0 auto 14px;
  border: 3px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
.proc-head {
  text-align: center;
}
.proc-head h2 {
  margin: 0 0 4px;
  font-size: 1.15rem;
}
.muted {
  color: var(--ink-sub);
  margin: 0 0 16px;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  gap: 10px;
  max-height: 246px;
  overflow-y: auto;
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
  background: color-mix(in srgb, var(--ink) 68%, transparent);
  color: var(--on-fill);
}
.badge.ready {
  background: var(--t-sage);
}
.badge.failed {
  background: var(--complete);
}
.badge.pending {
  background: color-mix(in srgb, var(--ink-sub) 74%, transparent);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
