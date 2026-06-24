import { describe, it, expect } from 'vitest'

import { PHOTO_SETTING_DEFAULTS, resolvePhotoSettings } from './photoSettings'

describe('photoSettings — 사진별 편집 설정 해석', () => {
  it('저장본이 없으면 전부 기본값', () => {
    expect(resolvePhotoSettings(undefined)).toEqual(PHOTO_SETTING_DEFAULTS)
    expect(resolvePhotoSettings(null)).toEqual(PHOTO_SETTING_DEFAULTS)
  })

  it('저장본이 있으면 그 값으로 복원', () => {
    const saved = {
      toneDown: 0.1,
      format: 'fixed',
      outlineWidth: 3,
      outlineStyle: 'dashed',
      dashLen: 20,
      dashGap: 4,
      padFill: 'solid',
      padColor: '#000000',
      fontFamily: 'Ownglyph hani',
      fontScale: 1.4,
    }
    expect(resolvePhotoSettings(saved)).toEqual(saved)
  })

  it('일부만 저장돼 있으면 나머지는 기본값(키 추가 대비)', () => {
    const r = resolvePhotoSettings({ format: 'fixed' })
    expect(r.format).toBe('fixed')
    expect(r.toneDown).toBe(PHOTO_SETTING_DEFAULTS.toneDown)
    expect(r.padColor).toBe(PHOTO_SETTING_DEFAULTS.padColor)
  })

  it('사진별 격리 — 한 사진만 저장본이 있어도 다른 사진은 기본값', () => {
    const store = { 1: { format: 'fixed', toneDown: 0.5 } }
    expect(resolvePhotoSettings(store[1]).format).toBe('fixed')
    expect(resolvePhotoSettings(store[1]).toneDown).toBe(0.5)
    expect(resolvePhotoSettings(store[2]).format).toBe('native') // 미저장 사진 = 기본
    expect(resolvePhotoSettings(store[2]).toneDown).toBe(PHOTO_SETTING_DEFAULTS.toneDown)
  })

  it('해석 결과는 기본값 객체를 변형하지 않는다', () => {
    const r = resolvePhotoSettings({ format: 'fixed' })
    r.format = 'square'
    expect(PHOTO_SETTING_DEFAULTS.format).toBe('native')
  })
})
