import { describe, it, expect, vi } from 'vitest'
import { effectScope } from 'vue'

import {
  isOutlineTerminal,
  pendingOutlineIds,
  summarizeOutlines,
  nextBackoff,
  useOutlinePolling,
} from '@/composables/useOutlinePolling'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('외곽선 폴링 순수 헬퍼', () => {
  it('isOutlineTerminal — READY/FAILED 만 종료', () => {
    expect(isOutlineTerminal('READY')).toBe(true)
    expect(isOutlineTerminal('FAILED')).toBe(true)
    expect(isOutlineTerminal('PENDING')).toBe(false)
    expect(isOutlineTerminal(undefined)).toBe(false)
  })

  it('pendingOutlineIds — 미조회·PENDING 은 미완료', () => {
    const outlines = { 1: { status: 'READY' }, 2: { status: 'PENDING' } }
    expect(pendingOutlineIds(outlines, [1, 2, 3])).toEqual([2, 3])
  })

  it('summarizeOutlines — 집계 + done 판정', () => {
    const outlines = { 1: { status: 'READY' }, 2: { status: 'FAILED' } }
    expect(summarizeOutlines(outlines, [1, 2, 3])).toEqual({
      ready: 1,
      failed: 1,
      pending: 1,
      total: 3,
      done: false,
    })
    expect(summarizeOutlines({ 1: { status: 'READY' } }, [1]).done).toBe(true)
  })

  it('nextBackoff — base → ×factor → cap', () => {
    expect(nextBackoff(0)).toBe(1500)
    expect(nextBackoff(1500)).toBe(2250)
    expect(nextBackoff(4000)).toBe(5000)
  })
})

describe('useOutlinePolling 상태머신', () => {
  // statusSeq: photoId -> 연속 호출 시 반환할 상태 배열(마지막 값이 이후 반복).
  function setup(statusSeq) {
    const calls = {}
    const api = {
      fetchPhotoOutline: vi.fn(async (id) => {
        const seq = statusSeq[id] || ['READY']
        const i = Math.min(calls[id] ?? 0, seq.length - 1)
        calls[id] = (calls[id] ?? 0) + 1
        const status = seq[i]
        return { photoId: id, status, items: status === 'READY' ? [] : null }
      }),
    }
    let scheduled = null
    let clock = 0
    const scope = effectScope()
    let handle
    scope.run(() => {
      handle = useOutlinePolling([1, 2], {
        api,
        deadlineMs: 10000,
        now: () => clock,
        schedule: (fn) => {
          scheduled = fn
          return 1
        },
        unschedule: () => {},
      })
    })
    return {
      ...handle,
      api,
      scope,
      runNext: () => scheduled && scheduled(),
      setClock: (c) => {
        clock = c
      },
    }
  }

  it('모두 READY 면 즉시 finished', async () => {
    const h = setup({ 1: ['READY'], 2: ['READY'] })
    await flush()
    expect(h.finished.value).toBe(true)
    expect(h.summary.value.done).toBe(true)
  })

  it('모두 FAILED 여도 timeout 아니라 finished 로 끝난다(#75 폴백: 전체 실패는 막힘 아님)', async () => {
    const h = setup({ 1: ['FAILED'], 2: ['FAILED'] })
    await flush()
    expect(h.finished.value).toBe(true)
    expect(h.timedOut.value).toBe(false)
    expect(h.summary.value.done).toBe(true)
  })

  it('PENDING→READY 전이 후 finished', async () => {
    const h = setup({ 1: ['PENDING', 'READY'], 2: ['READY'] })
    await flush()
    expect(h.finished.value).toBe(false)
    h.runNext()
    await flush()
    expect(h.finished.value).toBe(true)
  })

  it('deadline 초과 시 timedOut (finished 아님)', async () => {
    const h = setup({ 1: ['PENDING'], 2: ['PENDING'] })
    await flush()
    h.setClock(20000)
    h.runNext()
    await flush()
    expect(h.timedOut.value).toBe(true)
    expect(h.finished.value).toBe(false)
  })

  it('scope 종료 후엔 더 폴링하지 않는다(누수 방지)', async () => {
    const h = setup({ 1: ['PENDING'], 2: ['PENDING'] })
    await flush()
    const before = h.api.fetchPhotoOutline.mock.calls.length
    h.scope.stop()
    h.runNext()
    await flush()
    expect(h.api.fetchPhotoOutline.mock.calls.length).toBe(before)
  })
})
