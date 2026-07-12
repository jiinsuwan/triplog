import { describe, it, expect } from 'vitest'
import {
  ticketSerial,
  ticketDday,
  dateValue,
  activityValue,
  parseDateTimeValue,
  stampTitle,
  memoryTags,
  memoryTone,
  MEMORY_TONES,
} from './homeTripPresenters.js'

// HomeView.spec가 못 닿는 사각지대(serial fallback·D-day·정렬 키 계산)를 순수 함수 단위로 검증.

describe('ticketSerial', () => {
  it('serial 이 있으면 그대로 쓴다', () => {
    expect(ticketSerial({ serial: 'TL-CUSTOM' })).toBe('TL-CUSTOM')
  })
  it('없으면 startDate 연도 + id(4자리 zero-pad)로 만든다', () => {
    expect(ticketSerial({ startDate: '2025-03-01', id: 42 })).toBe('TL-2025-0042')
  })
})

describe('ticketDday', () => {
  it('startDate 가 없으면 null', () => {
    expect(ticketDday({ status: 'PLANNING' })).toBeNull()
  })
  it('예정 여행은 시작일까지 남은 일수(양수)', () => {
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
    expect(ticketDday({ status: 'PLANNING', startDate: future })).toBeGreaterThan(0)
  })
})

describe('dateValue', () => {
  it('값이 없으면 맨 뒤로 밀리게 MAX', () => {
    expect(dateValue(null)).toBe(Number.MAX_SAFE_INTEGER)
  })
  it('날짜 문자열을 자정 timestamp로', () => {
    expect(dateValue('2025-01-01')).toBe(new Date('2025-01-01T00:00:00').getTime())
  })
})

describe('parseDateTimeValue', () => {
  it('T 없는 날짜는 자정으로 파싱', () => {
    expect(parseDateTimeValue('2025-06-15')).toBe(new Date('2025-06-15T00:00:00').getTime())
  })
  it('T 있는 값은 그대로 파싱', () => {
    expect(parseDateTimeValue('2025-06-15T12:30:00')).toBe(new Date('2025-06-15T12:30:00').getTime())
  })
  it('값이 없으면 NaN', () => {
    expect(Number.isNaN(parseDateTimeValue(null))).toBe(true)
  })
})

describe('activityValue', () => {
  it('updatedAt 을 우선한다', () => {
    expect(activityValue({ updatedAt: '2025-05-01', createdAt: '2024-01-01' })).toBe(
      new Date('2025-05-01T00:00:00').getTime(),
    )
  })
  it('날짜가 전혀 없으면 id 로 폴백', () => {
    expect(activityValue({ id: 7 })).toBe(7)
  })
})

describe('stampTitle / memoryTags / memoryTone', () => {
  it('stampTitle 은 region 앞 4글자, 없으면 TRIP', () => {
    expect(stampTitle({ region: '제주도여행' })).toBe('제주도여')
    expect(stampTitle({})).toBe('TRIP')
  })
  it('memoryTags 는 theme 있으면 배열, 없으면 빈 배열', () => {
    expect(memoryTags({ theme: '가족' })).toEqual(['가족'])
    expect(memoryTags({})).toEqual([])
  })
  it('memoryTone 은 인덱스를 톤 개수로 순환', () => {
    expect(memoryTone(0)).toBe(MEMORY_TONES[0])
    expect(memoryTone(MEMORY_TONES.length)).toBe(MEMORY_TONES[0])
  })
})
