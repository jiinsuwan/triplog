import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope } from 'vue'

// load(onMounted) 가 부르는 API 를 모킹 — 순수 분기(배치/자동배치/순서)만 검증한다.
vi.mock('@/api/itineraryApi', () => ({
  fetchItinerary: vi.fn(() => Promise.resolve({ days: [] })),
}))
vi.mock('@/api/photoApi', () => ({
  fetchTripPhotos: vi.fn(() => Promise.resolve([])),
  unlinkPhotoFromTrip: vi.fn(() => Promise.resolve()),
}))

import { usePhotoPlacement } from '@/composables/usePhotoPlacement'
import { unlinkPhotoFromTrip } from '@/api/photoApi'

// effectScope 로 컴포저블을 띄운다(onMounted 는 인스턴스가 없어 no-op — load 는 직접 데이터 주입으로 대체).
function setup() {
  const scope = effectScope()
  let api
  scope.run(() => {
    api = usePhotoPlacement(3)
  })
  return api
}

// 헬퍼: 일정/사진 주입.
function seed(api, days, photos) {
  api.days.value = days
  api.photos.value = photos
}
const stop = (id, sortOrder, selectedTime) => ({ id, sortOrder, selectedTime, place: { name: `장소${id}` } })

beforeEach(() => vi.clearAllMocks())

describe('placePhoto — 장소당 1장(교체)', () => {
  it('빈 장소에 배치한다', () => {
    const api = setup()
    seed(api, [{ dayNumber: 1, date: '2024-05-01', stops: [stop(10, 1, '09:00')] }], [{ id: 1 }, { id: 2 }])
    api.placePhoto(1, 10)
    expect(api.placement[1]).toBe(10)
    expect(api.photosForStop(10).map((p) => p.id)).toEqual([1])
  })

  it('이미 사진이 있는 장소에 다른 사진을 놓으면 기존 사진을 미배치로 교체한다(1장 유지)', () => {
    const api = setup()
    seed(api, [{ dayNumber: 1, date: '2024-05-01', stops: [stop(10, 1, '09:00')] }], [{ id: 1 }, { id: 2 }])
    api.placePhoto(1, 10)
    api.placePhoto(2, 10)
    expect(api.placement[1]).toBeUndefined() // 기존 사진은 미배치로
    expect(api.placement[2]).toBe(10)
    expect(api.photosForStop(10).map((p) => p.id)).toEqual([2])
    expect(api.unplaced.value.map((p) => p.id)).toEqual([1])
  })
})

describe('autoPlaceByTime — 촬영시각 근사·장소당 1장·같은 날짜 우선', () => {
  it('각 장소에 시각이 가장 가까운 사진 1장만 배치한다', () => {
    const api = setup()
    seed(
      api,
      [{ dayNumber: 1, date: '2024-05-01', stops: [stop(10, 1, '09:00'), stop(11, 2, '13:00')] }],
      [
        { id: 1, takenAt: '2024-05-01T09:05:00' }, // 09:00 근접
        { id: 2, takenAt: '2024-05-01T12:50:00' }, // 13:00 근접
        { id: 3, takenAt: '2024-05-01T09:10:00' }, // 09:00 이지만 1보다 멀어 미배치
      ],
    )
    api.autoPlaceByTime()
    expect(api.placement[1]).toBe(10)
    expect(api.placement[2]).toBe(11)
    expect(api.placement[3]).toBeUndefined() // 장소당 1장이라 남은 09시 사진은 미배치
  })

  it('다일자: stop 은 같은 날짜 사진을 시각 근사보다 우선한다(다른 날 사진이 시각만 가깝다고 끼어들지 않음)', () => {
    const api = setup()
    seed(
      api,
      [{ dayNumber: 1, date: '2024-05-01', stops: [stop(10, 1, '10:00')] }],
      [
        { id: 1, takenAt: '2024-05-02T10:00:00' }, // 다른 날(05-02), 시각은 정확
        { id: 2, takenAt: '2024-05-01T10:30:00' }, // 같은 날(05-01), 시각 30분 차
      ],
    )
    api.autoPlaceByTime()
    expect(api.placement[2]).toBe(10) // 같은 날짜 우선 — 시각 더 먼 2가 선택됨
    expect(api.placement[1]).toBeUndefined() // 다른 날 사진은 이 stop 후보에서 제외
  })

  it('다일자: 각 사진이 자기 날짜 stop 에 배치된다', () => {
    const api = setup()
    seed(
      api,
      [
        { dayNumber: 1, date: '2024-05-01', stops: [stop(10, 1, '10:00')] },
        { dayNumber: 2, date: '2024-05-02', stops: [stop(20, 1, '10:00')] },
      ],
      [
        { id: 1, takenAt: '2024-05-02T10:30:00' }, // DAY2
        { id: 2, takenAt: '2024-05-01T10:30:00' }, // DAY1
      ],
    )
    api.autoPlaceByTime()
    expect(api.placement[2]).toBe(10) // DAY1 사진 → DAY1 stop
    expect(api.placement[1]).toBe(20) // DAY2 사진 → DAY2 stop
  })

  it('takenAt 없는 사진은 자동배치하지 않는다', () => {
    const api = setup()
    seed(api, [{ dayNumber: 1, date: '2024-05-01', stops: [stop(10, 1, '09:00')] }], [{ id: 1 }])
    api.autoPlaceByTime()
    expect(api.placement[1]).toBeUndefined()
  })
})

describe('placedPhotoIds — 일정(DAY/stop) 순서', () => {
  it('배치된 사진을 화면과 같은 일정 순서로 반환한다(업로드 순서 아님)', () => {
    const api = setup()
    seed(
      api,
      [
        { dayNumber: 1, date: '2024-05-01', stops: [stop(10, 1, '09:00'), stop(11, 2, '13:00')] },
        { dayNumber: 2, date: '2024-05-02', stops: [stop(20, 1, '10:00')] },
      ],
      [{ id: 7 }, { id: 8 }, { id: 9 }],
    )
    // 업로드 순서(7,8,9)와 다른 stop 에 배치
    api.placePhoto(9, 20) // DAY2
    api.placePhoto(8, 11) // DAY1 stop2
    api.placePhoto(7, 10) // DAY1 stop1
    // 일정 순서 = stop10(7) → stop11(8) → stop20(9)
    expect(api.placedPhotoIds.value).toEqual([7, 8, 9])
  })

  it('미배치 사진은 제외한다', () => {
    const api = setup()
    seed(api, [{ dayNumber: 1, date: '2024-05-01', stops: [stop(10, 1, '09:00')] }], [{ id: 1 }, { id: 2 }])
    api.placePhoto(1, 10)
    expect(api.placedPhotoIds.value).toEqual([1])
  })
})

describe('removeFromTrip — 이 여행에서 빼기(unlink)', () => {
  it('unlink 호출 후 placement·photos 에서 제거한다', async () => {
    const api = setup()
    seed(api, [{ dayNumber: 1, date: '2024-05-01', stops: [stop(10, 1, '09:00')] }], [{ id: 1 }, { id: 2 }])
    api.placePhoto(1, 10)
    await api.removeFromTrip(1)
    expect(unlinkPhotoFromTrip).toHaveBeenCalledWith(1)
    expect(api.placement[1]).toBeUndefined()
    expect(api.photos.value.map((p) => p.id)).toEqual([2])
  })
})
