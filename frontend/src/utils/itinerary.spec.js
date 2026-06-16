import { describe, expect, it } from 'vitest'
import {
  buildRouteMapData,
  createDaysFromTrip,
  hasStopForPlace,
  moveStop,
  nextDefaultTime,
  removeStop,
  toItineraryPlaceRequest,
} from './itinerary'

const hanok = {
  source: 'DB',
  dbPlaceId: 1,
  placeType: 'ATTRACTION',
  name: '전주한옥마을',
  latitude: 35.8149,
  longitude: 127.153,
}

const cafe = {
  source: 'KAKAO',
  sourcePlaceId: 'cafe-1',
  placeType: 'CAFE',
  name: '마시랑게',
  latitude: 35.817,
  longitude: 127.1528,
}

const restaurant = {
  source: 'KAKAO',
  sourcePlaceId: 'food-1',
  placeType: 'RESTAURANT',
  name: '다우랑',
  latitude: 35.8155,
  longitude: 127.1521,
}

function stop(id, place, sortOrder = id) {
  return {
    id,
    dayNumber: 1,
    sortOrder,
    selectedTime: '10:00',
    memo: '',
    transport: 'walk',
    place,
  }
}

describe('itinerary utils', () => {
  it('여행 기간 기준으로 날짜 탭 데이터를 만든다', () => {
    expect(
      createDaysFromTrip({
        startDate: '2026-06-11',
        endDate: '2026-06-13',
      }),
    ).toEqual([
      { dayNumber: 1, date: '2026-06-11', stops: [] },
      { dayNumber: 2, date: '2026-06-12', stops: [] },
      { dayNumber: 3, date: '2026-06-13', stops: [] },
    ])
  })

  it('같은 날짜 안에서 위/아래 버튼 순서를 재정렬한다', () => {
    const reordered = moveStop([stop(1, hanok, 1), stop(2, cafe, 2), stop(3, restaurant, 3)], 2, 'up')

    expect(reordered.map((item) => item.id)).toEqual([2, 1, 3])
    expect(reordered.map((item) => item.sortOrder)).toEqual([1, 2, 3])
  })

  it('문자열 stop id 로도 정렬과 삭제를 처리한다', () => {
    const stops = [stop(1, hanok, 1), stop(2, cafe, 2), stop(3, restaurant, 3)]

    expect(moveStop(stops, '2', 'down').map((item) => item.id)).toEqual([1, 3, 2])
    expect(removeStop(stops, '2').map((item) => item.id)).toEqual([1, 3])
  })

  it('삭제 후 sortOrder 를 다시 1부터 맞춘다', () => {
    const nextStops = removeStop([stop(1, hanok, 1), stop(2, cafe, 2), stop(3, restaurant, 3)], 2)

    expect(nextStops.map((item) => item.id)).toEqual([1, 3])
    expect(nextStops.map((item) => item.sortOrder)).toEqual([1, 2])
  })

  it('지도 marker/polyline 데이터는 일정 순서를 따른다', () => {
    const data = buildRouteMapData(
      {
        dayNumber: 1,
        stops: [stop(1, hanok, 1), stop(2, restaurant, 2)],
      },
      [hanok, cafe, restaurant],
    )

    expect(data.markers).toHaveLength(3)
    expect(data.markers.filter((marker) => marker.routed).map((marker) => marker.order)).toEqual([1, 2])
    expect(data.routePoints).toHaveLength(2)
    expect(data.polylinePoints).toContain(',')
  })

  it('DB/Kakao 장소를 #77 요청 payload 형태로 변환한다', () => {
    expect(toItineraryPlaceRequest(hanok)).toMatchObject({
      source: 'DB',
      dbPlaceId: 1,
      placeType: 'ATTRACTION',
      name: '전주한옥마을',
    })
    expect(toItineraryPlaceRequest(cafe)).toMatchObject({
      source: 'KAKAO',
      sourcePlaceId: 'cafe-1',
      placeType: 'CAFE',
      name: '마시랑게',
    })
  })

  it('이미 추가된 장소와 다음 기본 시간을 계산한다', () => {
    const day = { stops: [stop(1, hanok, 1)] }

    expect(hasStopForPlace(day, hanok)).toBe(true)
    expect(hasStopForPlace(day, cafe)).toBe(false)
    expect(nextDefaultTime([{ selectedTime: '10:30' }])).toBe('12:00')
  })
})
