import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./instance', () => ({
  default: {
    get: vi.fn(),
  },
}))

import instance from './instance'
import { fetchPlaceRegions, fetchPlaces } from './placeApi'

describe('placeApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchPlaces 는 빈 파라미터를 제거하고 /places 를 호출한다', async () => {
    instance.get.mockResolvedValue({
      data: {
        data: {
          items: [{ id: 1, name: '경기전' }],
          page: 0,
          total: 1,
        },
      },
    })

    const result = await fetchPlaces({ keyword: '전주', category: '', size: 20 })

    expect(result.items).toHaveLength(1)
    expect(instance.get).toHaveBeenCalledWith('/places', {
      params: {
        keyword: '전주',
        page: 0,
        size: 20,
      },
    })
  })

  it('regions 응답 data 를 반환한다', async () => {
    instance.get.mockResolvedValueOnce({ data: { data: [{ region1: '서울특별시', count: 2 }] } })

    await expect(fetchPlaceRegions()).resolves.toEqual([{ region1: '서울특별시', count: 2 }])
  })
})
