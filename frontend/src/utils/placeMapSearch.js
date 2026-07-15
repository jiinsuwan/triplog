const MAX_KAKAO_RADIUS_METERS = 20000
const MIN_KAKAO_RADIUS_METERS = 1500
const MAX_KAKAO_PAGE_LIMIT = 2
const MAP_KAKAO_PAGE_SIZE = 8
const MAP_PLACE_PAGE_SIZE = 60

export function buildFallbackPinStyle(places, place) {
  const drawable = places.filter(hasCoordinates)
  const lats = drawable.map((item) => item.latitude)
  const lngs = drawable.map((item) => item.longitude)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRatio = maxLat === minLat ? 0.5 : (place.latitude - minLat) / (maxLat - minLat)
  const lngRatio = maxLng === minLng ? 0.5 : (place.longitude - minLng) / (maxLng - minLng)

  return {
    left: `${10 + lngRatio * 78}%`,
    top: `${12 + (1 - latRatio) * 72}%`,
  }
}

export function limitPlacesForViewport(placeItems, viewport, maxResults, level = 7) {
  if (!maxResults || placeItems.length <= maxResults) return placeItems
  if (!viewport?.bounds || level >= 4) return placeItems.slice(0, maxResults)
  return spatiallyBalancedPlaces(placeItems, viewport, maxResults)
}

export function buildKakaoMapSearchPlan(viewport, level = 7) {
  const pageLimit = kakaoPageLimitForLevel(level)
  return {
    viewports: level <= 3 ? buildMapGridViewports(viewport) : [viewport],
    pageLimit,
    pageSize: kakaoPageSizeForLevel(level),
    maxResults: kakaoMaxResultsForLevel(level),
  }
}

export function dbMapPageSizeForLevel(level) {
  if (level <= 2) return 80
  if (level <= 4) return MAP_PLACE_PAGE_SIZE
  return 36
}

export function buildMapGridViewports(viewport) {
  if (!viewport?.bounds) return [viewport]

  const { minLat, maxLat, minLng, maxLng } = viewport.bounds
  const midLat = (minLat + maxLat) / 2
  const midLng = (minLng + maxLng) / 2
  const tiles = [
    { minLat, maxLat: midLat, minLng, maxLng: midLng },
    { minLat, maxLat: midLat, minLng: midLng, maxLng },
    { minLat: midLat, maxLat, minLng, maxLng: midLng },
    { minLat: midLat, maxLat, minLng: midLng, maxLng },
  ]

  return tiles.map((bounds) => {
    const center = {
      lat: (bounds.minLat + bounds.maxLat) / 2,
      lng: (bounds.minLng + bounds.maxLng) / 2,
    }
    return {
      center,
      bounds,
      radius: plainBoundsRadius(bounds, center),
      useRadiusFilter: false,
    }
  })
}

export function centerFocusedRadius(baseRadius, level) {
  if (level <= 2) return baseRadius
  if (level === 3) return clampRadius(baseRadius * 0.75, 250, 700)
  if (level === 4) return clampRadius(baseRadius * 0.58, 320, 900)
  if (level === 5) return clampRadius(baseRadius * 0.42, 400, 1100)
  if (level === 6) return clampRadius(baseRadius * 0.32, 520, 1400)
  return clampRadius(baseRadius * 0.22, 700, 1800)
}

export function mapSearchRadius(bounds, center) {
  if (!bounds || !center) return MAX_KAKAO_RADIUS_METERS

  const northEast = bounds.getNorthEast()
  const southWest = bounds.getSouthWest()
  const farthest = Math.max(
    distanceMeters(center.getLat(), center.getLng(), northEast.getLat(), northEast.getLng()),
    distanceMeters(center.getLat(), center.getLng(), southWest.getLat(), southWest.getLng()),
  )
  return clampRadius(farthest, MIN_KAKAO_RADIUS_METERS, MAX_KAKAO_RADIUS_METERS)
}

export function mapBoundsToPlain(bounds) {
  const northEast = bounds.getNorthEast()
  const southWest = bounds.getSouthWest()
  return {
    minLat: southWest.getLat(),
    maxLat: northEast.getLat(),
    minLng: southWest.getLng(),
    maxLng: northEast.getLng(),
  }
}

export function isWithinSearchViewport(place, viewport) {
  if (viewport?.useRadiusFilter || !viewport?.bounds) {
    if (!viewport?.center || !Number.isFinite(viewport.radius)) return true
    return distanceMeters(
      viewport.center.lat,
      viewport.center.lng,
      place.latitude,
      place.longitude,
    ) <= viewport.radius
  }

  const { minLat, maxLat, minLng, maxLng } = viewport.bounds
  return place.latitude >= minLat &&
    place.latitude <= maxLat &&
    place.longitude >= minLng &&
    place.longitude <= maxLng
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function spatiallyBalancedPlaces(placeItems, viewport, maxResults) {
  const columns = 4
  const rows = 3
  const buckets = new Map()

  placeItems.forEach((place) => {
    const key = viewportGridKey(place, viewport.bounds, columns, rows)
    const bucket = buckets.get(key) || []
    bucket.push(place)
    buckets.set(key, bucket)
  })

  const orderedBuckets = [...buckets.entries()]
    .map(([key, bucket]) => ({ key, bucket, priority: viewportGridPriority(key, columns, rows) }))
    .sort((a, b) => a.priority - b.priority)
  const selected = []
  while (selected.length < maxResults && orderedBuckets.some((item) => item.bucket.length)) {
    orderedBuckets.forEach((item) => {
      if (selected.length >= maxResults) return
      const nextPlace = item.bucket.shift()
      if (nextPlace) selected.push(nextPlace)
    })
  }
  return selected
}

function viewportGridKey(place, bounds, columns, rows) {
  const lngSpan = bounds.maxLng - bounds.minLng || 1
  const latSpan = bounds.maxLat - bounds.minLat || 1
  const column = clampIndex(Math.floor(((place.longitude - bounds.minLng) / lngSpan) * columns), columns)
  const row = clampIndex(Math.floor(((bounds.maxLat - place.latitude) / latSpan) * rows), rows)
  return `${row}:${column}`
}

function viewportGridPriority(key, columns, rows) {
  const [row, column] = key.split(':').map(Number)
  return Math.hypot(row - (rows - 1) / 2, column - (columns - 1) / 2)
}

function plainBoundsRadius(bounds, center) {
  const farthest = Math.max(
    distanceMeters(center.lat, center.lng, bounds.maxLat, bounds.maxLng),
    distanceMeters(center.lat, center.lng, bounds.minLat, bounds.minLng),
  )
  return clampRadius(farthest, MIN_KAKAO_RADIUS_METERS, MAX_KAKAO_RADIUS_METERS)
}

function kakaoPageLimitForLevel(level) {
  return level <= 1 ? MAX_KAKAO_PAGE_LIMIT : 1
}

function kakaoPageSizeForLevel(level) {
  if (level <= 1) return 10
  if (level <= 2) return 9
  if (level === 3) return 8
  if (level <= 5) return MAP_KAKAO_PAGE_SIZE
  return 6
}

function kakaoMaxResultsForLevel(level) {
  if (level <= 1) return 56
  if (level <= 2) return 48
  if (level === 3) return 40
  if (level <= 5) return 28
  return 18
}

function clampRadius(value, min, max) {
  return Math.min(max, Math.max(min, Math.ceil(value)))
}

function clampIndex(value, size) {
  return Math.min(size - 1, Math.max(0, value))
}

function hasCoordinates(place) {
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}
