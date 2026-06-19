import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { effectScope } from 'vue'

import { useCardCaptions } from '@/composables/useCardCaptions'
import { useCardStore } from '@/stores/card'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function inScope(fn) {
  const scope = effectScope()
  let handle
  scope.run(() => {
    handle = fn()
  })
  return handle
}

describe('useCardCaptions — GMS 크레딧 보호', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('같은 사진은 한 번만 호출한다(세션 캐시)', async () => {
    const api = {
      fetchCardCaption: vi.fn(async () => ({ response: { objects: [], closing: null }, warnings: [] })),
    }
    const h = inScope(() => useCardCaptions({ api }))

    await h.generate(7)
    await flush()
    await h.generate(7) // 캐시 히트 → 재호출 금지
    await flush()

    expect(api.fetchCardCaption).toHaveBeenCalledTimes(1)
    expect(useCardStore().captions[7]).toBeTruthy()
  })

  it('동시 호출도 1회로 합친다(in-flight 가드)', async () => {
    let resolveFetch
    const api = {
      fetchCardCaption: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      ),
    }
    const h = inScope(() => useCardCaptions({ api }))

    const p1 = h.generate(7)
    const p2 = h.generate(7) // 진행 중 → 같은 작업을 공유
    resolveFetch({ response: { objects: [] }, warnings: [] })
    await Promise.all([p1, p2])
    await flush()

    expect(api.fetchCardCaption).toHaveBeenCalledTimes(1)
    // 동시 호출자도 작업 완료를 기다려, await 이후 caption 이 준비돼 있다.
    expect(useCardStore().captions[7]).toBeTruthy()
  })

  it('실패해도 자동 재시도하지 않는다', async () => {
    const api = {
      fetchCardCaption: vi.fn(async () => {
        throw new Error('GMS 실패')
      }),
    }
    const h = inScope(() => useCardCaptions({ api }))

    await h.generate(7)
    await flush()

    expect(api.fetchCardCaption).toHaveBeenCalledTimes(1) // 1회만, 자동 재시도 없음
    expect(h.failed[7]).toBeTruthy()
    expect(useCardStore().captions[7]).toBeFalsy()
  })
})
