export const TRIP_STATUS = Object.freeze({
  PLANNING: 'planning',
  UPCOMING: 'upcoming',
  PAST: 'past',
})

export const DEFAULT_TRIP_STATUS = TRIP_STATUS.PLANNING

export const STATUS_OPTIONS = [
  { label: '계획 중', value: TRIP_STATUS.PLANNING },
  { label: '예정', value: TRIP_STATUS.UPCOMING },
  { label: '다녀옴', value: TRIP_STATUS.PAST },
]

export function normalizeTripStatus(status = DEFAULT_TRIP_STATUS) {
  const value = String(status ?? '').trim()
  return Object.values(TRIP_STATUS).includes(value) ? value : DEFAULT_TRIP_STATUS
}

export function isTripStatusSupported(status) {
  const value = String(status ?? '').trim()
  return Object.values(TRIP_STATUS).includes(value)
}

export function isPastTripStatus(status) {
  return normalizeTripStatus(status) === TRIP_STATUS.PAST
}

export function tripStatusLabel(status) {
  return STATUS_OPTIONS.find((option) => option.value === normalizeTripStatus(status))?.label ?? '계획 중'
}

export function tripStatusSeverity(status) {
  switch (normalizeTripStatus(status)) {
    case TRIP_STATUS.PAST:
      return 'success'
    case TRIP_STATUS.UPCOMING:
      return 'warning'
    default:
      return 'info'
  }
}
