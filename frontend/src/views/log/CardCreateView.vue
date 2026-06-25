<script setup>
// 카드 에디터 진입 셸.
// 사진 선택/배치는 다녀온 여행 기록뷰(TripPreviewDialog + RecordPlacementBody)가 담당한다.
// 이 라우트는 기록뷰가 card store 에 배치 사진을 채운 뒤 step=editor 로 직행할 때만 사용한다.
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CardOutlineProgress from '@/components/log/CardOutlineProgress.vue'
import { normalizeStepKey, useCardStore } from '@/stores/card'

const route = useRoute()
const router = useRouter()
const card = useCardStore()

// 진입 시 여행 컨텍스트 세팅 + 선택 초기화. 아래 스텝 가드보다 먼저 동기 실행한다
// (가드가 갓 초기화된 photoIds 를 봐야 에디터 딥링크를 올바로 막는다).
// 단, 다녀옴 미리보기 팝업이 막 startForTrip+setPhotoIds 로 채워 step=editor 로 직행한 경우
// (= 같은 여행 + photoIds 보유)는 재초기화를 건너뛰어 배치 결과를 보존한다.
const entryTripId = Number(route.query.tripId)
if (card.selectedTripId !== entryTripId || card.photoIds.length === 0) {
  card.startForTrip(route.query.tripId)
}

// 같은 /cards/new 라우트에서 ?tripId 만 바뀌면 컴포넌트가 재사용돼 setup 이 다시 안 돈다.
// tripId 변경 시 카드 상태를 재초기화한다(이전 여행 사진을 다른 여행 화면에서 편집하는 것 방지).
watch(
  () => route.query.tripId,
  (tid) => card.startForTrip(tid),
)

// 현재 단계 = URL ?step= 을 정규화한 값.
const currentStepKey = computed(() => normalizeStepKey(route.query.step))
// 에디터에서 나가기 = 여행 목록으로. 옛 '고르기'(step=pick) 화면은 다녀옴 팝업이 대체하므로 경유하지 않는다.
const leaveEditor = () => router.push({ name: 'trip-list' })

function leaveDeprecatedPick() {
  if (card.selectedTripId) {
    router.replace({ name: 'trip-record-workspace', params: { tripId: card.selectedTripId } })
    return
  }
  router.replace({ name: 'trip-list' })
}

// URL step 정규화 + 에디터 진입 가드.
// 사진 0장이나 옛 pick 딥링크는 더 이상 쓰지 않는 고르기 페이지 대신 기록뷰로 돌린다.
watch(
  () => route.query.step,
  (raw) => {
    let valid = normalizeStepKey(raw)
    if (valid === 'editor' && card.photoIds.length === 0) valid = 'pick'
    if (valid === 'pick') {
      leaveDeprecatedPick()
      return
    }
    if (raw !== valid) {
      router.replace({ query: { ...route.query, step: valid } })
    }
  },
  { immediate: true },
)
</script>

<template>
  <main v-if="currentStepKey === 'pick'" class="card-create">
    <p>기록 화면으로 이동 중입니다.</p>
  </main>

  <!-- 에디터 단계: 풀스크린(외곽선 처리 → 에디터). 위저드 칼럼/스텝/푸터 없음. -->
  <div v-else class="cc-editor">
    <CardOutlineProgress :photo-ids="card.photoIds" :trip-id="card.selectedTripId" @back="leaveEditor" />
  </div>
</template>

<style scoped>
.card-create {
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 700;
  padding: 32px 16px;
  text-align: center;
}

.cc-editor {
  min-height: 100vh;
  width: 100%;
}
</style>
