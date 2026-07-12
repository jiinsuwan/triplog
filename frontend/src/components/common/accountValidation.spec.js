import { describe, it, expect } from 'vitest'
import { validateNickname, extractApiMessage } from './accountValidation.js'

// AccountDialog.spec가 못 닿는 사각지대(50자 초과·무변경·trim)를 순수 함수로 검증.

describe('validateNickname', () => {
  it('빈값·공백만 있으면 입력 요구 에러', () => {
    expect(validateNickname('', 'old')).toMatchObject({ ok: false, error: '닉네임을 입력하세요.' })
    expect(validateNickname('   ', 'old')).toMatchObject({ ok: false, error: '닉네임을 입력하세요.' })
  })

  it('50자 초과는 길이 에러', () => {
    expect(validateNickname('a'.repeat(51), 'old')).toMatchObject({
      ok: false,
      error: '닉네임은 50자 이하여야 합니다.',
    })
  })

  it('정확히 50자는 허용', () => {
    expect(validateNickname('a'.repeat(50), 'old')).toMatchObject({ ok: true })
  })

  it('현재 닉네임과 같으면 unchanged(저장 없이 종료)', () => {
    expect(validateNickname('same', 'same')).toMatchObject({ ok: false, unchanged: true })
  })

  it('trim 후 유효하면 정리된 값을 반환', () => {
    expect(validateNickname('  새이름  ', 'old')).toMatchObject({ ok: true, value: '새이름' })
  })
})

describe('extractApiMessage', () => {
  it('서버 메시지가 있으면 그것을 쓴다', () => {
    expect(extractApiMessage({ response: { data: { message: '서버 오류' } } }, 'fb')).toBe('서버 오류')
  })
  it('없으면 fallback', () => {
    expect(extractApiMessage(new Error('x'), 'fb')).toBe('fb')
    expect(extractApiMessage(null, 'fb')).toBe('fb')
  })
})
