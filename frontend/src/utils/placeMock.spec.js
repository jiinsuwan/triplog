import { describe, expect, it } from 'vitest'
import { filterPlaces, getPlacesByRegion, isPlaceSaved, toggleSavedPlace } from './placeMock'

describe('place mock 유틸', () => {
  it('지역별 목업 장소를 반환한다', () => {
    const places = getPlacesByRegion('전주')

    expect(places.length).toBeGreaterThan(0)
    expect(places.every((place) => place.region === '전주')).toBe(true)
  })

  it('카테고리와 키워드로 장소를 필터링한다', () => {
    const places = getPlacesByRegion('전주')

    const result = filterPlaces(places, { category: 'food', keyword: '칼국수' })

    expect(result).toHaveLength(1)
    expect(result[0].name).toContain('칼국수')
  })

  it('장소 담기 상태를 토글한다', () => {
    const [place] = getPlacesByRegion('전주')

    const saved = toggleSavedPlace([], place)
    const removed = toggleSavedPlace(saved, place)

    expect(isPlaceSaved(saved, place.id)).toBe(true)
    expect(removed).toEqual([])
  })
})
