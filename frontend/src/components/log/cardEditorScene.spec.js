import { describe, it, expect } from 'vitest'

import { applyOverrides } from '@/components/log/cardEditorScene'

// 크롭·캔버스가 항등이면 캔버스 정규화 = 콘텐츠 정규화.
const IDENTITY_CR = { dx: 0, dy: 0, cw: 1, ch: 1 }
const IDENTITY_CD = { W: 1, H: 1 }

describe('applyOverrides — 문구/마무리 override → buildScene 입력', () => {
  it('위치·기울기 override 가 없으면 원본 객체를 그대로(동일 참조) 반환', () => {
    const obj = { itemId: 3, text: '안녕' }
    expect(applyOverrides(obj, null, 0, IDENTITY_CR, IDENTITY_CD)).toBe(obj)
  })

  it('위치 override 는 캔버스 정규화를 콘텐츠 정규화로 환산한다', () => {
    const obj = { itemId: 1 }
    // p 를 콘텐츠 크롭 기준으로 환산: x=(px*W - dx)/cw.
    const cr = { dx: 10, dy: 20, cw: 80, ch: 60 }
    const cd = { W: 100, H: 100 }
    const out = applyOverrides(obj, { x: 1, y: 1 }, 0, cr, cd)
    expect(out.position).toEqual({ x: (100 - 10) / 80, y: (100 - 20) / 60 })
    expect(out.itemId).toBe(1) // 다른 필드 보존
    expect(out).not.toBe(obj) // 새 객체
  })

  it('항등 크롭·캔버스에서는 위치가 그대로 통과한다', () => {
    const out = applyOverrides({ itemId: 2 }, { x: 0.3, y: 0.7 }, 0, IDENTITY_CR, IDENTITY_CD)
    expect(out.position).toEqual({ x: 0.3, y: 0.7 })
  })

  it('기울기 override 는 rotation 으로 붙고 0 은 무시한다', () => {
    expect(applyOverrides({ itemId: 1 }, null, 30, IDENTITY_CR, IDENTITY_CD).rotation).toBe(30)
    expect(applyOverrides({ itemId: 1 }, null, 0, IDENTITY_CR, IDENTITY_CD).rotation).toBeUndefined()
  })

  it('위치·기울기 동시 적용', () => {
    const out = applyOverrides({ itemId: 9 }, { x: 0.5, y: 0.5 }, -45, IDENTITY_CR, IDENTITY_CD)
    expect(out.position).toEqual({ x: 0.5, y: 0.5 })
    expect(out.rotation).toBe(-45)
    expect(out.itemId).toBe(9)
  })
})
