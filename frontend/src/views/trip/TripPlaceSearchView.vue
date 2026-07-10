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
import PlacePocketPanel from '@/components/trip/PlacePocketPanel.vue'
import PlaceSearchPanel from '@/components/trip/PlaceSearchPanel.vue'
import { useItineraryStore } from '@/stores/itinerary'
import { useKakaoMapLifecycle } from '@/composables/useKakaoMapLifecycle'
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
import {
  buildTimelineLayout as calculateTimelineLayout,
  formatStayMinutes,
  minutesToSelectedTime,
  nextRouteStartTime as calculateNextRouteStartTime,
  orderTimelineStops as sortTimelineStops,
  roundToTimelineStep,
  selectedTimeToMinutes,
  selectedTimeToTop,
  stayMemoFromMinutes,
  stayMinutesFromMemo,
  stopStayMinutes as calculateStopStayMinutes,
  stopTimelineHeight as calculateStopTimelineHeight,
  timelineBaseHeight,
  timelineHourLabel,
  timelineHourStyle,
  topToSelectedTime,
} from '@/utils/itineraryTimeline'
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
const mapLifecycle = useKakaoMapLifecycle()

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
  mapLifecycle.cleanup(kakao, map)
  selectedPlace.value = null
  cleanupTimelineDrag()
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
  mapLifecycle.attachListeners(kakao, map, {
    idle: () => {
      updateMapSignature()
      drawMapPlaces({ preserveViewport: true })
      if (shouldMarkBaselineOnIdle) {
        lastMapSearchSignature.value = currentMapSignature.value
        shouldMarkBaselineOnIdle = false
      }
    },
    zoom_changed: () => {
      shouldMarkBaselineOnIdle = false
      updateMapSignature()
      drawMapPlaces({ preserveViewport: true })
    },
    click: () => clearPlacePopup(),
  })
  updateMapSignature()
}

function removeMapListeners() {
  mapLifecycle.removeListeners(kakao, map)
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
    mapLifecycle.addOverlay(overlay)
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
  mapLifecycle.clearDrawings()
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
      mapLifecycle.addRoutePolyline(polyline)
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
  const show = () => {
    if (selectedPlace.value?.uid !== place.uid) return
    showPlacePopup(place, position)
  }
  mapLifecycle.schedulePopup(show, delayed ? 450 : 0)
}

function showPlacePopup(place, position) {
  if (!kakao || !map) return
  clearPlacePopup({ clearSelection: false })

  const popupOverlay = new kakao.maps.CustomOverlay({
    position,
    content: createPlacePopupContent(place),
    xAnchor: 0.5,
    yAnchor: 1.1,
    zIndex: 50,
    clickable: true,
  })
  mapLifecycle.setPopupOverlay(popupOverlay)
  popupOverlay.setMap(map)
  requestAnimationFrame(() => keepPlacePopupInView())
}

function clearPlacePopup({ clearSelection = true } = {}) {
  mapLifecycle.clearPopupTimer()
  mapLifecycle.clearPopupOverlay()
  if (clearSelection) {
    selectedPlace.value = null
  }
}

function clearPlacePopupTimer() {
  mapLifecycle.clearPopupTimer()
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
  if (!mapEl.value || !mapLifecycle.hasPopupOverlay()) return

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
  return sortTimelineStops(stops, stopDraft, timelineDragState.value)
}

function nextRouteStartTime(stops = []) {
  return calculateNextRouteStartTime(stops, stopDraft, timelineDragState.value)
}

function buildTimelineLayout(stops = []) {
  return calculateTimelineLayout(stops, stopDraft)
}

function stopStayMinutes(stop) {
  return calculateStopStayMinutes(stop, stopDraft)
}

function stopTimelineHeight(stop) {
  return calculateStopTimelineHeight(stop, stopDraft)
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
        <PlaceSearchPanel
          v-if="!itineraryMode"
          v-model:keyword="keyword"
          v-model:active-tab="activeTab"
          :can-go-next-page="canGoNextPage"
          :can-go-prev-page="canGoPrevPage"
          :category-options="CATEGORY_OPTIONS"
          :current-page="currentPage"
          :is-pocketed="isPocketed"
          :map-marker-type="mapMarkerType"
          :marker-symbol="markerSymbol"
          :page-numbers="pageNumbers"
          :paginated-places="paginatedPlaces"
          :searching="searching"
          :selected-place="selectedPlace"
          :visible-count="visiblePlaces.length"
          @go-page="goToPage"
          @search="searchKakaoPlaces"
          @select-place="selectPlace"
          @toggle-pocket="togglePocket"
        />

        <aside v-else class="place-list-panel planning">
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

        <PlacePocketPanel
          :is-pocketed="isPocketed"
          :is-routed-place="isRoutedPlace"
          :itinerary-loading="itineraryStore.loading"
          :itinerary-mode="itineraryMode"
          :map-marker-type="mapMarkerType"
          :marker-symbol="markerSymbol"
          :pocket-display-places="pocketDisplayPlaces"
          :route-candidate-places="routeCandidatePlaces"
          @add-route-place="addPocketPlaceToRoute"
          @open-itinerary="openItineraryBuilder"
          @toggle-pocket="togglePocket"
        />
      </section>
    </main>
  </div>
</template>

<style src="./TripPlaceSearchView.css"></style>
