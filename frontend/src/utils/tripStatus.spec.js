import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRIP_STATUS,
  isTripStatusSupported,
  isPastTripStatus,
  normalizeTripStatus,
  tripStatusLabel,
  tripStatusSeverity,
} from './tripStatus'

describe('trip status 유틸', () => {
  it('Trip.status 는 planning/upcoming/past canonical 값만 그대로 사용한다', () => {
    expect(normalizeTripStatus('planning')).toBe('planning')
    expect(normalizeTripStatus('upcoming')).toBe('upcoming')
    expect(normalizeTripStatus('past')).toBe('past')
  })

  it('지원하지 않는 값은 화면 기본값으로만 보정한다', () => {
    expect(normalizeTripStatus('PLANNING')).toBe(DEFAULT_TRIP_STATUS)
    expect(normalizeTripStatus('DONE')).toBe(DEFAULT_TRIP_STATUS)
    expect(isTripStatusSupported('PLANNING')).toBe(false)
    expect(isTripStatusSupported('planning')).toBe(true)
  })

  it('past 만 기록 워크스페이스 진입 대상으로 본다', () => {
    expect(isPastTripStatus('past')).toBe(true)
    expect(isPastTripStatus('planning')).toBe(false)
    expect(isPastTripStatus('upcoming')).toBe(false)
  })

  it('상태별 라벨과 태그 severity 를 제공한다', () => {
    expect(tripStatusLabel('planning')).toBe('계획 중')
    expect(tripStatusLabel('upcoming')).toBe('예정')
    expect(tripStatusLabel('past')).toBe('다녀옴')
    expect(tripStatusSeverity('planning')).toBe('info')
    expect(tripStatusSeverity('upcoming')).toBe('warning')
    expect(tripStatusSeverity('past')).toBe('success')
  })
})
