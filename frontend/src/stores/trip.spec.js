import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/tripApi', () => ({
  fetchTrips: vi.fn(),
  createTrip: vi.fn(),
  fetchTrip: vi.fn(),
  updateTrip: vi.fn(),
  deleteTrip: vi.fn(),
}))

import * as tripApi from '@/api/tripApi'
import { useTripStore } from './trip'

const sampleTrips = [
  {
    id: 1,
    title: '전주 새 일정',
    startDate: '2026-06-20',
    endDate: '2026-06-22',
    region: '전주',
    theme: '미식',
    status: 'PLANNING',
  },
]

describe('trip 스토어', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchTripList 는 /trips 목록 응답을 상태에 반영한다', async () => {
    tripApi.fetchTrips.mockResolvedValue({
      items: sampleTrips,
      page: 0,
      total: 1,
    })
    const store = useTripStore()

    const result = await store.fetchTripList()

    expect(result.items).toEqual(sampleTrips)
    expect(store.trips).toEqual(sampleTrips)
    expect(store.page).toBe(0)
    expect(store.total).toBe(1)
    expect(store.hasTrips).toBe(true)
    expect(store.loading).toBe(false)
    expect(tripApi.fetchTrips).toHaveBeenCalledWith({})
  })

  it('fetchTripList 실패 시 사용자 메시지를 저장하고 에러를 전파한다', async () => {
    tripApi.fetchTrips.mockRejectedValue({
      response: { data: { message: '인증이 필요합니다.' } },
    })
    const store = useTripStore()

    await expect(store.fetchTripList()).rejects.toBeTruthy()

    expect(store.error).toBe('인증이 필요합니다.')
    expect(store.loading).toBe(false)
  })

  it('createTrip 은 생성된 Trip 을 목록 맨 앞에 반영한다', async () => {
    tripApi.fetchTrips.mockResolvedValue({
      items: sampleTrips,
      page: 0,
      total: 1,
    })
    const created = {
      id: 2,
      title: '제주 바다 산책',
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      region: '제주',
      theme: '바다',
      status: 'PLANNING',
    }
    tripApi.createTrip.mockResolvedValue(created)
    const store = useTripStore()
    await store.fetchTripList()

    const result = await store.createTrip({
      title: '제주 바다 산책',
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      region: '제주',
      theme: '바다',
      status: 'PLANNING',
    })

    expect(result).toEqual(created)
    expect(store.trips[0]).toEqual(created)
    expect(store.trips).toHaveLength(2)
    expect(store.total).toBe(2)
    expect(store.creating).toBe(false)
  })

  it('createTrip 실패 시 사용자 메시지를 저장하고 생성 상태를 복원한다', async () => {
    tripApi.createTrip.mockRejectedValue({
      response: { data: { message: '여행을 생성할 수 없습니다.' } },
    })
    const store = useTripStore()

    await expect(
      store.createTrip({
        title: '실패하는 여행',
        startDate: '2026-07-01',
        endDate: '2026-07-03',
        region: '전주',
        theme: '미식',
        status: 'PLANNING',
      }),
    ).rejects.toBeTruthy()

    expect(store.error).toBe('여행을 생성할 수 없습니다.')
    expect(store.creating).toBe(false)
    expect(store.trips).toEqual([])
    expect(store.total).toBe(0)
  })

  it('fetchTripDetail 은 상세 응답을 selectedTrip 과 목록에 반영한다', async () => {
    const detail = { ...sampleTrips[0], title: '상세로 본 전주 일정' }
    tripApi.fetchTrip.mockResolvedValue(detail)
    const store = useTripStore()

    const result = await store.fetchTripDetail(1)

    expect(result).toEqual(detail)
    expect(store.selectedTrip).toEqual(detail)
    expect(store.trips[0]).toEqual(detail)
    expect(store.detailLoading).toBe(false)
    expect(tripApi.fetchTrip).toHaveBeenCalledWith(1)
  })

  it('updateTrip 은 수정된 Trip 을 selectedTrip 과 목록에 반영한다', async () => {
    tripApi.fetchTrips.mockResolvedValue({
      items: sampleTrips,
      page: 0,
      total: 1,
    })
    const updated = { ...sampleTrips[0], title: '수정된 전주 일정', theme: '골목' }
    tripApi.updateTrip.mockResolvedValue(updated)
    const store = useTripStore()
    await store.fetchTripList()

    const result = await store.updateTrip(1, {
      title: '수정된 전주 일정',
      startDate: '2026-06-20',
      endDate: '2026-06-22',
      region: '전주',
      theme: '골목',
      status: 'PLANNING',
    })

    expect(result).toEqual(updated)
    expect(store.selectedTrip).toEqual(updated)
    expect(store.trips[0]).toEqual(updated)
    expect(store.updating).toBe(false)
  })

  it('deleteTrip 은 삭제된 Trip 을 목록과 selectedTrip 에서 제거한다', async () => {
    tripApi.fetchTrips.mockResolvedValue({
      items: sampleTrips,
      page: 0,
      total: 1,
    })
    tripApi.fetchTrip.mockResolvedValue(sampleTrips[0])
    tripApi.deleteTrip.mockResolvedValue(null)
    const store = useTripStore()
    await store.fetchTripList()
    await store.fetchTripDetail(1)

    await store.deleteTrip(1)

    expect(store.trips).toEqual([])
    expect(store.selectedTrip).toBeNull()
    expect(store.total).toBe(0)
    expect(store.deleting).toBe(false)
  })
})
