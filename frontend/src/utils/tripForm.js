import {
  DEFAULT_TRIP_STATUS,
  STATUS_OPTIONS,
  isTripStatusSupported,
  normalizeTripStatus,
} from './tripStatus'

export { DEFAULT_TRIP_STATUS, STATUS_OPTIONS }

export const REGION_OPTIONS = [
  { label: '전주', value: '전주' },
  { label: '제주', value: '제주' },
  { label: '부산', value: '부산' },
  { label: '서울', value: '서울' },
]

export const THEME_OPTIONS = [
  { label: '미식', value: '미식' },
  { label: '바다', value: '바다' },
  { label: '골목', value: '골목' },
  { label: '휴식', value: '휴식' },
]

export function createDefaultTripForm(today = new Date()) {
  const startDate = toDateOnly(today)
  return {
    title: '',
    startDate,
    endDate: addDays(startDate, 2),
    region: '',
    theme: '',
    tags: [],
    status: DEFAULT_TRIP_STATUS,
  }
}

export function createTripFormFromTrip(trip) {
  return {
    title: trip?.title ?? '',
    startDate: trip?.startDate ?? '',
    endDate: trip?.endDate ?? '',
    region: trip?.region ?? '',
    theme: trip?.theme ?? '',
    tags: Array.isArray(trip?.tags) ? [...trip.tags] : loadTripTags(trip?.id),
    status: normalizeTripStatus(trip?.status ?? DEFAULT_TRIP_STATUS),
  }
}

export function validateTripForm(form) {
  const errors = {}

  if (!form.title?.trim()) {
    errors.title = '여행 제목을 입력해주세요.'
  } else if (form.title.trim().length > 100) {
    errors.title = '여행 제목은 100자 이하로 입력해주세요.'
  }

  if (!form.startDate) {
    errors.startDate = '시작일을 선택해주세요.'
  }

  if (!form.endDate) {
    errors.endDate = '종료일을 선택해주세요.'
  }

  if (form.startDate && form.endDate && form.startDate > form.endDate) {
    errors.endDate = '종료일은 시작일 이후로 선택해주세요.'
  }

  if (!form.region?.trim()) {
    errors.region = '지역을 입력해주세요.'
  }

  if (!form.theme?.trim()) {
    errors.theme = '테마를 입력해주세요.'
  }

  if (!form.status) {
    errors.status = '상태를 선택해주세요.'
  } else if (!isTripStatusSupported(form.status)) {
    errors.status = '상태를 다시 선택해주세요.'
  }

  return errors
}

export function toTripPayload(form) {
  return {
    title: form.title.trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    region: form.region.trim(),
    theme: form.theme.trim(),
    status: form.status?.trim() || DEFAULT_TRIP_STATUS,
  }
}

const TRIP_TAG_STORAGE_PREFIX = 'triplog.trip.tags.'

export function normalizeTripTag(value) {
  const trimmed = String(value ?? '')
    .trim()
    .replace(/^#+/, '')

  return trimmed ? `#${trimmed}` : ''
}

export function parseTripTags(value) {
  const seen = new Set()

  return String(value ?? '')
    .split(/[\s,]+/)
    .map(normalizeTripTag)
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false
      seen.add(tag)
      return true
    })
}

export function loadTripTags(tripId) {
  if (!tripId || typeof window === 'undefined' || !window.localStorage) return []

  try {
    return parseTripTags(window.localStorage.getItem(`${TRIP_TAG_STORAGE_PREFIX}${tripId}`) || '')
  } catch {
    return []
  }
}

export function saveTripTags(tripId, tags = []) {
  if (!tripId || typeof window === 'undefined' || !window.localStorage) return

  const normalizedTags = parseTripTags(tags.join(' '))

  try {
    if (normalizedTags.length) {
      window.localStorage.setItem(`${TRIP_TAG_STORAGE_PREFIX}${tripId}`, normalizedTags.join(' '))
    } else {
      window.localStorage.removeItem(`${TRIP_TAG_STORAGE_PREFIX}${tripId}`)
    }
  } catch {
    // localStorage 사용이 막힌 환경에서는 태그 저장만 건너뜁니다.
  }
}

export function applyTripTags(trip, tags = []) {
  const normalizedTags = parseTripTags(tags.join(' '))
  saveTripTags(trip?.id, normalizedTags)
  if (!trip) return trip

  trip.tags = normalizedTags
  return trip
}

export function tripDisplayTags(source) {
  const explicitTags = Array.isArray(source?.tags)
    ? source.tags.map(normalizeTripTag).filter(Boolean)
    : []

  if (explicitTags.length) return explicitTags

  return loadTripTags(source?.id)
}

export function toDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toDateOnly(date)
}

export function formatTripDateRange(trip) {
  if (!trip?.startDate || !trip?.endDate) return '날짜 미정'
  return `${trip.startDate.replaceAll('-', '.')} - ${trip.endDate.replaceAll('-', '.')}`
}

export function tripDurationDays(trip) {
  if (!trip?.startDate || !trip?.endDate) return 0
  const start = new Date(`${trip.startDate}T00:00:00`)
  const end = new Date(`${trip.endDate}T00:00:00`)
  return Math.max(1, Math.round((end - start) / 86400000) + 1)
}
