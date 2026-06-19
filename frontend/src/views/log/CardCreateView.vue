<script setup>
// 카드 생성 위저드 셸 (S3-LOG-06 / #74, S1 — 골격만).
// 단일 라우트 /cards/new + ?step= 쿼리. 단계 본문은 S1 에선 placeholder.
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Steps from 'primevue/steps'
import Button from 'primevue/button'
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

// 진입 시 여행 컨텍스트 세팅. 진입점: 사진 화면 "카드 만들기" → ?tripId=.
onMounted(() => card.startForTrip(route.query.tripId))

// 현재 단계 = URL ?step= 을 정규화한 값(URL이 정본).
const currentStepKey = computed(() => normalizeStepKey(route.query.step))
const activeIndex = computed(() => stepIndexOf(currentStepKey.value))

// 단계 표시줄 모델(읽기 전용 인디케이터). 이동은 아래 이전/다음 버튼.
const stepItems = CARD_STEPS.map((step) => ({ label: step.label }))

const canPrev = computed(() => activeIndex.value > 0)
const canNext = computed(() => activeIndex.value < CARD_STEPS.length - 1)

function goToStep(key) {
  router.push({ query: { ...route.query, step: key } })
}
const goNext = () => goToStep(nextStepKey(currentStepKey.value))
const goPrev = () => goToStep(prevStepKey(currentStepKey.value))

// URL 의 step 이 비었거나 잘못된 값이면 정규 단계로 교정(딥링크 안정화).
watch(
  () => route.query.step,
  (raw) => {
    const valid = normalizeStepKey(raw)
    if (raw !== valid) {
      router.replace({ query: { ...route.query, step: valid } })
    }
  },
  { immediate: true },
)
</script>

<template>
  <main class="card-create">
    <header class="cc-head">
      <span class="eyebrow">카드 만들기</span>
      <h1>여행 카드 만들기</h1>
      <p v-if="card.selectedTripId">여행 #{{ card.selectedTripId }} · 사진을 골라 카드를 만듭니다.</p>
      <p v-else>여행을 선택하고 사진을 골라 카드를 만듭니다.</p>
    </header>

    <Steps :model="stepItems" :activeStep="activeIndex" :readonly="true" class="cc-steps" />

    <!-- S1: 단계 골격만. 본문은 placeholder. 실제 기능은 이후 단계에서 채워진다. -->
    <section v-if="currentStepKey === 'pick'" class="cc-step-body">
      <h2>고르기</h2>
      <p class="cc-placeholder">S2에서 여기에 여행 선택과 사진(최대 10장) 고르기가 들어옵니다.</p>
    </section>

    <section v-else class="cc-step-body">
      <h2>에디터</h2>
      <p class="cc-placeholder">
        S5~S7에서 여기에 미리보기 · 문구 보정 · 외곽선 편집 · PNG 저장이 들어옵니다.
      </p>
    </section>

    <footer class="cc-nav">
      <Button
        label="이전"
        icon="pi pi-chevron-left"
        severity="secondary"
        :disabled="!canPrev"
        @click="goPrev"
      />
      <Button
        label="다음"
        icon="pi pi-chevron-right"
        icon-pos="right"
        :disabled="!canNext"
        @click="goNext"
      />
    </footer>
  </main>
</template>

<style scoped>
.card-create {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px 16px 48px;
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
