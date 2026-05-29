import { describe, it, expect } from 'vitest'
import { formatDate } from './datetime'

describe('formatDate', () => {
  it('Date 객체를 YYYY-MM-DD 로 변환한다', () => {
    expect(formatDate(new Date('2026-05-29T10:00:00'))).toBe('2026-05-29')
  })

  it('월/일을 0으로 패딩한다', () => {
    expect(formatDate(new Date('2026-01-05T00:00:00'))).toBe('2026-01-05')
  })

  it('유효하지 않은 값이면 에러를 던진다', () => {
    expect(() => formatDate('not-a-date')).toThrow()
  })
})
