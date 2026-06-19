<script setup>
// 카드 생성 위저드 셸 (S3-LOG-06 / #74).
// 단일 라우트 /cards/new + ?step= 쿼리(URL이 단계 정본). 1단계=골격, 2단계=고르기 본문.
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Steps from 'primevue/steps'
import Button from 'primevue/button'
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

// 현재 단계 = URL ?step= 을 정규화한 값.
const currentStepKey = computed(() => normalizeStepKey(route.query.step))
const activeIndex = computed(() => stepIndexOf(currentStepKey.value))

// 단계 표시줄 모델(읽기 전용 인디케이터). 이동은 아래 이전/다음 버튼.
const stepItems = CARD_STEPS.map((step) => ({ label: step.label }))

const canPrev = computed(() => activeIndex.value > 0)
// 다음: 마지막 단계가 아니어야 하고, 고르기 단계에선 사진을 1장 이상 골라야 활성.
const canNext = computed(() => {
  if (activeIndex.value >= CARD_STEPS.length - 1) return false
  if (currentStepKey.value === 'pick') return card.photoIds.length >= 1
  return true
})
const nextLabel = computed(() =>
  currentStepKey.value === 'pick' ? `✨ AI 초안 생성 (${card.photoIds.length}장)` : '다음',
)

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
  <main class="card-create">
    <header class="cc-head">
      <span class="eyebrow">카드 만들기</span>
      <h1>여행 카드 만들기</h1>
      <p v-if="card.selectedTripId">여행 #{{ card.selectedTripId }} · 사진을 골라 카드를 만듭니다.</p>
      <p v-else>여행을 선택하고 사진을 골라 카드를 만듭니다.</p>
    </header>

    <Steps :model="stepItems" :activeStep="activeIndex" :readonly="true" class="cc-steps" />

    <!-- 1단계=골격, 2단계=고르기 본문. 에디터 본문은 이후 단계에서 채운다. -->
    <CardPhotoPicker v-if="currentStepKey === 'pick'" :trip-id="card.selectedTripId" />

    <CardOutlineProgress v-else :photo-ids="card.photoIds" />

    <footer class="cc-nav">
      <Button
        label="이전"
        icon="pi pi-chevron-left"
        severity="secondary"
        :disabled="!canPrev"
        @click="goPrev"
      />
      <Button
        :label="nextLabel"
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
