import { describe, expect, it } from 'vitest'
import { clamp01, lineEndpointAt, lineRotHandle, nearLine } from './cardEditorCanvas'

describe('cardEditorCanvas — 캔버스 편집 기하', () => {
  it('정규화 좌표를 0~1 범위로 제한한다', () => {
    expect(clamp01(-0.2)).toBe(0)
    expect(clamp01(0.4)).toBe(0.4)
    expect(clamp01(1.4)).toBe(1)
  })

  it('선분 본체와 끝점 hit-test를 판정한다', () => {
    const line = { x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.2 }

    expect(nearLine(line, 0.5, 0.205)).toBe(true)
    expect(nearLine(line, 0.5, 0.28)).toBe(false)
    expect(lineEndpointAt(line, 0.2, 0.2)).toBe('1')
    expect(lineEndpointAt(line, 0.8, 0.2)).toBe('2')
    expect(lineEndpointAt(line, 0.5, 0.2)).toBe(null)
  })

  it('회전 핸들을 선분 중점에서 수직 방향으로 둔다', () => {
    const line = { x1: 0.25, y1: 0.5, x2: 0.75, y2: 0.5 }
    const [x, y] = lineRotHandle(line, { W: 1000, H: 1000 })

    expect(x).toBeCloseTo(500)
    expect(y).toBeGreaterThan(500)
  })
})
