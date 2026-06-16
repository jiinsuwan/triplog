import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useItineraryStore } from './itinerary'

const trip = {
  id: 5001,
  title: '전주 테스트',
  startDate: '2026-06-11',
  endDate: '2026-06-13',
  status: 'planning',
}

describe('itinerary store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mock 일정 조회 시 여행 기간의 날짜와 후보 장소를 준비한다', async () => {
    const store = useItineraryStore()

    await store.fetchTripItinerary(5101, { ...trip, id: 5101 })

    expect(store.days).toHaveLength(3)
    expect(store.days[0].stops).toHaveLength(0)
    expect(store.candidatePlaces.length).toBeGreaterThan(0)
    expect(store.isMock).toBe(true)
  })

  it('장소를 현재 날짜에 추가하고 수정한다', async () => {
    const store = useItineraryStore()
    await store.fetchTripItinerary(5102, { ...trip, id: 5102 })
    const cafe = store.candidatePlaces.find((place) => place.placeType === 'CAFE')

    const created = await store.addPlaceToDay(5102, 2, cafe, {
      selectedTime: '14:00',
      transport: 'walk',
    })
    await store.updateStop(5102, 2, created.id, {
      selectedTime: '15:30',
      memo: '디저트',
      transport: 'public_transit',
    })

    const day2 = store.days.find((day) => day.dayNumber === 2)
    expect(day2.stops).toHaveLength(1)
    expect(day2.stops[0]).toMatchObject({
      selectedTime: '15:30',
      memo: '디저트',
      transport: 'public_transit',
    })
  })

  it('같은 날짜 안에서 위/아래 정렬과 삭제를 처리한다', async () => {
    const store = useItineraryStore()
    await store.fetchTripItinerary(5103, { ...trip, id: 5103 })
    const [, cafe, restaurant] = store.candidatePlaces

    const first = await store.addPlaceToDay(5103, 2, cafe, { transport: 'walk' })
    const second = await store.addPlaceToDay(5103, 2, restaurant, { transport: 'walk' })

    await store.moveStopWithinDay(5103, 2, second.id, 'up')
    expect(store.days.find((day) => day.dayNumber === 2).stops.map((stop) => stop.id)).toEqual([
      second.id,
      first.id,
    ])

    await store.deleteStop(5103, 2, second.id)
    expect(store.days.find((day) => day.dayNumber === 2).stops).toEqual([
      expect.objectContaining({ id: first.id, sortOrder: 1 }),
    ])
  })
})
