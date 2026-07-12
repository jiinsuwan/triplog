// PhotoView 업로드 화면의 순수 표시 헬퍼 — 큐 아이템 → 배지·라벨(DOM·API 무관).
// PhotoView.vue 자체는 커버 테스트가 없으므로, 이 표시 로직만이라도 단위 테스트로 회귀를 잡는다.
import { QueueStatus } from '@/composables/useUploadQueue'

// 업로드 큐 상태 → 배지 { label, severity }. 실패·거부는 사유 문구를 그대로 노출한다.
export function statusTag(item) {
  switch (item.status) {
    case QueueStatus.PENDING:
      return { label: '대기 중', severity: 'secondary' }
    case QueueStatus.UPLOADING:
      return { label: `업로드 중 ${item.progress}%`, severity: 'info' }
    case QueueStatus.LINKING:
      return { label: '연결 중', severity: 'info' }
    case QueueStatus.LINKED:
      return { label: '연결됨', severity: 'success' }
    case QueueStatus.FAILED:
      return { label: item.error?.message ?? '실패', severity: 'danger' }
    case QueueStatus.REJECTED:
      return { label: item.error?.message ?? '업로드 불가', severity: 'warn' }
    default:
      return { label: item.status, severity: 'secondary' }
  }
}

export const isUploading = (item) =>
  item.status === QueueStatus.UPLOADING || item.status === QueueStatus.LINKING

// EXIF 촬영시각 ISO "2026-06-04T12:17:56" → "🕐 2026-06-04 12:17", 없으면 "🕐 시간 없음".
export function takenAtLabel(item) {
  if (!item.takenAt) return '🕐 시간 없음'
  return `🕐 ${item.takenAt.slice(0, 16).replace('T', ' ')}`
}
