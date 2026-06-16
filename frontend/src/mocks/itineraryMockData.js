import { createDaysFromTrip, nextDefaultTime, renumberStops } from '@/utils/itinerary'

const mockPlaces = [
  {
    source: 'DB',
    provider: 'PUBLIC_TOURIST_STANDARD',
    dbPlaceId: 7001,
    sourcePlaceId: 'mock-jeonju-hanok-village',
    placeType: 'ATTRACTION',
    name: '전주한옥마을',
    category: '전통 마을',
    categoryGroup: '관광지',
    region1: '전라북도',
    region2: '전주시',
    address: '전북 전주시 완산구 교동',
    roadAddress: '전북 전주시 완산구 기린대로 99',
    latitude: 35.8149,
    longitude: 127.153,
    phone: '',
    placeUrl: '',
  },
  {
    source: 'KAKAO',
    provider: 'KAKAO',
    dbPlaceId: null,
    sourcePlaceId: 'mock-pnb-jeonju-station',
    placeType: 'RESTAURANT',
    name: '풍년제과 전주역전점',
    category: '음식점 > 제과,베이커리',
    categoryGroup: '음식점',
    region1: '전라북도',
    region2: '전주시',
    address: '전북 전주시 덕진구 백제대로 838',
    roadAddress: '전북 전주시 덕진구 백제대로 838',
    latitude: 35.8499,
    longitude: 127.1622,
    phone: '063-245-0946',
    placeUrl: 'https://place.map.kakao.com/mock-pnb',
  },
  {
    source: 'DB',
    provider: 'CURATED_SEED',
    dbPlaceId: 7002,
    sourcePlaceId: 'mock-gyeonggijeon',
    placeType: 'ATTRACTION',
    name: '경기전',
    category: '역사 유적',
    categoryGroup: '관광지',
    region1: '전라북도',
    region2: '전주시',
    address: '전북 전주시 완산구 태조로 44',
    roadAddress: '전북 전주시 완산구 태조로 44',
    latitude: 35.8152,
    longitude: 127.1499,
    phone: '',
    placeUrl: '',
  },
  {
    source: 'KAKAO',
    provider: 'KAKAO',
    dbPlaceId: null,
    sourcePlaceId: 'mock-dawoorang',
    placeType: 'RESTAURANT',
    name: '다우랑',
    category: '음식점 > 분식',
    categoryGroup: '음식점',
    region1: '전라북도',
    region2: '전주시',
    address: '전북 전주시 완산구 태조로 33',
    roadAddress: '전북 전주시 완산구 태조로 33',
    latitude: 35.8155,
    longitude: 127.1521,
    phone: '',
    placeUrl: 'https://place.map.kakao.com/mock-dawoorang',
  },
  {
    source: 'KAKAO',
    provider: 'KAKAO',
    dbPlaceId: null,
    sourcePlaceId: 'mock-mamich',
    placeType: 'CAFE',
    name: '마시랑게',
    category: '음식점 > 카페',
    categoryGroup: '카페',
    region1: '전라북도',
    region2: '전주시',
    address: '전북 전주시 완산구 은행로 54',
    roadAddress: '전북 전주시 완산구 은행로 54',
    latitude: 35.817,
    longitude: 127.1528,
    phone: '',
    placeUrl: 'https://place.map.kakao.com/mock-cafe',
  },
  {
    source: 'DB',
    provider: 'CURATED_SEED',
    dbPlaceId: 7003,
    sourcePlaceId: 'mock-jaman-village',
    placeType: 'ATTRACTION',
    name: '자만벽화마을',
    category: '마을 산책',
    categoryGroup: '관광지',
    region1: '전라북도',
    region2: '전주시',
    address: '전북 전주시 완산구 자만동길 33',
    roadAddress: '전북 전주시 완산구 자만동길 33',
    latitude: 35.813,
    longitude: 127.1592,
    phone: '',
    placeUrl: '',
  },
  {
    source: 'KAKAO',
    provider: 'KAKAO',
    dbPlaceId: null,
    sourcePlaceId: 'mock-veteran',
    placeType: 'RESTAURANT',
    name: '베테랑 칼국수',
    category: '음식점 > 한식',
    categoryGroup: '음식점',
    region1: '전라북도',
    region2: '전주시',
    address: '전북 전주시 완산구 경기전길 135',
    roadAddress: '전북 전주시 완산구 경기전길 135',
    latitude: 35.8179,
    longitude: 127.1516,
    phone: '',
    placeUrl: 'https://place.map.kakao.com/mock-veteran',
  },
]

let nextStopId = 9200
const itineraryByTripId = new Map()

export function listMockItineraryPlaces() {
  return clone(mockPlaces)
}

