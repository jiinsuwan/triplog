export const CATEGORY_OPTIONS = [
  { label: '전체', value: 'all' },
  { label: '관광지', value: 'attraction' },
  { label: '식당', value: 'restaurant' },
  { label: '카페', value: 'cafe' },
]

const REGION_KEYWORDS = {
  서울: '서울',
  부산: '부산',
  제주: '제주',
  전주: '전주',
}

const REGION_CONFIGS = [
  {
    aliases: ['서울', '서울시', '서울특별시'],
    keyword: '서울',
    region1: '서울특별시',
    center: { lat: 37.5665, lng: 126.978 },
    bounds: { minLat: 37.41, maxLat: 37.72, minLng: 126.73, maxLng: 127.27 },
    mapLevel: 8,
  },
  {
    aliases: ['부산', '부산시', '부산광역시'],
    keyword: '부산',
    region1: '부산광역시',
    center: { lat: 35.1796, lng: 129.0756 },
    bounds: { minLat: 35.03, maxLat: 35.39, minLng: 128.76, maxLng: 129.33 },
    mapLevel: 8,
  },
  {
    aliases: ['제주', '제주시', '제주도', '제주특별자치도'],
    keyword: '제주',
    region1: '제주특별자치도',
    center: { lat: 33.4996, lng: 126.5312 },
    bounds: { minLat: 33.1, maxLat: 33.65, minLng: 126.1, maxLng: 126.98 },
    mapLevel: 9,
  },
  {
    aliases: ['전주', '전주시'],
    keyword: '전주',
    region2: '전주시',
    center: { lat: 35.8242, lng: 127.148 },
    bounds: { minLat: 35.74, maxLat: 35.93, minLng: 127.0, maxLng: 127.25 },
    mapLevel: 7,
  },
  {
    aliases: ['강원', '강원도', '강원특별자치도'],
    keyword: '강원',
    region1: '강원특별자치도',
    center: { lat: 37.82, lng: 128.16 },
    bounds: { minLat: 37.0, maxLat: 38.62, minLng: 127.0, maxLng: 129.37 },
    mapLevel: 11,
  },
]

export function normalizeDbPlace(place) {
  return {
    uid: `db-${place.id}`,
    origin: 'db',
    sourceId: place.id,
    name: place.name,
    category: place.category || '관광지',
    categoryGroup: '관광지',
    markerLabel: place.name || '관광지',
    region1: place.region1 || '',
    region2: place.region2 || '',
    address: place.roadAddress || place.address || '',
    latitude: toNumber(place.latitude),
    longitude: toNumber(place.longitude),
    phone: place.phone || '',
    summary: place.summary || place.facilities || '공공데이터 관광지',
    description: place.description || '',
    facilities: place.facilities || '',
    homepage: place.homepage || '',
    imageUrl: place.imageUrl || '',
    sourceLabel: 'DB 관광지',
  }
}

export function normalizeKakaoPlace(place) {
  return {
    uid: `kakao-${place.id}`,
    origin: 'kakao',
    sourceId: place.id,
    name: place.place_name,
    category: place.category_name || place.category_group_name || '카카오 장소',
    categoryGroup: place.category_group_name || '',
    markerLabel: kakaoMarkerLabel(place),
    address: place.road_address_name || place.address_name || '',
    latitude: toNumber(place.y),
    longitude: toNumber(place.x),
    phone: place.phone || '',
    summary: place.place_url || '카카오 실시간 검색 결과',
    sourceLabel: 'Kakao',
    placeUrl: place.place_url,
  }
}

export function filterPlacesByTab(places, tab) {
  if (tab === 'all') return places
  if (tab === 'attraction') return places.filter((place) => place.origin === 'db')
  if (tab === 'restaurant') {
    return places.filter((place) => place.category.includes('음식점') || place.categoryGroup === '음식점')
  }
  if (tab === 'cafe') {
    return places.filter((place) => place.category.includes('카페') || place.categoryGroup === '카페')
  }
  return places
}

export function buildKakaoKeyword({ keyword, region, tab, regions = [] }) {
  const regionQuery = resolvePlaceRegion({ keyword, fallbackRegion: region, regions })
  const trimmedKeyword = keyword?.trim() || ''
  const isRegionOnly = isRegionKeyword(trimmedKeyword, regionQuery)
  const base = regionQuery?.keyword || regionKeyword(region)
  const scopedKeyword = trimmedKeyword && !isRegionOnly ? `${base} ${trimmedKeyword}` : base

  if (tab === 'cafe' && !/(카페|커피)/.test(scopedKeyword)) return `${scopedKeyword} 카페`
  if (tab === 'restaurant' && !/(맛집|식당|음식점|레스토랑)/.test(scopedKeyword)) {
    return `${scopedKeyword} 맛집`
  }
  if (tab === 'all' && (!trimmedKeyword || isRegionOnly)) return `${scopedKeyword} 맛집`
  return scopedKeyword
}

