import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/tripApi', () => ({
  fetchTrips: vi.fn(),
  createTrip: vi.fn(),
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
})
