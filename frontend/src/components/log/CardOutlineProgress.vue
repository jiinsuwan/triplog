<script setup>
// 카드 위저드 에디터 단계 (S3-LOG-06 3·4·5단계).
// 사용자가 "AI 초안 생성"으로 진입한 흐름: 외곽선(전처리) 폴링 → 문구(LLM) 생성 → 자동 초안 미리보기.
//  - 외곽선: 사진별 상태(대기/완료/실패) 폴링. 부분 실패 허용(FAILED 는 외곽선 없이 진행).
//  - 문구: 외곽선 완료 후 READY 사진의 문구를 생성(세션 캐시·in-flight 가드·자동 재시도 금지).
//  - 미리보기: buildScene→renderCard (CardPreview). 보정은 다음 단계.
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import CardPreview from '@/components/log/CardPreview.vue'
import { useOutlinePolling } from '@/composables/useOutlinePolling'
import { useCardCaptions } from '@/composables/useCardCaptions'
import { useCardStore } from '@/stores/card'

const props = defineProps({
  photoIds: { type: Array, default: () => [] },
})

const card = useCardStore()
const { outlines, summary, timedOut, finished } = useOutlinePolling(props.photoIds)
const { generateMany, generating: captionGenerating, failed: captionFailed } = useCardCaptions()

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

const outlineDone = computed(() => finished.value || timedOut.value)
// 외곽선이 READY 인 사진만 문구 생성 대상(FAILED 는 외곽선/문구 없이 사진만).
const readyIds = computed(() => props.photoIds.filter((id) => card.outlines[id]?.status === 'READY'))

// 외곽선 완료 → 문구 생성 1회 트리거(사용자가 "AI 초안 생성"으로 들어온 흐름).
const captionsTriggered = ref(false)
watch(
  outlineDone,
  (done) => {
    if (done && !captionsTriggered.value) {
      captionsTriggered.value = true
      generateMany(readyIds.value)
    }
  },
  { immediate: true },
)

const captionFailedIds = computed(() => Object.keys(captionFailed))
// 미리보기 단계: 외곽선 완료 + 문구 트리거됨 + 문구 생성 진행 중 아님.
const showPreview = computed(
  () => outlineDone.value && captionsTriggered.value && !captionGenerating.value,
)

function retryCaptions() {
  // 실패(아직 캐시에 없는) READY 사진만 다시 시도 — 성공분은 재호출 안 함(크레딧 보호).
  generateMany(readyIds.value.filter((id) => !card.captions[id]))
}

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
    <!-- 1) 외곽선 처리 중: 사진별 상태 -->
    <template v-if="!outlineDone">
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
    </template>

    <!-- 2) 문구 생성 중 -->
    <div v-else-if="!showPreview" class="proc-head">
      <h2>AI가 카드 문구를 만드는 중…</h2>
      <p class="muted">사진 속 피사체에 어울리는 짧은 문구를 생성하고 있습니다.</p>
    </div>

    <!-- 3) 자동 초안 미리보기 -->
    <template v-else>
      <p v-if="summary.failed" class="note" role="status">
        외곽선을 못 찾은 사진 {{ summary.failed }}장은 외곽선 없이 표시됩니다.
      </p>
      <p v-if="captionFailedIds.length" class="note warn" role="status">
        문구 생성에 실패한 사진 {{ captionFailedIds.length }}장이 있습니다.
        <Button label="문구 다시 시도" link @click="retryCaptions" />
      </p>
      <CardPreview :photo-ids="photoIds" />
    </template>
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
  margin: 0 0 10px;
  color: #4b5563;
}
.note.warn {
  color: #f04452;
}
</style>
