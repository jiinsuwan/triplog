import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { usePhotoContent } from '@/composables/usePhotoContent'

// jsdom 은 objectURL API 가 없으므로 스텁한다. 캐시·해제 대상을 구분하려 매번 다른 url 을 준다.
let urlSeq
beforeEach(() => {
  urlSeq = 0
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => `blob:${++urlSeq}`),
    revokeObjectURL: vi.fn(),
  })
})
afterEach(() => vi.unstubAllGlobals())

// 컴포저블을 effectScope 안에서 실행해 onScopeDispose 가 정상 동작하게 한다.
function run(fn) {
  const scope = effectScope()
  let result
  scope.run(() => {
    result = fn()
  })
  return { ...result, dispose: () => scope.stop() }
}

// 외부 제어형 promise — fetch 완료 시점을 테스트가 직접 정한다.
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function blob() {
  return new Blob(['x'], { type: 'image/jpeg' })
}

describe('usePhotoContent', () => {
  it('캐시: 같은 id 를 다시 load 하면 fetch 없이 같은 objectURL 을 준다', async () => {
    const fetchPhotoContent = vi.fn().mockResolvedValue(blob())
    const c = run(() => usePhotoContent({ api: { fetchPhotoContent } }))

    const first = await c.load(3)
    const second = await c.load(3)

    expect(first).toBe(second)
    expect(fetchPhotoContent).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('in-flight 공유: 같은 id 동시 요청은 fetch 1회만 내고 같은 url 을 공유한다', async () => {
    const gate = deferred()
    const fetchPhotoContent = vi.fn(() => gate.promise)
    const c = run(() => usePhotoContent({ api: { fetchPhotoContent } }))

    const p1 = c.load(5)
    const p2 = c.load(5) // 첫 요청이 끝나기 전 같은 id 재요청
    gate.resolve(blob())
    const [u1, u2] = await Promise.all([p1, p2])

    expect(u1).toBe(u2)
    expect(fetchPhotoContent).toHaveBeenCalledTimes(1)
  })

  it('서로 다른 id 는 각각 fetch 하고 다른 url 을 준다', async () => {
    const fetchPhotoContent = vi.fn().mockResolvedValue(blob())
    const c = run(() => usePhotoContent({ api: { fetchPhotoContent } }))

    const a = await c.load(1)
    const b = await c.load(2)

    expect(a).not.toBe(b)
    expect(fetchPhotoContent).toHaveBeenCalledTimes(2)
  })

  it('dispose(언마운트): 만든 objectURL 을 전부 revoke 한다', async () => {
    const fetchPhotoContent = vi.fn().mockResolvedValue(blob())
    const c = run(() => usePhotoContent({ api: { fetchPhotoContent } }))

    const u1 = await c.load(1)
    const u2 = await c.load(2)
    c.dispose()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(u1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(u2)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('지연 도착: dispose 후 도착한 응답은 즉시 revoke 하고, 해제된 URL 을 넘기지 않도록 reject 한다', async () => {
    const gate = deferred()
    const fetchPhotoContent = vi.fn(() => gate.promise)
    const c = run(() => usePhotoContent({ api: { fetchPhotoContent } }))

    const pending = c.load(9) // in-flight 상태로 둔다
    c.dispose() // 응답 도착 전에 스코프 해제 — dispose 의 캐시 순회엔 아직 안 잡힌다
    gate.resolve(blob())

    // 1) 호출자에게 '이미 해제된' URL 을 resolve 하지 않는다(거부).
    await expect(pending).rejects.toThrow()
    // 2) 그래도 만든 objectURL 은 해제돼 누수가 없다.
    const created = URL.createObjectURL.mock.results[0].value
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(created)
  })

  it('dispose 이후의 load 는 새 fetch 없이 즉시 reject 한다', async () => {
    const fetchPhotoContent = vi.fn().mockResolvedValue(blob())
    const c = run(() => usePhotoContent({ api: { fetchPhotoContent } }))
    c.dispose()

    await expect(c.load(1)).rejects.toThrow()
    expect(fetchPhotoContent).not.toHaveBeenCalled()
  })

  it('실패 전파: fetch 가 거부되면 load 도 거부된다', async () => {
    const fetchPhotoContent = vi.fn().mockRejectedValue(new Error('network'))
    const c = run(() => usePhotoContent({ api: { fetchPhotoContent } }))

    await expect(c.load(1)).rejects.toThrow('network')
  })
})
