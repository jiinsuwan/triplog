<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import { fetchPlaceDetail, fetchPlaceRegions, fetchPlaces } from '@/api/placeApi'
import { AppTopBar } from '@/components/common'
import { useItineraryStore } from '@/stores/itinerary'
import { loadKakaoMaps } from '@/utils/kakaoMap'
import {
  formatDayDate,
  hasStopForPlace,
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
import {
  buildFallbackPinStyle,
  buildKakaoMapSearchPlan,
  centerFocusedRadius,
  dbMapPageSizeForLevel,
  distanceMeters,
  isWithinSearchViewport,
  limitPlacesForViewport,
  mapBoundsToPlain,
  mapSearchRadius,
} from '@/utils/placeMapSearch'
import { useTripStore } from '@/stores/trip'
import { createTripFormFromTrip, toTripPayload } from '@/utils/tripForm'
import { TRIP_STATUS } from '@/utils/tripStatus'

const LIST_PAGE_SIZE = 5
const PAGE_BUTTON_WINDOW_SIZE = 5
const KAKAO_PAGE_SIZE = 15
const REGION_KAKAO_PAGE_SIZE = 8
const MAP_KAKAO_PAGE_SIZE = 8
const REGION_KAKAO_PAGE_LIMIT = 1
const MAX_KAKAO_PAGE_LIMIT = 2
const REGION_PLACE_PAGE_SIZE = 28
const MAP_PLACE_PAGE_SIZE = 60
const TIMELINE_START_HOUR = 9
const TIMELINE_END_HOUR = 21
const TIMELINE_HOUR_HEIGHT_PX = 88
const TIMELINE_MINUTES_PER_STEP = 15
const MIN_STAY_MINUTES = 30
const DEFAULT_STAY_MINUTES = 60
const TIMELINE_CARD_GAP_PX = 0
const TRANSPORT_VIEW_OPTIONS = [
  { label: '🚶 도보', value: 'walk' },
  { label: '🚗 자동차', value: 'car' },
  { label: '🚌 대중교통', value: 'public_transit' },
  { label: '… 기타', value: 'other' },
]
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
  '#c2693f',
  '#6f8a5f',
  '#5f7d94',
  '#8f4a47',
  '#8a6a82',
  '#7c7a4f',
  '#c39a40',
]
const COLLECTION_ROUTE_COLOR = '#c2693f'
const GENERIC_FOOD_KEYWORDS = new Set([
  '식당',
  '맛집',
  '음식점',
  '한식',
  '밥',
  '고기',
  '레스토랑',
  '브런치',
  '분식',
])
const GENERIC_CAFE_KEYWORDS = new Set(['카페', '커피', '디저트', '베이커리'])

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
const timelineDragState = ref(null)

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
const activeDisplayStops = computed(() => orderTimelineStops(activeStops.value))
const hasScheduledStops = computed(() => days.value.some((day) => (day.stops ?? []).length > 0))
const activeTimelineLayout = computed(() => buildTimelineLayout(activeDisplayStops.value))
const timelineHours = computed(() =>
  Array.from(
    { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
    (_, index) => TIMELINE_START_HOUR + index,
  ),
)
const timelineCanvasStyle = computed(() => {
  const timelineBottom = activeDisplayStops.value.reduce((bottom, stop) => {
    const layout = activeTimelineLayout.value.get(stop.id)
    return Math.max(bottom, (layout?.top ?? 0) + (layout?.height ?? stopTimelineHeight(stop)) + 96)
  }, 0)
  return {
    minHeight: `${Math.max(timelineBaseHeight(), timelineBottom)}px`,
  }
})
const dayTabs = computed(() =>
  days.value.map((day) => ({
    label: `DAY ${day.dayNumber}`,
    value: day.dayNumber,
    count: day.stops.length,
    date: day.date,
  })),
)
const activeRoutePlaceKeys = computed(
  () => new Map(activeDisplayStops.value.map((stop, index) => [stopPlaceKey(stop), index + 1])),
)
const routeSummary = computed(() =>
  activeDisplayStops.value
    .map((stop, index) => `${index + 1}. ${stop.place.name}`)
    .join(' → '),
)
const routeCandidatePlaces = computed(() =>
  pocketPlaces.value.filter((place) => !isRoutedPlace(place)),
)
const routeMapPlaces = computed(() => {
  const routedPlaces = activeDisplayStops.value.map((stop) => toMapPlace(stop.place))
  return dedupeRouteMapPlaces([...routeCandidatePlaces.value, ...routedPlaces])
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
  () => activeDisplayStops.value.map((stop, index) => {
    const draft = stopDraft(stop)
    return [stop.id, index, draft.selectedTime, draft.stayMinutes, draft.transport].join(':')
  }).join('|'),
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
  const limitedPlaces = limitPlacesForViewport(
    filteredPlaces,
    filterViewport,
    maxResults,
    map?.getLevel?.() ?? 7,
  )
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
  const stops = orderTimelineStops(day.stops ?? []).filter((stop) => hasCoordinates(stop.place))
  const segments = []
  for (let index = 0; index < stops.length - 1; index += 1) {
    const from = stops[index]
    const to = stops[index + 1]
    const actualPath = routePathForLeg(from, to)
    const fallbackPath = [from.place, to.place].map((place) => new kakao.maps.LatLng(place.latitude, place.longitude))
    segments.push({
      mode: routeLegMode(from),
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
  if (mode === 'walk') return '#6f8a5f'
  if (mode === 'car') return dayRouteColor(dayNumber)
  if (mode === 'public_transit') return '#5f7d94'
  return '#7c7a4f'
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
    !routeOrder && (!itineraryMode.value || markerState.labelHidden) ? 'is-label-hidden' : '',
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
    dot.textContent = markerSymbol(place)
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
      labelHidden: !keepFullLabels || wideRegionView,
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
  closeButton.textContent = '×'
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
  pocketButton.innerHTML = popupPrimaryLabel(place)
  pocketButton.addEventListener('click', async (event) => {
    event.stopPropagation()
    if (itineraryMode.value) {
      await addPocketPlaceToRoute(place)
    } else {
      togglePocket(place)
    }
    pocketButton.innerHTML = popupPrimaryLabel(place)
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
  const mark = isPocketed(place) ? '✓' : '＋'
  const label = pocketActionLabel(place)
  return `<span aria-hidden="true">${mark}</span><span>${label}</span>`
}

function popupPrimaryLabel(place) {
  if (!itineraryMode.value) return popupPocketLabel(place)
  const mark = hasActiveDayStopForPlace(place) ? '↩' : '＋'
  const label = hasActiveDayStopForPlace(place) ? '후보로 되돌리기' : '일정 추가'
  return `<span aria-hidden="true">${mark}</span><span>${label}</span>`
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

async function completeItineraryBuilder() {
  await ensureItineraryLoaded()

  if (!hasScheduledStops.value) {
    itineraryNotice.value = '일정에 담긴 장소가 없습니다. 먼저 지도에서 장소를 추가해주세요.'
    return
  }

  try {
    await persistTimelineDrafts()
    const currentTrip = trip.value?.id === tripId.value
      ? trip.value
      : await tripStore.fetchTripDetail(tripId.value)

    if (!currentTrip) {
      itineraryNotice.value = '여행 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
      return
    }

    await tripStore.updateTrip(
      tripId.value,
      toTripPayload({
        ...createTripFormFromTrip(currentTrip),
        status: TRIP_STATUS.UPCOMING,
      }),
    )
    itineraryNotice.value = '일정이 여행예정 카드로 저장되었습니다.'
    await router.push({ name: 'trip-list' })
  } catch {
    itineraryNotice.value = '일정을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.'
  }
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
    itineraryNotice.value = `${place.name}을(를) 경로 후보로 되돌렸습니다.`
    await nextTick()
    renderMapPlacesAfterLayout({ preserveViewport: true })
    return
  }

  try {
    const stop = await itineraryStore.addPlaceToDay(tripId.value, activeDayNumber.value, itineraryPlace, {
      selectedTime: nextRouteStartTime(activeStops.value),
      memo: stayMemoFromMinutes(DEFAULT_STAY_MINUTES),
      transport: 'walk',
    })
    selectedStopId.value = stop.id
    await itineraryStore.fetchTripItinerary(tripId.value, trip.value)
    itineraryNotice.value = `${place.name}을(를) ${activeDayNumber.value}일차 루트에 추가했습니다.`
    await nextTick()
    renderMapPlacesAfterLayout({ preserveViewport: true })
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
      memo: stayMemoFromMinutes(draft.stayMinutes),
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
  renderMapPlaces()
  try {
    await itineraryStore.updateStop(tripId.value, activeDayNumber.value, stop.id, {
      selectedTime: draft.selectedTime,
      memo: stayMemoFromMinutes(draft.stayMinutes),
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
  const nextStop = nextRouteStop(stop)
  if (!manualTravelDurationMinutes) {
    resetStopDraft(stop)
    return
  }
  if (!nextStop) return

  try {
    const nextDraft = stopDraft(nextStop)
    await itineraryStore.updateStop(tripId.value, activeDayNumber.value, nextStop.id, {
      selectedTime: nextDraft.selectedTime,
      memo: stayMemoFromMinutes(nextDraft.stayMinutes),
      transport: nextDraft.transport,
      manualTravelDurationMinutes,
    })
    await itineraryStore.fetchTripItinerary(tripId.value, trip.value)
    selectedStopId.value = stop.id
  } catch {
    resetStopDraft(stop)
    // store error를 오른쪽 일정 패널에서 표시한다.
  }
}

function nextRouteStop(stop) {
  const index = activeDisplayStops.value.findIndex((candidate) => candidate.id === stop?.id)
  return index >= 0 ? activeDisplayStops.value[index + 1] : null
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

function startStopDrag(stop, event) {
  if (event.button !== undefined && event.button !== 0) return
  const card = event.currentTarget
  const body = card.closest('.route-stop-list')
  if (!body) return
  const rect = card.getBoundingClientRect()
  const startMinutes =
    selectedTimeToMinutes(stopDraft(stop).selectedTime || stop.selectedTime) ??
    fallbackStopMinutes(stop)
  timelineDragState.value = {
    type: 'move',
    stop,
    body,
    grabOffsetY: event.clientY - rect.top,
    lastMinutes: startMinutes,
    moveDirection: 1,
  }
  selectedStopId.value = stop.id
  beginTimelinePointerTracking()
}

function startStayResize(stop, edge, event) {
  if (event.button !== undefined && event.button !== 0) return
  const body = event.currentTarget.closest('.route-stop-list')
  if (!body) return
  timelineDragState.value = {
    type: edge === 'top' ? 'resize-top' : 'resize-bottom',
    stop,
    body,
    startY: event.clientY,
    startMinutes: selectedTimeToMinutes(stopDraft(stop).selectedTime || stop.selectedTime) || TIMELINE_START_HOUR * 60,
    startStay: stopStayMinutes(stop),
  }
  selectedStopId.value = stop.id
  beginTimelinePointerTracking()
}

function beginTimelinePointerTracking() {
  window.addEventListener('pointermove', handleTimelinePointerMove)
  window.addEventListener('pointerup', finishTimelinePointerMove, { once: true })
  window.addEventListener('pointercancel', cancelTimelinePointerMove, { once: true })
}

function handleTimelinePointerMove(event) {
  const state = timelineDragState.value
  if (!state?.stop) return
  event.preventDefault()
  autoScrollTimeline(state.body, event.clientY)
  if (state.type === 'move') {
    const rect = state.body.getBoundingClientRect()
    const top = event.clientY - rect.top + state.body.scrollTop - state.grabOffsetY
    const selectedTime = topToSelectedTime(top)
    const nextMinutes = selectedTimeToMinutes(selectedTime) ?? state.lastMinutes
    timelineDragState.value = {
      ...state,
      lastMinutes: nextMinutes,
      moveDirection: nextMinutes >= state.lastMinutes ? 1 : -1,
    }
    setStopDraft(state.stop, { selectedTime })
  } else {
    const deltaMinutes = roundToTimelineStep(((event.clientY - state.startY) / TIMELINE_HOUR_HEIGHT_PX) * 60)
    if (state.type === 'resize-bottom') {
      setStopDraft(state.stop, { stayMinutes: Math.max(MIN_STAY_MINUTES, state.startStay + deltaMinutes) })
    } else {
      const nextStay = Math.max(MIN_STAY_MINUTES, state.startStay - deltaMinutes)
      const nextStart = state.startMinutes + (state.startStay - nextStay)
      setStopDraft(state.stop, { selectedTime: minutesToSelectedTime(nextStart), stayMinutes: nextStay })
    }
  }
  normalizeTimelineDrafts()
  renderMapPlaces()
}

function finishTimelinePointerMove() {
  normalizeTimelineDrafts()
  persistTimelineDrafts()
  cleanupTimelineDrag()
}

function cancelTimelinePointerMove() {
  cleanupTimelineDrag()
}

function cleanupTimelineDrag() {
  window.removeEventListener('pointermove', handleTimelinePointerMove)
  window.removeEventListener('pointerup', finishTimelinePointerMove)
  window.removeEventListener('pointercancel', cancelTimelinePointerMove)
  timelineDragState.value = null
}

function normalizeTimelineDrafts() {
  let cursor = TIMELINE_START_HOUR * 60
  activeDisplayStops.value.forEach((stop) => {
    const draft = stopDraft(stop)
    const current = selectedTimeToMinutes(draft.selectedTime || stop.selectedTime) || cursor
    const nextStart = Math.max(cursor, current)
    const stay = Math.max(MIN_STAY_MINUTES, Number(draft.stayMinutes) || stopStayMinutes(stop))
    setStopDraft(stop, { selectedTime: minutesToSelectedTime(nextStart), stayMinutes: stay })
    cursor = nextStart + stay
  })
}

function autoScrollTimeline(body, clientY) {
  if (!body) return
  const rect = body.getBoundingClientRect()
  if (clientY < rect.top + 64) body.scrollTop -= 18
  if (clientY > rect.bottom - 64) body.scrollTop += 18
}

function persistTimelineDrafts() {
  return Promise.all(activeDisplayStops.value.map((stop) => updateStopField(stop)))
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

function hasActiveDayStopForPlace(place) {
  const key = routePlaceKey(place)
  return Boolean(activeDay.value?.stops?.some((stop) => stopPlaceKey(stop) === key))
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
    stayMinutes: stayMinutesFromMemo(stop.memo),
  }
}

function orderTimelineStops(stops = []) {
  return [...stops].sort((left, right) => {
    const leftTime = selectedTimeToMinutes(stopDraft(left).selectedTime || left.selectedTime)
    const rightTime = selectedTimeToMinutes(stopDraft(right).selectedTime || right.selectedTime)
    const dragOrder = overlappingDragOrder(left, right, leftTime, rightTime)
    if (dragOrder) return dragOrder
    return (
      (leftTime ?? fallbackStopMinutes(left)) -
        (rightTime ?? fallbackStopMinutes(right)) ||
      Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0) ||
      Number(left.id ?? 0) - Number(right.id ?? 0)
    )
  })
}

function overlappingDragOrder(left, right, leftTime, rightTime) {
  const state = timelineDragState.value
  if (state?.type !== 'move' || !state.stop) return 0

  const leftIsDragged = String(left.id) === String(state.stop.id)
  const rightIsDragged = String(right.id) === String(state.stop.id)
  if (leftIsDragged === rightIsDragged) return 0

  const dragged = leftIsDragged ? left : right
  const other = leftIsDragged ? right : left
  const draggedStart = (leftIsDragged ? leftTime : rightTime) ?? fallbackStopMinutes(dragged)
  const otherStart = (leftIsDragged ? rightTime : leftTime) ?? fallbackStopMinutes(other)
  const draggedEnd = draggedStart + stopStayMinutes(dragged)
  const otherEnd = otherStart + stopStayMinutes(other)
  const overlaps = draggedStart < otherEnd && draggedEnd > otherStart
  if (!overlaps) return 0

  const draggedAfterOther = state.moveDirection >= 0
  if (leftIsDragged) return draggedAfterOther ? 1 : -1
  return draggedAfterOther ? -1 : 1
}

function nextRouteStartTime(stops = []) {
  const orderedStops = orderTimelineStops(stops)
  if (!orderedStops.length) return minutesToSelectedTime(TIMELINE_START_HOUR * 60)

  const lastStop = orderedStops[orderedStops.length - 1]
  const lastMinutes =
    selectedTimeToMinutes(stopDraft(lastStop).selectedTime || lastStop.selectedTime) ??
    fallbackStopMinutes(lastStop)
  const maxStart = TIMELINE_END_HOUR * 60 - MIN_STAY_MINUTES
  return minutesToSelectedTime(Math.min(maxStart, lastMinutes + 120))
}

function buildTimelineLayout(stops = []) {
  const layout = new Map()
  let cursor = 0
  stops.forEach((stop) => {
    const rawTop = selectedTimeToTop(stopDraft(stop).selectedTime || stop.selectedTime)
    const height = stopTimelineHeight(stop)
    const top = Math.max(rawTop, cursor)
    layout.set(stop.id, { top, height })
    cursor = top + height + TIMELINE_CARD_GAP_PX
  })
  return layout
}

function timelineBaseHeight() {
  return (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * TIMELINE_HOUR_HEIGHT_PX + 90
}

function timelineHourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`
}

function timelineHourStyle(hour) {
  return {
    top: `${Math.max(0, hour - TIMELINE_START_HOUR) * TIMELINE_HOUR_HEIGHT_PX}px`,
  }
}

function fallbackStopMinutes(stop) {
  return TIMELINE_START_HOUR * 60 + Math.max(0, Number(stop?.sortOrder ?? 1) - 1) * 90
}

function selectedTimeToMinutes(value) {
  const [hour, minute] = String(value || '').split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

function minutesToSelectedTime(minutes) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)))
  const hour = Math.floor(clamped / 60)
  const minute = clamped % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function roundToTimelineStep(minutes) {
  return Math.round(minutes / TIMELINE_MINUTES_PER_STEP) * TIMELINE_MINUTES_PER_STEP
}

function selectedTimeToTop(value) {
  const minutes = selectedTimeToMinutes(value) ?? TIMELINE_START_HOUR * 60
  const fromStart = Math.max(0, minutes - TIMELINE_START_HOUR * 60)
  return (fromStart / 60) * TIMELINE_HOUR_HEIGHT_PX
}

function topToSelectedTime(top) {
  const maxMinutes = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60
  const minutesFromStart = Math.max(
    0,
    Math.min(maxMinutes, roundToTimelineStep((top / TIMELINE_HOUR_HEIGHT_PX) * 60)),
  )
  return minutesToSelectedTime(TIMELINE_START_HOUR * 60 + minutesFromStart)
}

function stopStayMinutes(stop) {
  const draftMinutes = Number(stopDraft(stop).stayMinutes)
  if (Number.isFinite(draftMinutes) && draftMinutes >= MIN_STAY_MINUTES) return draftMinutes
  return stayMinutesFromMemo(stop.memo)
}

function stopTimelineHeight(stop) {
  return Math.max(
    72,
    Math.round((stopStayMinutes(stop) / 60) * TIMELINE_HOUR_HEIGHT_PX),
  )
}

function stopTimelineStyle(stop) {
  const layout = activeTimelineLayout.value.get(stop.id)
  return {
    top: `${layout?.top ?? selectedTimeToTop(stopDraft(stop).selectedTime || stop.selectedTime)}px`,
    height: `${layout?.height ?? stopTimelineHeight(stop)}px`,
    '--route-stop-color': mapMarkerColor(stop.place),
  }
}

function routeLegTimelineStyle(stop, nextStop) {
  const layout = activeTimelineLayout.value.get(stop.id)
  const nextLayout = nextStop ? activeTimelineLayout.value.get(nextStop.id) : null
  const stopBottom = (layout?.top ?? 0) + (layout?.height ?? stopTimelineHeight(stop))
  const nextTop = nextLayout?.top ?? stopBottom + 52
  const gap = Math.max(0, nextTop - stopBottom)
  const legHeight = 34
  return {
    top: `${stopBottom + Math.max(4, (gap - legHeight) / 2)}px`,
  }
}

function routePlaceTypeLabel(place = {}) {
  const markerType = mapMarkerType(toMapPlace(place))
  if (markerType === 'attraction') return '관광지'
  if (markerType === 'restaurant') return '식당'
  if (markerType === 'cafe') return '카페'
  return place.category || '장소'
}

function stayMinutesFromMemo(memo) {
  const text = String(memo || '')
  const hourMatch = text.match(/(\d+)\s*시간/)
  const minuteMatch = text.match(/(\d+)\s*분/)
  const minutes = (hourMatch ? Number(hourMatch[1]) * 60 : 0) + (minuteMatch ? Number(minuteMatch[1]) : 0)
  return Math.max(MIN_STAY_MINUTES, minutes || 60)
}

function formatStayMinutes(minutes) {
  const safeMinutes = Math.max(MIN_STAY_MINUTES, Number(minutes) || 60)
  const hours = Math.floor(safeMinutes / 60)
  const rest = safeMinutes % 60
  if (!hours) return rest + '분'
  return rest ? hours + '시간 ' + rest + '분' : hours + '시간'
}

function stayMemoFromMinutes(minutes) {
  return '머무는 시간 ' + formatStayMinutes(minutes)
}

function travelEstimateLabel(stop) {
  const estimate = stop?.travelFromPrevious
  if (!estimate) return '계산 중'
  if (estimate.status === 'manual' || estimate.status === 'estimated') {
    return formatTravelDuration(estimate.durationSeconds) || '계산 중'
  }
  return '계산 중'
}

function travelProviderLabel() {
  return ''
}

function travelEstimateTitle(stop) {
  return travelEstimateLabel(stop) || '이동 시간'
}

function routeLegSummary(fromStop, toStop) {
  const option = transportOption(routeLegMode(fromStop))
  const estimate = routeLegEstimate(fromStop, toStop)
  const duration = formatTravelDuration(estimate?.durationSeconds)
  const durationLabel = estimate?.status === 'manual' && duration ? `직접 ${duration}` : duration
  const distance = formatTravelDistance(estimate?.distanceMeters)
  return [option.label, durationLabel || '계산 중', distance].filter(Boolean).join(' · ')
}

function routeLegTitle(fromStop, toStop) {
  const estimate = routeLegEstimate(fromStop, toStop)
  if (estimate?.status === 'estimated') return '계산된 경로 기준 이동 시간입니다.'
  if (estimate?.status === 'manual') return '직접 입력한 이동 시간입니다.'
  return '좌표 거리로 임시 계산한 이동 시간입니다. 교통수단을 바꾸면 지도 경로와 시간이 함께 갱신됩니다.'
}

function routeLegMode(stop) {
  return stopDraft(stop).transport || stop.transport || 'other'
}

function transportOption(value) {
  return TRANSPORT_VIEW_OPTIONS.find((option) => option.value === value) || TRANSPORT_VIEW_OPTIONS[3]
}

function routeLegEstimate(fromStop, toStop) {
  const estimate = toStop?.travelFromPrevious
  if (
    estimate?.fromStopId === fromStop?.id &&
    Number.isFinite(estimate.durationSeconds)
  ) {
    return estimate
  }

  const fromPlace = toMapPlace(fromStop?.place)
  const toPlace = toMapPlace(toStop?.place)
  if (!hasCoordinates(fromPlace) || !hasCoordinates(toPlace)) return null

  const distance = distanceMeters(
    fromPlace.latitude,
    fromPlace.longitude,
    toPlace.latitude,
    toPlace.longitude,
  )

  return {
    status: 'local',
    mode: routeLegMode(fromStop),
    durationSeconds: fallbackTravelDurationSeconds(routeLegMode(fromStop), distance),
    distanceMeters: distance,
  }
}

function fallbackTravelDurationSeconds(mode, meters) {
  const metersPerMinuteByMode = {
    walk: 75,
    car: 520,
    public_transit: 330,
    other: 220,
  }
  const metersPerMinute = metersPerMinuteByMode[mode] || metersPerMinuteByMode.other
  return Math.max(60, Math.round((meters / metersPerMinute) * 60))
}

function formatTravelDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return minutes + '분'
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes ? hours + '시간 ' + restMinutes + '분' : hours + '시간'
}

function formatTravelDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return ''
  if (meters < 1000) return Math.round(meters) + 'm'
  return (meters / 1000).toFixed(meters < 10000 ? 1 : 0) + 'km'
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

function mapMarkerType(place) {
  const categoryText = `${place.categoryGroup || ''} ${place.category || ''}`
  if (place.origin === 'db') return 'attraction'
  if (/카페|커피|디저트|베이커리/.test(categoryText)) return 'cafe'
  if (/음식|식당|맛집|한식|중식|일식|양식|분식|고기|술집|호프|요리/.test(categoryText)) return 'restaurant'
  return 'place'
}

function markerSymbol(place) {
  const markerType = mapMarkerType(place)
  if (markerType === 'attraction') return '★'
  if (markerType === 'cafe') return '◆'
  if (markerType === 'restaurant') return '●'
  return '•'
}

function mapMarkerColor(place) {
  const markerType = mapMarkerType(toMapPlace(place))
  if (markerType === 'attraction') return '#6f8a5f'
  if (markerType === 'restaurant') return '#8f4a47'
  if (markerType === 'cafe') return '#8a6a82'
  return '#5f7d94'
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
  return buildFallbackPinStyle(mapPlaces.value, place)
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
  return buildKakaoMapSearchPlan(viewport, map?.getLevel?.() ?? 7)
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

function normalizeSearchText(value = '') {
  return value.trim().replace(/\s+/g, '').toLowerCase()
}
</script>

<template>
  <div class="place-page-shell">
    <AppTopBar active="trips" search-placeholder="장소, 골목, 맛집 검색">
      <template #actions>
        <Button label="여행으로" severity="secondary" outlined @click="goBack" />
      </template>
    </AppTopBar>

    <main class="place-page">
      <header class="place-header">
        <div>
          <span class="tag-hand">{{ itineraryMode ? 'Route Builder' : 'Place Search' }}</span>
          <h1>{{ itineraryMode ? '담은 장소를 일정으로 엮어요' : tripRegion + ' 주변 장소를 담아요' }}</h1>
          <p>{{ itineraryMode ? '날짜별로 방문 순서와 머무는 시간을 빠르게 정합니다.' : '관광 데이터와 카카오맵 검색 결과를 한 화면에서 확인하고 보관함에 담습니다.' }}</p>
        </div>
        <div class="step-card">
          <span :class="{ on: !itineraryMode }">1 장소 담기</span>
          <i aria-hidden="true">›</i>
          <span :class="{ on: itineraryMode }">2 일정 배치</span>
        </div>
      </header>

      <Message v-if="tripStore.error && !trip" severity="error" :closable="false" class="state-message">{{ tripStore.error }}</Message>
      <Message v-if="placeError" severity="error" :closable="false" class="state-message">{{ placeError }}</Message>
      <Message v-if="itineraryNotice" severity="success" :closable="false" class="state-message">{{ itineraryNotice }}</Message>

      <section v-if="loading" class="loading-state" aria-live="polite">
        <ProgressSpinner aria-label="장소 정보를 불러오는 중" />
        <span>장소 정보를 불러오고 있습니다.</span>
      </section>

      <section v-else class="search-shell" :class="{ planning: itineraryMode }">
        <aside class="place-list-panel" :class="{ planning: itineraryMode }">
          <template v-if="!itineraryMode">
            <div class="search-card">
              <div class="field-row">
                <InputText v-model="keyword" placeholder="카페, 관광지, 식당..." @keyup.enter="searchKakaoPlaces" />
                <Button label="검색" :loading="searching" @click="searchKakaoPlaces" />
              </div>
              <SelectButton v-model="activeTab" :options="CATEGORY_OPTIONS" option-label="label" option-value="value" />
            </div>
            <div class="list-head"><strong>검색 결과</strong><em>{{ visiblePlaces.length }}곳</em></div>
            <div class="place-list">
              <article v-for="place in paginatedPlaces" :key="place.uid" class="place-row" :class="{ active: selectedPlace?.uid === place.uid }">
                <button type="button" class="place-row__main" @click="selectPlace(place)">
                  <span class="place-type-dot" :class="mapMarkerType(place)">{{ markerSymbol(place) }}</span>
                  <span><strong>{{ place.name }}</strong><small>{{ place.origin === 'kakao' ? '카카오맵' : '한국관광공사' }} · {{ place.category || '장소' }}</small></span>
                </button>
                <Button class="place-row__pocket" :label="isPocketed(place) ? '✓' : '＋'" severity="secondary" outlined rounded :aria-label="place.name + ' 담기'" @click="togglePocket(place)" />
              </article>
            </div>
            <nav class="pagination" aria-label="검색 결과 페이지">
              <Button label="이전" size="small" severity="secondary" outlined :disabled="!canGoPrevPage" @click="goToPage(currentPage - 1)" />
              <Button v-for="pageNumber in pageNumbers" :key="pageNumber" :label="String(pageNumber)" size="small" :severity="pageNumber === currentPage ? 'contrast' : 'secondary'" :outlined="pageNumber !== currentPage" @click="goToPage(pageNumber)" />
              <Button label="다음" size="small" severity="secondary" outlined :disabled="!canGoNextPage" @click="goToPage(currentPage + 1)" />
            </nav>
          </template>

          <template v-else>
            <div class="route-builder-head">
              <Button label="장소 담기로" severity="secondary" outlined @click="closeItineraryBuilder" />
            </div>
            <SelectButton v-model="activeDayNumber" :options="dayTabs" option-label="label" option-value="value" class="day-tabs" />
            <section class="route-stop-section">
              <header class="route-section-head">
                <strong>DAY {{ activeDay?.dayNumber || 1 }} · {{ formatDayDate(activeDay?.date) }}</strong>
                <small>09:00부터 21:00까지, 카드 높이로 머무는 시간을 조정합니다.</small>
              </header>
              <div class="route-stop-list">
                <div class="route-time-canvas" :style="timelineCanvasStyle">
                  <div v-for="hour in timelineHours" :key="hour" class="route-hour-row" :style="timelineHourStyle(hour)">
                    <span>{{ timelineHourLabel(hour) }}</span>
                    <i aria-hidden="true"></i>
                  </div>
                  <p v-if="!activeDisplayStops.length" class="empty-pocket route-empty-timeline">지도 마커나 Pocket의 ＋ 버튼으로 장소를 일정에 추가하세요.</p>
                  <template v-for="(stop, index) in activeDisplayStops" :key="stop.id">
                    <article class="route-stop-card" :class="{ active: selectedStopId === stop.id }" :style="stopTimelineStyle(stop)" @pointerdown="startStopDrag(stop, $event)">
                      <span class="route-stop-resize route-stop-resize--top" @pointerdown.stop.prevent="startStayResize(stop, 'top', $event)"></span>
                      <div class="route-stop-main">
                        <div>
                          <strong>{{ stop.place.name }}</strong>
                          <small><b>{{ routePlaceTypeLabel(stop.place) }}</b>{{ stop.place.category ? ' · ' + stop.place.category : '' }}</small>
                          <em>머무는 시간 {{ formatStayMinutes(stopStayMinutes(stop)) }}</em>
                        </div>
                      </div>
                      <Button class="route-stop-delete" label="×" severity="danger" text rounded :aria-label="stop.place.name + ' 삭제'" @pointerdown.stop @click="deleteStop(stop)" />
                      <span class="route-stop-resize route-stop-resize--bottom" @pointerdown.stop.prevent="startStayResize(stop, 'bottom', $event)"></span>
                    </article>
                    <div v-if="index < activeDisplayStops.length - 1" class="route-leg" :style="routeLegTimelineStyle(stop, activeDisplayStops[index + 1])">
                      <div class="route-leg__details" :class="{ 'has-manual': isManualTravelInputVisible(stop) }">
                        <Select :model-value="routeLegMode(stop)" :options="TRANSPORT_VIEW_OPTIONS" option-label="label" option-value="value" :disabled="itineraryStore.mutating" @pointerdown.stop @update:model-value="updateLegTransport(stop, $event)" />
                        <em :title="routeLegTitle(stop, activeDisplayStops[index + 1])">{{ routeLegSummary(stop, activeDisplayStops[index + 1]) }}</em>
                        <label v-if="isManualTravelInputVisible(stop)" class="route-leg__manual">
                          <InputText
                            :model-value="stopDraft(stop).manualTravelMinutes"
                            class="route-leg__manual-input"
                            inputmode="numeric"
                            aria-label="대중교통 이동 시간 직접 입력"
                            @update:model-value="setStopDraft(stop, { manualTravelMinutes: $event })"
                            @change="updateManualTravelDuration(stop)"
                          />
                          <span>분</span>
                        </label>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </section>
          </template>
        </aside>

        <section class="map-panel">
          <div class="map-toolbar">
            <div><span class="eyebrow">{{ itineraryMode ? 'Itinerary Map' : 'Kakao Map' }}</span><h2>{{ itineraryMode ? tripRegion + ' 일정 지도' : tripRegion + ' 주변 지도' }}</h2></div>
            <div class="map-tools">
              <Button
                v-if="itineraryMode"
                class="route-complete-button"
                label="완료"
                :disabled="!hasScheduledStops || itineraryStore.loading || itineraryStore.mutating || tripStore.updating"
                :loading="tripStore.updating"
                @click="completeItineraryBuilder"
              />
              <Button v-if="canSearchCurrentMapArea" label="이 위치에서 재검색" severity="secondary" outlined size="small" :loading="searching" @click="searchCurrentMapArea" />
            </div>
          </div>
          <div class="map-stage">
            <div ref="mapEl" class="kakao-map" :class="{ disabled: sdkError }" />
            <Message v-if="sdkError" severity="error" :closable="false" class="map-error">카카오맵을 불러오지 못했습니다. {{ sdkError }}</Message>
            <div v-if="sdkError" class="fallback-map">
              <button v-for="place in mapPlaces.filter(hasCoordinates)" :key="place.uid" type="button" class="fallback-pin" :class="[mapMarkerType(place), { pocketed: isPocketed(place) }]" :style="fallbackPinStyle(place)" @click="handleMapPlaceClick(place)"><span aria-hidden="true" /><strong>{{ place.name }}</strong></button>
            </div>
          </div>
        </section>

        <aside class="pocket-panel">
          <template v-if="!itineraryMode">
            <div class="pocket-head"><div><span class="eyebrow">Pocket</span><h2>담긴 장소</h2></div><strong>{{ pocketDisplayPlaces.length }}</strong></div>
            <div v-if="pocketDisplayPlaces.length" class="pocket-list">
              <article v-for="place in pocketDisplayPlaces" :key="place.uid" class="pocket-item" :class="{ routed: isRoutedPlace(place) }">
                <span class="pocket-dot" :class="mapMarkerType(place)">{{ markerSymbol(place) }}</span>
                <span class="pocket-item__text"><strong>{{ place.name }}</strong><small>{{ place.category || '장소' }}</small></span>
                <Button v-if="isPocketed(place)" label="×" severity="secondary" text rounded aria-label="담기 취소" @click="togglePocket(place)" />
                <em v-else>일정 포함</em>
              </article>
            </div>
            <p v-else class="empty-pocket">지도나 목록에서 장소를 골라 담아보세요.</p>
            <Button class="route-start-button" label="일정 배치하기" severity="success" :disabled="!pocketDisplayPlaces.length" :loading="itineraryStore.loading" @click="openItineraryBuilder" />
          </template>
          <template v-else>
            <div class="pocket-head"><div><span class="eyebrow">Pocket</span><h2>경로 후보</h2></div><strong>{{ routeCandidatePlaces.length }}</strong></div>
            <div v-if="routeCandidatePlaces.length" class="pocket-list">
              <article v-for="place in routeCandidatePlaces" :key="place.uid" class="pocket-item">
                <span class="pocket-dot" :class="mapMarkerType(place)">{{ markerSymbol(place) }}</span>
                <span class="pocket-item__text"><strong>{{ place.name }}</strong><small>{{ place.category || '장소' }}</small></span>
                <Button label="＋" severity="secondary" text rounded :aria-label="place.name + ' 일정 추가'" @click="addPocketPlaceToRoute(place)" />
              </article>
            </div>
            <p v-else class="empty-pocket">추가할 경로 후보가 없습니다.</p>
          </template>
        </aside>
      </section>
    </main>
  </div>
</template>

<style scoped>
.place-page-shell {
  min-height: 100vh;
  --ds-surface: var(--paper);
}

.place-page {
  color: var(--ink);
  margin: 0 auto;
  width: min(100%, 1760px);
  max-width: none;
  min-height: calc(100vh - 54px);
  padding: 18px clamp(14px, 2.2vw, 34px) 44px;
}

.place-header {
  display: flex;
  align-items: center;
  gap: 18px;
  justify-content: space-between;
  margin-bottom: 14px;
}

.place-header h1 {
  margin: 4px 0 0;
  font-size: clamp(28px, 3vw, 42px);
  line-height: 1.04;
  letter-spacing: 0;
}

.place-header p {
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 650;
  margin: 8px 0 0;
}

.step-card {
  align-items: center;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  color: var(--ink-faint);
  display: flex;
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 800;
  gap: 9px;
  padding: 11px 14px;
}

.step-card span {
  white-space: nowrap;
}

.step-card span.on {
  color: var(--accent);
}

.state-message {
  margin-bottom: 18px;
}

.loading-state {
  min-height: 420px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  background: var(--paper);
}

.search-shell {
  height: clamp(640px, calc(100vh - 170px), 860px);
  display: grid;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1.8fr) minmax(260px, 320px);
  gap: 12px;
  align-items: stretch;
}

.search-shell.planning {
  grid-template-columns: minmax(340px, 430px) minmax(0, 1.6fr) minmax(260px, 320px);
}

.place-list-panel,
.map-panel,
.pocket-panel {
  min-height: 0;
  height: 100%;
  border: 1px solid var(--line2);
  border-radius: 12px;
  background: color-mix(in srgb, var(--paper) 86%, transparent);
  box-shadow: none;
  overflow: hidden;
}

.place-list-panel {
  padding: 14px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  min-height: 0;
}

.place-list-panel.planning {
  grid-template-rows: auto auto minmax(0, 1fr);
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

.route-complete-button {
  border-color: var(--accent) !important;
  background: var(--accent) !important;
  color: var(--on-fill) !important;
  font-weight: 850;
  box-shadow: 0 10px 24px -14px rgba(194, 105, 63, 0.85);
}

.route-complete-button:enabled:hover {
  border-color: #a95534 !important;
  background: #a95534 !important;
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

.pocket-list {
  flex: 1 1 auto;
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
  border: 1px solid var(--line2);
  border-radius: var(--radius-sm);
  background: var(--paper-card);
}

.place-row {
  min-height: 82px;
  width: 100%;
  padding: 12px;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 12px;
  text-align: left;
  color: var(--ink);
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
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

.place-row__pocket {
  justify-self: end;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.place-row.active {
  border-color: var(--accent-soft);
  background: #f7ecd6;
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
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.map-panel {
  padding: 10px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
}

.map-toolbar {
  align-items: center;
  padding: 2px 4px 0;
}

.map-toolbar h2,
.pocket-head h2 {
  margin: 4px 0 0;
  font-size: 24px;
}

.map-stage {
  height: 100%;
  min-height: 0;
  border: 1px solid var(--line2);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  background:
    linear-gradient(90deg, rgba(90, 74, 46, 0.08) 1px, transparent 1px),
    linear-gradient(0deg, rgba(90, 74, 46, 0.08) 1px, transparent 1px),
    linear-gradient(135deg, #f8f3e9, #efe5d4);
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
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px 7px 7px;
  border-radius: 999px;
  background: var(--paper-card);
  color: var(--ink);
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
  color: #f7ecd6;
  font-size: 12px;
  background: var(--t-blue);
}

.fallback-pin.attraction span {
  background: var(--t-sage);
}

.fallback-pin.restaurant span {
  background: var(--t-burgundy);
}

.fallback-pin.cafe span {
  background: var(--t-plum);
}

.fallback-pin.pocketed {
  outline: 0;
}

.fallback-pin.pocketed span {
  background: var(--t-mustard);
}

.empty-pocket {
  margin: 0;
  color: var(--ink-sub);
  font-weight: 750;
  line-height: 1.55;
}

.pocket-panel {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pocket-head strong {
  min-width: 42px;
  height: 42px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: var(--on-fill);
  background: var(--accent);
}

.pocket-item {
  min-height: 66px;
  padding: 12px 46px 12px 12px;
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 9px;
}

.pocket-item :deep(.p-button) {
  position: absolute;
  top: 8px;
  right: 8px;
}

.pocket-item__text {
  min-width: 0;
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
  background: #e7efe4;
  color: var(--t-sage);
  font-style: normal;
  font-size: 11px;
  font-weight: 900;
}

.route-start-button {
  width: 100%;
  justify-content: center;
  margin-top: auto;
  border-color: var(--accent) !important;
  background: var(--accent) !important;
  color: var(--on-fill) !important;
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
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 9px;
  background: var(--paper-card);
  color: var(--ink);
  display: grid;
  justify-items: start;
  gap: 2px;
  cursor: pointer;
  box-shadow: inset 4px 0 0 var(--trip-day-color, var(--accent));
}

.day-tab strong {
  font-size: 14px;
}

.day-tab span,
.day-tab small {
  color: var(--ink-sub);
  font-size: 11px;
  font-weight: 800;
}

.day-tab em {
  min-width: 26px;
  min-height: 22px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  background: color-mix(in srgb, var(--trip-day-color, var(--accent)) 12%, var(--paper-card));
  color: var(--trip-day-color, var(--accent));
  font-style: normal;
  font-size: 12px;
  font-weight: 900;
}

.day-tab.active {
  border-color: var(--trip-day-color, var(--accent));
  background: color-mix(in srgb, var(--trip-day-color, var(--accent)) 9%, var(--paper-card));
  box-shadow: inset 4px 0 0 var(--trip-day-color, var(--accent)),
    inset 0 0 0 1px var(--trip-day-color, var(--accent));
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
  color: var(--ink);
  font-size: 15px;
}

.route-section-head small {
  min-width: 0;
  color: var(--ink-sub);
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
  background: var(--t-sage);
  color: #f7ecd6;
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
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 750;
  overflow-wrap: anywhere;
}

.route-stop-card {
  position: relative;
  border: 1px solid var(--line2);
  border-radius: var(--radius-sm);
  padding: 11px;
  display: grid;
  gap: 9px;
  background: var(--paper-card);
}

.route-stop-card.active {
  border-color: var(--accent-soft);
  background: #fff7ea;
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
  color: var(--t-sage);
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
  color: var(--trip-active-day-color, var(--accent));
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
  background: var(--trip-other-day-color, var(--accent));
  position: absolute;
  top: -7px;
  left: 50%;
  transform: translateX(-50%);
  box-shadow: 0 2px 7px rgba(194, 105, 63, 0.24);
}

:global(.trip-map-pin.is-used-in-route::before) {
  content: '';
  width: 34px;
  height: 3px;
  border-radius: 999px;
  background: var(--trip-other-day-color, var(--accent));
  position: absolute;
  top: -7px;
  left: 50%;
  transform: translateX(-50%);
  box-shadow: 0 2px 7px color-mix(in srgb, var(--trip-other-day-color, var(--accent)) 25%, transparent);
}

:global(.trip-map-pin span) {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #f7ecd6;
  font-size: 12px;
  font-weight: 950;
  line-height: 1;
}

:global(.trip-map-pin.is-db span) {
  background: var(--t-sage);
}

:global(.trip-map-pin.is-kakao span) {
  background: var(--t-blue);
}

:global(.trip-map-pin.is-attraction span) {
  background: var(--t-sage);
}

:global(.trip-map-pin.is-restaurant span) {
  background: var(--t-burgundy);
}

:global(.trip-map-pin.is-cafe span) {
  background: var(--t-plum);
}

:global(.trip-map-pin.is-routed span) {
  background: var(--trip-active-day-color, var(--accent));
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--trip-active-day-color, var(--accent)) 18%, transparent),
    0 10px 24px rgba(15, 23, 42, 0.22);
}

:global(.trip-map-pin.is-pocketed:not(.is-routed):not(.is-used-other-day):not(.is-used-in-route) span) {
  background: var(--t-mustard);
  box-shadow: 0 8px 18px rgba(195, 154, 64, 0.24);
}

:global(.trip-map-pin.is-pocketed:not(.is-routed):not(.is-used-other-day):not(.is-used-in-route) strong) {
  color: var(--t-khaki);
}

:global(.trip-map-pin.is-used-other-day:not(.is-routed) span) {
  background: var(--trip-other-day-color, var(--accent));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--trip-other-day-color, var(--accent)) 16%, transparent),
    0 8px 18px color-mix(in srgb, var(--trip-other-day-color, var(--accent)) 24%, transparent);
}

:global(.trip-map-pin.is-used-other-day:not(.is-routed) strong),
:global(.trip-map-pin.is-used-other-day:not(.is-routed) .trip-map-pin__status) {
  color: var(--trip-other-day-color, var(--accent));
}

:global(.trip-map-pin.is-used-in-route span) {
  background: var(--trip-other-day-color, var(--accent));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--trip-other-day-color, var(--accent)) 16%, transparent),
    0 8px 18px color-mix(in srgb, var(--trip-other-day-color, var(--accent)) 24%, transparent);
}

:global(.trip-map-pin.is-used-in-route strong),
:global(.trip-map-pin.is-used-in-route .trip-map-pin__status) {
  color: var(--trip-other-day-color, var(--accent));
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
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-fill);
}

:global(.trip-place-popup__button:disabled) {
  border-color: var(--line);
  background: var(--paper-dim);
  color: var(--ink-sub);
  cursor: default;
}

:global(.trip-map-pin.is-grouped) {
  filter: drop-shadow(0 8px 14px rgba(15, 23, 42, 0.18));
}

:global(.trip-map-pin.is-pocketed) {
  outline: 0;
}

@media (max-width: 1180px) {
  .search-shell {
    height: auto;
    min-height: 640px;
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
    min-height: 0;
    grid-template-columns: 1fr;
  }

  .search-shell.planning {
    min-height: 0;
    grid-template-columns: 1fr;
  }

  .place-list-panel,
  .map-panel,
  .pocket-panel {
    height: auto;
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

.place-list-panel.planning {
  min-width: 0;
  overflow: hidden;
}

.route-builder-head {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.day-tabs {
  width: 100%;
}

.route-stop-list {
  position: relative;
  display: block;
  height: min(680px, 66vh);
  min-height: 540px;
  overflow: auto;
  padding: 8px 8px 32px 0;
  border: 1px solid rgba(213, 195, 164, 0.72);
  border-radius: 12px;
  background: #fffaf3;
}

.route-time-canvas {
  position: relative;
  min-width: 0;
  margin-left: 58px;
  border-left: 3px solid #e2d5c0;
}

.route-hour-row {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  pointer-events: none;
}

.route-hour-row span {
  position: absolute;
  top: -10px;
  left: -58px;
  width: 48px;
  color: #b19f87;
  font-size: 12px;
  font-weight: 800;
  text-align: right;
}

.route-hour-row i {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px solid #ecdfcb;
}

.route-empty-timeline {
  position: absolute;
  top: 36px;
  left: 18px;
  right: 18px;
  border: 1px dashed #dfcfb8;
  border-radius: 10px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.72);
  text-align: center;
}

.route-stop-card {
  position: absolute;
  left: -2px;
  right: 8px;
  min-height: 72px;
  margin: 0;
  padding: 13px 44px 14px 18px;
  border-left: 6px solid var(--route-stop-color, #6f8d61);
  border-color: #e6d8c2;
  border-radius: 0 12px 12px 0;
  display: flex;
  align-items: center;
  cursor: grab;
  user-select: none;
  overflow: hidden;
  z-index: 10;
  box-shadow: 0 8px 18px rgba(82, 68, 45, 0.09);
  transition:
    top 0.16s ease,
    height 0.16s ease,
    box-shadow 0.16s ease;
}

.route-stop-card:active {
  cursor: grabbing;
}

.route-stop-main {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  cursor: inherit;
}

.route-stop-main strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 18px;
  line-height: 1.25;
}

.route-stop-main small {
  display: block;
  min-width: 0;
  margin-top: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 800;
}

.route-stop-main small b {
  margin-right: 5px;
  border: 1px solid #e5d5bd;
  border-radius: 999px;
  padding: 1px 6px;
  color: #b9693f;
  font-size: 11px;
}

.route-stop-main em {
  display: block;
  margin-top: 8px;
  color: var(--ink-sub);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: normal;
  font-size: 12px;
  font-weight: 800;
}

.route-stop-delete {
  position: absolute;
  top: 8px;
  right: 8px;
}

.route-stop-resize {
  position: absolute;
  left: 50%;
  z-index: 20;
  width: 54px;
  height: 6px;
  border-radius: 999px;
  background: #cdbfa7;
  transform: translateX(-50%);
  cursor: ns-resize;
}

.route-stop-resize--top {
  top: -4px;
}

.route-stop-resize--bottom {
  bottom: -4px;
}

.route-leg {
  position: absolute;
  left: 20px;
  z-index: 14;
  width: min(300px, calc(100% - 48px));
  min-height: 34px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  display: flex;
  align-items: center;
  background: #f5eddf;
  box-shadow: 0 3px 8px rgba(82, 68, 45, 0.08);
  transition: top 0.16s ease;
}

.route-leg > span {
  display: none;
}

.route-leg__details,
.route-leg__details.has-manual {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  padding: 4px 8px;
}

.route-leg__details :deep(.p-select) {
  width: 128px;
  min-width: 128px;
  height: 28px;
  border-color: #dfcfb8;
  border-radius: 999px;
  background: #fff;
}

.route-leg__details :deep(.p-select-label) {
  padding: 3px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 850;
}

.route-leg em {
  min-width: 0;
  max-width: none;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: transparent;
  color: #2f7b5f;
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
}

.route-leg__manual,
.route-leg__manual-input {
  display: none;
}

.place-row__main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.place-type-dot,
.pocket-dot {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  color: #f7ecd6;
  background: var(--t-blue);
  font-weight: 950;
  line-height: 1;
}

.place-type-dot {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  font-size: 14px;
}

.pocket-dot {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  font-size: 12px;
}

.place-type-dot.attraction,
.pocket-dot.attraction {
  background: var(--t-sage);
}

.place-type-dot.restaurant,
.pocket-dot.restaurant {
  background: var(--t-burgundy);
}

.place-type-dot.cafe,
.pocket-dot.cafe {
  background: var(--t-plum);
}

.place-type-dot.place,
.pocket-dot.place {
  background: var(--t-blue);
}
</style>
