import { defineStore } from 'pinia'

// 문구는 백엔드에 저장되지 않아(생성만) 새로고침 시 GMS 재호출이 일어난다.
// 사진별 문구 결과를 localStorage 에 고정해 재진입·새로고침에도 재생성을 막는다(크레딧 절약).
const CAP_KEY = (photoId) => `triplog:card:caption:${photoId}`

// 카드 생성 위저드 상태·도메인 모델 (S3-LOG-06 / #74).
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

// 위저드의 직렬화 도메인 상태. 단계 이동(SPA) 동안 유지한다.
// 카드가 될 사진 = 일정에 "배치한" 사진(고르기 단계에서 정해 photoIds 로 넘긴다). 별도 선택·개수 제한 없음.
export const useCardStore = defineStore('card', {
  state: () => ({
    selectedTripId: null,
    photoIds: [],
    // 외곽선 결과: photoId -> { status, items }. 배치 화면 폴링이 채우고(전처리), 렌더 단계가 쓴다.
    outlines: {},
    // 문구 결과: photoId -> { response, warnings }. 4단계가 채우고, 렌더(buildScene)는 response 만 쓴다.
    captions: {},
  }),
  actions: {
    // 진입 시 여행 컨텍스트 세팅 + 상태 초기화. 무효 tripId 는 null.
    startForTrip(tripId) {
      const id = Number(tripId)
      this.selectedTripId = Number.isInteger(id) && id > 0 ? id : null
      this.photoIds = []
      this.outlines = {}
      this.captions = {}
    },
    // 카드로 만들 사진 = 배치된 사진. 고르기 → 에디터 전이 때 확정해 넘긴다.
    setPhotoIds(ids) {
      this.photoIds = Array.isArray(ids) ? [...ids] : []
    },
    // 외곽선 폴링 결과를 보관한다(이후 렌더 단계 입력).
    setOutline(photoId, data) {
      this.outlines = { ...this.outlines, [photoId]: data }
    },
    // 문구 생성 결과를 보관한다. 세션 캐시 역할 — 같은 사진 재호출(크레딧 차감)을 막는다.
    setCaption(photoId, data) {
      this.captions = { ...this.captions, [photoId]: data }
      this.persistCaption(photoId)
    },
    // 문구 캐시를 비운다(전체 재생성 허용 — useCardCaptions 캐시 가드 우회). 사용자 확인 후에만 호출.
    clearCaption(photoId) {
      const next = { ...this.captions }
      delete next[photoId]
      this.captions = next
      this.persistCaption(photoId)
    },
    // 사진별 문구를 localStorage 에 고정/삭제(없으면 삭제). 환경상 불가하면 조용히 무시.
    persistCaption(photoId) {
      try {
        const cap = this.captions[photoId]
        if (cap) localStorage.setItem(CAP_KEY(photoId), JSON.stringify(cap))
        else localStorage.removeItem(CAP_KEY(photoId))
      } catch {
        /* localStorage 불가 환경 무시 */
      }
    },
    // 메모리에 없는 문구를 localStorage 에서 복원한다(새로고침·재진입 시 재생성 방지).
    hydrateCaptions(photoIds) {
      const add = {}
      for (const id of photoIds || []) {
        if (this.captions[id]) continue
        try {
          const raw = localStorage.getItem(CAP_KEY(id))
          if (raw) add[id] = JSON.parse(raw)
        } catch {
          /* 무시 */
        }
      }
      if (Object.keys(add).length) this.captions = { ...this.captions, ...add }
    },
    // 한 객체의 문구만 지운다(외곽선은 유지). scene·export 가 captions 를 읽으므로 양쪽 즉시 반영.
    removeCaptionObject(photoId, itemId) {
      const cap = this.captions[photoId]
      if (!cap?.response?.objects) return
      this.captions = {
        ...this.captions,
        [photoId]: {
          ...cap,
          response: { ...cap.response, objects: cap.response.objects.filter((o) => o.itemId !== itemId) },
        },
      }
      this.persistCaption(photoId)
    },
    // 보정 추가(탭/박스): 결과 item 을 외곽선에 더한다. 상태가 READY 가 아니었어도(FAILED 등) READY 로 올린다.
    appendOutlineItem(photoId, item) {
      const cur = this.outlines[photoId]
      const items = cur?.status === 'READY' && Array.isArray(cur.items) ? cur.items : []
      this.outlines = { ...this.outlines, [photoId]: { status: 'READY', items: [...items, item] } }
    },
    // 정제 후 서버 기준으로 외곽선을 갱신하고(교체·병합 흡수 반영), 더는 없는 item 의 문구를 정리한다.
    applyOutlineSync(photoId, data) {
      this.outlines = { ...this.outlines, [photoId]: data }
      this.pruneCaptions(photoId, Array.isArray(data?.items) ? data.items.map((it) => it.id) : [])
    },
    // 객체 삭제(빼기): 외곽선에서 제거하고 그 객체의 문구도 함께 제거(없는 itemId 문구가 새 객체에 안 붙게).
    removeOutlineItem(photoId, itemId) {
      const cur = this.outlines[photoId]
      if (!cur || !Array.isArray(cur.items)) return
      const items = cur.items.filter((it) => it.id !== itemId)
      this.outlines = { ...this.outlines, [photoId]: { ...cur, items } }
      this.pruneCaptions(
        photoId,
        items.map((it) => it.id),
      )
    },
    // 문구를 현재 존재하는 item id 들로만 정리한다(삭제·흡수된 itemId 의 문구 제거).
    pruneCaptions(photoId, ids) {
      const cap = this.captions[photoId]
      if (!cap?.response?.objects) return
      const keep = new Set(ids)
      this.captions = {
        ...this.captions,
        [photoId]: {
          ...cap,
          response: { ...cap.response, objects: cap.response.objects.filter((o) => keep.has(o.itemId)) },
        },
      }
      this.persistCaption(photoId)
    },
  },
})
