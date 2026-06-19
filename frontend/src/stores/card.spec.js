import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import {
  CARD_STEPS,
  MAX_CARD_PHOTOS,
  normalizeStepKey,
  nextStepKey,
  prevStepKey,
  togglePhotoSelection,
  useCardStore,
} from '@/stores/card'

describe('카드 위저드 step 모델', () => {
  it('단계는 고르기 → 에디터 2개', () => {
    expect(CARD_STEPS.map((step) => step.key)).toEqual(['pick', 'editor'])
  })

  describe('normalizeStepKey — 외부 입력(쿼리) 정규화', () => {
    it('유효 키는 그대로 둔다', () => {
      expect(normalizeStepKey('pick')).toBe('pick')
      expect(normalizeStepKey('editor')).toBe('editor')
    })

    it('미지정·미지의 값·비문자열은 첫 단계로 떨군다', () => {
      expect(normalizeStepKey(undefined)).toBe('pick')
      expect(normalizeStepKey('')).toBe('pick')
      expect(normalizeStepKey('xxx')).toBe('pick')
      expect(normalizeStepKey(['editor'])).toBe('pick')
    })
  })

  describe('next/prevStepKey — 경계 clamp', () => {
    it('next 는 마지막 단계에서 더 나아가지 않는다', () => {
      expect(nextStepKey('pick')).toBe('editor')
      expect(nextStepKey('editor')).toBe('editor')
    })

    it('prev 는 첫 단계에서 더 물러나지 않는다', () => {
      expect(prevStepKey('editor')).toBe('pick')
      expect(prevStepKey('pick')).toBe('pick')
    })

    it('알 수 없는 키는 첫 단계 기준으로 계산한다', () => {
      expect(nextStepKey('xxx')).toBe('editor')
      expect(prevStepKey('xxx')).toBe('pick')
    })
  })
})

describe('togglePhotoSelection — 사진 선택 토글(순수함수)', () => {
  it('선택 안 된 사진은 추가한다', () => {
    expect(togglePhotoSelection([1, 2], 3, 10)).toEqual({ ids: [1, 2, 3], blocked: false })
  })

  it('이미 선택된 사진은 해제한다', () => {
    expect(togglePhotoSelection([1, 2, 3], 2, 10)).toEqual({ ids: [1, 3], blocked: false })
  })

  it('한도에 도달하면 새 추가를 막고 blocked 를 돌려준다', () => {
    const full = [1, 2, 3]
    expect(togglePhotoSelection(full, 4, 3)).toEqual({ ids: [1, 2, 3], blocked: true })
  })

  it('한도에 도달해도 이미 선택된 사진의 해제는 허용한다', () => {
    expect(togglePhotoSelection([1, 2, 3], 2, 3)).toEqual({ ids: [1, 3], blocked: false })
  })

  it('원본 배열을 변형하지 않는다', () => {
    const original = [1, 2]
    togglePhotoSelection(original, 3, 10)
    expect(original).toEqual([1, 2])
  })
})

describe('useCardStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  describe('startForTrip', () => {
    it('유효 tripId 는 숫자로 저장하고 선택을 초기화한다', () => {
      const card = useCardStore()
      card.photoIds = [9, 8]
      card.startForTrip('12')
      expect(card.selectedTripId).toBe(12)
      expect(card.photoIds).toEqual([])
    })

    it('무효 tripId(0·음수·비숫자·미지정)는 null 로 둔다', () => {
      const card = useCardStore()
      for (const bad of ['0', '-3', 'abc', undefined]) {
        card.startForTrip(bad)
        expect(card.selectedTripId).toBeNull()
      }
    })
  })

  describe('togglePhoto', () => {
    it('추가/해제하며 카운트·한도 게터가 따라온다', () => {
      const card = useCardStore()
      expect(card.togglePhoto(1)).toBe(false)
      expect(card.togglePhoto(2)).toBe(false)
      expect(card.selectedCount).toBe(2)
      expect(card.atPhotoLimit).toBe(false)
      expect(card.togglePhoto(1)).toBe(false) // 해제
      expect(card.photoIds).toEqual([2])
    })

    it('한도(10장)에 도달하면 새 추가를 막고 true 를 돌려준다', () => {
      const card = useCardStore()
      for (let i = 1; i <= MAX_CARD_PHOTOS; i += 1) card.togglePhoto(i)
      expect(card.atPhotoLimit).toBe(true)
      expect(card.togglePhoto(99)).toBe(true)
      expect(card.selectedCount).toBe(MAX_CARD_PHOTOS)
    })
  })
})
