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

export const DEFAULT_TRIP_STATUS = 'PLANNING'

export function createDefaultTripForm(today = new Date()) {
  const startDate = toDateOnly(today)
  return {
    title: '',
    startDate,
    endDate: addDays(startDate, 2),
    region: REGION_OPTIONS[0].value,
    theme: THEME_OPTIONS[0].value,
    status: DEFAULT_TRIP_STATUS,
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

  if (!form.region) {
    errors.region = '지역을 선택해주세요.'
  }

  if (!form.theme) {
    errors.theme = '테마를 선택해주세요.'
  }

  return errors
}

export function toTripPayload(form) {
  return {
    title: form.title.trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    region: form.region,
    theme: form.theme,
    status: form.status || DEFAULT_TRIP_STATUS,
  }
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
