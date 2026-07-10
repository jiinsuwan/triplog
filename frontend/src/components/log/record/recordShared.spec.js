import { describe, it, expect } from 'vitest'
import { projectStopsToViewBox, TYPE_ICON } from './recordShared.js'

// 두 record 지도(RecordPlacementBody·RecordRouteMap)가 공유하는 좌표 투영의 회귀 테스트.

const stop = (id, sortOrder, latitude, longitude) => ({
  id,
  sortOrder,
  place: { latitude, longitude },
})

describe('projectStopsToViewBox — 위경도 0~100 뷰박스 투영', () => {
  it('빈 입력·좌표 없는 stop만 있으면 빈 배열', () => {
    expect(projectStopsToViewBox([])).toEqual([])
    expect(projectStopsToViewBox(null)).toEqual([])
    expect(projectStopsToViewBox([{ id: 1, place: {} }])).toEqual([])
  })

  it('단일 stop은 중앙(50,50)에 놓는다', () => {
    expect(projectStopsToViewBox([stop(1, 1, 37, 127)])).toEqual([{ id: 1, no: 1, x: 50, y: 50 }])
  })

  it('경도는 서→동(x 증가), 위도는 북→위(y 반전)로 패딩 안에 배치한다', () => {
    // 남서(37,127) / 북동(38,128), P=14 S=72 → 남서 (14,86), 북동 (86,14)
    const out = projectStopsToViewBox([stop(1, 1, 37, 127), stop(2, 2, 38, 128)])
    expect(out[0]).toEqual({ id: 1, no: 1, x: 14, y: 86 })
    expect(out[1]).toEqual({ id: 2, no: 2, x: 86, y: 14 })
  })

  it('빈 문자열·NaN 좌표 stop은 제외한다(Number("")===0 원점 함정 방지)', () => {
    const out = projectStopsToViewBox([stop(1, 1, '', 127), stop(2, 2, 37, 127), stop(3, 3, 'x', 128)])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(2)
  })

  it('id·sortOrder 가 없으면 인덱스로 폴백한다', () => {
    const out = projectStopsToViewBox([
      { place: { latitude: 37, longitude: 127 } },
      { place: { latitude: 38, longitude: 128 } },
    ])
    expect(out[0]).toMatchObject({ id: 0, no: 1 })
    expect(out[1]).toMatchObject({ id: 1, no: 2 })
  })
})

describe('TYPE_ICON', () => {
  it('장소 타입별 아이콘을 제공한다', () => {
    expect(TYPE_ICON.ATTRACTION).toBe('🏛')
    expect(TYPE_ICON.LODGING).toBe('🏨')
  })
})
