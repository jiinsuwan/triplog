<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import SelectButton from 'primevue/selectbutton'
import { fetchPlaceRegions, fetchPlaces } from '@/api/placeApi'
import { loadKakaoMaps } from '@/utils/kakaoMap'
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
let placePopupOverlay = null
let mapIdleHandler = null
let mapZoomChangedHandler = null
let mapClickHandler = null
let shouldMarkBaselineOnIdle = false

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
  places.value.filter((place) => pocketIds.value.includes(place.uid)),
)
const canSearchCurrentMapArea = computed(
  () =>
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
  () => [visiblePlaces.value, pocketIds.value],
  () => renderMapPlaces(),
  { deep: true },
)

watch(
  () => visiblePlaces.value.map((place) => place.uid).join('|'),
  () => {
    currentPage.value = 1
  },
)

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
    renderMapPlaces()
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

function renderMapPlaces() {
  drawMapPlaces({ preserveViewport: false })
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
  const drawable = visiblePlaces.value.filter(hasCoordinates)
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
  overlays.forEach((overlay) => overlay.setMap(null))
  overlays = []
}

function createOverlayContent(place, markerState = defaultMarkerState()) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = [
    'trip-map-pin',
    place.origin === 'db' ? 'is-db' : 'is-kakao',
    `is-${mapMarkerType(place)}`,
    isPocketed(place) ? 'is-pocketed' : '',
    markerState.dot ? 'is-dot' : '',
    markerState.labelHidden ? 'is-label-hidden' : '',
    markerState.groupSize > 1 ? 'is-grouped' : '',
  ]
    .filter(Boolean)
    .join(' ')
  button.style.setProperty('--marker-offset-x', `${markerState.offset.x}px`)
  button.style.setProperty('--marker-offset-y', `${markerState.offset.y}px`)
  if (markerState.dot) {
    const hiddenCount = markerState.groupSize > 1 ? ` 외 ${markerState.groupSize - 1}곳` : ''
    button.title = `${place.name}${hiddenCount}`
    button.setAttribute('aria-label', `${place.name}${hiddenCount}`)
  }

  const dot = document.createElement('span')
  const icon = document.createElement('i')
  icon.className = markerIconClass(place)
  dot.append(icon)
  const label = document.createElement('strong')
  label.textContent = mapMarkerLabel(place)
  button.append(dot, label)
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    selectPlace(place, { pan: false })
  })
  return button
}

