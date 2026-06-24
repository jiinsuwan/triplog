import { describe, it, expect } from 'vitest'

import { pointInPolygons, itemAt, bboxCenter, normalizeBox } from '@/card/outlineEdit'

const SQUARE = [
  [
    [0.2, 0.2],
    [0.6, 0.2],
    [0.6, 0.6],
    [0.2, 0.6],
  ],
]

describe('outlineEdit 순수 헬퍼', () => {
  describe('pointInPolygons — 점-다각형 포함', () => {
    it('안쪽 점은 true, 바깥 점은 false', () => {
      expect(pointInPolygons(SQUARE, 0.4, 0.4)).toBe(true)
      expect(pointInPolygons(SQUARE, 0.05, 0.05)).toBe(false)
      expect(pointInPolygons(SQUARE, 0.8, 0.4)).toBe(false)
    })

    it('U자(오목) 틈새는 바깥으로 판정한다', () => {
      const u = [
        [
          [0.2, 0.2],
          [0.3, 0.2],
          [0.3, 0.5],
          [0.5, 0.5],
          [0.5, 0.2],
          [0.6, 0.2],
          [0.6, 0.7],
          [0.2, 0.7],
        ],
      ]
      expect(pointInPolygons(u, 0.25, 0.45)).toBe(true) // 왼쪽 다리
      expect(pointInPolygons(u, 0.4, 0.35)).toBe(false) // 틈새
    })
  })

  describe('itemAt — 겹치면 작은(위) 객체 우선', () => {
    it('클릭 위치를 포함하는 가장 작은 객체를 고른다', () => {
      const big = { id: 1, polygons: [[[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]] }
      const small = { id: 2, polygons: [[[0.4, 0.4], [0.5, 0.4], [0.5, 0.5], [0.4, 0.5]]] }
      expect(itemAt([big, small], 0.45, 0.45).id).toBe(2) // 둘 다 포함 → 작은 것
      expect(itemAt([big, small], 0.2, 0.2).id).toBe(1) // big 만 포함
      expect(itemAt([big, small], 0.95, 0.95)).toBeNull() // 빈 곳
    })
  })

  describe('bboxCenter — bbox 중점', () => {
    it('정사각형의 중점', () => {
      expect(bboxCenter(SQUARE)).toEqual([0.4, 0.4])
    })
  })

  describe('normalizeBox — 모서리 정렬·미세박스 폐기', () => {
    it('역드래그(우하→좌상)도 x1<x2, y1<y2 로 정렬', () => {
      expect(normalizeBox(0.6, 0.6, 0.2, 0.2)).toEqual([0.2, 0.2, 0.6, 0.6])
    })

    it('너무 작은 박스는 null(폐기)', () => {
      expect(normalizeBox(0.5, 0.5, 0.505, 0.505)).toBeNull()
    })
  })
})