export async function fetchMockItinerary(tripId, trip) {
  const numericTripId = Number(tripId)
  if (!itineraryByTripId.has(numericTripId)) {
    itineraryByTripId.set(numericTripId, createSeedItinerary(numericTripId, trip))
  }
  return clone(itineraryByTripId.get(numericTripId))
}

export async function createMockItineraryStop(tripId, dayNumber, payload, trip) {
  const itinerary = await mutableItinerary(tripId, trip)
  const day = findDay(itinerary, dayNumber)
  const place = resolvePlace(payload.place)
  const stop = {
    id: nextStopId,
    dayNumber: Number(dayNumber),
    sortOrder: day.stops.length + 1,
    selectedTime: payload.selectedTime || nextDefaultTime(day.stops),
    memo: payload.memo || '',
    transport: payload.transport || 'walk',
    place,
  }
  nextStopId += 1
  day.stops = renumberStops([...day.stops, stop])
  return clone(stop)
}

export async function updateMockItineraryStop(tripId, dayNumber, stopId, payload, trip) {
  const itinerary = await mutableItinerary(tripId, trip)
  const day = findDay(itinerary, dayNumber)
  const index = day.stops.findIndex((stop) => stop.id === Number(stopId))
  if (index < 0) throw new Error('일정 방문지를 찾지 못했습니다.')

  day.stops[index] = {
    ...day.stops[index],
    selectedTime: payload.selectedTime ?? day.stops[index].selectedTime,
    memo: payload.memo ?? day.stops[index].memo,
    transport: payload.transport ?? day.stops[index].transport,
  }
  return clone(day.stops[index])
}

export async function deleteMockItineraryStop(tripId, dayNumber, stopId, trip) {
  const itinerary = await mutableItinerary(tripId, trip)
  const day = findDay(itinerary, dayNumber)
  day.stops = renumberStops(day.stops.filter((stop) => stop.id !== Number(stopId)))
  return null
}

export async function reorderMockItineraryStops(tripId, dayNumber, stopIds, trip) {
  const itinerary = await mutableItinerary(tripId, trip)
  const day = findDay(itinerary, dayNumber)
  const currentIds = day.stops.map((stop) => stop.id).sort().join(',')
  const nextIds = [...stopIds].map(Number).sort().join(',')
  if (currentIds !== nextIds) throw new Error('같은 날짜의 전체 방문지 순서가 필요합니다.')

  const stopById = new Map(day.stops.map((stop) => [stop.id, stop]))
  day.stops = renumberStops(stopIds.map((id) => stopById.get(Number(id))).filter(Boolean))
  return clone(itinerary)
}

async function mutableItinerary(tripId, trip) {
  const numericTripId = Number(tripId)
  if (!itineraryByTripId.has(numericTripId)) {
    itineraryByTripId.set(numericTripId, createSeedItinerary(numericTripId, trip))
  }
  return itineraryByTripId.get(numericTripId)
}

function createSeedItinerary(tripId, trip) {
  const safeTrip = {
    id: Number(tripId),
    title: trip?.title || '전주 새 일정',
    startDate: trip?.startDate || '2026-06-11',
    endDate: trip?.endDate || '2026-06-13',
    status: trip?.status || 'planning',
  }
  const days = createDaysFromTrip(safeTrip)
  return {
    trip: safeTrip,
    dayCount: days.length,
    days,
  }
}

function findDay(itinerary, dayNumber) {
  const day = itinerary.days.find((item) => item.dayNumber === Number(dayNumber))
  if (!day) throw new Error('여행 날짜를 찾지 못했습니다.')
  return day
}

function resolvePlace(placeRequest = {}) {
  if (placeRequest.source === 'DB') {
    return (
      mockPlaces.find((place) => place.dbPlaceId === placeRequest.dbPlaceId) || {
        source: 'DB',
        provider: placeRequest.provider || 'DB',
        dbPlaceId: placeRequest.dbPlaceId,
        sourcePlaceId: placeRequest.sourcePlaceId || String(placeRequest.dbPlaceId),
        placeType: placeRequest.placeType || 'ATTRACTION',
        name: placeRequest.name || '장소',
        category: placeRequest.category || '',
        categoryGroup: placeRequest.categoryGroup || '',
        region1: placeRequest.region1 || '',
        region2: placeRequest.region2 || '',
        address: placeRequest.address || '',
        roadAddress: placeRequest.roadAddress || '',
        latitude: placeRequest.latitude,
        longitude: placeRequest.longitude,
        phone: placeRequest.phone || '',
        placeUrl: placeRequest.placeUrl || '',
      }
    )
  }
  return {
    source: 'KAKAO',
    provider: 'KAKAO',
    dbPlaceId: null,
    ...placeRequest,
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}
