import { reactive, ref, onScopeDispose } from 'vue'
import { fetchCardCaption as defaultFetch } from '@/api/cardApi'
import { useCardStore } from '@/stores/card'

// 카드 문구 생성 (S3-LOG-06 4단계).
// ⚠️ GMS 호출당 크레딧이 차감된다. 그래서:
//  - 세션 캐시: 이미 만든 사진은 다시 호출하지 않는다(store.captions 가 캐시).
//  - in-flight 가드: 같은 사진 동시 호출 1회로 합친다.
//  - 자동 재시도 금지: 실패해도 자동으로 다시 부르지 않는다 — 사용자가 "다시 시도"로만 재호출.
// 생성은 사용자 트리거다(자동 실행 금지).
export function useCardCaptions({ api } = {}) {
  const fetchCaption = api?.fetchCardCaption ?? defaultFetch
  const card = useCardStore()

  const inFlight = new Map() // photoId -> 진행 중 Promise
  const failed = reactive({}) // photoId -> 실패 메시지 (자동 재시도 안 함)
  const generating = ref(false)

  let disposed = false
  const controllers = new Set()

  // 한 사진의 문구를 1회 생성한다. 이미 있으면 호출 안 함(크레딧 보호). 진행 중이면 그 작업을
  // "함께 기다린다" — 동시 호출자가 caption 준비 전에 진행하지 않도록 기존 Promise 를 돌려준다.
  function generate(photoId) {
    if (disposed) return Promise.resolve()
    if (card.captions[photoId]) return Promise.resolve() // 세션 캐시 히트 — 재호출 금지
    if (inFlight.has(photoId)) return inFlight.get(photoId) // in-flight — 같은 작업을 공유

    delete failed[photoId]
    generating.value = true
    const controller = new AbortController()
    controllers.add(controller)
    const task = (async () => {
      try {
        const result = await fetchCaption(photoId, { signal: controller.signal })
        if (!disposed) card.setCaption(photoId, result)
      } catch (e) {
        // 자동 재시도하지 않는다 — 실패만 기록하고 사용자 재시도를 기다린다.
        if (!disposed) failed[photoId] = e?.message || '문구 생성에 실패했습니다.'
      } finally {
        inFlight.delete(photoId)
        controllers.delete(controller)
        if (inFlight.size === 0) generating.value = false
      }
    })()
    inFlight.set(photoId, task)
    return task
  }

  // 여러 사진을 생성한다(각각 1회·캐시·가드 적용).
  async function generateMany(photoIds) {
    await Promise.all(photoIds.map((id) => generate(id)))
  }

  onScopeDispose(() => {
    disposed = true
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
  })

  return { generate, generateMany, generating, failed }
}
