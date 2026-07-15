// HomeView 홈 화면의 순수 프리젠터·날짜 유틸 — 여행/메모리 티켓·스탬프 표시값 계산.
// 컴포넌트 밖 순수 함수라 D-day·serial fallback 등 계산을 단위 테스트로 직접 검증한다.
import { isPastTripStatus } from '@/utils/tripStatus'
import { getTripTicketColor } from '@/utils/tripTicket'
import { tripDisplayTags } from '@/utils/tripForm'

// 메모리(과거 여행) 폴라로이드 배경 톤 3종.
export const MEMORY_TONES = [
  'radial-gradient(80% 70% at 60% 35%, #d39a5a, #9a4b2a 60%, #5a2c18)',
  'radial-gradient(80% 70% at 40% 40%, #7bb0ad, #3d8079 60%, #235650)',
  'radial-gradient(80% 70% at 50% 30%, #8a6a9e, #4a3566 65%, #2a1d3e)',
]

export function ticketStatus(trip) {
  return isPastTripStatus(trip.status) ? 'MEMORY TICKET' : 'TRIP TICKET'
}

export function ticketSerial(trip) {
  if (trip.serial) return trip.serial
  const year = trip.startDate?.slice(0, 4) || new Date().getFullYear()
  return `TL-${year}-${String(trip.id).padStart(4, '0')}`
}

export function ticketColor(trip, index = 0) {
  return getTripTicketColor(trip, index)
}

export function ticketDday(trip) {
  if (!trip?.startDate || isPastTripStatus(trip.status)) return null
  const today = new Date()
  const target = new Date(`${trip.startDate}T00:00:00`)
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.ceil((target - today) / 86400000))
}

export function tripTags(trip) {
  return tripDisplayTags(trip)
}

export function memoryTags(memory) {
  return memory.theme ? [memory.theme] : []
}

export function stampTitle(trip) {
  return (trip.region || 'TRIP').slice(0, 4)
}

export function memoryTone(index) {
  return MEMORY_TONES[index % MEMORY_TONES.length]
}

// 날짜(YYYY-MM-DD 등) → 정렬용 timestamp. 값 없으면 맨 뒤로 밀리게 MAX.
export function dateValue(value) {
  if (!value) return Number.MAX_SAFE_INTEGER
  return new Date(`${value}T00:00:00`).getTime()
}

// 여행의 "활동 최신순" 정렬 키 — 수정/생성/여행일 중 있는 것, 없으면 id.
export function activityValue(trip) {
  const value = trip.updatedAt || trip.modifiedAt || trip.createdAt || trip.startDate || trip.endDate
  const timestamp = parseDateTimeValue(value)
  if (Number.isFinite(timestamp)) return timestamp
  return Number(trip.id) || 0
}

export function parseDateTimeValue(value) {
  if (!value) return Number.NaN
  const normalizedValue = String(value)
  const dateText = normalizedValue.includes('T') ? normalizedValue : `${normalizedValue}T00:00:00`
  return new Date(dateText).getTime()
}
