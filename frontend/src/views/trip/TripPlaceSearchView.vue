<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Select from 'primevue/select'
import { fetchPlaceDetail, fetchPlaceRegions, fetchPlaces } from '@/api/placeApi'
import { useItineraryStore } from '@/stores/itinerary'
import { loadKakaoMaps } from '@/utils/kakaoMap'
import {
  TRANSPORT_OPTIONS,
  formatDayDate,
  hasStopForPlace,
  nextDefaultTime,
  placeKey,
  stopPlaceKey,
} from '@/utils/itinerary'
import {
  CATEGORY_OPTIONS,
  buildDbPlaceQuery,
  buildKakaoKeyword,
  filterPlacesByTab,
  isWithinPlaceRegion,
  normalizeDbPlace,
  normalizeKakaoPlace,
  resolvePlaceRegion,
} from '@/utils/placeSearch'
import { useTripStore } from '@/stores/trip'

const LIST_PAGE_SIZE = 5
const PAGE_BUTTON_WINDOW_SIZE = 5
const KAKAO_PAGE_SIZE = 15
const REGION_KAKAO_PAGE_SIZE = 8
const MAP_KAKAO_PAGE_SIZE = 8
const REGION_KAKAO_PAGE_LIMIT = 1
const MAX_KAKAO_PAGE_LIMIT = 2
const REGION_PLACE_PAGE_SIZE = 28
const MAP_PLACE_PAGE_SIZE = 60
const ANCHOR_SEARCH_RADIUS_METERS = 380
const ANCHOR_SEARCH_LEVEL = 3
const MAP_MIN_LEVEL = 1
const MARKER_GROUP_DISTANCE_PX = 34
const MARKER_LABEL_COLLISION_GAP_PX = 10
const MARKER_LABEL_HEIGHT_PX = 44
const MARKER_ICON_SIZE_PX = 42
const POPUP_EDGE_PADDING_PX = 28
const MAP_FIT_PADDING_PX = 64
const MAX_KAKAO_RADIUS_METERS = 20000
const MIN_KAKAO_RADIUS_METERS = 1500
const KAKAO_CATEGORY_CODES = {
  restaurant: 'FD6',
  cafe: 'CE7',
}
const DAY_ROUTE_COLORS = [
  '#2563eb',
  '#f97316',
  '#10b981',
  '#a855f7',
  '#e11d48',
  '#0891b2',
  '#ca8a04',
]
const COLLECTION_ROUTE_COLOR = '#ea580c'
const GENERIC_FOOD_KEYWORDS = new Set([
  '맛집',
  '식당',
  '음식점',
  '밥집',
  '밥',
  '먹거리',
  '뭐먹지',
  '뭘먹지',
  '뭐먹을까',
  '뭘먹을까',
  '점심',
  '저녁',
])
const GENERIC_CAFE_KEYWORDS = new Set(['카페', '커피', '찻집', '디저트'])

const route = useRoute()
const router = useRouter()
const tripStore = useTripStore()
const itineraryStore = useItineraryStore()

const tripId = computed(() => Number(route.params.tripId))
const trip = computed(() => tripStore.selectedTrip)
const tripRegion = computed(() => trip.value?.region || '서울')

const mapEl = ref(null)
const activeTab = ref('all')
const keyword = ref('')
const dbPlaces = ref([])
const kakaoPlaces = ref([])
const placeRegions = ref([])
const selectedPlace = ref(null)
const pocketIds = ref([])
const pocketPlaceLookup = ref(new Map())
const itineraryMode = ref(route.query.mode === 'itinerary')
const activeDayNumber = ref(1)
const selectedStopId = ref(null)
const stopDrafts = ref({})
const itineraryNotice = ref('')
const loading = ref(false)
const searching = ref(false)
const sdkError = ref('')
const placeError = ref('')
const kakaoSearchNotice = ref('')
const currentPage = ref(1)
const mapViewportFilter = ref(null)
const currentMapSignature = ref('')
const lastMapSearchSignature = ref('')

let kakao = null
let map = null
let placesService = null
let overlays = []
let routePolylines = []
let placePopupOverlay = null
let placePopupTimer = null
let mapIdleHandler = null
let mapZoomChangedHandler = null
let mapClickHandler = null
let shouldMarkBaselineOnIdle = false
const dbPlaceDetailCache = new Map()
const dbPlaceDetailRequests = new Map()

const activeRegion = computed(() =>
  resolvePlaceRegion({
    keyword: keyword.value,
    fallbackRegion: tripRegion.value,
    regions: placeRegions.value,
  }),
)
const places = computed(() => [...dbPlaces.value, ...kakaoPlaces.value])
const visiblePlaces = computed(() => {
  const tabPlaces = filterPlacesByTab(places.value, activeTab.value)
  if (!mapViewportFilter.value) return tabPlaces
  return tabPlaces.filter((place) => isWithinSearchViewport(place, mapViewportFilter.value))
})
const totalPages = computed(() => Math.max(1, Math.ceil(visiblePlaces.value.length / LIST_PAGE_SIZE)))
const paginatedPlaces = computed(() => {
  const start = (currentPage.value - 1) * LIST_PAGE_SIZE
  return visiblePlaces.value.slice(start, start + LIST_PAGE_SIZE)
})
const pocketPlaces = computed(() =>
  pocketIds.value.map((id) => pocketPlaceLookup.value.get(id)).filter(Boolean),
)
const routedPlaces = computed(() =>
  dedupeRouteMapPlaces(
    days.value.flatMap((day) => (day.stops ?? []).map((stop) => toMapPlace(stop.place))),
  ),
)
const pocketDisplayPlaces = computed(() =>
  dedupeRouteMapPlaces([...pocketPlaces.value, ...routedPlaces.value]),
)
const days = computed(() =>
  itineraryStore.itinerary?.trip?.id === tripId.value ? itineraryStore.days : [],
)
const activeDay = computed(() =>
  days.value.find((day) => day.dayNumber === activeDayNumber.value) || days.value[0],
)
const activeStops = computed(() => activeDay.value?.stops ?? [])
const dayTabs = computed(() =>
  days.value.map((day) => ({
    label: `${day.dayNumber}일차`,
    value: day.dayNumber,
    count: day.stops.length,
    date: day.date,
  })),
)
const activeRoutePlaceKeys = computed(
  () => new Map(activeStops.value.map((stop) => [stopPlaceKey(stop), stop.sortOrder])),
)
const routeSummary = computed(() =>
  activeStops.value
    .map((stop) => `${stop.sortOrder}. ${stop.place.name}`)
    .join(' → '),
)
const routeMapPlaces = computed(() => {
  const routedPlaces = activeStops.value.map((stop) => toMapPlace(stop.place))
  return dedupeRouteMapPlaces([...pocketPlaces.value, ...routedPlaces])
})
const allRouteMapPlaces = computed(() =>
  routedPlaces.value,
)
const mapPlaces = computed(() => {
  if (itineraryMode.value) return routeMapPlaces.value
  return dedupeRouteMapPlaces([...allRouteMapPlaces.value, ...visiblePlaces.value])
})
const mapPlaceSignature = computed(() => mapPlaces.value.map((place) => place.uid).join('|'))
const canSearchCurrentMapArea = computed(
  () =>
    !itineraryMode.value &&
    !sdkError.value &&
    Boolean(currentMapSignature.value) &&
    currentMapSignature.value !== lastMapSearchSignature.value,
)
const mapCenter = computed(() => activeRegion.value.center || { lat: 37.5665, lng: 126.978 })
const pageNumbers = computed(() =>
  Array.from(
    { length: Math.min(PAGE_BUTTON_WINDOW_SIZE, totalPages.value) },
    (_, index) => pageWindowStart.value + index,
  ),
)
const pageWindowStart = computed(() => {
  if (totalPages.value <= PAGE_BUTTON_WINDOW_SIZE) return 1

  const halfWindow = Math.floor(PAGE_BUTTON_WINDOW_SIZE / 2)
  const latestStart = totalPages.value - PAGE_BUTTON_WINDOW_SIZE + 1
  return Math.min(Math.max(currentPage.value - halfWindow, 1), latestStart)
})
const canGoPrevPage = computed(() => currentPage.value > 1)
const canGoNextPage = computed(() => currentPage.value < totalPages.value)

onMounted(async () => {
  loading.value = true
  try {
    await loadTrip()
    await loadPlaceRegions()
    await loadDbPlaces()
    if (itineraryMode.value) {
      await ensureItineraryLoaded()
    }
  } finally {
    loading.value = false
  }

  await nextTick()
  await initMap()
  await searchKakaoPlaces()
  markMapSearchBaseline({ afterIdle: true })
})

onBeforeUnmount(() => {
  removeMapListeners()
  clearPlacePopup()
  clearOverlays()
})

watch(
  () => [mapPlaceSignature.value, pocketIds.value.join('|'), itineraryMode.value],
  () => renderMapPlaces(),
)

watch(
  () => activeStops.value.map((stop) => `${stop.id}:${stop.sortOrder}`).join('|'),
  () => renderMapPlaces(),
)

watch(
  () =>
    activeStops.value
      .map((stop) => [
        stop.id,
        stop.selectedTime ?? '',
        stop.memo ?? '',
        stop.transport ?? '',
        stop.travelFromPrevious?.status ?? '',
        stop.travelFromPrevious?.durationSeconds ?? '',
      ].join(':'))
      .join('|'),
  () => syncStopDrafts(),
  { immediate: true },
)

watch(
  () => visiblePlaces.value.map((place) => place.uid).join('|'),
  () => {
    currentPage.value = 1
  },
)

watch(
  () => route.query.mode,
  async (mode) => {
    itineraryMode.value = mode === 'itinerary'
    itineraryNotice.value = ''
    if (itineraryMode.value) {
      await ensureItineraryLoaded()
    }
    clearPlacePopup()
    await nextTick()
    renderMapPlacesAfterLayout({
      preserveViewport: !(itineraryMode.value && routeMapPlaces.value.length > 0),
    })
  },
)

watch(tripId, async (nextTripId, previousTripId) => {
  if (!Number.isFinite(nextTripId) || nextTripId === previousTripId) return

  resetTripLocalState()
  loading.value = true
  try {
    await loadTrip()
    await loadDbPlaces()
    if (itineraryMode.value) {
      await ensureItineraryLoaded()
    }
    await searchKakaoPlaces()
  } finally {
    loading.value = false
  }

  await nextTick()
  renderMapPlacesAfterLayout({ preserveViewport: false })
})

watch(activeDayNumber, () => {
  selectedStopId.value = activeStops.value[0]?.id ?? null
  itineraryNotice.value = ''
  renderMapPlaces()
})

watch(activeTab, async (nextTab) => {
  if (nextTab !== 'attraction') {
    if (mapViewportFilter.value) {
      const plan = currentMapKakaoSearchPlan(mapViewportFilter.value)
      await searchKakaoByViewports(
        plan.viewports,
        mapViewportFilter.value,
        plan.pageLimit,
        plan.pageSize,
        plan.maxResults,
      )
      return
    }
    await searchKakaoPlaces()
  }
})

async function loadTrip() {
  if (!tripId.value) return
  if (trip.value?.id === tripId.value) return
  try {
    await tripStore.fetchTripDetail(tripId.value)
  } catch {
    // TripStore 의 error 를 화면에서 표시한다.
  }
}

async function loadPlaceRegions() {
  try {
    placeRegions.value = await fetchPlaceRegions()
  } catch {
    placeRegions.value = []
  }
}

async function loadDbPlaces({ ignoreKeyword = false, size = REGION_PLACE_PAGE_SIZE } = {}) {
  placeError.value = ''
  try {
    const placeQuery = buildDbPlaceQuery({
      keyword: ignoreKeyword ? '' : keyword.value,
      fallbackRegion: tripRegion.value,
      regions: placeRegions.value,
    })
    const result = await fetchPlaces({
      ...placeQuery,
      size,
    })
    dbPlaces.value = (result.items ?? [])
      .map(normalizeDbPlace)
      .filter(hasCoordinates)
      .filter((place) => isWithinPlaceRegion(place, activeRegion.value))
  } catch (error) {
    placeError.value = error?.response?.data?.message || '관광지 데이터를 불러오지 못했습니다.'
    dbPlaces.value = []
  }
}

async function initMap() {
  try {
    kakao = await loadKakaoMaps()
    if (!mapEl.value) {
      throw new Error('Map container is not ready.')
    }
    const center = mapCenter.value
    map = new kakao.maps.Map(mapEl.value, {
      center: new kakao.maps.LatLng(center.lat, center.lng),
      level: 5,
    })
    map.setMinLevel?.(MAP_MIN_LEVEL)
    map.addControl?.(
      new kakao.maps.ZoomControl(),
      kakao.maps.ControlPosition.RIGHT,
    )
    attachMapListeners()
    placesService = new kakao.maps.services.Places(map)
    renderMapPlaces({ preserveViewport: false })
  } catch (error) {
    sdkError.value = error.message
  }
}

async function runSearch() {
  searching.value = true
  mapViewportFilter.value = null
  clearPlacePopup()
  try {
    const anchorViewport = await resolveSearchAnchorViewport()
    if (anchorViewport) {
      focusSearchAnchor(anchorViewport)
      const searchViewport = currentMapKakaoViewport()
      mapViewportFilter.value = searchViewport
      await loadDbPlaces({
        ignoreKeyword: isCurrentKeywordRegionish(),
        size: dbMapPageSizeForLevel(map?.getLevel?.() ?? ANCHOR_SEARCH_LEVEL),
      })
      if (activeTab.value !== 'attraction') {
        const plan = currentMapKakaoSearchPlan(searchViewport)
        await searchKakaoByViewports(
          plan.viewports,
          searchViewport,
          plan.pageLimit,
          plan.pageSize,
          plan.maxResults,
        )
      }
      markMapSearchBaseline()
      return
    }

    await loadDbPlaces()
    await searchKakaoPlaces()
    renderMapPlaces({ preserveViewport: false })
    markMapSearchBaseline({ afterIdle: true })
  } finally {
    searching.value = false
  }
}

