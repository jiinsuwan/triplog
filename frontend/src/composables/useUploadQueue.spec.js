import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useUploadQueue, QueueStatus, MAX_FILE_BYTES } from '@/composables/useUploadQueue'

const TRIP_ID = 7

// jsdom 은 objectURL API 를 구현하지 않으므로 스텁한다(호출 여부만 검증).
beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:fake'),
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

function jpeg(name = 'a.jpg', size = 1024) {
  const file = new File(['x'], name, { type: 'image/jpeg' })
  Object.defineProperty(file, 'size', { value: size }) // 실제 바이트 할당 없이 크기 위조.
  return file
}

// 외부 제어형 promise — 업로드/연결 완료 시점을 테스트가 직접 정한다.
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useUploadQueue', () => {
  it('검증 탈락: 미지원 형식·초과 크기는 rejected 이고 서버 요청을 보내지 않는다', () => {
    const api = { uploadPhoto: vi.fn(), linkPhotoToTrip: vi.fn() }
    const q = run(() => useUploadQueue(TRIP_ID, { api }))

    const txt = new File(['x'], 'note.txt', { type: 'text/plain' })
    const big = jpeg('huge.jpg', MAX_FILE_BYTES + 1)
    q.addFiles([txt, big])

    expect(q.items).toHaveLength(2)
    expect(q.items[0].status).toBe(QueueStatus.REJECTED)
    expect(q.items[0].error.retryable).toBe(false)
    expect(q.items[1].status).toBe(QueueStatus.REJECTED)
    expect(api.uploadPhoto).not.toHaveBeenCalled()
  })

  it('성공 흐름: 업로드 → 연결됨, EXIF 상태를 행에 반영한다', async () => {
    const api = {
      uploadPhoto: vi.fn().mockResolvedValue({ id: 11, takenAt: '2026-06-04T12:17:56', hasGps: true }),
      linkPhotoToTrip: vi.fn().mockResolvedValue({ id: 11, tripId: TRIP_ID }),
    }
    const q = run(() => useUploadQueue(TRIP_ID, { api }))
    q.addFiles([jpeg()])

    await vi.waitFor(() => expect(q.items[0].status).toBe(QueueStatus.LINKED))
    expect(api.uploadPhoto).toHaveBeenCalledTimes(1)
    expect(api.linkPhotoToTrip).toHaveBeenCalledWith(11, TRIP_ID)
    expect(q.items[0]).toMatchObject({ photoId: 11, takenAt: '2026-06-04T12:17:56', hasGps: true, progress: 100 })
  })

  it('연결 실패 후 재시도는 "연결만" 다시 한다(업로드 재호출 없음 → 중복 방지)', async () => {
    const api = {
      uploadPhoto: vi.fn().mockResolvedValue({ id: 11, takenAt: null, hasGps: false }),
      linkPhotoToTrip: vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ id: 11, tripId: TRIP_ID }),
    }
    const q = run(() => useUploadQueue(TRIP_ID, { api }))
    q.addFiles([jpeg()])

    await vi.waitFor(() => expect(q.items[0].status).toBe(QueueStatus.FAILED))
    expect(q.items[0].photoId).toBe(11) // 업로드는 이미 성공 → photoId 보존
    expect(q.items[0].error.retryable).toBe(true)

    q.retry(q.items[0].id)
    await vi.waitFor(() => expect(q.items[0].status).toBe(QueueStatus.LINKED))

    expect(api.uploadPhoto).toHaveBeenCalledTimes(1) // 업로드는 단 1회
    expect(api.linkPhotoToTrip).toHaveBeenCalledTimes(2) // 연결만 재시도
  })

  it('재시도 가드: 실패가 아닌 항목(완료·검증탈락)에는 아무 동작도 하지 않는다', async () => {
    const api = {
      uploadPhoto: vi.fn().mockResolvedValue({ id: 1, takenAt: null, hasGps: false }),
      linkPhotoToTrip: vi.fn().mockResolvedValue({ id: 1, tripId: TRIP_ID }),
    }
    const q = run(() => useUploadQueue(TRIP_ID, { api }))
    q.addFiles([jpeg(), new File(['x'], 'n.txt', { type: 'text/plain' })])

    await vi.waitFor(() => expect(q.items[0].status).toBe(QueueStatus.LINKED))
    q.retry(q.items[0].id) // 이미 연결됨
    q.retry(q.items[1].id) // rejected
    await Promise.resolve()

    expect(api.uploadPhoto).toHaveBeenCalledTimes(1)
    expect(q.items[1].status).toBe(QueueStatus.REJECTED)
  })

  it('진행률: onUploadProgress 콜백이 행 progress 에 반영된다', async () => {
    const gate = deferred()
    const api = {
      uploadPhoto: vi.fn((file, { onUploadProgress }) => {
        onUploadProgress({ loaded: 25, total: 100 })
        return gate.promise
      }),
      linkPhotoToTrip: vi.fn().mockResolvedValue({ id: 1, tripId: TRIP_ID }),
    }
    const q = run(() => useUploadQueue(TRIP_ID, { api }))
    q.addFiles([jpeg()])

    await vi.waitFor(() => expect(q.items[0].progress).toBe(25))
    expect(q.items[0].status).toBe(QueueStatus.UPLOADING)

    gate.resolve({ id: 1, takenAt: null, hasGps: false })
    await vi.waitFor(() => expect(q.items[0].status).toBe(QueueStatus.LINKED))
    expect(q.items[0].progress).toBe(100)
  })

  it('동시 상한: concurrency=1 이면 두 번째는 첫 번째가 끝날 때까지 대기한다', async () => {
    const first = deferred()
    const api = {
      uploadPhoto: vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockResolvedValue({ id: 2, takenAt: null, hasGps: false }),
      linkPhotoToTrip: vi.fn().mockResolvedValue({ id: 1, tripId: TRIP_ID }),
    }
    const q = run(() => useUploadQueue(TRIP_ID, { concurrency: 1, api }))
    q.addFiles([jpeg('1.jpg'), jpeg('2.jpg')])

    await vi.waitFor(() => expect(q.items[0].status).toBe(QueueStatus.UPLOADING))
    expect(q.items[1].status).toBe(QueueStatus.PENDING) // 상한 1 → 대기
    expect(api.uploadPhoto).toHaveBeenCalledTimes(1)

    first.resolve({ id: 1, takenAt: null, hasGps: false })
    await vi.waitFor(() => expect(q.items[1].status).toBe(QueueStatus.LINKED))
    expect(api.uploadPhoto).toHaveBeenCalledTimes(2)
  })

  it('objectURL: 미리보기 가능한 형식만 생성하고 remove 시 해제한다(HEIC 는 미리보기 없음)', () => {
    const api = { uploadPhoto: vi.fn(() => new Promise(() => {})), linkPhotoToTrip: vi.fn() }
    const q = run(() => useUploadQueue(TRIP_ID, { api }))

    const heic = new File(['x'], 'p.heic', { type: 'image/heic' })
    q.addFiles([jpeg(), heic])

    expect(q.items[0].previewUrl).toBe('blob:fake')
    expect(q.items[1].previewUrl).toBeNull() // HEIC → 폴백(아이콘)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)

    q.remove(q.items[0].id)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('스코프 해제(언마운트) 시 모든 objectURL 을 해제한다', () => {
    const api = { uploadPhoto: vi.fn(() => new Promise(() => {})), linkPhotoToTrip: vi.fn() }
    const q = run(() => useUploadQueue(TRIP_ID, { api }))
    q.addFiles([jpeg()])
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)

    q.dispose() // effectScope.stop() → onScopeDispose 발화
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })
})
