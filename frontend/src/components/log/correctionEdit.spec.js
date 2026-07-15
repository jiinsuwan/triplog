import { describe, it, expect } from 'vitest'

import {
  MODE,
  ADD_TOOL,
  MARK,
  ITEM_SRC,
  NOTICE,
  correctionError,
  dotCursor,
  letterboxPoint,
} from '@/components/log/correctionEdit'

describe('correctionEdit 상수 — template·script 공유 정본', () => {
  it('상수 값은 기존 매직 스트링과 동일(값 바꾸면 CSS·API 계약 깨짐)', () => {
    expect(MODE).toEqual({ ADD: 'add', EDIT: 'edit' })
    expect(ADD_TOOL).toEqual({ TAP: 'tap', BOX: 'box' })
    expect(MARK).toEqual({ PLUS: 'plus', MINUS: 'minus' })
    expect(ITEM_SRC.USER).toBe('user')
    // NOTICE 값은 그대로 CSS 클래스명으로도 쓰인다.
    expect(NOTICE).toEqual({ INFO: 'info', ERROR: 'error' })
  })
})

describe('correctionError — API 에러 → 안내 문구', () => {
  it('503/409 는 상태별 문구, 그 외·미상은 일반 문구', () => {
    expect(correctionError({ response: { status: 503 } })).toContain('인식 서버가 잠깐')
    expect(correctionError({ response: { status: 409 } })).toContain('아직 자동 외곽선')
    expect(correctionError({ response: { status: 500 } })).toContain('처리에 실패')
    expect(correctionError(undefined)).toContain('처리에 실패')
  })
})

describe('dotCursor — 정제 커서 SVG', () => {
  it('data URL 커서 문자열, 포함(십자)이 제외(가로선)보다 선이 하나 많다', () => {
    const plus = dotCursor('#00ff00', true)
    const minus = dotCursor('#ff0000', false)
    expect(plus.startsWith('url("data:image/svg+xml,')).toBe(true)
    expect(minus.startsWith('url("data:image/svg+xml,')).toBe(true)
    expect(plus.endsWith('15 15, crosshair')).toBe(true)
    const count = (s) => (decodeURIComponent(s).match(/<line/g) || []).length
    expect(count(plus)).toBe(2)
    expect(count(minus)).toBe(1)
    expect(decodeURIComponent(plus)).toContain('#00ff00')
  })
})

describe('letterboxPoint — 레터박스 캔버스 좌표 → 정규화 0~1', () => {
  it('레터박스 없음: 표시 박스 그대로 매핑', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 }
    expect(letterboxPoint(rect, 100, 100, 50, 50)).toEqual([0.5, 0.5])
    expect(letterboxPoint(rect, 100, 100, 0, 0)).toEqual([0, 0])
    expect(letterboxPoint(rect, 100, 100, 100, 100)).toEqual([1, 1])
  })

  it('가로 레터박스(넓은 표시 박스): 좌우 여백 보정 후 매핑, 밖은 clamp', () => {
    // rect 200x100, 사진 100x100 → scale 1, 그려진 폭 100, 좌우 offset 50.
    const rect = { left: 0, top: 0, width: 200, height: 100 }
    expect(letterboxPoint(rect, 100, 100, 100, 50)).toEqual([0.5, 0.5]) // 중앙
    expect(letterboxPoint(rect, 100, 100, 0, 50)).toEqual([0, 0.5]) // 왼쪽 여백 → clamp 0
    expect(letterboxPoint(rect, 100, 100, 200, 50)).toEqual([1, 0.5]) // 오른쪽 여백 → clamp 1
  })

  it('rect.left/top offset 을 뺀다', () => {
    const rect = { left: 20, top: 10, width: 100, height: 100 }
    expect(letterboxPoint(rect, 100, 100, 70, 60)).toEqual([0.5, 0.5])
  })
})