function searchKakaoPlaces() {
  kakaoSearchNotice.value = ''
  if (!placesService || activeTab.value === 'attraction') {
    kakaoPlaces.value = []
    return Promise.resolve()
  }

  return searchKakaoByViewports(
    [regionKakaoViewport()],
    undefined,
    REGION_KAKAO_PAGE_LIMIT,
    REGION_KAKAO_PAGE_SIZE,
  )
}

async function searchCurrentMapArea() {
  if (!map) return

  const viewport = currentMapKakaoViewport()
  mapViewportFilter.value = viewport
  clearPlacePopup()
  searching.value = true
  try {
    await loadDbPlaces({
      ignoreKeyword: shouldIgnoreDbKeywordForMapSearch(),
      size: dbMapPageSizeForLevel(map.getLevel()),
    })
    if (activeTab.value === 'attraction') {
      kakaoPlaces.value = []
      return
    }
    if (placesService) {
      const plan = currentMapKakaoSearchPlan(viewport)
      await searchKakaoByViewports(
        plan.viewports,
        viewport,
        plan.pageLimit,
        plan.pageSize,
        plan.maxResults,
      )
    }
    markMapSearchBaseline()
  } finally {
    searching.value = false
  }
}

async function searchKakaoByViewports(
  viewports,
  filterViewport = viewports[0],
  pageLimit = MAX_KAKAO_PAGE_LIMIT,
  pageSize = KAKAO_PAGE_SIZE,
  maxResults,
) {
  kakaoSearchNotice.value = ''
  const targets = kakaoSearchTargets(viewports[0])
  const resultGroups = await Promise.all(
    viewports.flatMap((viewport) =>
      targets.map((target) => fetchKakaoTargetPages(target, viewport, pageLimit, pageSize)),
    ),
  )
  const filteredPlaces = dedupePlaces(
    resultGroups
      .flat()
      .map(normalizeKakaoPlace)
      .filter(hasCoordinates)
      .filter((place) => isWithinSearchViewport(place, filterViewport)),
  )
  const limitedPlaces = limitKakaoPlacesForViewport(filteredPlaces, filterViewport, maxResults)
  kakaoPlaces.value = limitedPlaces
  if (!limitedPlaces.length && shouldShowKakaoSearchNotice(filterViewport)) {
    kakaoSearchNotice.value =
      '이 위치에서는 카카오 장소를 찾지 못했어요. 지도를 조금 옮기거나 확대해서 다시 검색해 보세요.'
  }
}

function shouldShowKakaoSearchNotice(viewport) {
  return activeTab.value !== 'attraction' && Boolean(viewport?.center || keyword.value.trim())
}

async function fetchKakaoTargetPages(target, viewport, pageLimit, pageSize) {
  const pages = []
  for (let page = 1; page <= pageLimit; page += 1) {
    const { data, hasNextPage } = await fetchKakaoPage(target, viewport, page, pageSize)
    pages.push(...data)
    if (!hasNextPage || data.length < pageSize) break
  }
  return pages
}

function fetchKakaoPage(target, viewport, page, pageSize = KAKAO_PAGE_SIZE) {
  const options = {
    ...kakaoSearchOptions(viewport),
    page,
    size: pageSize,
  }

  return new Promise((resolve) => {
    const callback = (data, status, pagination) => {
      if (status !== kakao.maps.services.Status.OK) {
        resolve({ data: [], hasNextPage: false })
        return
      }
      resolve({ data, hasNextPage: Boolean(pagination?.hasNextPage) })
    }

    if (target.type === 'category') {
      placesService.categorySearch(target.categoryCode, callback, options)
      return
    }

    if (target.categoryCode) {
      placesService.keywordSearch(target.keyword, callback, {
        ...options,
        category_group_code: target.categoryCode,
      })
      return
    }

    placesService.keywordSearch(target.keyword, callback, options)
  })
}

function kakaoSearchTargets(viewport) {
  const anchorKeyword = searchAnchorKeyword()
  if (anchorKeyword && viewport?.center) {
    return anchorKakaoTargets(anchorKeyword)
  }

  if (activeTab.value === 'restaurant') {
    return [kakaoFoodTarget('restaurant', viewport)]
  }
  if (activeTab.value === 'cafe') {
    return [kakaoFoodTarget('cafe', viewport)]
  }
  if (hasSpecificAllKeyword()) {
    return [
      {
        type: 'keyword',
        keyword: buildKakaoKeyword({
          keyword: keyword.value,
          region: tripRegion.value,
          tab: 'restaurant',
          regions: placeRegions.value,
        }),
      },
    ]
  }
  if (!viewport?.center) {
    return [
      {
        type: 'keyword',
        keyword: buildKakaoKeyword({
          keyword: keyword.value,
          region: tripRegion.value,
          tab: 'restaurant',
          regions: placeRegions.value,
        }),
      },
      {
        type: 'keyword',
        keyword: buildKakaoKeyword({
          keyword: keyword.value,
          region: tripRegion.value,
          tab: 'cafe',
          regions: placeRegions.value,
        }),
      },
    ]
  }
  return [
    { type: 'category', categoryCode: KAKAO_CATEGORY_CODES.restaurant },
    { type: 'category', categoryCode: KAKAO_CATEGORY_CODES.cafe },
  ]
}

function anchorKakaoTargets(anchorKeyword) {
  if (activeTab.value === 'restaurant') {
    return [anchorFoodTarget(anchorKeyword, 'restaurant')]
  }
  if (activeTab.value === 'cafe') {
    return [anchorFoodTarget(anchorKeyword, 'cafe')]
  }
  return [
    anchorFoodTarget(anchorKeyword, 'restaurant'),
    anchorFoodTarget(anchorKeyword, 'cafe'),
  ]
}

function anchorFoodTarget(anchorKeyword, kind) {
  const categoryCode = KAKAO_CATEGORY_CODES[kind]
  const suffix = kind === 'cafe' ? '카페' : '맛집'
  return {
    type: 'keyword',
    categoryCode,
    keyword: `${anchorKeyword} ${suffix}`,
  }
}

function kakaoFoodTarget(kind, viewport) {
  const categoryCode = KAKAO_CATEGORY_CODES[kind]
  if (!hasSpecificKakaoKeyword(kind) && viewport?.center) {
    return { type: 'category', categoryCode }
  }

  return {
    type: 'keyword',
    categoryCode,
    keyword: buildKakaoKeyword({
      keyword: keyword.value,
      region: tripRegion.value,
      tab: kind,
      regions: placeRegions.value,
    }),
  }
}

function hasSpecificKakaoKeyword(kind) {
  const normalized = normalizeSearchText(keyword.value)
  if (!normalized) return false
  if (activeRegion.value.aliases.some((alias) => normalizeSearchText(alias) === normalized)) return false
  if (kind === 'cafe') return !GENERIC_CAFE_KEYWORDS.has(normalized)
  return !GENERIC_FOOD_KEYWORDS.has(normalized)
}

function hasSpecificAllKeyword() {
  const normalized = normalizeSearchText(keyword.value)
  if (!normalized) return false
  if (activeRegion.value.aliases.some((alias) => normalizeSearchText(alias) === normalized)) return false
  return !GENERIC_FOOD_KEYWORDS.has(normalized) && !GENERIC_CAFE_KEYWORDS.has(normalized)
}

function shouldIgnoreDbKeywordForMapSearch() {
  const normalized = normalizeSearchText(keyword.value)
  if (!normalized) return false
  return !activeRegion.value.aliases.some((alias) => normalizeSearchText(alias) === normalized)
}

function isCurrentKeywordRegionish() {
  const normalized = normalizeSearchText(searchAnchorKeyword() || keyword.value)
  if (!normalized) return false
  return activeRegion.value.aliases.some((alias) => normalizeSearchText(alias) === normalized)
}

function resolveSearchAnchorViewport() {
  const anchorKeyword = searchAnchorKeyword()
  if (!placesService || !anchorKeyword) return Promise.resolve(null)

  return new Promise((resolve) => {
    placesService.keywordSearch(
      anchorKeyword,
      (data, status) => {
        if (status !== kakao.maps.services.Status.OK || !data?.length) {
          resolve(null)
          return
        }

        const anchor = normalizeKakaoPlace(data[0])
        if (!hasCoordinates(anchor)) {
          resolve(null)
          return
        }

        resolve({
          center: {
            lat: anchor.latitude,
            lng: anchor.longitude,
          },
          radius: ANCHOR_SEARCH_RADIUS_METERS,
        })
      },
      { size: 1 },
    )
  })
}

function focusSearchAnchor(viewport) {
  if (!map || !viewport?.center) return
  map.setCenter(new kakao.maps.LatLng(viewport.center.lat, viewport.center.lng))
  map.setLevel(Math.max(MAP_MIN_LEVEL, ANCHOR_SEARCH_LEVEL))
}

function searchAnchorKeyword() {
  const normalized = keyword.value.trim()
  if (!normalized) return ''

  const withoutIntent = normalized
    .replace(/(맛집|식당|음식점|카페|커피|디저트|근처|주변|인근)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!looksLikeAnchorKeyword(withoutIntent)) return ''
  return withoutIntent
}

function looksLikeAnchorKeyword(value) {
  if (!value) return false
  return /(역|터미널|시장|공원|광장|거리|길|마을|해변|해수욕장|궁|성|타워|몰|센터|백화점|대학교|대학|병원)$/.test(
    value,
  )
}

function dedupePlaces(placeItems) {
  const seen = new Set()
  return placeItems.filter((place) => {
    if (seen.has(place.uid)) return false
    seen.add(place.uid)
    return true
  })
}

function limitKakaoPlacesForViewport(placeItems, viewport, maxResults) {
  if (!maxResults || placeItems.length <= maxResults) return placeItems
  if (!viewport?.bounds) return placeItems.slice(0, maxResults)

  const level = map?.getLevel?.() ?? 7
  if (level >= 4) return placeItems.slice(0, maxResults)

  return spatiallyBalancedPlaces(placeItems, viewport, maxResults)
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
    .map(([key, bucket]) => ({
      key,
      bucket,
      priority: viewportGridPriority(key, columns, rows),
    }))
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
  const centerRow = (rows - 1) / 2
  const centerColumn = (columns - 1) / 2
  return Math.hypot(row - centerRow, column - centerColumn)
}

function clampIndex(value, size) {
  return Math.min(size - 1, Math.max(0, value))
}

function renderMapPlaces({ preserveViewport = true } = {}) {
  drawMapPlaces({ preserveViewport })
}

function renderMapPlacesAfterLayout({ preserveViewport = true } = {}) {
  map?.relayout?.()
  renderMapPlaces({ preserveViewport })
  window.requestAnimationFrame(() => {
    map?.relayout?.()
    renderMapPlaces({ preserveViewport })
  })
}

function attachMapListeners() {
  if (!kakao || !map || mapIdleHandler) return
  mapIdleHandler = () => {
    updateMapSignature()
    drawMapPlaces({ preserveViewport: true })
    if (shouldMarkBaselineOnIdle) {
      lastMapSearchSignature.value = currentMapSignature.value
      shouldMarkBaselineOnIdle = false
    }
  }
  mapZoomChangedHandler = () => {
    shouldMarkBaselineOnIdle = false
    updateMapSignature()
    drawMapPlaces({ preserveViewport: true })
  }
  mapClickHandler = () => clearPlacePopup()
  kakao.maps.event.addListener(map, 'idle', mapIdleHandler)
  kakao.maps.event.addListener(map, 'zoom_changed', mapZoomChangedHandler)
  kakao.maps.event.addListener(map, 'click', mapClickHandler)
  updateMapSignature()
}

function removeMapListeners() {
  if (!kakao || !map) return
  if (mapIdleHandler) {
    kakao.maps.event.removeListener(map, 'idle', mapIdleHandler)
  }
  if (mapZoomChangedHandler) {
    kakao.maps.event.removeListener(map, 'zoom_changed', mapZoomChangedHandler)
  }
  if (mapClickHandler) {
    kakao.maps.event.removeListener(map, 'click', mapClickHandler)
  }
  mapIdleHandler = null
  mapZoomChangedHandler = null
  mapClickHandler = null
}

function markMapSearchBaseline({ afterIdle = false } = {}) {
  updateMapSignature()
  lastMapSearchSignature.value = currentMapSignature.value
  shouldMarkBaselineOnIdle = afterIdle
}

function updateMapSignature() {
  currentMapSignature.value = mapSignature()
}

function mapSignature() {
  if (!map) return ''
  const center = map.getCenter()
  const level = map.getLevel()
  return [
    level,
    center.getLat().toFixed(4),
    center.getLng().toFixed(4),
  ].join(':')
}

function drawMapPlaces({ preserveViewport }) {
  if (!kakao || !map) return

  clearOverlays()
  const drawable = mapPlaces.value.filter(hasCoordinates)
  const bounds = new kakao.maps.LatLngBounds()
  const viewport = activeRegion.value
  const markerStates = createMarkerDisplayStates(drawable)

  drawable.forEach((place) => {
    const position = new kakao.maps.LatLng(place.latitude, place.longitude)
    const markerState = markerStates.get(place.uid) || defaultMarkerState()
    bounds.extend(position)
    const overlay = new kakao.maps.CustomOverlay({
      position,
      content: createOverlayContent(place, markerState),
      yAnchor: markerOverlayYAnchor(markerState),
      zIndex: markerState.zIndex,
      clickable: true,
    })
    overlay.setMap(map)
    overlays.push(overlay)
  })
  drawRoutePolylines()

  if (mapViewportFilter.value) {
    return
  }
  if (preserveViewport) {
    return
  }

  if (drawable.length === 1) {
    map.setCenter(new kakao.maps.LatLng(drawable[0].latitude, drawable[0].longitude))
    map.setLevel(Math.max(MAP_MIN_LEVEL, Math.min(2, viewport.mapLevel)))
  } else if (drawable.length > 1) {
    map.setBounds(
      bounds,
      MAP_FIT_PADDING_PX,
      MAP_FIT_PADDING_PX,
      MAP_FIT_PADDING_PX,
      MAP_FIT_PADDING_PX,
    )
    if (map.getLevel() > viewport.mapLevel) {
      map.setLevel(viewport.mapLevel)
    }
  } else {
    focusRegion(viewport)
  }
}

