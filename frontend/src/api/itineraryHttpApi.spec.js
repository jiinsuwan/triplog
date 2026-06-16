import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./instance', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import instance from './instance'
import {
  createItineraryStop,
  deleteItineraryStop,
  fetchItinerary,
  reorderItineraryStops,
  updateItineraryStop,
} from './itineraryHttpApi'

describe('itineraryHttpApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchItinerary 는 #77 조회 endpoint 의 data 를 반환한다', async () => {
    instance.get.mockResolvedValueOnce({ data: { data: { dayCount: 3, days: [] } } })

    await expect(fetchItinerary(10)).resolves.toEqual({ dayCount: 3, days: [] })
    expect(instance.get).toHaveBeenCalledWith('/trips/10/itinerary')
  })

  it('createItineraryStop 은 날짜별 stop 생성 endpoint 를 호출한다', async () => {
    const payload = { transport: 'walk', place: { source: 'DB', dbPlaceId: 1 } }
    instance.post.mockResolvedValueOnce({ data: { data: { id: 99 } } })

    await expect(createItineraryStop(10, 2, payload)).resolves.toEqual({ id: 99 })
    expect(instance.post).toHaveBeenCalledWith('/trips/10/itinerary/days/2/stops', payload)
  })

  it('update/delete/reorder endpoint 계약을 유지한다', async () => {
    instance.put.mockResolvedValueOnce({ data: { data: { id: 7, memo: '수정' } } })
    instance.delete.mockResolvedValueOnce({ data: { data: null } })
    instance.put.mockResolvedValueOnce({ data: { data: { days: [] } } })

    await expect(updateItineraryStop(10, 1, 7, { memo: '수정' })).resolves.toMatchObject({
      id: 7,
      memo: '수정',
    })
    await expect(deleteItineraryStop(10, 1, 7)).resolves.toBeNull()
    await expect(reorderItineraryStops(10, 1, [8, 9])).resolves.toEqual({ days: [] })

    expect(instance.put).toHaveBeenNthCalledWith(
      1,
      '/trips/10/itinerary/days/1/stops/7',
      { memo: '수정' },
    )
    expect(instance.delete).toHaveBeenCalledWith('/trips/10/itinerary/days/1/stops/7')
    expect(instance.put).toHaveBeenNthCalledWith(
      2,
      '/trips/10/itinerary/days/1/stops/order',
      { stopIds: [8, 9] },
    )
  })
})
