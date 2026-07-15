import { describe, it, expect } from 'vitest'
import { statusTag, isUploading, takenAtLabel, isFailed } from './photoUploadPresenters.js'
import { QueueStatus } from '@/composables/useUploadQueue'

// 무커버 화면 PhotoView의 표시 로직 회귀 테스트(순수 함수).

describe('statusTag', () => {
  it('진행 상태별 배지', () => {
    expect(statusTag({ status: QueueStatus.PENDING })).toEqual({ label: '대기 중', severity: 'secondary' })
    expect(statusTag({ status: QueueStatus.UPLOADING, progress: 42 })).toEqual({
      label: '업로드 중 42%',
      severity: 'info',
    })
    expect(statusTag({ status: QueueStatus.LINKING })).toEqual({ label: '연결 중', severity: 'info' })
    expect(statusTag({ status: QueueStatus.LINKED })).toEqual({ label: '연결됨', severity: 'success' })
  })

  it('실패·거부는 사유 문구, 없으면 기본 문구', () => {
    expect(statusTag({ status: QueueStatus.FAILED, error: { message: '네트워크 오류' } })).toEqual({
      label: '네트워크 오류',
      severity: 'danger',
    })
    expect(statusTag({ status: QueueStatus.FAILED })).toEqual({ label: '실패', severity: 'danger' })
    expect(statusTag({ status: QueueStatus.REJECTED })).toEqual({ label: '업로드 불가', severity: 'warn' })
  })

  it('알 수 없는 상태는 그대로 표시', () => {
    expect(statusTag({ status: 'WEIRD' })).toEqual({ label: 'WEIRD', severity: 'secondary' })
  })
})

describe('isUploading', () => {
  it('업로드/연결 중만 true', () => {
    expect(isUploading({ status: QueueStatus.UPLOADING })).toBe(true)
    expect(isUploading({ status: QueueStatus.LINKING })).toBe(true)
    expect(isUploading({ status: QueueStatus.LINKED })).toBe(false)
    expect(isUploading({ status: QueueStatus.PENDING })).toBe(false)
  })
})

describe('isFailed', () => {
  it('FAILED 만 true(재시도 버튼 표시 조건)', () => {
    expect(isFailed({ status: QueueStatus.FAILED })).toBe(true)
    expect(isFailed({ status: QueueStatus.REJECTED })).toBe(false)
    expect(isFailed({ status: QueueStatus.LINKED })).toBe(false)
  })
})

describe('takenAtLabel', () => {
  it('ISO 촬영시각을 날짜·분까지', () => {
    expect(takenAtLabel({ takenAt: '2026-06-04T12:17:56' })).toBe('🕐 2026-06-04 12:17')
  })
  it('없으면 시간 없음', () => {
    expect(takenAtLabel({})).toBe('🕐 시간 없음')
    expect(takenAtLabel({ takenAt: null })).toBe('🕐 시간 없음')
  })
})
