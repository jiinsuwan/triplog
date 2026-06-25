<script setup>
// 카드 생성 위저드 셸 (S3-LOG-06 / #74).
// 단일 라우트 /cards/new + ?step= 쿼리(URL이 단계 정본). 1단계=골격, 2단계=고르기 본문.
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Steps from 'primevue/steps'
import CardPhotoPicker from '@/components/log/CardPhotoPicker.vue'
import CardOutlineProgress from '@/components/log/CardOutlineProgress.vue'
import {
  CARD_STEPS,
  normalizeStepKey,
  nextStepKey,
  prevStepKey,
  stepIndexOf,
  useCardStore,
} from '@/stores/card'

const route = useRoute()
const router = useRouter()
const card = useCardStore()

// 진입 시 여행 컨텍스트 세팅 + 선택 초기화. 아래 스텝 가드보다 먼저 동기 실행한다
// (가드가 갓 초기화된 photoIds 를 봐야 에디터 딥링크를 올바로 막는다).
card.startForTrip(route.query.tripId)

// 같은 /cards/new 라우트에서 ?tripId 만 바뀌면 컴포넌트가 재사용돼 setup 이 다시 안 돈다.
// tripId 변경 시 카드 상태를 재초기화한다(이전 여행 사진을 다른 여행 화면에서 편집하는 것 방지).
// 피커는 아래 :key 로 재마운트되어 그 여행의 사진·일정을 새로 불러온다.
watch(
  () => route.query.tripId,
  (tid) => card.startForTrip(tid),
)

// 현재 단계 = URL ?step= 을 정규화한 값.
const currentStepKey = computed(() => normalizeStepKey(route.query.step))
const activeIndex = computed(() => stepIndexOf(currentStepKey.value))

// 단계 표시줄 모델(읽기 전용 인디케이터). 이동: 고르기 = 배치 화면의 "에디터로", 에디터 = 뒤로가기.
const stepItems = CARD_STEPS.map((step) => ({ label: step.label }))

function goToStep(key) {
  router.push({ query: { ...route.query, step: key } })
}
const goNext = () => goToStep(nextStepKey(currentStepKey.value))
const goPrev = () => goToStep(prevStepKey(currentStepKey.value))

// URL step 정규화 + 에디터 진입 가드.
// 잘못된 step 은 첫 단계로, 사진 0장인데 에디터로 들어오면 고르기로 되돌린다(딥링크·새로고침 안정화).
watch(
  () => route.query.step,
  (raw) => {
    let valid = normalizeStepKey(raw)
    if (valid === 'editor' && card.photoIds.length === 0) valid = 'pick'
    if (raw !== valid) {
      router.replace({ query: { ...route.query, step: valid } })
    }
  },
  { immediate: true },
)
</script>

<template>
  <!-- 고르기 단계: 위저드(좁은 칼럼) -->
  <main v-if="currentStepKey === 'pick'" class="card-create">
    <header class="cc-head">
      <span class="eyebrow">카드 만들기</span>
      <h1>여행 카드 만들기</h1>
      <p v-if="card.selectedTripId">여행 #{{ card.selectedTripId }} · 사진을 일정에 배치해 카드를 만듭니다.</p>
      <p v-else>여행을 선택하고 사진을 일정에 배치해 카드를 만듭니다.</p>
    </header>

    <Steps :model="stepItems" :activeStep="activeIndex" :readonly="true" class="cc-steps" />

    <CardPhotoPicker :key="card.selectedTripId" :trip-id="card.selectedTripId" @proceed="goNext" />
  </main>

  <!-- 에디터 단계: 풀스크린(외곽선 처리 → 에디터). 위저드 칼럼/스텝/푸터 없음. -->
  <div v-else class="cc-editor">
    <CardOutlineProgress :photo-ids="card.photoIds" :trip-id="card.selectedTripId" @back="goPrev" />
  </div>
</template>

<style scoped>
.card-create {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
/* 에디터 단계 = 풀폭(좁은 칼럼 제거) — 나중에 실제 화면으로 그대로 이식. */
.cc-editor {
  width: 100%;
  min-height: 100vh;
}
.cc-head {
  margin-bottom: 20px;
}
.eyebrow {
  color: var(--p-primary-color, #3182f6);
  font-weight: 600;
  font-size: 0.85rem;
}
.cc-head h1 {
  margin: 4px 0 6px;
  font-size: 1.5rem;
}
.cc-head p {
  margin: 0;
  color: #8b95a1;
}
.cc-steps {
  margin-bottom: 28px;
}
.cc-step-body {
  min-height: 240px;
  padding: 24px;
  border: 1px solid #e5e8eb;
  border-radius: 12px;
  background: #fff;
}
.cc-step-body h2 {
  margin: 0 0 8px;
  font-size: 1.15rem;
}
.cc-placeholder {
  color: #8b95a1;
}
.cc-nav {
  display: flex;
  justify-content: space-between;
  margin-top: 24px;
}
</style>
