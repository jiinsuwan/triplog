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

  describe('setPhotoIds', () => {
    it('배치된 사진 id 를 카드 대상으로 설정한다(복사본)', () => {
      const card = useCardStore()
      const ids = [3, 7, 9]
      card.setPhotoIds(ids)
      expect(card.photoIds).toEqual([3, 7, 9])
      ids.push(99)
      expect(card.photoIds).toEqual([3, 7, 9]) // 원본 변형이 새도 영향 없음(복사)
    })

    it('배열이 아니면 빈 배열로 둔다', () => {
      const card = useCardStore()
      card.setPhotoIds(null)
      expect(card.photoIds).toEqual([])
    })
  })

  describe('setOutline / setCaption — 폴링·문구 결과 보관(불변 갱신)', () => {
    it('setOutline — 새 키 추가가 기존 키를 보존하고 새 참조로 갱신한다', () => {
      const card = useCardStore()
      card.setOutline(1, { status: 'READY', items: [] })
      const first = card.outlines
      card.setOutline(2, { status: 'FAILED', items: null })
      expect(card.outlines[1]).toEqual({ status: 'READY', items: [] })
      expect(card.outlines[2]).toEqual({ status: 'FAILED', items: null })
      expect(card.outlines).not.toBe(first)
    })

    it('setCaption — 세션 캐시에 결과를 보관한다(같은 사진 재호출 방지용)', () => {
      const card = useCardStore()
      const data = { response: { objects: [], closing: null }, warnings: [] }
      card.setCaption(7, data)
      expect(card.captions[7]).toEqual(data)
    })
  })
})
