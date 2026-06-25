import { describe, expect, it } from 'vitest'
import {
  addDays,
  applyTripTags,
  createDefaultTripForm,
  createTripFormFromTrip,
  parseTripTags,
  toTripPayload,
  tripDisplayTags,
  validateTripForm,
} from './tripForm'

describe('trip form 유틸', () => {
  it('기본 생성 폼은 시작일과 종료일, 자유 입력 지역/테마/status 를 가진다', () => {
    const form = createDefaultTripForm(new Date('2026-06-08T09:00:00'))

    expect(form).toMatchObject({
      title: '',
      startDate: '2026-06-08',
      endDate: '2026-06-10',
      region: '',
      theme: '',
      tags: [],
      status: 'planning',
    })
  })

  it('필수값 누락과 날짜 역전을 검증한다', () => {
    const errors = validateTripForm({
      title: '',
      startDate: '2026-06-10',
      endDate: '2026-06-08',
      region: '',
      theme: '',
      status: '',
    })

    expect(errors.title).toBe('여행 제목을 입력해주세요.')
    expect(errors.endDate).toBe('종료일은 시작일 이후로 선택해주세요.')
    expect(errors.region).toBe('지역을 입력해주세요.')
    expect(errors.theme).toBe('테마를 입력해주세요.')
    expect(errors.status).toBe('상태를 선택해주세요.')
  })

  it('지원하지 않는 status 값은 폼에서 막는다', () => {
    const errors = validateTripForm({
      title: '전주 여행',
      startDate: '2026-06-10',
      endDate: '2026-06-12',
      region: '전주',
      theme: '미식',
      status: 'PLANNING',
    })

    expect(errors.status).toBe('상태를 다시 선택해주세요.')
  })

  it('Trip 상세 응답을 수정 폼 초기값으로 변환한다', () => {
    const form = createTripFormFromTrip({
      title: '제주 바다 산책',
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      region: '제주',
      theme: '바다',
      status: 'past',
    })

    expect(form).toEqual({
      title: '제주 바다 산책',
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      region: '제주',
      theme: '바다',
      tags: [],
      status: 'past',
    })
  })

  it('API payload 는 제목 공백을 제거하고 백엔드 Trip 생성 계약을 맞춘다', () => {
    const payload = toTripPayload({
      title: '  제주 바다 산책  ',
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      region: '제주',
      theme: '바다',
      status: 'planning',
    })

    expect(payload).toEqual({
      title: '제주 바다 산책',
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      region: '제주',
      theme: '바다',
      status: 'planning',
    })
  })

  it('addDays 는 date-only 문자열을 유지한다', () => {
    expect(addDays('2026-06-08', 2)).toBe('2026-06-10')
  })

  it('해시태그 입력은 공백과 쉼표를 파싱하고 중복을 제거한다', () => {
    expect(parseTripTags('#바다멍 드라이브, #바다멍')).toEqual(['#바다멍', '#드라이브'])
  })

  it('표시용 태그는 사용자가 입력한 해시태그만 사용한다', () => {
    expect(tripDisplayTags({ tags: ['바다멍'], region: '제주', theme: '힐링' })).toEqual(['#바다멍'])
    expect(tripDisplayTags({ region: '제주', theme: '힐링' })).toEqual([])
  })

  it('해시태그는 Trip 응답에 없을 때 로컬 보조 저장값으로 복원한다', () => {
    const trip = { id: 100, title: '제주 여행' }

    applyTripTags(trip, ['바다멍', '#드라이브'])

    expect(tripDisplayTags({ id: 100, region: '제주', theme: '힐링' })).toEqual(['#바다멍', '#드라이브'])
  })
})
