export const TIMELINE_START_HOUR = 9
export const TIMELINE_END_HOUR = 21
export const TIMELINE_HOUR_HEIGHT_PX = 88
export const TIMELINE_MINUTES_PER_STEP = 15
export const MIN_STAY_MINUTES = 30

export function orderTimelineStops(stops = [], getDraft = () => ({}), dragState = null) {
  return [...stops].sort((left, right) => {
    const leftTime = selectedTimeToMinutes(getDraft(left).selectedTime || left.selectedTime)
    const rightTime = selectedTimeToMinutes(getDraft(right).selectedTime || right.selectedTime)
    const dragOrder = overlappingDragOrder(left, right, leftTime, rightTime, getDraft, dragState)
    if (dragOrder) return dragOrder
    return (leftTime ?? fallbackStopMinutes(left)) - (rightTime ?? fallbackStopMinutes(right)) ||
      Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0) ||
      Number(left.id ?? 0) - Number(right.id ?? 0)
  })
}

export function nextRouteStartTime(stops = [], getDraft = () => ({}), dragState = null) {
  const orderedStops = orderTimelineStops(stops, getDraft, dragState)
  if (!orderedStops.length) return minutesToSelectedTime(TIMELINE_START_HOUR * 60)

  const lastStop = orderedStops.at(-1)
  const lastMinutes = selectedTimeToMinutes(getDraft(lastStop).selectedTime || lastStop.selectedTime) ??
    fallbackStopMinutes(lastStop)
  const maxStart = TIMELINE_END_HOUR * 60 - MIN_STAY_MINUTES
  return minutesToSelectedTime(Math.min(maxStart, lastMinutes + 120))
}

export function buildTimelineLayout(stops = [], getDraft = () => ({})) {
  const layout = new Map()
  let cursor = 0
  stops.forEach((stop) => {
    const rawTop = selectedTimeToTop(getDraft(stop).selectedTime || stop.selectedTime)
    const height = stopTimelineHeight(stop, getDraft)
    const top = Math.max(rawTop, cursor)
    layout.set(stop.id, { top, height })
    cursor = top + height
  })
  return layout
}

export function timelineBaseHeight() {
  return (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * TIMELINE_HOUR_HEIGHT_PX + 90
}

export function timelineHourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`
}

export function timelineHourStyle(hour) {
  return { top: `${Math.max(0, hour - TIMELINE_START_HOUR) * TIMELINE_HOUR_HEIGHT_PX}px` }
}

export function selectedTimeToMinutes(value) {
  const [hour, minute] = String(value || '').split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

export function minutesToSelectedTime(minutes) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)))
  const hour = Math.floor(clamped / 60)
  const minute = clamped % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function roundToTimelineStep(minutes) {
  return Math.round(minutes / TIMELINE_MINUTES_PER_STEP) * TIMELINE_MINUTES_PER_STEP
}

export function selectedTimeToTop(value) {
  const minutes = selectedTimeToMinutes(value) ?? TIMELINE_START_HOUR * 60
  return (Math.max(0, minutes - TIMELINE_START_HOUR * 60) / 60) * TIMELINE_HOUR_HEIGHT_PX
}

export function topToSelectedTime(top) {
  const maxMinutes = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60
  const minutesFromStart = Math.max(
    0,
    Math.min(maxMinutes, roundToTimelineStep((top / TIMELINE_HOUR_HEIGHT_PX) * 60)),
  )
  return minutesToSelectedTime(TIMELINE_START_HOUR * 60 + minutesFromStart)
}

export function stopStayMinutes(stop, getDraft = () => ({})) {
  const draftMinutes = Number(getDraft(stop).stayMinutes)
  if (Number.isFinite(draftMinutes) && draftMinutes >= MIN_STAY_MINUTES) return draftMinutes
  return stayMinutesFromMemo(stop.memo)
}

export function stopTimelineHeight(stop, getDraft = () => ({})) {
  return Math.max(72, Math.round((stopStayMinutes(stop, getDraft) / 60) * TIMELINE_HOUR_HEIGHT_PX))
}

export function stayMinutesFromMemo(memo) {
  const text = String(memo || '')
  const hourMatch = text.match(/(\d+)\s*시간/)
  const minuteMatch = text.match(/(\d+)\s*분/)
  const minutes = (hourMatch ? Number(hourMatch[1]) * 60 : 0) +
    (minuteMatch ? Number(minuteMatch[1]) : 0)
  return Math.max(MIN_STAY_MINUTES, minutes || 60)
}

export function formatStayMinutes(minutes) {
  const safeMinutes = Math.max(MIN_STAY_MINUTES, Number(minutes) || 60)
  const hours = Math.floor(safeMinutes / 60)
  const rest = safeMinutes % 60
  if (!hours) return rest + '분'
  return rest ? hours + '시간 ' + rest + '분' : hours + '시간'
}

export function stayMemoFromMinutes(minutes) {
  return '머무는 시간 ' + formatStayMinutes(minutes)
}

function fallbackStopMinutes(stop) {
  return TIMELINE_START_HOUR * 60 + Math.max(0, Number(stop?.sortOrder ?? 1) - 1) * 90
}

function overlappingDragOrder(left, right, leftTime, rightTime, getDraft, dragState) {
  if (dragState?.type !== 'move' || !dragState.stop) return 0
  const leftIsDragged = String(left.id) === String(dragState.stop.id)
  const rightIsDragged = String(right.id) === String(dragState.stop.id)
  if (leftIsDragged === rightIsDragged) return 0

  const dragged = leftIsDragged ? left : right
  const other = leftIsDragged ? right : left
  const draggedStart = (leftIsDragged ? leftTime : rightTime) ?? fallbackStopMinutes(dragged)
  const otherStart = (leftIsDragged ? rightTime : leftTime) ?? fallbackStopMinutes(other)
  const overlaps = draggedStart < otherStart + stopStayMinutes(other, getDraft) &&
    draggedStart + stopStayMinutes(dragged, getDraft) > otherStart
  if (!overlaps) return 0

  const draggedAfterOther = dragState.moveDirection >= 0
  if (leftIsDragged) return draggedAfterOther ? 1 : -1
  return draggedAfterOther ? -1 : 1
}
