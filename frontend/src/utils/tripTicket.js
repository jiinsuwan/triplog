import { isPastTripStatus } from './tripStatus'

export const TRIP_TICKET_COLORS = ['mustard', 'blue', 'sage', 'burgundy', 'plum']

function fallbackSeed(trip, fallbackIndex = 0) {
  const source = `${trip?.title ?? ''}${trip?.region ?? ''}${trip?.startDate ?? ''}`
  if (!source) return fallbackIndex

  return [...source].reduce((sum, char) => sum + char.charCodeAt(0), fallbackIndex)
}

export function getTripTicketColor(trip, fallbackIndex = 0) {
  if (isPastTripStatus(trip?.status)) return 'khaki'

  const numericId = Number(trip?.id)
  const seed = Number.isFinite(numericId) ? numericId : fallbackSeed(trip, fallbackIndex)

  return TRIP_TICKET_COLORS[Math.abs(Math.trunc(seed)) % TRIP_TICKET_COLORS.length]
}
