import { defineStore } from 'pinia'

// 카드 생성 위저드 상태·도메인 모델 (S3-LOG-06 / #74).
// 사용자에게 보이는 단계는 2개: 고르기 → 에디터.
// AI 외곽선/문구 처리는 "단계"가 아니라 고르기→에디터 전이 중 로딩 상태다.
export const CARD_STEPS = [
  { key: 'pick', label: '고르기' },
  { key: 'editor', label: '에디터' },
]

const STEP_KEYS = CARD_STEPS.map((step) => step.key)

// 카드 한 장에 쓸 수 있는 최대 사진 수.
export const MAX_CARD_PHOTOS = 10

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

// 사진 선택 토글(순수함수). 이미 선택돼 있으면 해제, 아니면 max 한도 내에서 추가.
// 반환 { ids, blocked }: blocked=true 면 한도 초과로 "추가"가 거부된 것(피드백용).
export function togglePhotoSelection(currentIds, photoId, max = MAX_CARD_PHOTOS) {
  if (currentIds.includes(photoId)) {
    return { ids: currentIds.filter((id) => id !== photoId), blocked: false }
  }
  if (currentIds.length >= max) {
    return { ids: currentIds, blocked: true }
  }
  return { ids: [...currentIds, photoId], blocked: false }
}

// 위저드의 직렬화 도메인 상태. 단계 이동(SPA) 동안 선택을 유지한다.
// (S4에서 items/captions, S6에서 visibility 가 추가될 예정.)
export const useCardStore = defineStore('card', {
  state: () => ({
    selectedTripId: null,
    photoIds: [],
    // 외곽선 결과: photoId -> { status, items }. 3단계 폴링이 채우고, 이후 렌더 단계가 쓴다.
    outlines: {},
    // 문구 결과: photoId -> { response, warnings }. 4단계가 채우고, 렌더(buildScene)는 response 만 쓴다.
    captions: {},
  }),
  getters: {
    selectedCount: (state) => state.photoIds.length,
    atPhotoLimit: (state) => state.photoIds.length >= MAX_CARD_PHOTOS,
  },
  actions: {
    // 진입 시 여행 컨텍스트 세팅 + 선택 초기화. 무효 tripId 는 null.
    startForTrip(tripId) {
      const id = Number(tripId)
      this.selectedTripId = Number.isInteger(id) && id > 0 ? id : null
      this.photoIds = []
      this.outlines = {}
      this.captions = {}
    },
    // 외곽선 폴링 결과를 보관한다(이후 렌더 단계 입력).
    setOutline(photoId, data) {
      this.outlines = { ...this.outlines, [photoId]: data }
    },
    // 문구 생성 결과를 보관한다. 세션 캐시 역할 — 같은 사진 재호출(크레딧 차감)을 막는다.
    setCaption(photoId, data) {
      this.captions = { ...this.captions, [photoId]: data }
    },
    // 사진 선택 토글. 한도 초과로 추가가 막히면 true 를 돌려준다(호출부 피드백용).
    togglePhoto(photoId) {
      const { ids, blocked } = togglePhotoSelection(this.photoIds, photoId, MAX_CARD_PHOTOS)
      this.photoIds = ids
      return blocked
    },
  },
})
