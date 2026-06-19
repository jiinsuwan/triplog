import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import {
  CARD_STEPS,
  normalizeStepKey,
  nextStepKey,
  prevStepKey,
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

  describe('useCardStore.startForTrip', () => {
    beforeEach(() => setActivePinia(createPinia()))

    it('유효 tripId 는 숫자로 저장한다', () => {
      const card = useCardStore()
      card.startForTrip('12')
      expect(card.selectedTripId).toBe(12)
    })

    it('무효 tripId(0·음수·비숫자·미지정)는 null 로 둔다', () => {
      const card = useCardStore()
      card.startForTrip('0')
      expect(card.selectedTripId).toBeNull()
      card.startForTrip('-3')
      expect(card.selectedTripId).toBeNull()
      card.startForTrip('abc')
      expect(card.selectedTripId).toBeNull()
      card.startForTrip(undefined)
      expect(card.selectedTripId).toBeNull()
    })
  })
})