function clearOverlays() {
  routePolylines.forEach((polyline) => polyline.setMap(null))
  routePolylines = []
  overlays.forEach((overlay) => overlay.setMap(null))
  overlays = []
}

function drawRoutePolylines() {
  if (!kakao || !map) return

  days.value.forEach((day) => {
    const isActiveDay = day.dayNumber === activeDayNumber.value
    const isCollectionMode = !itineraryMode.value
    routeSegments(day).forEach((segment) => {
      const polyline = new kakao.maps.Polyline({
        path: segment.path,
        strokeWeight: isCollectionMode ? 3 : isActiveDay ? 5 : 3,
        strokeColor: routeSegmentColor(segment.mode, day.dayNumber),
        strokeOpacity: isCollectionMode ? 0.52 : isActiveDay ? 0.92 : 0.38,
        strokeStyle: segment.actual ? routeSegmentStyle(segment.mode) : 'shortdash',
        zIndex: isCollectionMode ? 20 : isActiveDay ? 36 : 22,
      })
      polyline.setMap(map)
      routePolylines.push(polyline)
    })
  })
}

function routeSegments(day) {
  const stops = (day.stops ?? []).filter((stop) => hasCoordinates(stop.place))
  const segments = []
  for (let index = 0; index < stops.length - 1; index += 1) {
    const from = stops[index]
    const to = stops[index + 1]
    const actualPath = routePathForLeg(from, to)
    const fallbackPath = [from.place, to.place].map((place) => new kakao.maps.LatLng(place.latitude, place.longitude))
    segments.push({
      mode: to.travelFromPrevious?.mode || from.transport || 'other',
      actual: actualPath.length >= 2,
      path: actualPath.length >= 2 ? actualPath : fallbackPath,
    })
  }
  return segments
}

function routePathForLeg(from, to) {
  const estimate = to.travelFromPrevious
  if (!estimate || estimate.fromStopId !== from.id || estimate.status !== 'estimated') {
    return []
  }
  return (estimate.routePath ?? [])
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
    .map((point) => new kakao.maps.LatLng(point.latitude, point.longitude))
}

function routeSegmentColor(mode, dayNumber) {
  if (mode === 'walk') return '#10b981'
  if (mode === 'car') return dayRouteColor(dayNumber)
  if (mode === 'public_transit') return '#8b5cf6'
  return '#64748b'
}

function routeSegmentStyle(mode) {
  if (mode === 'walk') return 'shortdash'
  if (mode === 'public_transit') return 'dash'
  return 'solid'
}

function createOverlayContent(place, markerState = defaultMarkerState()) {
  const routeOrder = itineraryMode.value ? routeOrderForPlace(place) : null
  const routeUsages = itineraryMode.value
    ? otherRouteDayUsagesForPlace(place)
    : allRouteDayUsagesForPlace(place)
  const isCollectionRouteMarker = !itineraryMode.value && routeUsages.length > 0
  const routeStatus = itineraryMode.value
    ? markerRouteStatus(place, routeOrder, routeUsages)
    : collectionMarkerRouteStatus(place, routeUsages)
  const button = document.createElement('button')
  button.type = 'button'
  button.className = [
    'trip-map-pin',
    place.origin === 'db' ? 'is-db' : 'is-kakao',
    `is-${mapMarkerType(place)}`,
    isPocketed(place) ? 'is-pocketed' : '',
    routeOrder ? 'is-routed' : '',
    itineraryMode.value && routeUsages.length ? 'is-used-other-day' : '',
    !itineraryMode.value && routeUsages.length ? 'is-used-in-route' : '',
    !routeOrder && markerState.dot ? 'is-dot' : '',
    !routeOrder && markerState.labelHidden && !isCollectionRouteMarker ? 'is-label-hidden' : '',
    markerState.groupSize > 1 ? 'is-grouped' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const collectionRouteColor = routeUsages[0]?.color || COLLECTION_ROUTE_COLOR
  button.style.setProperty('--marker-offset-x', `${markerState.offset.x}px`)
  button.style.setProperty('--marker-offset-y', `${markerState.offset.y}px`)
  button.style.setProperty(
    '--trip-active-day-color',
    itineraryMode.value ? dayRouteColor(activeDayNumber.value) : collectionRouteColor,
  )
  button.style.setProperty(
    '--trip-other-day-color',
    itineraryMode.value
      ? routeUsages[0]?.color || dayRouteColor(activeDayNumber.value)
      : collectionRouteColor,
  )
  if (markerState.dot) {
    const hiddenCount = markerState.groupSize > 1 ? ` 외 ${markerState.groupSize - 1}곳` : ''
    button.title = `${place.name}${hiddenCount}`
    button.setAttribute('aria-label', `${place.name}${hiddenCount}`)
  }

  const dot = document.createElement('span')
  if (routeOrder) {
    dot.textContent = String(routeOrder)
  } else {
    const icon = document.createElement('i')
    icon.className = markerIconClass(place)
    dot.append(icon)
  }
  const label = document.createElement('strong')
  label.textContent = isCollectionRouteMarker && routeStatus ? routeStatus.label : mapMarkerLabel(place)
  button.append(dot, label)
  if (routeStatus && !isCollectionRouteMarker) {
    const status = document.createElement('em')
    status.className = 'trip-map-pin__status'
    status.textContent = routeStatus.label
    button.append(status)
    button.title = routeStatus.title
    button.setAttribute('aria-label', routeStatus.title)
  }
  if (isCollectionRouteMarker && routeStatus) {
    button.title = routeStatus.title
    button.setAttribute('aria-label', routeStatus.title)
  }
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    handleMapPlaceClick(place)
  })
  return button
}

function createMarkerDisplayStates(drawable) {
  const states = new Map()
  const level = map?.getLevel?.() ?? 5
  const keepFullLabels = itineraryMode.value
  const wideRegionView = !keepFullLabels && level >= 6 && !mapViewportFilter.value
  const entries = drawable
    .map((place, index) => ({
      place,
      index,
      point: markerScreenPoint(place),
    }))
    .filter((entry) => entry.point)

  entries.forEach((entry) => {
    states.set(entry.place.uid, {
      ...defaultMarkerState(),
      labelHidden: wideRegionView,
    })
  })

  if (wideRegionView) {
    return states
  }

  groupMarkerEntries(entries).forEach((group) => {
    const rankedGroup = [...group].sort(compareMarkerPriority)
    const groupPlaces = rankedGroup.map((entry) => entry.place)
    rankedGroup.forEach((entry, groupIndex) => {
      const state = states.get(entry.place.uid)
      state.offset = markerGroupOffset(groupIndex, rankedGroup.length)
      state.groupSize = rankedGroup.length
      state.groupPlaces = groupPlaces
      if (groupIndex > 0 && !keepFullLabels && !shouldKeepRouteMarkerLabel(entry.place)) {
        state.dot = true
      }
    })
  })

  const occupiedLabelRects = []
  ;[...entries].sort(compareMarkerPriority).forEach((entry) => {
    const state = states.get(entry.place.uid)
    if (!state) return

    if (state.dot) {
      state.zIndex = 8
      return
    }

    const labelRect = markerLabelRect(entry, state)
    if (
      occupiedLabelRects.some((rect) => rectsOverlap(labelRect, rect)) &&
      !keepFullLabels &&
      !shouldKeepRouteMarkerLabel(entry.place)
    ) {
      state.dot = true
      state.zIndex = 8
      return
    }

    occupiedLabelRects.push(labelRect)
    state.zIndex = 10
  })

  return states
}

function defaultMarkerState() {
  return {
    dot: false,
    labelHidden: false,
    groupSize: 1,
    groupPlaces: [],
    offset: { x: 0, y: 0 },
    zIndex: 10,
  }
}

function markerOverlayYAnchor(markerState) {
  if (markerState.dot || markerState.labelHidden) return 0.5
  return 0.32
}

function markerScreenPoint(place) {
  try {
    const projection = map.getProjection?.()
    const point = projection?.pointFromCoords(
      new kakao.maps.LatLng(place.latitude, place.longitude),
    )
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
    return { x: point.x, y: point.y }
  } catch {
    return null
  }
}

function groupMarkerEntries(entries) {
  const groups = []

  entries.forEach((entry) => {
    const group = groups.find(
      (candidate) =>
        distanceBetweenPoints(entry.point, candidate.center) <= markerGroupDistance(),
    )

    if (!group) {
      groups.push({
        center: { ...entry.point },
        entries: [entry],
      })
      return
    }

    group.entries.push(entry)
    group.center = averagePoint(group.entries)
  })

  return groups.map((group) => group.entries)
}

function markerGroupDistance() {
  const level = map?.getLevel?.() ?? 5
  if (level <= 1) return 18
  if (level === 2) return 24
  return MARKER_GROUP_DISTANCE_PX
}

function markerGroupOffset(index, groupSize) {
  if (groupSize <= 1) return { x: 0, y: 0 }

  const radius = groupSize <= 3 ? 22 : 30
  const visibleSlots = Math.min(groupSize, 8)
  const angle = (-90 + (360 / visibleSlots) * (index % visibleSlots)) * (Math.PI / 180)
  const ring = Math.floor(index / visibleSlots)

  return {
    x: Math.round(Math.cos(angle) * (radius + ring * 10)),
    y: Math.round(Math.sin(angle) * (radius + ring * 10)),
  }
}

function markerLabelRect(entry, state) {
  const width = markerLabelWidth(mapMarkerLabel(entry.place))
  const x = entry.point.x + state.offset.x - width / 2
  const y = entry.point.y + state.offset.y - MARKER_LABEL_HEIGHT_PX

  return {
    left: x - MARKER_LABEL_COLLISION_GAP_PX,
    right: x + width + MARKER_LABEL_COLLISION_GAP_PX,
    top: y - MARKER_LABEL_COLLISION_GAP_PX,
    bottom: y + MARKER_LABEL_HEIGHT_PX + MARKER_LABEL_COLLISION_GAP_PX,
  }
}

function markerLabelWidth(label) {
  return Math.min(148, Math.max(MARKER_ICON_SIZE_PX, 58 + label.length * 10))
}

function compareMarkerPriority(a, b) {
  return markerPriorityScore(a) - markerPriorityScore(b)
}

function markerPriorityScore(entry) {
  let score = entry.index
  if (shouldKeepRouteMarkerLabel(entry.place)) score -= 1500
  if (isPocketed(entry.place)) score -= 1000
  if (entry.place.origin === 'kakao') score -= 80
  if (entry.place.origin === 'db') score -= 40
  return score
}

function shouldKeepRouteMarkerLabel(place) {
  if (itineraryMode.value) {
    return Boolean(routeOrderForPlace(place) || otherRouteDayUsagesForPlace(place).length)
  }
  return Boolean(allRouteDayUsagesForPlace(place).length)
}

