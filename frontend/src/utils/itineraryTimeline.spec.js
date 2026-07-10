import { describe, expect, it } from 'vitest'
import {
  buildTimelineLayout,
  formatStayMinutes,
  minutesToSelectedTime,
  nextRouteStartTime,
  orderTimelineStops,
  roundToTimelineStep,
  selectedTimeToMinutes,
  selectedTimeToTop,
  stayMinutesFromMemo,
  stopTimelineHeight,
  topToSelectedTime,
} from './itineraryTimeline'

describe('itineraryTimeline', () => {
  const stops = [
    { id: 1, sortOrder: 1, selectedTime: '10:00', memo: '머무는 시간 1시간' },
    { id: 2, sortOrder: 2, selectedTime: '11:30', memo: '머무는 시간 30분' },
  ]
  const drafts = new Map()
  const getDraft = (stop) => drafts.get(stop.id) || {}

  it('converts drag positions to 15 minute timeline steps', () => {
    expect(roundToTimelineStep(38)).toBe(45)
    expect(topToSelectedTime(44)).toBe('09:30')
    expect(selectedTimeToTop('10:30')).toBe(132)
    expect(selectedTimeToMinutes(minutesToSelectedTime(615))).toBe(615)
  })

  it('uses draft stay duration to calculate resize height', () => {
    drafts.set(1, { stayMinutes: 90 })
    expect(stopTimelineHeight(stops[0], getDraft)).toBe(132)
    expect(stayMinutesFromMemo('머무는 시간 2시간 15분')).toBe(135)
    expect(formatStayMinutes(135)).toBe('2시간 15분')
  })

  it('places overlapping cards sequentially in the layout', () => {
    drafts.set(1, { selectedTime: '10:00', stayMinutes: 90 })
    drafts.set(2, { selectedTime: '10:30', stayMinutes: 30 })
    const layout = buildTimelineLayout(stops, getDraft)
    expect(layout.get(1)).toEqual({ top: 88, height: 132 })
    expect(layout.get(2).top).toBe(220)
  })

  it('moves the dragged stop across an overlapping neighbor according to direction', () => {
    drafts.set(1, { selectedTime: '10:45', stayMinutes: 60 })
    drafts.set(2, { selectedTime: '11:00', stayMinutes: 60 })
    expect(orderTimelineStops(stops, getDraft, {
      type: 'move',
      stop: stops[0],
      moveDirection: 1,
    }).map((stop) => stop.id)).toEqual([2, 1])
    expect(orderTimelineStops(stops, getDraft, {
      type: 'move',
      stop: stops[1],
      moveDirection: -1,
    }).map((stop) => stop.id)).toEqual([2, 1])
  })

  it('chooses a bounded default start for the next route stop', () => {
    expect(nextRouteStartTime([], getDraft)).toBe('09:00')
    drafts.set(2, { selectedTime: '20:30' })
    expect(nextRouteStartTime(stops, getDraft)).toBe('20:30')
  })
})
