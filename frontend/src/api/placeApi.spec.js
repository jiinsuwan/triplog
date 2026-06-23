import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./instance', () => ({
  default: {
    get: vi.fn(),
  },
}))

import instance from './instance'
import { fetchPlaceDetail, fetchPlaceRegions, fetchPlaces } from './placeApi'

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

    const result = await fetchPlaces({ keyword: '전주', placeType: 'LODGING', category: '', size: 20 })

    expect(result.items).toHaveLength(1)
    expect(instance.get).toHaveBeenCalledWith('/places', {
      params: {
        keyword: '전주',
        placeType: 'LODGING',
        page: 0,
        size: 20,
      },
    })
  })

  it('regions 응답 data 를 반환한다', async () => {
    instance.get.mockResolvedValueOnce({ data: { data: [{ region1: '서울특별시', count: 2 }] } })

    await expect(fetchPlaceRegions()).resolves.toEqual([{ region1: '서울특별시', count: 2 }])
  })

  it('fetchPlaceDetail 은 /places/{id} 상세 응답 data 를 반환한다', async () => {
    instance.get.mockResolvedValueOnce({
      data: {
        data: {
          id: 7,
          name: '경기전',
          description: '조선 왕조의 역사 공간',
        },
      },
    })

    await expect(fetchPlaceDetail(7)).resolves.toMatchObject({
      id: 7,
      name: '경기전',
      description: '조선 왕조의 역사 공간',
    })
    expect(instance.get).toHaveBeenCalledWith('/places/7')
  })
})