function distanceBetweenPoints(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function averagePoint(entries) {
  const total = entries.reduce(
    (acc, entry) => ({
      x: acc.x + entry.point.x,
      y: acc.y + entry.point.y,
    }),
    { x: 0, y: 0 },
  )

  return {
    x: total.x / entries.length,
    y: total.y / entries.length,
  }
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

async function selectPlace(place, { pan = true } = {}) {
  selectedPlace.value = place
  let position = null
  if (map && kakao && hasCoordinates(place)) {
    position = new kakao.maps.LatLng(place.latitude, place.longitude)
    if (pan) map.panTo(position)
    schedulePlacePopup(place, position, { delayed: pan })
  }
  const detailPlace = await resolveDbPlaceDetail(place)
  if (!detailPlace || selectedPlace.value?.uid !== place.uid) return

  selectedPlace.value = detailPlace
  if (map && kakao && hasCoordinates(detailPlace)) {
    schedulePlacePopup(
      detailPlace,
      position || new kakao.maps.LatLng(detailPlace.latitude, detailPlace.longitude),
      { delayed: pan },
    )
  }
}

async function resolveDbPlaceDetail(place) {
  if (place.origin !== 'db' || place.sourceId == null) return null
  if (dbPlaceDetailCache.has(place.uid)) return dbPlaceDetailCache.get(place.uid)

  if (!dbPlaceDetailRequests.has(place.uid)) {
    const request = fetchPlaceDetail(place.sourceId)
      .then((detail) => {
        const detailPlace = {
          ...place,
          ...normalizeDbPlace(detail),
        }
        dbPlaceDetailCache.set(place.uid, detailPlace)
        return detailPlace
      })
      .finally(() => {
        dbPlaceDetailRequests.delete(place.uid)
      })
    dbPlaceDetailRequests.set(place.uid, request)
  }

  try {
    return await dbPlaceDetailRequests.get(place.uid)
  } catch (error) {
    if (selectedPlace.value?.uid === place.uid) {
      placeError.value = error?.response?.data?.message || '장소 상세 정보를 불러오지 못했습니다.'
    }
    return null
  }
}

function schedulePlacePopup(place, position, { delayed = false } = {}) {
  clearPlacePopupTimer()
  const show = () => {
    placePopupTimer = null
    if (selectedPlace.value?.uid !== place.uid) return
    showPlacePopup(place, position)
  }

  if (delayed) {
    placePopupTimer = window.setTimeout(show, 450)
    return
  }
  show()
}

function showPlacePopup(place, position) {
  if (!kakao || !map) return
  clearPlacePopup({ clearSelection: false })

  placePopupOverlay = new kakao.maps.CustomOverlay({
    position,
    content: createPlacePopupContent(place),
    xAnchor: 0.5,
    yAnchor: 1.1,
    zIndex: 50,
    clickable: true,
  })
  placePopupOverlay.setMap(map)
  requestAnimationFrame(() => keepPlacePopupInView())
}

function clearPlacePopup({ clearSelection = true } = {}) {
  clearPlacePopupTimer()
  if (placePopupOverlay) {
    placePopupOverlay.setMap(null)
    placePopupOverlay = null
  }
  if (clearSelection) {
    selectedPlace.value = null
  }
}

function clearPlacePopupTimer() {
  if (!placePopupTimer) return
  window.clearTimeout(placePopupTimer)
  placePopupTimer = null
}

function createPlacePopupContent(place) {
  const popup = document.createElement('article')
  popup.className = 'trip-place-popup'
  popup.addEventListener('click', (event) => event.stopPropagation())
  popup.addEventListener('mousedown', preventPopupMapEvent)
  popup.addEventListener('touchstart', preventPopupMapEvent, { passive: false })

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'trip-place-popup__close'
  closeButton.setAttribute('aria-label', '장소 팝업 닫기')
  closeButton.innerHTML = '<i class="pi pi-times" aria-hidden="true"></i>'
  closeButton.addEventListener('click', (event) => {
    event.stopPropagation()
    clearPlacePopup()
  })

  const content = document.createElement('div')
  content.className = 'trip-place-popup__content'

  const title = document.createElement('h3')
  title.textContent = place.name

  const meta = document.createElement('p')
  meta.className = 'trip-place-popup__meta'
  meta.textContent = popupMeta(place)

  const summaryText = popupSummary(place)
  const summary = document.createElement('p')
  summary.className = 'trip-place-popup__summary'
  summary.textContent = summaryText

  const imageUrl = safeExternalUrl(place.imageUrl)
  const hero = imageUrl ? document.createElement('img') : null
  if (hero) {
    hero.className = 'trip-place-popup__image'
    hero.src = imageUrl
    hero.alt = ''
    hero.loading = 'lazy'
  }

  const actions = document.createElement('div')
  actions.className = 'trip-place-popup__actions'

  const pocketButton = document.createElement('button')
  pocketButton.type = 'button'
  pocketButton.className = 'trip-place-popup__button is-primary'
  pocketButton.innerHTML = popupPocketLabel(place)
  pocketButton.addEventListener('click', (event) => {
    event.stopPropagation()
    togglePocket(place)
    pocketButton.innerHTML = popupPocketLabel(place)
  })
  actions.append(pocketButton)

  const homepageUrl = safeExternalUrl(place.homepage)
  if (homepageUrl) {
    const homepage = document.createElement('a')
    homepage.className = 'trip-place-popup__button'
    homepage.href = homepageUrl
    homepage.target = '_blank'
    homepage.rel = 'noreferrer'
    homepage.textContent = '홈페이지'
    actions.append(homepage)
  }

  const kakaoPlaceUrl = safeExternalUrl(place.placeUrl)
  if (kakaoPlaceUrl) {
    const link = document.createElement('a')
    link.className = 'trip-place-popup__button'
    link.href = kakaoPlaceUrl
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = '카카오맵에서 보기'
    actions.append(link)
  }

  if (hero) {
    content.append(hero)
  }
  content.append(title, meta)
  if (summaryText && summaryText !== meta.textContent) {
    content.append(summary)
  }
  const info = createPopupInfo(place)
  if (info) {
    content.append(info)
  }
  content.append(actions)
  popup.append(content, closeButton)
  return popup
}

function preventPopupMapEvent(event) {
  event.stopPropagation()
  kakao?.maps?.event?.preventMap?.()
}

function popupPocketLabel(place) {
  const icon = isPocketed(place) ? 'pi-bookmark-fill' : 'pi-bookmark'
  const label = pocketActionLabel(place)
  return `<i class="pi ${icon}" aria-hidden="true"></i><span>${label}</span>`
}

function popupMeta(place) {
  return [place.address, place.category].filter(Boolean).join(' · ') || '장소 정보'
}

function popupSummary(place) {
  return [place.description, place.summary, place.facilities].find(isPopupSummaryValue) || ''
}

function isPopupSummaryValue(value = '') {
  const trimmed = String(value || '').trim()
  return (
    Boolean(trimmed) &&
    !/^https?:\/\//.test(trimmed) &&
    trimmed !== '카카오 실시간 검색 결과' &&
    trimmed !== '공공데이터 관광지'
  )
}

function createPopupInfo(place) {
  const rows = [
    { label: '전화', value: place.phone },
    { label: '시설', value: formatFacilities(place.facilities) },
  ].filter((row) => row.value && row.value !== popupSummary(place))

  if (!rows.length) return null

  const info = document.createElement('dl')
  info.className = 'trip-place-popup__info'
  rows.forEach((row) => {
    const term = document.createElement('dt')
    term.textContent = row.label
    const value = document.createElement('dd')
    value.textContent = row.value
    info.append(term, value)
  })
  return info
}

function formatFacilities(value = '') {
  return String(value || '')
    .replace(/^public:\s*/i, '')
    .replace(/;\s*/g, ' · ')
    .replace(/\+/g, ', ')
    .trim()
}

function safeExternalUrl(value = '') {
  const trimmed = String(value || '').trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : ''
}

async function openItineraryBuilder() {
  itineraryMode.value = true
  await router.replace({
    name: 'trip-place-search',
    params: { tripId: tripId.value },
    query: { ...route.query, mode: 'itinerary' },
  })
  await ensureItineraryLoaded()
  clearPlacePopup()
  await nextTick()
  renderMapPlacesAfterLayout({ preserveViewport: false })
}

async function closeItineraryBuilder() {
  itineraryMode.value = false
  itineraryNotice.value = ''
  const { mode, ...nextQuery } = route.query
  await router.replace({
    name: 'trip-place-search',
    params: { tripId: tripId.value },
    query: nextQuery,
  })
  await nextTick()
  renderMapPlacesAfterLayout()
}

async function ensureItineraryLoaded() {
  if (!tripId.value) return
  if (itineraryStore.itinerary?.trip?.id === tripId.value) return
  try {
    await itineraryStore.fetchTripItinerary(tripId.value, trip.value)
    activeDayNumber.value = days.value[0]?.dayNumber ?? 1
    selectedStopId.value = activeStops.value[0]?.id ?? null
  } catch {
    // store error를 오른쪽 일정 패널에서 표시한다.
  }
}

async function addPocketPlaceToRoute(place) {
  await ensureItineraryLoaded()
  if (!activeDay.value) return

  const itineraryPlace = toItineraryPlace(place)
  if (hasStopForPlace(activeDay.value, itineraryPlace)) {
    const currentStop = activeDay.value.stops.find(
      (stop) => stopPlaceKey(stop) === placeKey(itineraryPlace),
    )
    if (!currentStop) return
    await deleteStop(currentStop)
    return
  }

  try {
    const stop = await itineraryStore.addPlaceToDay(tripId.value, activeDayNumber.value, itineraryPlace, {
      selectedTime: nextDefaultTime(activeStops.value),
      transport: 'walk',
    })
    selectedStopId.value = stop.id
    itineraryNotice.value = `${place.name}을(를) ${activeDayNumber.value}일차 루트에 추가했습니다.`
  } catch {
    // store error를 오른쪽 일정 패널에서 표시한다.
  }
}

async function handleMapPlaceClick(place) {
  if (itineraryMode.value) {
    await addPocketPlaceToRoute(place)
    return
  }

  selectPlace(place, { pan: false })
}

async function updateStopField(stop) {
  const draft = stopDraft(stop)
  try {
    await itineraryStore.updateStop(tripId.value, activeDayNumber.value, stop.id, {
      selectedTime: draft.selectedTime,
      memo: draft.memo,
      transport: draft.transport,
    })
    selectedStopId.value = stop.id
  } catch {
    resetStopDraft(stop)
    // store error를 오른쪽 일정 패널에서 표시한다.
  }
}

async function updateLegTransport(stop, transport) {
  const draft = {
    ...stopDraft(stop),
    transport,
  }
  setStopDraft(stop, { transport })
  try {
    await itineraryStore.updateStop(tripId.value, activeDayNumber.value, stop.id, {
      selectedTime: draft.selectedTime,
      memo: draft.memo,
      transport: draft.transport,
    })
    await itineraryStore.fetchTripItinerary(tripId.value, trip.value)
    selectedStopId.value = stop.id
  } catch {
    resetStopDraft(stop)
    // store error를 오른쪽 일정 패널에서 표시한다.
  }
}

async function updateManualTravelDuration(stop) {
  const draft = stopDraft(stop)
  const manualTravelDurationMinutes = normalizeManualTravelMinutes(draft.manualTravelMinutes)
  if (!manualTravelDurationMinutes) {
    resetStopDraft(stop)
    return
  }

  try {
    await itineraryStore.updateStop(tripId.value, activeDayNumber.value, stop.id, {
      selectedTime: draft.selectedTime,
      memo: draft.memo,
      transport: draft.transport,
      manualTravelDurationMinutes,
    })
    await itineraryStore.fetchTripItinerary(tripId.value, trip.value)
    selectedStopId.value = stop.id
  } catch {
    resetStopDraft(stop)
    // store error를 오른쪽 일정 패널에서 표시한다.
  }
}

async function deleteStop(stop) {
  try {
    await itineraryStore.deleteStop(tripId.value, activeDayNumber.value, stop.id)
    selectedStopId.value = activeStops.value[0]?.id ?? null
    itineraryNotice.value = `${stop.place.name}을(를) 루트에서 제거했습니다.`
  } catch {
    // store error를 오른쪽 일정 패널에서 표시한다.
  }
}

function keepPlacePopupInView() {
  if (!mapEl.value || !placePopupOverlay) return

  const popup = mapEl.value.querySelector('.trip-place-popup')
  if (!popup) return

  const mapRect = mapEl.value.getBoundingClientRect()
  const popupRect = popup.getBoundingClientRect()
  let moveX = 0
  let moveY = 0

  if (popupRect.left < mapRect.left + POPUP_EDGE_PADDING_PX) {
    moveX = popupRect.left - mapRect.left - POPUP_EDGE_PADDING_PX
  } else if (popupRect.right > mapRect.right - POPUP_EDGE_PADDING_PX) {
    moveX = popupRect.right - mapRect.right + POPUP_EDGE_PADDING_PX
  }

  if (popupRect.top < mapRect.top + POPUP_EDGE_PADDING_PX) {
    moveY = popupRect.top - mapRect.top - POPUP_EDGE_PADDING_PX
  } else if (popupRect.bottom > mapRect.bottom - POPUP_EDGE_PADDING_PX) {
    moveY = popupRect.bottom - mapRect.bottom + POPUP_EDGE_PADDING_PX
  }

  if (moveX || moveY) {
    map.panBy(moveX, moveY)
  }
}

function togglePocket(place) {
  if (isPocketed(place)) {
    pocketIds.value = pocketIds.value.filter((id) => id !== place.uid)
    const nextLookup = new Map(pocketPlaceLookup.value)
    nextLookup.delete(place.uid)
    pocketPlaceLookup.value = nextLookup
    return
  }
  const nextLookup = new Map(pocketPlaceLookup.value)
  nextLookup.set(place.uid, place)
  pocketPlaceLookup.value = nextLookup
  pocketIds.value = [...pocketIds.value, place.uid]
}

function clearPocketPlaces() {
  pocketIds.value = []
  pocketPlaceLookup.value = new Map()
}

function resetTripLocalState() {
  clearPocketPlaces()
  selectedPlace.value = null
  selectedStopId.value = null
  stopDrafts.value = {}
  itineraryNotice.value = ''
  placeError.value = ''
  kakaoSearchNotice.value = ''
  currentPage.value = 1
  mapViewportFilter.value = null
  currentMapSignature.value = ''
  lastMapSearchSignature.value = ''
  clearPlacePopup()
}

function pocketActionLabel(place) {
  return isPocketed(place) ? '담기 취소' : '담기'
}

function goToPage(pageNumber) {
  currentPage.value = Math.min(Math.max(pageNumber, 1), totalPages.value)
}

function isPocketed(place) {
  return pocketIds.value.includes(place.uid)
}

function isRoutedPlace(place) {
  return allRouteDayUsagesForPlace(place).length > 0
}

function syncStopDrafts() {
  const nextDrafts = {}
  activeStops.value.forEach((stop) => {
    nextDrafts[stop.id] = defaultStopDraft(stop)
  })
  stopDrafts.value = nextDrafts
}

function stopDraft(stop) {
  return stopDrafts.value[stop.id] || defaultStopDraft(stop)
}

function setStopDraft(stop, patch) {
  stopDrafts.value = {
    ...stopDrafts.value,
    [stop.id]: {
      ...defaultStopDraft(stop),
      ...stopDrafts.value[stop.id],
      ...patch,
    },
  }
}

function resetStopDraft(stop) {
  setStopDraft(stop, defaultStopDraft(stop))
}

function defaultStopDraft(stop) {
  return {
    selectedTime: stop.selectedTime || '',
    memo: stop.memo || '',
    transport: stop.transport || 'walk',
    manualTravelMinutes: manualTravelMinutesValue(stop.travelFromPrevious),
  }
}

function travelEstimateLabel(stop) {
  const estimate = stop?.travelFromPrevious
  if (!estimate) return '계산 대기'
  if (estimate.status === 'manual') {
    return `직접 ${formatTravelDuration(estimate.durationSeconds)}`
  }
  if (estimate.status === 'estimated') {
    return [travelProviderLabel(estimate.provider), formatTravelDuration(estimate.durationSeconds), formatTravelDistance(estimate.distanceMeters)]
      .filter(Boolean)
      .join(' · ')
  }
  const labels = {
    manual_required: '직접 입력 필요',
    missing_coordinates: '좌표 없음',
    not_configured: '키 미설정',
    failed: '계산 실패',
  }
  return labels[estimate.status] || '계산 대기'
}

function travelProviderLabel(provider) {
  if (provider === 'tmap') return 'TMAP'
  return ''
}

function travelEstimateTitle(stop) {
  const estimate = stop?.travelFromPrevious
  if (estimate?.status === 'manual') {
    return '직접 입력한 구간 소요시간입니다.'
  }
  if (estimate?.provider === 'tmap' && estimate.status === 'estimated') {
    return 'TMAP API로 계산된 구간 소요시간입니다.'
  }
  return travelEstimateLabel(stop)
}

function formatTravelDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes ? `${hours}시간 ${restMinutes}분` : `${hours}시간`
}

function formatTravelDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return ''
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)}km`
}

function isManualTravelInputVisible(stop) {
  return stopDraft(stop).transport === 'public_transit'
}

function manualTravelMinutesValue(estimate) {
  if (!estimate || estimate.status !== 'manual' || !Number.isFinite(estimate.durationSeconds)) {
    return ''
  }
  return String(Math.max(1, Math.round(estimate.durationSeconds / 60)))
}

function normalizeManualTravelMinutes(value) {
  const numeric = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(numeric) || numeric < 1) {
    return null
  }
  return Math.min(numeric, 1440)
}

function routeOrderForPlace(place) {
  return activeRoutePlaceKeys.value.get(routePlaceKey(place)) ?? null
}

function otherRouteDayUsagesForPlace(place) {
  const key = routePlaceKey(place)
  return days.value
    .filter((day) => day.dayNumber !== activeDayNumber.value)
    .filter((day) => day.stops.some((stop) => stopPlaceKey(stop) === key))
    .map((day) => ({
      dayNumber: day.dayNumber,
      label: `${day.dayNumber}일차`,
      color: dayRouteColor(day.dayNumber),
    }))
}

function allRouteDayUsagesForPlace(place) {
  const key = routePlaceKey(place)
  return days.value
    .filter((day) => day.stops.some((stop) => stopPlaceKey(stop) === key))
    .map((day) => ({
      dayNumber: day.dayNumber,
      label: `${day.dayNumber}일차`,
      color: dayRouteColor(day.dayNumber),
    }))
}

function collectionMarkerRouteStatus(place, routeUsages = []) {
  if (!routeUsages.length) return null

  const dayLabels = routeUsages.map((usage) => usage.label)
  const daysText = dayLabels.join(', ')
  return {
    label: dayLabels.join('·'),
    title: `${place.name}, ${daysText} 일정에 포함된 장소`,
  }
}

function markerRouteStatus(place, routeOrder, otherDayUsages = []) {
  const otherDayLabels = otherDayUsages.map((usage) => usage.label)

  if (routeOrder && otherDayLabels.length) {
    const otherDays = otherDayLabels.join(', ')
    return {
      label: `추가됨 · ${otherDayLabels.join('·')}`,
      title: `${place.name}, 현재 ${activeDayNumber.value}일차에 추가됨, ${otherDays}에도 포함됨`,
    }
  }

  if (routeOrder) {
    return {
      label: '추가됨',
      title: `${place.name}, 현재 ${activeDayNumber.value}일차에 이미 추가됨`,
    }
  }

  if (otherDayLabels.length) {
    const otherDays = otherDayLabels.join(', ')
    return {
      label: otherDayLabels.join('·'),
      title: `${place.name}, ${otherDays}에 이미 포함됨. 현재 날짜에도 추가할 수 있음`,
    }
  }

  return null
}

function dayRouteColor(dayNumber) {
  const index = Math.max(0, Number(dayNumber || 1) - 1)
  return DAY_ROUTE_COLORS[index % DAY_ROUTE_COLORS.length]
}

function routePlaceKey(place) {
  return placeKey(toItineraryPlace(place))
}

function dedupeRouteMapPlaces(places = []) {
  const merged = new Map()
  places
    .filter(Boolean)
    .map(toMapPlace)
    .filter(hasCoordinates)
    .forEach((place) => {
      merged.set(routePlaceKey(place), place)
    })
  return [...merged.values()]
}

function toMapPlace(place = {}) {
  if (place.uid && place.origin) return place

  const source = String(place.source || place.provider || '').toUpperCase()
  const origin = source === 'DB' ? 'db' : 'kakao'
  const sourceId = origin === 'db' ? place.dbPlaceId : place.sourcePlaceId
  const uid = placeKey(place)
  return {
    uid,
    origin,
    sourceId,
    provider: place.provider || source || origin.toUpperCase(),
    dbPlaceId: place.dbPlaceId ?? null,
    sourcePlaceId: place.sourcePlaceId || String(sourceId ?? uid),
    placeType: place.placeType || 'ETC',
    name: place.name || '장소',
    category: place.category || '',
    categoryGroup: place.categoryGroup || '',
    region1: place.region1 || '',
    region2: place.region2 || '',
    address: place.address || '',
    roadAddress: place.roadAddress || '',
    latitude: place.latitude,
    longitude: place.longitude,
    phone: place.phone || '',
    homepage: place.homepage || '',
    placeUrl: place.placeUrl || '',
    description: place.description || '',
    summary: place.summary || '',
    facilities: place.facilities || '',
    imageUrl: place.imageUrl || '',
  }
}

function toItineraryPlace(place) {
  const placeType = toItineraryPlaceType(place)
  const source = place.origin === 'db' ? 'DB' : 'KAKAO'
  return {
    source,
    provider: place.provider || source,
    dbPlaceId: place.origin === 'db' ? place.sourceId : null,
    sourcePlaceId: String(place.sourceId ?? place.uid ?? place.name),
    placeType,
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

function toItineraryPlaceType(place) {
  const markerType = mapMarkerType(place)
  if (markerType === 'attraction') return 'ATTRACTION'
  if (markerType === 'restaurant') return 'RESTAURANT'
  if (markerType === 'cafe') return 'CAFE'
  return 'ETC'
}

function goBack() {
  router.push({ name: 'trip-detail', params: { tripId: tripId.value } })
}

function goHome() {
  router.push({ name: 'home' })
}

function goProfile() {
  router.push({ name: 'profile' })
}

function mapMarkerType(place) {
  if (place.origin === 'db') return 'attraction'
  if (place.categoryGroup.includes('카페') || place.category.includes('카페')) return 'cafe'
  if (place.categoryGroup.includes('음식점') || place.category.includes('음식점')) return 'restaurant'
  return 'place'
}

function markerIconClass(place) {
  const markerType = mapMarkerType(place)
  if (markerType === 'attraction') return 'pi pi-map-marker'
  if (markerType === 'cafe') return 'pi pi-shop'
  if (markerType === 'restaurant') return 'pi pi-shopping-bag'
  return 'pi pi-map-marker'
}

function mapMarkerLabel(place) {
  return truncateMarkerName(place.name)
}

function truncateMarkerName(name = '') {
  const trimmed = name.trim()
  if (trimmed.length <= 7) return trimmed
  return `${trimmed.slice(0, 7)}…`
}

function hasCoordinates(place) {
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
}

function fallbackPinStyle(place) {
  const drawable = mapPlaces.value.filter(hasCoordinates)
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

function focusRegion(viewport) {
  if (!viewport?.center) return
  map.setCenter(new kakao.maps.LatLng(viewport.center.lat, viewport.center.lng))
  map.setLevel(viewport.mapLevel)
}

function regionKakaoViewport() {
  if (!activeRegion.value.center) return null
  return {
    center: activeRegion.value.center,
    radius: MAX_KAKAO_RADIUS_METERS,
  }
}

function currentMapKakaoViewport() {
  if (!map) return regionKakaoViewport()

  const center = map.getCenter()
  const bounds = map.getBounds()
  const level = map.getLevel()
  const baseRadius = mapSearchRadius(bounds, center)
  const useRadiusFilter = level >= 4
  return {
    center: {
      lat: center.getLat(),
      lng: center.getLng(),
    },
    bounds: mapBoundsToPlain(bounds),
    radius: centerFocusedRadius(baseRadius, level),
    useRadiusFilter,
  }
}

function currentMapKakaoSearchPlan(viewport) {
  const level = map?.getLevel?.() ?? 7
  const pageLimit = kakaoPageLimitForLevel(level)
  if (level <= 3) {
    return {
      viewports: currentMapGridViewports(viewport),
      pageLimit,
      pageSize: kakaoPageSizeForLevel(level),
      maxResults: kakaoMaxResultsForLevel(level),
    }
  }
  return {
    viewports: [viewport],
    pageLimit,
    pageSize: kakaoPageSizeForLevel(level),
    maxResults: kakaoMaxResultsForLevel(level),
  }
}

function kakaoPageLimitForLevel(level) {
  if (level <= 1) return MAX_KAKAO_PAGE_LIMIT
  return 1
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

function dbMapPageSizeForLevel(level) {
  if (level <= 2) return 80
  if (level <= 4) return MAP_PLACE_PAGE_SIZE
  return 36
}

function currentMapGridViewports(viewport) {
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

function centerFocusedRadius(baseRadius, level) {
  if (level <= 2) return baseRadius
  if (level === 3) return clampRadius(baseRadius * 0.75, 250, 700)
  if (level === 4) return clampRadius(baseRadius * 0.58, 320, 900)
  if (level === 5) return clampRadius(baseRadius * 0.42, 400, 1100)
  if (level === 6) return clampRadius(baseRadius * 0.32, 520, 1400)
  return clampRadius(baseRadius * 0.22, 700, 1800)
}

function plainBoundsRadius(bounds, center) {
  const farthest = Math.max(
    distanceMeters(center.lat, center.lng, bounds.maxLat, bounds.maxLng),
    distanceMeters(center.lat, center.lng, bounds.minLat, bounds.minLng),
  )

  return Math.min(
    MAX_KAKAO_RADIUS_METERS,
    Math.max(MIN_KAKAO_RADIUS_METERS, Math.ceil(farthest)),
  )
}

function clampRadius(value, min, max) {
  return Math.min(max, Math.max(min, Math.ceil(value)))
}

function kakaoSearchOptions(viewport) {
  if (!viewport?.center) return {}

  const options = {
    location: new kakao.maps.LatLng(viewport.center.lat, viewport.center.lng),
    sort: kakao.maps.services.SortBy.DISTANCE,
  }

  if (viewport.bounds && viewport.useRadiusFilter === false) {
    options.bounds = plainBoundsToKakaoBounds(viewport.bounds)
    return options
  }

  if (Number.isFinite(viewport.radius)) {
    options.radius = viewport.radius
  }

  return options
}

function plainBoundsToKakaoBounds(bounds) {
  const kakaoBounds = new kakao.maps.LatLngBounds()
  kakaoBounds.extend(new kakao.maps.LatLng(bounds.minLat, bounds.minLng))
  kakaoBounds.extend(new kakao.maps.LatLng(bounds.maxLat, bounds.maxLng))
  return kakaoBounds
}

function mapSearchRadius(bounds, center) {
  if (!bounds || !center) return MAX_KAKAO_RADIUS_METERS

  const northEast = bounds.getNorthEast()
  const southWest = bounds.getSouthWest()
  const farthest = Math.max(
    distanceMeters(center.getLat(), center.getLng(), northEast.getLat(), northEast.getLng()),
    distanceMeters(center.getLat(), center.getLng(), southWest.getLat(), southWest.getLng()),
  )

  return Math.min(
    MAX_KAKAO_RADIUS_METERS,
    Math.max(MIN_KAKAO_RADIUS_METERS, Math.ceil(farthest)),
  )
}

function mapBoundsToPlain(bounds) {
  const northEast = bounds.getNorthEast()
  const southWest = bounds.getSouthWest()
  return {
    minLat: southWest.getLat(),
    maxLat: northEast.getLat(),
    minLng: southWest.getLng(),
    maxLng: northEast.getLng(),
  }
}

function isWithinSearchViewport(place, viewport) {
  if (viewport?.useRadiusFilter || !viewport?.bounds) {
    if (!viewport?.center || !Number.isFinite(viewport.radius)) return true
    return (
      distanceMeters(
        viewport.center.lat,
        viewport.center.lng,
        place.latitude,
        place.longitude,
      ) <= viewport.radius
    )
  }
  const { minLat, maxLat, minLng, maxLng } = viewport.bounds
  return (
    place.latitude >= minLat &&
    place.latitude <= maxLat &&
    place.longitude >= minLng &&
    place.longitude <= maxLng
  )
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

function normalizeSearchText(value = '') {
  return value.trim().replace(/\s+/g, '').toLowerCase()
}
</script>

<template>
  <main class="place-page">
    <section class="workspace-page">
      <header class="workspace-topbar">
        <button type="button" class="workspace-logo" @click="goHome">Trip<b>Log</b></button>
        <button type="button" class="workspace-crumb" @click="goBack">
          {{ trip?.title || '여행' }}
          <span>/</span>
          <strong>{{ itineraryMode ? '일정 배치' : '장소 담기' }}</strong>
        </button>
        <div class="workspace-steps" aria-label="여행 계획 단계">
          <span :class="{ active: !itineraryMode }">① 장소 담기</span>
          <i aria-hidden="true">›</i>
          <span :class="{ active: itineraryMode }">② 일정 배치</span>
        </div>
        <Button
          v-if="!itineraryMode"
          class="workspace-next-button"
          label="일정 배치하기 →"
          severity="primary"
          :disabled="!pocketDisplayPlaces.length"
          :loading="itineraryStore.loading"
          @click="openItineraryBuilder"
        />
        <Button
          v-else
          class="workspace-next-button"
          label="장소 더 담기"
          severity="secondary"
          outlined
          @click="closeItineraryBuilder"
        />
        <button type="button" class="workspace-avatar" aria-label="프로필" @click="goProfile">지</button>
      </header>

      <div class="workspace-title">
        <span class="eyebrow">{{ itineraryMode ? 'Route Builder' : 'Place Search' }}</span>
        <h1>{{ itineraryMode ? '담은 장소를 일정으로 엮어요' : `${tripRegion} 주변 장소를 담아요` }}</h1>
        <p>
          {{
            itineraryMode
              ? '날짜를 고르고 지도 마커를 눌러 방문 순서와 이동 구간을 만듭니다.'
              : '관광 데이터와 카카오맵 검색 결과를 한 화면에서 확인하고 보관함에 담습니다.'
          }}
        </p>
      </div>

      <Message v-if="tripStore.error && !trip" severity="error" :closable="false" class="state-message">
        {{ tripStore.error }}
      </Message>

      <section v-if="loading" class="loading-state" aria-live="polite">
        <ProgressSpinner aria-label="장소 탐색 화면 준비 중" />
        <span>지도와 장소 데이터를 준비하는 중입니다.</span>
      </section>

      <section v-else class="search-shell" :class="{ planning: itineraryMode }">
      <aside class="place-list-panel" :class="{ planning: itineraryMode }">
        <template v-if="!itineraryMode">
          <div class="panel-head">
            <strong>장소 찾기</strong>
            <small>{{ activeRegion.label || tripRegion }}</small>
          </div>
          <div class="search-card">
            <div class="field-row">
              <InputText
                v-model="keyword"
                placeholder="카페, 관광지, 식당..."
                aria-label="장소 검색어"
                @keyup.enter="runSearch"
              />
              <Button icon="pi pi-search" aria-label="검색" :loading="searching" @click="runSearch" />
            </div>
            <div class="category-row" aria-label="장소 유형">
              <button
                v-for="option in CATEGORY_OPTIONS"
                :key="option.value"
                type="button"
                :class="{ active: option.value === activeTab }"
                @click="activeTab = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <Message v-if="placeError" severity="warn" :closable="false">
            {{ placeError }}
          </Message>
          <Message v-if="kakaoSearchNotice" severity="info" :closable="false">
            {{ kakaoSearchNotice }}
          </Message>

          <div class="list-head">
            <span>검색 결과</span>
            <strong>{{ visiblePlaces.length }}곳</strong>
          </div>

          <div class="place-list">
            <article
              v-for="place in paginatedPlaces"
              :key="place.uid"
              class="place-row"
              :class="{ active: selectedPlace?.uid === place.uid }"
            >
              <button type="button" class="place-row__main" @click="selectPlace(place)">
                <span class="place-row__thumb" :class="`is-${mapMarkerType(place)}`" aria-hidden="true" />
                <span>
                  <strong>{{ place.name }}</strong>
                  <small>
                    <em>{{ place.origin === 'db' ? '한국관광공사' : '카카오맵' }}</em>
                    {{ place.category || place.categoryGroup || place.address || '장소' }}
                  </small>
                </span>
              </button>
              <button
                type="button"
                class="place-row__pocket"
                :class="{ done: isPocketed(place) }"
                :aria-label="`${place.name} ${pocketActionLabel(place)}`"
                @click.stop="togglePocket(place)"
              >
                {{ isPocketed(place) ? '담음' : '담기' }}
              </button>
            </article>
          </div>

          <nav v-if="totalPages > 1" class="pagination" aria-label="장소 목록 페이지">
            <Button
              icon="pi pi-chevron-left"
              severity="secondary"
              outlined
              size="small"
              aria-label="이전 페이지"
              :disabled="!canGoPrevPage"
              @click="goToPage(currentPage - 1)"
            />
            <Button
              v-for="pageNumber in pageNumbers"
              :key="pageNumber"
              :label="String(pageNumber)"
              :severity="pageNumber === currentPage ? 'primary' : 'secondary'"
              :outlined="pageNumber !== currentPage"
              size="small"
              @click="goToPage(pageNumber)"
            />
            <Button
              icon="pi pi-chevron-right"
              severity="secondary"
              outlined
              size="small"
              aria-label="다음 페이지"
              :disabled="!canGoNextPage"
              @click="goToPage(currentPage + 1)"
            />
          </nav>
        </template>

        <template v-else>
          <div class="route-panel-tools">
            <Button
              label="장소 담기로"
              icon="pi pi-bookmark"
              severity="secondary"
              outlined
              size="small"
              @click="closeItineraryBuilder"
            />
          </div>

          <Message v-if="itineraryStore.isMock" severity="info" :closable="false" class="compact-message">
            현재는 로컬 데이터로 일정 배치 흐름을 확인합니다.
          </Message>
          <Message v-if="itineraryStore.error" severity="error" :closable="false" class="compact-message">
            {{ itineraryStore.error }}
          </Message>
          <Message v-if="itineraryNotice" severity="success" :closable="false" class="compact-message">
            {{ itineraryNotice }}
          </Message>

          <div class="day-tabs" role="tablist" aria-label="편집할 날짜">
            <button
              v-for="day in dayTabs"
              :key="day.value"
              type="button"
              class="day-tab"
              :class="{ active: day.value === activeDayNumber }"
              :style="{ '--trip-day-color': dayRouteColor(day.value) }"
              role="tab"
              :aria-selected="day.value === activeDayNumber"
              @click="activeDayNumber = day.value"
            >
              <strong>DAY {{ day.value }}</strong>
              <span>{{ formatDayDate(day.date) }}</span>
              <em>{{ day.count }}</em>
            </button>
          </div>

          <section class="route-stop-section">
            <div class="route-section-head">
              <strong>DAY {{ activeDayNumber }} 일정</strong>
              <small>
                {{
                  routeSummary ||
                  (routeMapPlaces.length
                    ? '지도 마커를 누르는 순서대로 루트가 만들어집니다.'
                    : '장소를 검색하거나 담은 뒤 지도 마커를 눌러 루트를 만들어보세요.')
                }}
              </small>
            </div>

            <div v-if="activeStops.length" class="route-stop-list">
              <template v-for="(stop, index) in activeStops" :key="stop.id">
                <article
                  class="route-stop-card"
                  :class="{ active: selectedStopId === stop.id }"
                >
                <button
                  type="button"
                  class="route-stop-main"
                  :aria-label="`${stop.sortOrder}번 ${stop.place.name} 선택`"
                  @click="selectedStopId = stop.id"
                >
                  <span>{{ stop.sortOrder }}</span>
                  <strong>{{ stop.place.name }}</strong>
                  <small>{{ stop.place.roadAddress || stop.place.address || stop.place.category }}</small>
                </button>

                <div class="route-stop-fields">
                  <InputText
                    :model-value="stopDraft(stop).selectedTime"
                    type="time"
                    aria-label="방문 시각"
                    @update:model-value="setStopDraft(stop, { selectedTime: $event })"
                    @change="updateStopField(stop)"
                  />
                </div>
                <textarea
                  :value="stopDraft(stop).memo"
                  rows="2"
                  placeholder="메모"
                  aria-label="방문 메모"
                  @input="setStopDraft(stop, { memo: $event.target.value })"
                  @blur="updateStopField(stop)"
                />
                <div class="route-stop-actions">
                  <Button
                    icon="pi pi-trash"
                    severity="danger"
                    outlined
                    rounded
                    size="small"
                    :disabled="itineraryStore.mutating"
                    :aria-label="`${stop.place.name} 삭제`"
                    @click="deleteStop(stop)"
                  />
                </div>
                </article>
                <div v-if="index < activeStops.length - 1" class="route-leg">
                  <span>
                    <i class="pi pi-arrow-down" aria-hidden="true"></i>
                    {{ stop.place.name }} → {{ activeStops[index + 1].place.name }}
                  </span>
                  <div
                    class="route-leg__details"
                    :class="{ 'has-manual': isManualTravelInputVisible(stop) }"
                  >
                    <Select
                      :model-value="stopDraft(stop).transport"
                      :options="TRANSPORT_OPTIONS"
                      option-label="label"
                      option-value="value"
                      :aria-label="`${stop.place.name}에서 ${activeStops[index + 1].place.name} 이동수단`"
                      :disabled="itineraryStore.mutating"
                      @update:model-value="updateLegTransport(stop, $event)"
                    />
                    <label
                      v-if="isManualTravelInputVisible(stop)"
                      class="route-leg__manual"
                      :aria-label="`${stop.place.name}에서 ${activeStops[index + 1].place.name} 직접 소요시간`"
                    >
                      <input
                        class="route-leg__manual-input"
                        type="number"
                        min="1"
                        max="1440"
                        inputmode="numeric"
                        placeholder="분"
                        :value="stopDraft(activeStops[index + 1]).manualTravelMinutes"
                        :disabled="itineraryStore.mutating"
                        @input="setStopDraft(activeStops[index + 1], { manualTravelMinutes: $event.target.value })"
                        @change="updateManualTravelDuration(activeStops[index + 1])"
                      />
                      <span>분</span>
                    </label>
                    <em :title="travelEstimateTitle(activeStops[index + 1])">
                      <small>{{ travelEstimateLabel(activeStops[index + 1]) }}</small>
                    </em>
                  </div>
                </div>
              </template>
            </div>
            <p v-else class="empty-pocket">담긴 장소를 순서대로 눌러 루트를 만들어보세요.</p>
          </section>
        </template>
      </aside>

      <section class="map-panel">
        <div class="map-toolbar">
          <div>
            <span class="eyebrow">{{ itineraryMode ? 'Itinerary Map' : 'Kakao Map' }}</span>
            <h2>{{ itineraryMode ? `${tripRegion} 일정 지도` : `${tripRegion} 주변 지도` }}</h2>
          </div>
          <div class="map-tools">
            <Button
              v-if="canSearchCurrentMapArea"
              label="이 위치에서 재검색"
              icon="pi pi-refresh"
              severity="secondary"
              outlined
              size="small"
              :loading="searching"
              @click="searchCurrentMapArea"
            />
          </div>
        </div>

        <div class="map-stage">
          <div ref="mapEl" class="kakao-map" :class="{ disabled: sdkError }" />
          <Message v-if="sdkError" severity="error" :closable="false" class="map-error">
            카카오맵을 불러오지 못했습니다. 카카오 개발자 콘솔에서 JavaScript 키와 Web 플랫폼
            사이트 도메인(http://localhost:5173)을 확인해주세요. 상세: {{ sdkError }}
          </Message>
          <div v-if="sdkError" class="fallback-map">
            <button
              v-for="place in mapPlaces.filter(hasCoordinates)"
              :key="place.uid"
              type="button"
              class="fallback-pin"
              :class="{
                db: place.origin === 'db',
                kakao: place.origin === 'kakao',
                pocketed: isPocketed(place),
              }"
              :style="fallbackPinStyle(place)"
              @click="handleMapPlaceClick(place)"
            >
              <span aria-hidden="true" />
              <strong>{{ place.name }}</strong>
            </button>
          </div>
        </div>
      </section>

      <aside v-if="!itineraryMode" class="pocket-panel">
        <div class="pocket-head">
          <div>
            <span class="eyebrow">Pocket</span>
            <h2>담긴 장소</h2>
          </div>
          <strong>{{ pocketDisplayPlaces.length }}</strong>
        </div>

        <div v-if="pocketDisplayPlaces.length" class="pocket-list">
          <article
            v-for="place in pocketDisplayPlaces"
            :key="place.uid"
            class="pocket-item"
            :class="{ routed: isRoutedPlace(place) }"
          >
            <strong>{{ place.name }}</strong>
            <small>{{ place.address || place.category }}</small>
            <Button
              v-if="isPocketed(place)"
              icon="pi pi-times"
              severity="secondary"
              text
              rounded
              aria-label="담기 취소"
              @click="togglePocket(place)"
            />
            <em v-else>일정 포함</em>
          </article>
        </div>
        <p v-else class="empty-pocket">지도나 목록에서 장소를 골라 담아보세요.</p>
        <Button
          class="route-start-button"
          label="일정 배치하기 →"
          severity="success"
          :disabled="!pocketDisplayPlaces.length"
          :loading="itineraryStore.loading"
          @click="openItineraryBuilder"
        />
      </aside>
      </section>
    </section>
  </main>
</template>

<style scoped>
.place-page {
  min-height: 100vh;
  padding: 24px clamp(16px, 3vw, 40px) 40px;
  background:
    linear-gradient(135deg, rgba(46, 143, 107, 0.12), transparent 34%),
    linear-gradient(315deg, rgba(49, 130, 246, 0.10), transparent 38%),
    #f6f8fb;
  color: #151d25;
}

.place-header {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 18px;
}

.place-header h1 {
  margin: 4px 0 0;
  font-size: clamp(36px, 6vw, 68px);
  line-height: 0.96;
  letter-spacing: 0;
}

.place-header p {
  margin: 12px 0 0;
  color: #4e5968;
  font-weight: 750;
}

.eyebrow {
  color: #2e8f6b;
  font-size: 13px;
  font-weight: 900;
}

.state-message {
  margin-bottom: 18px;
}

.loading-state {
  min-height: 420px;
  border: 1px solid #e5e8ef;
  border-radius: 28px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  background: rgba(255, 255, 255, 0.88);
}

.search-shell {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(420px, 1fr) minmax(320px, 390px);
  gap: 16px;
  align-items: stretch;
}

.search-shell.planning {
  grid-template-columns: minmax(300px, 390px) minmax(520px, 1fr);
}

.place-list-panel,
.map-panel,
.pocket-panel {
  min-height: calc(100vh - 190px);
  border: 1px solid #e5e8ef;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.10);
}

.place-list-panel {
  padding: 18px;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  gap: 14px;
  min-height: 0;
}

.place-list-panel.planning {
  grid-template-rows: auto auto auto minmax(0, auto) minmax(0, 1fr);
  align-content: start;
}

.search-card {
  display: grid;
  gap: 12px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.field-row :deep(.p-inputtext) {
  width: 100%;
}

.list-head,
.pocket-head,
.map-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.map-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.list-head strong,
.pocket-head strong {
  font-size: 22px;
}

.place-list,
.pocket-list {
  min-height: 0;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 10px;
  padding-right: 4px;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
  flex-wrap: nowrap;
  padding-top: 2px;
}

.pagination :deep(.p-button) {
  width: 34px;
  min-width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 8px;
}

.place-row,
.pocket-item {
  border: 1px solid transparent;
  border-radius: 20px;
  background: #f8fafc;
}

.place-row {
  min-height: 96px;
  width: 100%;
  padding: 14px;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 12px;
  text-align: left;
  color: #151d25;
}

.place-row__main {
  min-width: 0;
  min-height: 68px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.place-row__main:focus-visible {
  outline: 2px solid #10b981;
  outline-offset: 4px;
}

.place-row__pocket {
  justify-self: end;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.place-row.active {
  border-color: transparent;
  background: #eefbf6;
}

.place-row strong,
.pocket-item strong {
  display: block;
  font-size: 15px;
  line-height: 1.3;
}

.place-row small,
.pocket-item small {
  display: block;
  margin-top: 4px;
  color: #687586;
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.map-panel {
  padding: 18px;
  display: grid;
  grid-template-rows: auto minmax(560px, 1fr);
  gap: 14px;
}

.map-toolbar h2,
.pocket-head h2 {
  margin: 4px 0 0;
  font-size: 24px;
}

.map-stage {
  min-height: 480px;
  border-radius: 24px;
  overflow: hidden;
  position: relative;
  background:
    linear-gradient(90deg, rgba(28, 64, 44, 0.06) 1px, transparent 1px),
    linear-gradient(0deg, rgba(28, 64, 44, 0.06) 1px, transparent 1px),
    linear-gradient(135deg, #f8f3e9, #eff8f2);
  background-size: 78px 78px, 78px 78px, auto;
}

.kakao-map {
  position: absolute;
  inset: 0;
}

.kakao-map.disabled {
  display: none;
}

.map-error {
  position: absolute;
  z-index: 3;
  left: 18px;
  right: 18px;
  top: 18px;
  box-shadow: 0 16px 38px rgba(15, 23, 42, 0.14);
}

.fallback-map {
  position: absolute;
  inset: 0;
}

.fallback-map::before,
.fallback-map::after {
  content: '';
  position: absolute;
  height: 18px;
  border: 5px solid rgba(116, 104, 84, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
}

.fallback-map::before {
  width: 62%;
  left: 8%;
  top: 56%;
  transform: rotate(-13deg);
}

.fallback-map::after {
  width: 42%;
  right: 8%;
  top: 33%;
  transform: rotate(72deg);
}

.fallback-pin {
  position: absolute;
  z-index: 1;
  border: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px 7px 7px;
  border-radius: 999px;
  background: #fff;
  color: #151d25;
  font-weight: 900;
  box-shadow: 0 16px 38px rgba(15, 23, 42, 0.16);
  cursor: pointer;
}

.fallback-pin span {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 12px;
  background: #ff5a4f;
}

.fallback-pin.db span {
  background: #2e8f6b;
}

.fallback-pin.pocketed {
  outline: 0;
}

.fallback-pin.pocketed span {
  background: #7c3aed;
}

.empty-pocket {
  margin: 0;
  color: #687586;
  font-weight: 750;
  line-height: 1.55;
}

.pocket-panel {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pocket-head strong {
  min-width: 42px;
  height: 42px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: #fff;
  background: #2e8f6b;
}

.pocket-item {
  padding: 14px 48px 14px 14px;
  position: relative;
}

.pocket-item :deep(.p-button) {
  position: absolute;
  top: 8px;
  right: 8px;
}

.pocket-item em {
  position: absolute;
  top: 10px;
  right: 10px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: #eefbf6;
  color: #0f8f63;
  font-style: normal;
  font-size: 11px;
  font-weight: 900;
}

.route-start-button {
  width: 100%;
  justify-content: center;
  margin-top: auto;
}

.route-panel-tools {
  display: flex;
  justify-content: flex-end;
}

.compact-message {
  margin: 0;
}

.day-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.day-tab {
  min-width: 0;
  min-height: 70px;
  border: 1px solid #d9e0ea;
  border-radius: 14px;
  padding: 9px;
  background: #fff;
  color: #151d25;
  display: grid;
  justify-items: start;
  gap: 2px;
  cursor: pointer;
  box-shadow: inset 4px 0 0 var(--trip-day-color, #2563eb);
}

.day-tab strong {
  font-size: 14px;
}

.day-tab span,
.day-tab small {
  color: #687586;
  font-size: 11px;
  font-weight: 800;
}

.day-tab em {
  min-width: 26px;
  min-height: 22px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  background: color-mix(in srgb, var(--trip-day-color, #2563eb) 12%, #fff);
  color: var(--trip-day-color, #2563eb);
  font-style: normal;
  font-size: 12px;
  font-weight: 900;
}

.day-tab.active {
  border-color: var(--trip-day-color, #2563eb);
  background: color-mix(in srgb, var(--trip-day-color, #2563eb) 9%, #fff);
  box-shadow: inset 4px 0 0 var(--trip-day-color, #2563eb),
    inset 0 0 0 1px var(--trip-day-color, #2563eb);
}

.route-stop-section {
  min-height: 0;
  display: grid;
  gap: 10px;
}

.route-section-head {
  display: grid;
  gap: 3px;
}

.route-section-head strong {
  color: #151d25;
  font-size: 15px;
}

.route-section-head small {
  min-width: 0;
  color: #687586;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.route-stop-list {
  min-height: 0;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 9px;
  padding-right: 4px;
}

.route-stop-list {
  max-height: min(420px, 44vh);
}

.route-stop-main span {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #10b981;
  color: #fff;
  font-size: 13px;
  font-weight: 950;
}

.route-stop-main strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.route-stop-main small {
  grid-column: 2;
  min-width: 0;
  color: #687586;
  font-size: 12px;
  font-weight: 750;
  overflow-wrap: anywhere;
}

.route-stop-card {
  position: relative;
  border: 1px solid #e5e8ef;
  border-radius: 18px;
  padding: 11px;
  display: grid;
  gap: 9px;
  background: #fff;
}

.route-stop-card.active {
  border-color: #c8eadb;
  background: #f7fffb;
  box-shadow: none;
}

.route-stop-main {
  min-width: 0;
  width: 100%;
  border: 0;
  padding: 0 42px 0 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 9px;
  align-items: center;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.route-stop-fields {
  display: grid;
  grid-template-columns: minmax(110px, 180px);
  gap: 8px;
}

.route-stop-fields :deep(.p-inputtext) {
  width: 100%;
}

.route-stop-card textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid #d9e0ea;
  border-radius: 12px;
  padding: 8px 10px;
  background: #f8fafc;
  color: #151d25;
  font: inherit;
  font-size: 13px;
}

.route-stop-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  justify-content: flex-end;
}

.route-leg {
  margin: -2px 16px;
  padding: 12px 0 12px 20px;
  border-left: 2px solid #d9e0ea;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
  align-items: center;
  gap: 12px;
  color: #536173;
}

.route-leg span {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 850;
}

.route-leg i {
  color: #10b981;
  font-size: 12px;
}

.route-leg__details {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(118px, 0.9fr) minmax(116px, 1fr);
  align-items: center;
  gap: 8px;
}

.route-leg__details.has-manual {
  grid-template-columns: minmax(104px, 0.8fr) minmax(76px, 0.62fr) minmax(98px, 1fr);
}

.route-leg__details :deep(.p-select) {
  width: 100%;
  min-width: 0;
  background: #fff;
}

.route-leg__manual {
  min-width: 0;
  height: 34px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  border: 1px solid #d9e0ea;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}

.route-leg__manual-input {
  min-width: 0;
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0 4px 0 10px;
  background: transparent;
  color: #151d25;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  outline: none;
}

.route-leg__manual span {
  padding-right: 8px;
  color: #687586;
  font-size: 11px;
  font-weight: 850;
}

.route-leg em {
  justify-self: end;
  width: 100%;
  border-radius: 999px;
  padding: 5px 9px;
  background: #eefbf6;
  color: #0f8f63;
  font-style: normal;
  text-align: center;
  display: grid;
  gap: 1px;
}

.route-leg em small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-leg em small {
  color: #256f54;
  font-size: 11px;
  font-weight: 800;
}

:global(.trip-map-pin) {
  position: relative;
  border: 0;
  display: grid;
  justify-items: center;
  gap: 3px;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: #151d25;
  font-weight: 900;
  box-shadow: none;
  cursor: pointer;
  white-space: nowrap;
  transform: translate(var(--marker-offset-x, 0px), var(--marker-offset-y, 0px));
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

:global(.trip-map-pin strong) {
  display: block;
  max-width: 86px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #151d25;
  font-size: 12px;
  line-height: 1.15;
}

:global(.trip-map-pin__status) {
  display: block;
  margin-top: -1px;
  color: var(--trip-active-day-color, #2563eb);
  font-style: normal;
  font-size: 10px;
  font-weight: 950;
  line-height: 1;
}

:global(.trip-map-pin.is-used-other-day:not(.is-routed)::before) {
  content: '';
  width: 34px;
  height: 3px;
  border-radius: 999px;
  background: var(--trip-other-day-color, #2563eb);
  position: absolute;
  top: -7px;
  left: 50%;
  transform: translateX(-50%);
  box-shadow: 0 2px 7px rgba(37, 99, 235, 0.25);
}

:global(.trip-map-pin.is-used-in-route::before) {
  content: '';
  width: 34px;
  height: 3px;
  border-radius: 999px;
  background: var(--trip-other-day-color, #2563eb);
  position: absolute;
  top: -7px;
  left: 50%;
  transform: translateX(-50%);
  box-shadow: 0 2px 7px color-mix(in srgb, var(--trip-other-day-color, #2563eb) 25%, transparent);
}

:global(.trip-map-pin span) {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 12px;
}

:global(.trip-map-pin.is-db span) {
  background: #2e8f6b;
}

:global(.trip-map-pin.is-kakao span) {
  background: #ff5a4f;
}

:global(.trip-map-pin.is-attraction span) {
  background: #2e8f6b;
}

:global(.trip-map-pin.is-restaurant span) {
  background: #f04452;
}

:global(.trip-map-pin.is-cafe span) {
  background: #8b5cf6;
}

:global(.trip-map-pin.is-routed span) {
  background: var(--trip-active-day-color, #2563eb);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--trip-active-day-color, #2563eb) 18%, transparent),
    0 10px 24px rgba(15, 23, 42, 0.22);
}

:global(.trip-map-pin.is-pocketed:not(.is-routed):not(.is-used-other-day):not(.is-used-in-route) span) {
  background: #f59e0b;
  box-shadow: 0 8px 18px rgba(245, 158, 11, 0.24);
}

:global(.trip-map-pin.is-pocketed:not(.is-routed):not(.is-used-other-day):not(.is-used-in-route) strong) {
  color: #92400e;
}

:global(.trip-map-pin.is-used-other-day:not(.is-routed) span) {
  background: var(--trip-other-day-color, #2563eb);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--trip-other-day-color, #2563eb) 16%, transparent),
    0 8px 18px color-mix(in srgb, var(--trip-other-day-color, #2563eb) 24%, transparent);
}

:global(.trip-map-pin.is-used-other-day:not(.is-routed) strong),
:global(.trip-map-pin.is-used-other-day:not(.is-routed) .trip-map-pin__status) {
  color: var(--trip-other-day-color, #2563eb);
}

:global(.trip-map-pin.is-used-in-route span) {
  background: var(--trip-other-day-color, #2563eb);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--trip-other-day-color, #2563eb) 16%, transparent),
    0 8px 18px color-mix(in srgb, var(--trip-other-day-color, #2563eb) 24%, transparent);
}

:global(.trip-map-pin.is-used-in-route strong),
:global(.trip-map-pin.is-used-in-route .trip-map-pin__status) {
  color: var(--trip-other-day-color, #2563eb);
}

:global(.trip-map-pin i) {
  font-size: 13px;
}

:global(.trip-map-pin.is-dot) {
  width: 12px;
  height: 12px;
  padding: 0;
  gap: 0;
  box-shadow: none;
}

:global(.trip-map-pin.is-dot span) {
  width: 100%;
  height: 100%;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.28);
}

:global(.trip-map-pin.is-dot i) {
  display: none;
}

:global(.trip-map-pin.is-dot strong) {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

:global(.trip-map-pin.is-label-hidden strong) {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

:global(.trip-map-pin.is-dot .trip-map-pin__status) {
  display: none;
}

:global(.trip-map-pin.is-label-hidden .trip-map-pin__status) {
  display: none;
}

:global(.trip-place-popup) {
  width: min(360px, calc(100vw - 48px));
  max-width: calc(100vw - 48px);
  position: relative;
  box-sizing: border-box;
  border: 1px solid #d9e0ea;
  border-radius: 14px;
  background: #fff;
  color: #151d25;
  white-space: normal;
  box-shadow: 0 22px 54px rgba(15, 23, 42, 0.20);
}

:global(.trip-place-popup::after) {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -10px;
  width: 18px;
  height: 18px;
  border-right: 1px solid #d9e0ea;
  border-bottom: 1px solid #d9e0ea;
  background: #fff;
  transform: translateX(-50%) rotate(45deg);
}

:global(.trip-place-popup__content) {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  padding: 18px 42px 16px 18px;
  display: grid;
  gap: 9px;
}

:global(.trip-place-popup h3) {
  min-width: 0;
  max-width: 100%;
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
  overflow-wrap: anywhere;
  white-space: normal;
}

:global(.trip-place-popup h3),
:global(.trip-place-popup p),
:global(.trip-place-popup dt),
:global(.trip-place-popup dd),
:global(.trip-place-popup a),
:global(.trip-place-popup button),
:global(.trip-place-popup span) {
  word-break: normal;
  overflow-wrap: anywhere;
}

:global(.trip-place-popup p) {
  min-width: 0;
  max-width: 100%;
  margin: 0;
  color: #536173;
  font-size: 14px;
  font-weight: 750;
  line-height: 1.45;
  overflow-wrap: anywhere;
  white-space: normal;
}

:global(.trip-place-popup__summary) {
  overflow-wrap: anywhere;
}

:global(.trip-place-popup__image) {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  object-fit: cover;
  background: #edf2f7;
}

:global(.trip-place-popup__meta) {
  padding-right: 8px;
}

:global(.trip-place-popup__info) {
  min-width: 0;
  margin: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 10px;
  color: #536173;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.45;
}

:global(.trip-place-popup__info dt) {
  color: #0f7a55;
}

:global(.trip-place-popup__info dd) {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

:global(.trip-place-popup__close) {
  position: absolute;
  z-index: 2;
  top: 12px;
  right: 12px;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 999px;
  background: #f1f5f9;
  color: #536173;
  display: grid;
  place-items: center;
  cursor: pointer;
}

:global(.trip-place-popup__actions) {
  min-width: 0;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}

:global(.trip-place-popup__button) {
  min-width: 0;
  max-width: 100%;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #d9e0ea;
  border-radius: 999px;
  background: #fff;
  color: #151d25;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 900;
  text-decoration: none;
  cursor: pointer;
}

:global(.trip-place-popup__button span) {
  min-width: 0;
}

:global(.trip-place-popup__button.is-primary) {
  border-color: #10b981;
  background: #10b981;
  color: #fff;
}

:global(.trip-map-pin.is-grouped) {
  filter: drop-shadow(0 8px 14px rgba(15, 23, 42, 0.18));
}

:global(.trip-map-pin.is-pocketed) {
  outline: 0;
}

@media (max-width: 1180px) {
  .search-shell {
    grid-template-columns: minmax(280px, 360px) 1fr;
  }

  .search-shell.planning {
    grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  }

  .pocket-panel {
    grid-column: 1 / -1;
    min-height: auto;
  }
}

@media (max-width: 820px) {
  .search-shell {
    grid-template-columns: 1fr;
  }

  .search-shell.planning {
    grid-template-columns: 1fr;
  }

  .place-list-panel,
  .map-panel,
  .pocket-panel {
    min-height: auto;
  }

  .map-stage {
    min-height: 420px;
  }

  .route-stop-fields,
  .route-leg {
    grid-template-columns: 1fr;
  }

  .route-leg__details,
  .route-leg__details.has-manual {
    grid-template-columns: 1fr;
  }

  .route-leg em {
    justify-self: start;
  }
}

@media (max-width: 640px) {
  .place-page {
    padding: 14px;
  }

  .place-header {
    flex-direction: column;
  }
}

.place-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 28px 18px 42px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-body);
}

.workspace-page {
  width: min(1160px, calc(100vw - 36px));
  margin: 0 auto;
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
  background: var(--paper-card);
  box-shadow: var(--shadow-card);
}

.workspace-topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 58px;
  padding: 11px 20px;
  border-bottom: 1px solid var(--line2);
  background: var(--paper-card);
}

.workspace-logo,
.workspace-crumb,
.workspace-avatar {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.workspace-logo {
  font-size: 16px;
  font-weight: 800;
}

.workspace-logo b {
  color: var(--accent);
}

.workspace-crumb {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 650;
}

.workspace-crumb span {
  color: var(--ink-faint);
  font-weight: 400;
}

.workspace-crumb strong {
  color: var(--ink-sub);
  font-weight: 500;
}

.workspace-steps {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.workspace-steps .active {
  color: var(--accent);
}

.workspace-steps i {
  color: var(--line);
  font-style: normal;
}

.workspace-next-button {
  flex: 0 0 auto;
}

.workspace-next-button :deep(.p-button-label) {
  font-size: 12.5px;
  font-weight: 800;
}

.workspace-avatar {
  width: 31px;
  height: 31px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--on-fill);
  background: linear-gradient(135deg, var(--accent-soft), var(--accent));
  font-size: 12px;
  font-weight: 800;
}

.workspace-title {
  display: grid;
  gap: 8px;
  padding: 24px 28px 20px;
  border-bottom: 1px solid var(--line2);
}

.workspace-title h1 {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-hand);
  font-size: 36px;
  font-weight: 400;
  line-height: 1;
  letter-spacing: 0;
}

.workspace-title p {
  margin: 0;
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 500;
}

.eyebrow {
  color: var(--accent);
  font-family: var(--font-hand);
  font-size: 17px;
  font-weight: 400;
  line-height: 1;
}

.state-message {
  margin: 16px 28px 0;
}

.loading-state {
  min-height: 600px;
  border: 0;
  border-radius: 0;
  background: var(--paper-card);
  box-shadow: none;
  color: var(--ink-sub);
}

.search-shell {
  height: min(680px, calc(100vh - 190px));
  min-height: 600px;
  display: grid;
  grid-template-columns: 328px minmax(0, 1fr) 280px;
  gap: 0;
  align-items: stretch;
}

.search-shell.planning {
  grid-template-columns: 328px minmax(0, 1fr);
}

.place-list-panel,
.map-panel,
.pocket-panel {
  min-height: 0;
  border: 0;
  border-right: 1px solid var(--line2);
  border-radius: 0;
  background: var(--paper-card);
  box-shadow: none;
}

.pocket-panel {
  border-right: 0;
}

.place-list-panel {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.place-list-panel.planning {
  display: flex;
  flex-direction: column;
  align-content: initial;
}

.panel-head,
.list-head,
.pocket-head,
.map-toolbar {
  min-height: 50px;
  padding: 12px 15px;
  border-bottom: 1px solid var(--line2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.panel-head strong,
.list-head span,
.pocket-head h2,
.map-toolbar h2 {
  margin: 0;
  color: var(--ink);
  font-size: 13px;
  font-weight: 800;
}

.panel-head small {
  color: var(--ink-faint);
  font-size: 11px;
  font-weight: 500;
}

.list-head strong,
.pocket-head strong {
  min-width: 28px;
  height: 24px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--bg);
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 800;
}

.search-card {
  padding: 12px 14px;
  border-bottom: 1px solid var(--line2);
  display: grid;
  gap: 11px;
}

.field-row {
  display: flex;
  gap: 7px;
}

.field-row :deep(.p-inputtext) {
  min-width: 0;
  flex: 1;
  border-color: var(--line);
  border-radius: 9px;
  background: var(--on-fill);
  color: var(--ink);
  font-size: 12.5px;
}

.field-row :deep(.p-button) {
  border-color: var(--accent);
  border-radius: 9px;
  background: var(--accent);
}

.category-row {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  padding-bottom: 1px;
}

.category-row button {
  flex: 0 0 auto;
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 5px 12px;
  background: var(--on-fill);
  color: var(--ink-sub);
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 700;
}

.category-row button.active {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-fill);
}

.place-list,
.pocket-list {
  min-height: 0;
  flex: 1;
  overflow: auto;
  display: block;
  padding: 0 14px;
}

.place-row,
.pocket-item {
  border: 0;
  border-bottom: 1px solid var(--line2);
  border-radius: 0;
  background: transparent;
}

.place-row {
  min-height: 64px;
  padding: 0;
  display: flex;
  align-items: stretch;
  gap: 0;
}

.place-row.active {
  background: rgba(194, 105, 63, 0.06);
}

.place-row__main {
  min-height: 64px;
  flex: 1;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 10px 2px;
}

.place-row__thumb {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: var(--t-sage);
}

.place-row__thumb.is-restaurant {
  background: var(--t-burgundy);
}

.place-row__thumb.is-cafe {
  background: var(--t-plum);
}

.place-row__thumb.is-place {
  background: var(--t-blue);
}

.place-row strong,
.pocket-item strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.35;
}

.place-row small,
.pocket-item small {
  margin-top: 2px;
  color: var(--ink-sub);
  font-size: 10.5px;
  font-weight: 500;
}

.place-row small em {
  margin-right: 5px;
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0 5px;
  color: var(--ink-faint);
  font-style: normal;
  font-size: 10px;
}

.place-row__pocket {
  align-self: center;
  margin-left: auto;
  border: 1px solid var(--accent);
  border-radius: 7px;
  padding: 5px 11px;
  background: var(--on-fill);
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

.place-row__pocket.done {
  border-color: var(--line);
  background: var(--bg);
  color: var(--ink-sub);
}

.pagination {
  padding: 12px 14px;
  border-top: 1px solid var(--line2);
}

.pagination :deep(.p-button) {
  width: 28px;
  min-width: 28px;
  height: 28px;
  border-color: var(--line);
  border-radius: 6px;
  background: var(--on-fill);
  color: var(--ink-sub);
}

.pagination :deep(.p-button[aria-pressed='true']),
.pagination :deep(.p-button.p-button-primary) {
  background: var(--ink);
  color: var(--on-fill);
}

.map-panel {
  padding: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0;
}

.map-toolbar {
  align-items: center;
}

.map-toolbar .eyebrow {
  font-size: 13px;
}

.map-tools :deep(.p-button) {
  border-color: var(--line);
  border-radius: 8px;
  background: var(--paper-card);
  color: var(--ink-sub);
  font-size: 12px;
}

.map-stage {
  min-height: 0;
  height: 100%;
  border-radius: 0;
  background:
    linear-gradient(rgba(120, 100, 60, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120, 100, 60, 0.05) 1px, transparent 1px),
    linear-gradient(135deg, #e9e2cf, #e3dcc4 50%, #ece6d4);
  background-size: 40px 40px, 40px 40px, auto;
}

.map-error {
  border-color: var(--line);
  background: var(--paper-card);
  box-shadow: var(--shadow-pop);
}

.pocket-panel {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.pocket-head strong {
  width: auto;
  min-width: 34px;
  height: 28px;
  border-radius: 999px;
  background: var(--bg);
  color: var(--ink-sub);
}

.pocket-item {
  position: relative;
  display: grid;
  grid-template-columns: 9px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 10px 2px;
}

.pocket-item::before {
  content: '';
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
}

.pocket-item.routed::before {
  background: var(--t-sage);
}

.pocket-item :deep(.p-button) {
  position: static;
  width: 28px;
  height: 28px;
  color: var(--ink-faint);
}

.pocket-item em {
  position: static;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--ink-sub);
}

.empty-pocket {
  padding: 14px;
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 600;
}

.route-start-button {
  width: calc(100% - 28px);
  margin: auto 14px 14px;
  border-color: var(--accent);
  border-radius: 9px;
  background: var(--accent);
  color: var(--on-fill);
  justify-content: center;
}

.route-panel-tools {
  min-height: 50px;
  padding: 12px 15px;
  border-bottom: 1px solid var(--line2);
  justify-content: flex-start;
}

.route-panel-tools :deep(.p-button) {
  border-color: var(--line);
  border-radius: 8px;
  background: var(--on-fill);
  color: var(--ink-sub);
  font-size: 12px;
}

.compact-message {
  margin: 10px 14px 0;
  font-size: 12px;
}

.day-tabs {
  display: flex;
  gap: 5px;
  padding: 13px 15px 10px;
  border-bottom: 1px solid var(--line2);
  overflow-x: auto;
}

.day-tab {
  min-width: auto;
  min-height: auto;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 5px 13px;
  background: var(--on-fill);
  color: var(--ink);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-shadow: none;
}

.day-tab strong,
.day-tab span,
.day-tab em {
  font-size: 12px;
  font-weight: 800;
}

.day-tab span {
  color: var(--ink-sub);
}

.day-tab em {
  min-width: 20px;
  min-height: 20px;
  background: var(--bg);
  color: var(--ink-sub);
}

.day-tab.active {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--on-fill);
  box-shadow: none;
}

.day-tab.active span,
.day-tab.active em {
  color: var(--on-fill);
}

.route-stop-section {
  min-height: 0;
  flex: 1;
  padding: 12px 15px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.route-section-head strong {
  color: var(--accent);
  font-size: 12.5px;
}

.route-section-head small {
  color: var(--ink-faint);
  font-size: 11px;
  font-weight: 500;
}

.route-stop-list {
  max-height: none;
  min-height: 0;
  flex: 1;
  overflow: auto;
}

.route-stop-card {
  border-color: var(--line);
  border-radius: 9px;
  background: var(--on-fill);
  box-shadow: 0 1px 4px rgba(80, 60, 30, 0.07);
}

.route-stop-card.active {
  border-color: var(--accent-soft);
  background: var(--paper-card);
}

.route-stop-main span {
  width: 26px;
  height: 26px;
  background: var(--accent);
}

.route-leg {
  grid-template-columns: 1fr;
  border-left-color: var(--line);
  color: var(--ink-sub);
}

.route-leg i {
  color: var(--accent);
}

.route-leg em {
  justify-self: start;
  width: auto;
  background: var(--bg);
  color: var(--ink-sub);
}

:global(.trip-map-pin span) {
  border: 2px solid var(--on-fill);
  border-radius: 50% 50% 50% 0;
  box-shadow: 0 3px 7px rgba(0, 0, 0, 0.25);
  transform: rotate(-45deg);
}

:global(.trip-map-pin span i),
:global(.trip-map-pin span b) {
  transform: rotate(45deg);
}

:global(.trip-map-pin.is-db span),
:global(.trip-map-pin.is-attraction span) {
  background: var(--t-sage);
}

:global(.trip-map-pin.is-kakao span) {
  background: var(--t-blue);
}

:global(.trip-map-pin.is-restaurant span) {
  background: var(--t-burgundy);
}

:global(.trip-map-pin.is-cafe span) {
  background: var(--t-plum);
}

:global(.trip-place-popup) {
  border-color: var(--line);
  border-radius: var(--radius);
  background: var(--paper-card);
  color: var(--ink);
  box-shadow: var(--shadow-pop);
}

:global(.trip-place-popup::after) {
  border-color: var(--line);
  background: var(--paper-card);
}

:global(.trip-place-popup__button.is-primary) {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-fill);
}

@media (max-width: 1180px) {
  .search-shell {
    height: auto;
    min-height: 0;
    grid-template-columns: minmax(280px, 328px) minmax(0, 1fr);
  }

  .search-shell.planning {
    grid-template-columns: minmax(280px, 328px) minmax(0, 1fr);
  }

  .pocket-panel {
    grid-column: 1 / -1;
    min-height: 240px;
    border-top: 1px solid var(--line2);
  }

  .map-stage {
    min-height: 520px;
  }
}

@media (max-width: 820px) {
  .workspace-page {
    width: min(100%, calc(100vw - 28px));
  }

  .workspace-topbar {
    flex-wrap: wrap;
  }

  .workspace-steps {
    order: 4;
    width: 100%;
    margin-left: 0;
  }

  .search-shell,
  .search-shell.planning {
    grid-template-columns: 1fr;
  }

  .place-list-panel,
  .map-panel,
  .pocket-panel {
    border-right: 0;
    border-bottom: 1px solid var(--line2);
  }

  .map-stage {
    min-height: 440px;
  }
}
</style>
