import { describe, it, expect, vi, beforeEach } from 'vitest'

// photoApi 는 공용 instance 위의 얇은 래퍼다. 인스턴스를 목으로 대체해
// "어떤 호출을 어떤 인자로 보내고, 응답을 어떻게 언랩하는지"만 검증한다(계약 고정).
vi.mock('@/api/instance', () => ({
  default: { post: vi.fn(), patch: vi.fn(), delete: vi.fn(), get: vi.fn() },
}))

import instance from '@/api/instance'
import {
  uploadPhoto,
  linkPhotoToTrip,
  unlinkPhotoFromTrip,
  fetchTripPhotos,
} from '@/api/photoApi'

// 공통 ApiResponse<T> 래퍼 형태의 성공 응답.
function ok(data) {
  return Promise.resolve({ data: { code: 'SUCCESS', message: '', data } })
}

describe('photoApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uploadPhoto: files 키로 multipart 전송하고 응답 배열의 첫 항목을 반환한다', async () => {
    const photo = { id: 1, hasGps: true, takenAt: null }
    instance.post.mockReturnValue(ok([photo]))
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    const onUploadProgress = vi.fn()

    const result = await uploadPhoto(file, { onUploadProgress })

    expect(result).toEqual(photo) // data.data[0] 언랩
    const [url, body, config] = instance.post.mock.calls[0]
    expect(url).toBe('/photos')
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('files')).toBe(file) // 컨트롤러 @RequestParam("files")
    expect(config.onUploadProgress).toBe(onUploadProgress)
    expect(config.timeout).toBe(0) // 대용량 업로드 → 짧은 전역 timeout 해제
  })

  it('linkPhotoToTrip: PATCH 바디 {tripId} 로 호출하고 data.data 를 반환한다', async () => {
    const updated = { id: 1, tripId: 7 }
    instance.patch.mockReturnValue(ok(updated))

    const result = await linkPhotoToTrip(1, 7)

    expect(result).toEqual(updated)
    expect(instance.patch).toHaveBeenCalledWith('/photos/1/trip', { tripId: 7 })
  })

  it('unlinkPhotoFromTrip: DELETE 를 호출하고 data.data 를 반환한다', async () => {
    instance.delete.mockReturnValue(ok({ id: 1, tripId: null }))

    const result = await unlinkPhotoFromTrip(1)

    expect(result).toEqual({ id: 1, tripId: null })
    expect(instance.delete).toHaveBeenCalledWith('/photos/1/trip')
  })

  it('fetchTripPhotos: tripId 쿼리로 GET 하고 data.data 를 반환한다', async () => {
    instance.get.mockReturnValue(ok([{ id: 1 }]))

    const result = await fetchTripPhotos(7)

    expect(result).toEqual([{ id: 1 }])
    expect(instance.get).toHaveBeenCalledWith('/photos', { params: { tripId: 7 } })
  })
})
