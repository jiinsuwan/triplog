import { describe, expect, it } from 'vitest'
import {
  appendRouteEdge,
  getConnectedPlaceIds,
  getRouteOrder,
  removeRouteEdge,
  updateRouteMode,
} from './itineraryBuilder'

describe('itinerary builder route logic', () => {
  it('단방향 경로를 순서대로 추가한다', () => {
    const first = appendRouteEdge([], 'a', 'b', 1)
    const second = appendRouteEdge(first.edges, 'b', 'c', 1)

    expect(second.added).toBe(true)
    expect(getRouteOrder(second.edges, 1)).toEqual(['a', 'b', 'c'])
  })

  it('출발지의 다음 장소는 하나만 허용한다', () => {
    const first = appendRouteEdge([], 'a', 'b', 1)
    const rejected = appendRouteEdge(first.edges, 'a', 'c', 1)

    expect(rejected.added).toBe(false)
    expect(rejected.reason).toContain('출발 장소')
  })

  it('순환 경로를 막는다', () => {
    const first = appendRouteEdge([], 'a', 'b', 1)
    const second = appendRouteEdge(first.edges, 'b', 'c', 1)
    const rejected = appendRouteEdge(second.edges, 'c', 'a', 1)

    expect(rejected.added).toBe(false)
    expect(rejected.reason).toContain('순환')
  })

  it('이동수단 변경과 구간 삭제를 반영한다', () => {
    const first = appendRouteEdge([], 'a', 'b', 1)
    const [edge] = first.edges
    const updated = updateRouteMode(first.edges, edge.id, 'bus')
    const removed = removeRouteEdge(updated, edge.id)

    expect(updated[0].mode).toBe('bus')
    expect(removed).toEqual([])
  })

  it('연결된 장소만 경로 요약 후보로 반환한다', () => {
    const first = appendRouteEdge([], 'a', 'b', 1)

    expect(getConnectedPlaceIds(first.edges, 1)).toEqual(['a', 'b'])
  })
})
