import { defineStore } from 'pinia'

// 카드 생성 위저드 단계 모델 (S3-LOG-06 / #74, S1).
// 사용자에게 보이는 단계는 2개: 고르기 → 에디터.
// AI 외곽선/문구 처리는 "단계"가 아니라 고르기→에디터 전이 중 로딩 상태다.
export const CARD_STEPS = [
  { key: 'pick', label: '고르기' },
  { key: 'editor', label: '에디터' },
]

const STEP_KEYS = CARD_STEPS.map((step) => step.key)

// 외부 입력(URL ?step= 쿼리)을 유효한 단계 키로 정규화한다.
// 위저드 단계는 URL을 정본으로 삼고, 컴포넌트가 이 함수로 검증한다(라우터 가드 아님).
// 미지정·미지의 값·비문자열은 모두 첫 단계로 떨어진다.
export function normalizeStepKey(raw) {
  return STEP_KEYS.includes(raw) ? raw : STEP_KEYS[0]
}

export function stepIndexOf(key) {
  return STEP_KEYS.indexOf(normalizeStepKey(key))
}

// 다음/이전 단계 키. 경계에서 더 나아가지 않도록 clamp 한다.
export function nextStepKey(key) {
  const next = Math.min(stepIndexOf(key) + 1, STEP_KEYS.length - 1)
  return STEP_KEYS[next]
}

export function prevStepKey(key) {
  const prev = Math.max(stepIndexOf(key) - 1, 0)
  return STEP_KEYS[prev]
}

// 위저드의 직렬화 도메인 상태. S1 골격은 선택된 여행만 보관한다.
// (S2에서 photoIds, S4에서 items/captions, S6에서 visibility 가 추가될 예정.)
export const useCardStore = defineStore('card', {
  state: () => ({
    selectedTripId: null,
  }),
  actions: {
    // 진입 시 여행 컨텍스트 세팅. 무효 tripId 는 null(=여행 선택부터 시작, S2).
    startForTrip(tripId) {
      const id = Number(tripId)
      this.selectedTripId = Number.isInteger(id) && id > 0 ? id : null
    },
  },
})