function createMarkerDisplayStates(drawable) {
  const states = new Map()
  const level = map?.getLevel?.() ?? 5
  const wideRegionView = level >= 6 && !mapViewportFilter.value
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
      if (groupIndex > 0) {
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
    if (occupiedLabelRects.some((rect) => rectsOverlap(labelRect, rect))) {
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
  if (isPocketed(entry.place)) score -= 1000
  if (entry.place.origin === 'kakao') score -= 80
  if (entry.place.origin === 'db') score -= 40
  return score
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

function selectPlace(place, { pan = true } = {}) {
  selectedPlace.value = place
  if (map && kakao && hasCoordinates(place)) {
    const position = new kakao.maps.LatLng(place.latitude, place.longitude)
    if (pan) map.panTo(position)
    showPlacePopup(place, position)
  }
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
  if (placePopupOverlay) {
    placePopupOverlay.setMap(null)
    placePopupOverlay = null
  }
  if (clearSelection) {
    selectedPlace.value = null
  }
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
  meta.textContent = place.address || place.category || '장소 정보'

  const summaryText = popupSummary(place)
  const summary = document.createElement('p')
  summary.className = 'trip-place-popup__summary'
  summary.textContent = summaryText

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

  if (place.placeUrl) {
    const link = document.createElement('a')
    link.className = 'trip-place-popup__button'
    link.href = place.placeUrl
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = '카카오맵에서 보기'
    actions.append(link)
  }

  content.append(title, meta)
  if (summaryText && summaryText !== meta.textContent) {
    content.append(summary)
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

function popupSummary(place) {
  if (place.phone) return place.phone
  if (!place.summary || /^https?:\/\//.test(place.summary)) return ''
  if (place.summary === '카카오 실시간 검색 결과') return ''
  return place.summary
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
    return
  }
  pocketIds.value = [...pocketIds.value, place.uid]
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

function goBack() {
  router.push({ name: 'trip-detail', params: { tripId: tripId.value } })
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
  const drawable = visiblePlaces.value.filter(hasCoordinates)
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
    <header class="place-header">
      <Button
        label="여행으로"
        icon="pi pi-arrow-left"
        severity="secondary"
        outlined
        @click="goBack"
      />
      <div>
        <span class="eyebrow">Place Search</span>
        <h1>{{ trip?.title || '장소 탐색' }}</h1>
        <p>{{ tripRegion }} 주변 장소를 한 지도에서 확인하고 담습니다.</p>
      </div>
    </header>

    <Message v-if="tripStore.error && !trip" severity="error" :closable="false" class="state-message">
      {{ tripStore.error }}
    </Message>

    <section v-if="loading" class="loading-state" aria-live="polite">
      <ProgressSpinner aria-label="장소 탐색 화면 준비 중" />
      <span>지도와 장소 데이터를 준비하는 중입니다.</span>
    </section>

    <section v-else class="search-shell">
      <aside class="place-list-panel">
        <div class="search-card">
          <div class="field-row">
            <InputText
              v-model="keyword"
              placeholder="장소, 골목, 맛집 검색"
              aria-label="장소 검색어"
              @keyup.enter="runSearch"
            />
            <Button icon="pi pi-search" aria-label="검색" :loading="searching" @click="runSearch" />
          </div>
          <SelectButton
            v-model="activeTab"
            :options="CATEGORY_OPTIONS"
            option-label="label"
            option-value="value"
            aria-label="장소 유형"
          />
        </div>

        <Message v-if="placeError" severity="warn" :closable="false">
          {{ placeError }}
        </Message>
        <Message v-if="kakaoSearchNotice" severity="info" :closable="false">
          {{ kakaoSearchNotice }}
        </Message>

        <div class="list-head">
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
              <span>
                <strong>{{ place.name }}</strong>
                <small>{{ place.address || place.category }}</small>
              </span>
            </button>
            <Button
              class="place-row__pocket"
              :icon="isPocketed(place) ? 'pi pi-bookmark-fill' : 'pi pi-bookmark'"
              :severity="isPocketed(place) ? 'success' : 'secondary'"
              text
              rounded
              :aria-label="`${place.name} ${pocketActionLabel(place)}`"
              @click.stop="togglePocket(place)"
            />
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
      </aside>

      <section class="map-panel">
        <div class="map-toolbar">
          <div>
            <span class="eyebrow">Map</span>
            <h2>{{ tripRegion }} 주변 장소</h2>
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
              v-for="place in visiblePlaces.filter(hasCoordinates)"
              :key="place.uid"
              type="button"
              class="fallback-pin"
              :class="{
                db: place.origin === 'db',
                kakao: place.origin === 'kakao',
                pocketed: isPocketed(place),
              }"
              :style="fallbackPinStyle(place)"
              @click="selectPlace(place)"
            >
              <span aria-hidden="true" />
              <strong>{{ place.name }}</strong>
            </button>
          </div>
        </div>
      </section>

      <aside class="pocket-panel">
        <div class="pocket-head">
          <div>
            <span class="eyebrow">Pocket</span>
            <h2>담긴 장소</h2>
          </div>
          <strong>{{ pocketPlaces.length }}</strong>
        </div>

        <div v-if="pocketPlaces.length" class="pocket-list">
          <article v-for="place in pocketPlaces" :key="place.uid" class="pocket-item">
            <strong>{{ place.name }}</strong>
            <small>{{ place.address || place.category }}</small>
            <Button
              icon="pi pi-times"
              severity="secondary"
              text
              rounded
              aria-label="담기 취소"
              @click="togglePocket(place)"
            />
          </article>
        </div>
        <p v-else class="empty-pocket">지도나 목록에서 장소를 골라 담아보세요.</p>
      </aside>
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
  grid-template-columns: minmax(280px, 360px) minmax(420px, 1fr) minmax(240px, 300px);
  gap: 16px;
  align-items: stretch;
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
  border-color: #151d25;
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
  outline: 6px solid rgba(139, 92, 246, 0.22);
}

.empty-pocket {
  margin: 0;
  color: #687586;
  font-weight: 750;
  line-height: 1.55;
}

.pocket-panel {
  padding: 18px;
  display: grid;
  grid-template-rows: auto 1fr;
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

:global(.trip-map-pin) {
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

:global(.trip-place-popup) {
  width: min(360px, calc(100vw - 48px));
  position: relative;
  border: 1px solid #d9e0ea;
  border-radius: 14px;
  background: #fff;
  color: #151d25;
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
  position: relative;
  z-index: 1;
  padding: 18px 54px 16px 18px;
  display: grid;
  gap: 9px;
}

:global(.trip-place-popup h3) {
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
}

:global(.trip-place-popup p) {
  margin: 0;
  color: #536173;
  font-size: 14px;
  font-weight: 750;
  line-height: 1.45;
}

:global(.trip-place-popup__summary) {
  overflow-wrap: anywhere;
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
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}

:global(.trip-place-popup__button) {
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

:global(.trip-place-popup__button.is-primary) {
  border-color: #10b981;
  background: #10b981;
  color: #fff;
}

:global(.trip-map-pin.is-grouped) {
  filter: drop-shadow(0 8px 14px rgba(15, 23, 42, 0.18));
}

:global(.trip-map-pin.is-pocketed) {
  outline: 6px solid rgba(139, 92, 246, 0.23);
}

@media (max-width: 1180px) {
  .search-shell {
    grid-template-columns: minmax(280px, 360px) 1fr;
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

  .place-list-panel,
  .map-panel,
  .pocket-panel {
    min-height: auto;
  }

  .map-stage {
    min-height: 420px;
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
</style>