export function regionKeyword(region = '') {
  return resolvePlaceRegion({ fallbackRegion: region })?.keyword || REGION_KEYWORDS[region] || region || '서울'
}

export function buildDbPlaceQuery({ keyword, fallbackRegion, regions = [] } = {}) {
  const regionQuery = resolvePlaceRegion({ keyword, fallbackRegion, regions })
  const trimmedKeyword = keyword?.trim() || ''
  const isRegionOnly = isRegionKeyword(trimmedKeyword, regionQuery)

  return {
    region1: regionQuery?.region1,
    region2: regionQuery?.region2,
    keyword: trimmedKeyword && !isRegionOnly ? trimmedKeyword : undefined,
  }
}

export function resolvePlaceRegion({ keyword = '', fallbackRegion = '', regions = [] } = {}) {
  return (
    findRegionConfig(keyword) ||
    findDynamicRegionConfig(keyword, regions, fallbackRegion) ||
    findRegionConfig(fallbackRegion) ||
    findDynamicRegionConfig(fallbackRegion, regions) ||
    findRegionConfig('서울')
  )
}

export function isWithinPlaceRegion(place, regionQuery) {
  if (!regionQuery?.bounds) return true
  const { minLat, maxLat, minLng, maxLng } = regionQuery.bounds
  return (
    place.latitude >= minLat &&
    place.latitude <= maxLat &&
    place.longitude >= minLng &&
    place.longitude <= maxLng
  )
}

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function findRegionConfig(value = '') {
  const normalized = normalizeRegionText(value)
  if (!normalized) return null
  return REGION_CONFIGS.find((config) =>
    config.aliases.some((alias) => normalizeRegionText(alias) === normalized),
  )
}

function findDynamicRegionConfig(value = '', regions = [], fallbackRegion = '') {
  const normalized = normalizeRegionText(value)
  if (!normalized || !regions.length) return null

  const candidates = regions
    .map((region) => ({
      region,
      aliases: regionAliases(region),
    }))
    .filter((candidate) =>
      candidate.aliases.some((alias) => normalizeRegionText(alias) === normalized),
    )

  if (!candidates.length) return null

  const fallback = findRegionConfig(fallbackRegion)
  const preferred =
    fallback?.region1 &&
    candidates.find((candidate) => candidate.region.region1 === fallback.region1)
  const selected = preferred || candidates[0]

  return dynamicRegionConfig(selected.region, selected.aliases)
}

function dynamicRegionConfig(region, aliases) {
  return {
    aliases,
    keyword: [region.region1, region.region2].filter(Boolean).join(' '),
    region1: region.region1,
    region2: region.region2,
    center: null,
    bounds: null,
    mapLevel: 8,
  }
}

function regionAliases(region) {
  const aliases = new Set()
  addRegionAlias(aliases, region.region1)
  addRegionAlias(aliases, shortRegion1(region.region1))
  addRegionAlias(aliases, region.region2)
  const strippedRegion2 = stripRegionSuffix(region.region2)
  addRegionAlias(aliases, strippedRegion2)
  addRegionAlias(aliases, strippedRegion2 ? `${strippedRegion2}역` : '')
  return [...aliases].filter((alias) => normalizeRegionText(alias).length >= 2)
}

function addRegionAlias(aliases, value) {
  if (value) aliases.add(value)
}

function shortRegion1(region1 = '') {
  return region1
    .replace(/특별자치도$/, '')
    .replace(/특별시$/, '')
    .replace(/광역시$/, '')
    .replace(/자치도$/, '')
}

function stripRegionSuffix(region2 = '') {
  return region2.replace(/(시|군|구)$/, '')
}

function normalizeRegionText(value = '') {
  return value.trim().replace(/\s+/g, '')
}

function isRegionKeyword(keyword, regionQuery) {
  if (!keyword || !regionQuery) return false
  const normalized = normalizeRegionText(keyword)
  return regionQuery.aliases.some((alias) => normalizeRegionText(alias) === normalized)
}

function kakaoMarkerLabel(place) {
  const category = place.category_group_name || place.category_name || ''
  if (category.includes('카페')) return '카페'
  if (category.includes('음식점') || category.includes('식당')) return '식당'
  return '장소'
}
