export const TRANSPORT_OPTIONS = [
  { label: '도보', value: 'walk', icon: 'pi pi-directions' },
  { label: '자동차', value: 'car', icon: 'pi pi-car' },
  { label: '대중교통', value: 'public_transit', icon: 'pi pi-send' },
  { label: '기타', value: 'other', icon: 'pi pi-ellipsis-h' },
]

export const PLACE_TYPE_META = {
  ATTRACTION: { label: '명소', icon: 'pi pi-map-marker', color: '#2e8f6b' },
  RESTAURANT: { label: '식당', icon: 'pi pi-shopping-bag', color: '#f04452' },
  CAFE: { label: '카페', icon: 'pi pi-cup', color: '#8b5cf6' },
  LODGING: { label: '숙소', icon: 'pi pi-home', color: '#3182f6' },
  ETC: { label: '장소', icon: 'pi pi-map-marker', color: '#687586' },
}

export function createDaysFromTrip(trip) {
  const dayCount = tripDayCount(trip)
  return Array.from({ length: dayCount }, (_, index) => ({
    dayNumber: index + 1,
    date: addDays(trip?.startDate, index),
    stops: [],
  }))
}

export function tripDayCount(trip) {
  if (!trip?.startDate || !trip?.endDate) return 1
  const start = new Date(`${trip.startDate}T00:00:00`)
  const end = new Date(`${trip.endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1
  return Math.max(1, Math.round((end - start) / 86400000) + 1)
}

export function addDays(dateOnly, days) {
  if (!dateOnly) return ''
  const date = new Date(`${dateOnly}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + days)
  return toDateOnly(date)
}

export function toDateOnly(date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDayDate(dateOnly) {
  if (!dateOnly) return '날짜 미정'
  return dateOnly.replaceAll('-', '.')
}

export function placeKey(place = {}) {
  if (place.dbPlaceId) return `db:${place.dbPlaceId}`
  if (place.sourcePlaceId) return `${String(place.source || 'place').toLowerCase()}:${place.sourcePlaceId}`
  return `${place.name}:${place.latitude}:${place.longitude}`
}

export function stopPlaceKey(stop = {}) {
  return placeKey(stop.place)
}

export function hasStopForPlace(day, place) {
  const key = placeKey(place)
  return Boolean(day?.stops?.some((stop) => stopPlaceKey(stop) === key))
}

export function renumberStops(stops = []) {
  return stops.map((stop, index) => ({
    ...stop,
    sortOrder: index + 1,
    dayNumber: stop.dayNumber,
  }))
}

export function moveStop(stops = [], stopId, direction) {
  const currentIndex = stops.findIndex((stop) => sameStopId(stop.id, stopId))
  const offset = direction === 'up' ? -1 : 1
  const nextIndex = currentIndex + offset

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= stops.length) {
    return renumberStops(stops)
  }

  const nextStops = [...stops]
  const [item] = nextStops.splice(currentIndex, 1)
  nextStops.splice(nextIndex, 0, item)
  return renumberStops(nextStops)
}

export function removeStop(stops = [], stopId) {
  return renumberStops(stops.filter((stop) => !sameStopId(stop.id, stopId)))
}

export function nextDefaultTime(stops = []) {
  const lastTime = [...stops]
    .reverse()
    .map((stop) => stop.selectedTime)
    .find(Boolean)

  if (!lastTime) return '10:00'

  const [hour, minute] = lastTime.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '10:00'

  const totalMinutes = Math.min(23 * 60 + 30, hour * 60 + minute + 90)
  const nextHour = Math.floor(totalMinutes / 60)
  const nextMinute = totalMinutes % 60
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`
}

export function toItineraryPlaceRequest(place = {}) {
  if (String(place.source).toUpperCase() === 'DB' && place.dbPlaceId) {
    return {
      source: 'DB',
      dbPlaceId: place.dbPlaceId,
      sourcePlaceId: place.sourcePlaceId || String(place.dbPlaceId),
      placeType: place.placeType || 'ATTRACTION',
      name: place.name || '',
      category: place.category || '',
      categoryGroup: place.categoryGroup || '',
      region1: place.region1 || '',
      region2: place.region2 || '',
      address: place.address || '',
      roadAddress: place.roadAddress || '',
      latitude: place.latitude,
      longitude: place.longitude,
      phone: place.phone || '',
      placeUrl: place.placeUrl || '',
    }
  }

  return {
    source: 'KAKAO',
    sourcePlaceId: place.sourcePlaceId,
    placeType: place.placeType || 'ETC',
    name: place.name,
    category: place.category || '',
    categoryGroup: place.categoryGroup || '',
    region1: place.region1 || '',
    region2: place.region2 || '',
    address: place.address || '',
    roadAddress: place.roadAddress || '',
    latitude: place.latitude,
    longitude: place.longitude,
    phone: place.phone || '',
    placeUrl: place.placeUrl || '',
  }
}

export function buildRouteMapData(day, candidatePlaces = []) {
  const sortedStops = [...(day?.stops ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  const allPlaces = mergePlaces(candidatePlaces, sortedStops.map((stop) => stop.place))
  const positions = calculateRelativePositions(allPlaces)
  const stopByPlace = new Map(sortedStops.map((stop) => [stopPlaceKey(stop), stop]))

  const markers = allPlaces.map((place) => {
    const key = placeKey(place)
    const stop = stopByPlace.get(key)
    const position = positions.get(key) ?? { x: 50, y: 50 }
    return {
      id: stop?.id ?? key,
      key,
      place,
      stop,
      x: position.x,
      y: position.y,
      order: stop?.sortOrder ?? null,
      routed: Boolean(stop),
      meta: placeTypeMeta(place.placeType),
    }
  })

  const routePoints = sortedStops
    .map((stop) => positions.get(stopPlaceKey(stop)))
    .filter(Boolean)

  return {
    markers,
    routePoints,
    polylinePoints: routePoints.map((point) => `${point.x},${point.y}`).join(' '),
  }
}

export function placeTypeMeta(placeType) {
  return PLACE_TYPE_META[placeType] ?? PLACE_TYPE_META.ETC
}

function mergePlaces(...placeGroups) {
  const merged = new Map()
  placeGroups
    .flat()
    .filter(Boolean)
    .forEach((place) => {
      merged.set(placeKey(place), place)
    })
  return [...merged.values()]
}

function calculateRelativePositions(places) {
  const points = places.filter(
    (place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude),
  )
  if (!points.length) return new Map()
  if (points.length === 1) {
    return new Map([[placeKey(points[0]), { x: 50, y: 50 }]])
  }

  const minLat = Math.min(...points.map((place) => place.latitude))
  const maxLat = Math.max(...points.map((place) => place.latitude))
  const minLng = Math.min(...points.map((place) => place.longitude))
  const maxLng = Math.max(...points.map((place) => place.longitude))
  const latSpan = maxLat - minLat || 0.01
  const lngSpan = maxLng - minLng || 0.01

  return new Map(
    points.map((place) => {
      const x = 10 + ((place.longitude - minLng) / lngSpan) * 80
      const y = 10 + ((maxLat - place.latitude) / latSpan) * 80
      return [
        placeKey(place),
        {
          x: roundPosition(x),
          y: roundPosition(y),
        },
      ]
    }),
  )
}

function roundPosition(value) {
  return Math.round(value * 10) / 10
}

function sameStopId(left, right) {
  return String(left) === String(right)
}
