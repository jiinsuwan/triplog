<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useTripStore } from '@/stores/trip'
import {
  ROUTE_MODE_OPTIONS,
  appendRouteEdge,
  getConnectedPlaceIds,
  getRouteOrder,
  removeRouteEdge,
  updateRouteMode,
} from '@/utils/itineraryBuilder'
import {
  PLACE_CATEGORY_OPTIONS,
  MOCK_REGION_OPTIONS,
  filterPlaces,
  getPlacesByRegion,
  isPlaceSaved,
  toggleSavedPlace,
} from '@/utils/placeMock'
import { tripDurationDays } from '@/utils/tripForm'

const route = useRoute()
const router = useRouter()
const tripStore = useTripStore()

const tripId = computed(() => Number(route.params.tripId))
const keyword = ref('')
const selectedRegion = ref(MOCK_REGION_OPTIONS[0].value)
const selectedCategory = ref(PLACE_CATEGORY_OPTIONS[0].value)
const selectedPlaceId = ref('')
const savedPlaces = ref([])
const routeMode = ref(false)
const activeDay = ref(1)
const pendingRouteFromId = ref('')
const routeEdges = ref([])
const routeNotice = ref('')

const trip = computed(() => tripStore.selectedTrip)
const regionPlaces = computed(() => getPlacesByRegion(selectedRegion.value))
const filteredPlaces = computed(() =>
  filterPlaces(regionPlaces.value, {
    category: selectedCategory.value,
    keyword: keyword.value,
  }),
)
const selectedPlace = computed(
  () => regionPlaces.value.find((place) => place.id === selectedPlaceId.value) ?? null,
)
const routeDayOptions = computed(() => {
  const days = Math.min(5, Math.max(1, tripDurationDays(trip.value)))
  return Array.from({ length: days }, (_, index) => index + 1)
})
const activeRouteEdges = computed(() =>
  routeEdges.value.filter((edge) => edge.day === activeDay.value),
)
const activeRouteOrderIds = computed(() => getRouteOrder(routeEdges.value, activeDay.value))
const activeRoutePlaces = computed(() =>
  activeRouteOrderIds.value.map((placeId) => placeById(placeId)).filter(Boolean),
)
const activeConnectedPlaceIds = computed(
  () => new Set(getConnectedPlaceIds(routeEdges.value, activeDay.value)),
)
const routeMapEdges = computed(() =>
  activeRouteEdges.value
    .map((edge) => ({
      ...edge,
      fromPlace: placeById(edge.from),
      toPlace: placeById(edge.to),
    }))
    .filter((edge) => edge.fromPlace && edge.toPlace),
)

onMounted(() => {
  if (!tripId.value) return
  tripStore.fetchTripDetail(tripId.value).catch(() => {})
})

watch(
  () => trip.value,
  (nextTrip) => {
    const tripRegion = nextTrip?.region
    if (MOCK_REGION_OPTIONS.some((option) => option.value === tripRegion)) {
      selectedRegion.value = tripRegion
    }
  },
  { immediate: true },
)

watch(
  filteredPlaces,
  (places) => {
    if (selectedPlaceId.value && !places.some((place) => place.id === selectedPlaceId.value)) {
      selectedPlaceId.value = ''
    }
  },
  { immediate: true },
)

function goBack() {
  router.push({ name: 'trip-detail', params: { tripId: tripId.value } })
}

function selectPlace(place) {
  selectedPlaceId.value = place.id
}

function clearSelection() {
  selectedPlaceId.value = ''
  pendingRouteFromId.value = ''
}

function togglePlace(place) {
  const removing = saved(place.id)
  savedPlaces.value = toggleSavedPlace(savedPlaces.value, place)
  if (removing) {
    routeEdges.value = routeEdges.value.filter((edge) => edge.from !== place.id && edge.to !== place.id)
    if (pendingRouteFromId.value === place.id) {
      pendingRouteFromId.value = ''
    }
    if (savedPlaces.value.length < 2) {
      routeMode.value = false
    }
  }
  selectedPlaceId.value = place.id
}

function saved(placeId) {
  return isPlaceSaved(savedPlaces.value, placeId)
}

function pinClass(place) {
  return {
    selected: selectedPlace.value?.id === place.id,
    saved: saved(place.id),
    connected: routeMode.value && activeConnectedPlaceIds.value.has(place.id),
    source: routeMode.value && pendingRouteFromId.value === place.id,
  }
}

function placeById(placeId) {
  return regionPlaces.value.find((place) => place.id === placeId) ?? savedPlaces.value.find((place) => place.id === placeId)
}

function startRouteMode() {
  if (savedPlaces.value.length < 2) {
    routeNotice.value = '장소를 2개 이상 담아야 경로를 만들 수 있습니다.'
    return
  }
  routeMode.value = true
  selectedPlaceId.value = ''
  pendingRouteFromId.value = ''
  routeNotice.value = `${activeDay.value}일차 시작 장소를 선택해주세요.`
}

function stopRouteMode() {
  routeMode.value = false
  pendingRouteFromId.value = ''
  routeNotice.value = ''
}

function setActiveDay(day) {
  activeDay.value = day
  pendingRouteFromId.value = ''
  routeNotice.value = `${day}일차 시작 장소를 선택해주세요.`
}

function handlePlaceClick(place) {
  if (routeMode.value) {
    connectRoutePlace(place)
    return
  }
  selectPlace(place)
}

function connectRoutePlace(place) {
  if (!saved(place.id)) {
    routeNotice.value = '담은 장소만 경로에 연결할 수 있습니다.'
    return
  }

  if (!pendingRouteFromId.value) {
    pendingRouteFromId.value = place.id
    routeNotice.value = `${place.name}에서 이어질 다음 장소를 선택해주세요.`
    return
  }

  if (pendingRouteFromId.value === place.id) {
    pendingRouteFromId.value = ''
    routeNotice.value = `${activeDay.value}일차 시작 장소를 다시 선택해주세요.`
    return
  }

  const result = appendRouteEdge(
    routeEdges.value,
    pendingRouteFromId.value,
    place.id,
    activeDay.value,
  )

  if (result.added) {
    routeEdges.value = result.edges
    pendingRouteFromId.value = place.id
    routeNotice.value = `${place.name}까지 연결했습니다. 다음 장소를 이어서 선택할 수 있습니다.`
    return
  }

  pendingRouteFromId.value = place.id
  routeNotice.value = result.reason
}

function changeRouteMode(edgeId, mode) {
  routeEdges.value = updateRouteMode(routeEdges.value, edgeId, mode)
}

function cycleRouteMode(edgeId) {
  const edge = routeEdges.value.find((item) => item.id === edgeId)
  if (!edge) return

  const index = ROUTE_MODE_OPTIONS.findIndex((option) => option.value === edge.mode)
  const nextMode = ROUTE_MODE_OPTIONS[(index + 1) % ROUTE_MODE_OPTIONS.length].value
  changeRouteMode(edgeId, nextMode)
}

function deleteRouteEdge(edgeId) {
  routeEdges.value = removeRouteEdge(routeEdges.value, edgeId)
}

function routeEdgeAfter(placeId) {
  return activeRouteEdges.value.find((edge) => edge.from === placeId)
}

function routeOrderNumber(placeId) {
  const index = activeRouteOrderIds.value.indexOf(placeId)
  return index >= 0 ? index + 1 : ''
}

function routePath(edge) {
  const from = { x: edge.fromPlace.x, y: edge.fromPlace.y }
  const to = { x: edge.toPlace.x, y: edge.toPlace.y }
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.hypot(dx, dy)
  const trim = Math.min(3.8, Math.max(0, distance / 4))

  if (!distance || distance <= trim * 2) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  }

  const unitX = dx / distance
  const unitY = dy / distance
  const start = {
    x: from.x + unitX * trim,
    y: from.y + unitY * trim,
  }
  const end = {
    x: to.x - unitX * trim,
    y: to.y - unitY * trim,
  }

  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} L ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}

function routeModeLabel(mode) {
  return ROUTE_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? '도보'
}
</script>

<template>
  <main class="place-page">
    <header class="top-bar">
      <div>
        <span class="eyebrow">Place Search</span>
        <h1>{{ trip?.title ?? '여행 장소 탐색' }}</h1>
      </div>
      <Button
        label="상세로"
        icon="pi pi-arrow-left"
        severity="secondary"
        outlined
        @click="goBack"
      />
    </header>

    <Message v-if="tripStore.error" severity="warn" :closable="false" class="state-message">
      {{ tripStore.error }}
    </Message>

    <section v-if="tripStore.detailLoading" class="loading-state" aria-live="polite">
      <ProgressSpinner aria-label="여행 정보를 불러오는 중" />
      <span>여행 정보를 불러오는 중입니다.</span>
    </section>

    <section
      v-else
      class="place-shell"
      :class="{ 'has-detail': selectedPlace && !routeMode, 'route-mode': routeMode }"
      @click.self="clearSelection"
    >
      <aside class="search-panel">
        <template v-if="!routeMode">
          <div class="search-head">
            <Select
              v-model="selectedRegion"
              :options="MOCK_REGION_OPTIONS"
              option-label="label"
              option-value="value"
              aria-label="지역 선택"
            />
            <span>{{ filteredPlaces.length }}곳</span>
          </div>

          <IconField class="search-field">
            <InputIcon class="pi pi-search" />
            <InputText v-model="keyword" placeholder="장소, 골목, 맛집 검색" fluid />
          </IconField>

          <div class="category-list" aria-label="장소 카테고리">
            <Button
              v-for="category in PLACE_CATEGORY_OPTIONS"
              :key="category.value"
              :label="category.label"
              :severity="selectedCategory === category.value ? 'contrast' : 'secondary'"
              :outlined="selectedCategory !== category.value"
              size="small"
              @click="selectedCategory = category.value"
            />
          </div>

          <div v-if="filteredPlaces.length" class="place-list">
            <button
              v-for="place in filteredPlaces"
              :key="place.id"
              class="place-row"
              :class="{ active: selectedPlace?.id === place.id }"
              type="button"
              @click.stop="selectPlace(place)"
            >
              <span class="place-thumb">{{ place.categoryLabel }}</span>
              <span class="place-copy">
                <strong>{{ place.name }}</strong>
                <small>{{ place.area }} · {{ place.rating.toFixed(1) }}</small>
              </span>
              <i v-if="saved(place.id)" class="pi pi-bookmark-fill" aria-label="담긴 장소" />
            </button>
          </div>

          <div v-else class="empty-results">
            <strong>검색 결과가 없습니다.</strong>
            <span>다른 키워드나 카테고리를 선택해보세요.</span>
          </div>

          <div class="route-ready-box">
            <div>
              <strong>담긴 장소 {{ savedPlaces.length }}곳</strong>
              <span>장소를 2곳 이상 담으면 같은 지도에서 경로를 만들 수 있어요.</span>
            </div>
            <Button
              label="경로 만들기"
              icon="pi pi-directions"
              :disabled="savedPlaces.length < 2"
              @click="startRouteMode"
            />
          </div>
        </template>

        <template v-else>
          <div class="route-head">
            <span class="eyebrow">Itinerary Builder</span>
            <h2>담은 장소를 날짜별 경로로 연결합니다.</h2>
            <p>{{ routeNotice }}</p>
          </div>

          <div class="day-tabs" aria-label="일차 선택">
            <Button
              v-for="day in routeDayOptions"
              :key="day"
              :label="`${day}일차`"
              :severity="activeDay === day ? 'contrast' : 'secondary'"
              :outlined="activeDay !== day"
              size="small"
              @click="setActiveDay(day)"
            />
          </div>

          <section class="route-summary">
            <h3>{{ activeDay }}일차 경로</h3>
            <ol v-if="activeRoutePlaces.length" class="route-steps">
              <template v-for="(place, index) in activeRoutePlaces" :key="place.id">
                <li class="route-step">
                  <span>{{ index + 1 }}</span>
                  <div>
                    <strong>{{ place.name }}</strong>
                    <small>{{ place.categoryLabel }} · {{ place.area }}</small>
                  </div>
                </li>
                <li
                  v-if="routeEdgeAfter(place.id)"
                  :key="`${place.id}-mode`"
                  class="route-step-mode"
                >
                  <span class="route-step-line" />
                  <button
                    class="route-mode-inline"
                    :class="`mode-${routeEdgeAfter(place.id).mode}`"
                    type="button"
                    @click="cycleRouteMode(routeEdgeAfter(place.id).id)"
                  >
                    {{ routeModeLabel(routeEdgeAfter(place.id).mode) }}
                  </button>
                </li>
              </template>
            </ol>
            <p v-else>지도 위 담긴 장소를 순서대로 눌러 경로를 만들어보세요.</p>
          </section>

          <section class="edge-list">
            <h3>이동 구간</h3>
            <div v-if="activeRouteEdges.length" class="edge-items">
              <div v-for="edge in activeRouteEdges" :key="edge.id" class="edge-item">
                <div>
                  <strong>{{ placeById(edge.from)?.name }} → {{ placeById(edge.to)?.name }}</strong>
                  <small>{{ routeModeLabel(edge.mode) }}</small>
                </div>
                <select
                  :value="edge.mode"
                  aria-label="이동수단 선택"
                  @change="changeRouteMode(edge.id, $event.target.value)"
                >
                  <option
                    v-for="mode in ROUTE_MODE_OPTIONS"
                    :key="mode.value"
                    :value="mode.value"
                  >
                    {{ mode.label }}
                  </option>
                </select>
                <Button
                  icon="pi pi-times"
                  rounded
                  text
                  severity="secondary"
                  aria-label="구간 삭제"
                  @click="deleteRouteEdge(edge.id)"
                />
              </div>
            </div>
            <p v-else>아직 연결된 이동 구간이 없습니다.</p>
          </section>

          <section class="route-candidates">
            <h3>담은 장소</h3>
            <button
              v-for="place in savedPlaces"
              :key="place.id"
              class="candidate-row"
              :class="{
                source: pendingRouteFromId === place.id,
                connected: activeConnectedPlaceIds.has(place.id),
              }"
              type="button"
              @click="connectRoutePlace(place)"
            >
              <span>{{ routeOrderNumber(place.id) || '·' }}</span>
              <div>
                <strong>{{ place.name }}</strong>
                <small>{{ place.categoryLabel }} · {{ place.area }}</small>
              </div>
            </button>
          </section>

          <div class="route-actions">
            <Button label="장소 더 담기" severity="secondary" outlined @click="stopRouteMode" />
            <Button label="일정 미리보기 확정" icon="pi pi-check" :disabled="!routeEdges.length" />
          </div>
        </template>
      </aside>

      <aside v-if="selectedPlace && !routeMode" class="detail-panel">
        <template v-if="selectedPlace">
          <div class="detail-visual">
            <span>{{ selectedPlace.categoryLabel }}</span>
          </div>

          <div class="detail-copy">
            <Tag :value="selectedPlace.categoryLabel" severity="secondary" />
            <h2>{{ selectedPlace.name }}</h2>
            <p>{{ selectedPlace.summary }}</p>
          </div>

          <div class="score-row">
            <strong>{{ selectedPlace.rating.toFixed(1) }}</strong>
            <span>리뷰 {{ selectedPlace.reviews.toLocaleString() }}</span>
          </div>

          <div class="tag-list">
            <Tag
              v-for="tag in selectedPlace.tags"
              :key="tag"
              :value="tag"
              rounded
              severity="info"
            />
          </div>

          <Button
            :label="saved(selectedPlace.id) ? '담기 취소' : '이 장소 담기'"
            :icon="saved(selectedPlace.id) ? 'pi pi-bookmark-fill' : 'pi pi-bookmark'"
            fluid
            @click="togglePlace(selectedPlace)"
          />
        </template>

        <div class="saved-box">
          <div class="saved-head">
            <strong>담긴 장소</strong>
            <span>{{ savedPlaces.length }}</span>
          </div>
          <ol v-if="savedPlaces.length" class="saved-list">
            <li v-for="place in savedPlaces" :key="place.id">
              <button type="button" @click="selectPlace(place)">
                <span>{{ place.name }}</span>
                <small>{{ place.categoryLabel }} · {{ place.area }}</small>
              </button>
            </li>
          </ol>
          <p v-else>지도의 핀이나 목록에서 장소를 골라 담아보세요.</p>
        </div>
      </aside>

      <section class="map-panel" aria-label="장소 지도">
        <div class="mock-map" @click="clearSelection">
          <span class="road road-main" />
          <span class="road road-river" />
          <span class="road road-small one" />
          <span class="road road-small two" />
          <span class="park" />
          <span class="water" />

          <svg
            v-if="routeMapEdges.length"
            class="route-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="route-arrow"
                markerWidth="2.4"
                markerHeight="2.4"
                refX="2.1"
                refY="1.2"
                orient="auto"
              >
                <path d="M0,0 L2.4,1.2 L0,2.4 Z" />
              </marker>
            </defs>
            <path
              v-for="edge in routeMapEdges"
              :key="edge.id"
              class="route-path"
              :class="`mode-${edge.mode}`"
              :d="routePath(edge)"
              marker-end="url(#route-arrow)"
            />
          </svg>

          <button
            v-for="place in regionPlaces"
            :key="place.id"
            class="map-pin"
            :class="pinClass(place)"
            type="button"
            :style="{ left: `${place.x}%`, top: `${place.y}%` }"
            @click.stop="handlePlaceClick(place)"
          >
            <i class="pi pi-map-marker" />
            <b v-if="routeMode && routeOrderNumber(place.id)">{{ routeOrderNumber(place.id) }}</b>
            <span>{{ place.name }}</span>
          </button>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.place-page {
  min-height: 100vh;
  padding: 24px clamp(16px, 3vw, 42px) 42px;
  background:
    linear-gradient(135deg, rgba(46, 143, 107, 0.12), transparent 34%),
    linear-gradient(315deg, rgba(49, 130, 246, 0.10), transparent 38%),
    #f6f8fb;
  color: #151d25;
}

.top-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.eyebrow {
  display: inline-flex;
  margin-bottom: 8px;
  color: #2e8f6b;
  font-size: 13px;
  font-weight: 900;
}

.top-bar h1 {
  margin: 0;
  font-size: clamp(34px, 5vw, 58px);
  line-height: 1;
  letter-spacing: 0;
}

.state-message {
  margin-bottom: 14px;
}

.place-shell {
  display: grid;
  grid-template-columns: minmax(280px, 0.7fr) minmax(520px, 1.6fr);
  gap: 16px;
  min-height: calc(100vh - 136px);
  transition: grid-template-columns 0.2s ease;
}

.place-shell.has-detail {
  grid-template-columns: minmax(280px, 0.75fr) minmax(280px, 0.82fr) minmax(420px, 1.45fr);
}

.place-shell.route-mode {
  grid-template-columns: minmax(330px, 0.8fr) minmax(520px, 1.55fr);
}

.search-panel {
  grid-column: 1;
  grid-row: 1;
}

.detail-panel {
  grid-column: 2;
  grid-row: 1;
}

.map-panel {
  grid-column: 2;
  grid-row: 1;
}

.place-shell.has-detail .map-panel {
  grid-column: 3;
}

.place-shell.route-mode .map-panel {
  grid-column: 2;
}

.search-panel,
.map-panel,
.detail-panel,
.loading-state {
  border: 1px solid #e5e8ef;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.10);
}

.search-panel,
.detail-panel {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.search-head,
.saved-head,
.score-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.search-head span,
.saved-head span {
  min-width: 34px;
  height: 34px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #edf3f0;
  color: #2e8f6b;
  font-size: 13px;
  font-weight: 900;
}

.search-field {
  width: 100%;
}

.category-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.place-list {
  display: grid;
  gap: 9px;
  overflow: auto;
  padding-right: 2px;
}

.place-row {
  width: 100%;
  min-height: 78px;
  padding: 11px;
  border: 1px solid transparent;
  border-radius: 20px;
  display: grid;
  grid-template-columns: 52px 1fr 18px;
  align-items: center;
  gap: 11px;
  background: #f7f9fc;
  color: #151d25;
  text-align: left;
  cursor: pointer;
}

.place-row.active {
  border-color: rgba(46, 143, 107, 0.38);
  background: #eef8f3;
}

.place-thumb {
  width: 52px;
  height: 52px;
  border-radius: 17px;
  display: grid;
  place-items: center;
  color: #fff;
  background:
    linear-gradient(0deg, rgba(9, 16, 22, 0.42), transparent),
    linear-gradient(135deg, #2e8f6b, #3182f6);
  font-size: 12px;
  font-weight: 900;
}

.place-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.place-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
}

.place-copy small,
.empty-results span,
.saved-box p,
.saved-list small,
.loading-state span {
  color: #687586;
  font-size: 12px;
  font-weight: 750;
}

.place-row i {
  color: #2e8f6b;
}

.empty-results,
.loading-state {
  min-height: 260px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  text-align: center;
}

.route-ready-box {
  margin-top: auto;
  padding: 14px;
  border: 1px solid #e5e8ef;
  border-radius: 20px;
  display: grid;
  gap: 12px;
  background: #fff;
}

.route-ready-box div,
.route-head,
.route-summary,
.edge-list,
.route-candidates {
  display: grid;
  gap: 8px;
}

.route-ready-box strong,
.route-summary h3,
.edge-list h3,
.route-candidates h3 {
  margin: 0;
  color: #151d25;
  font-size: 15px;
  font-weight: 950;
}

.route-ready-box span,
.route-head p,
.route-summary p,
.edge-list p {
  margin: 0;
  color: #687586;
  font-size: 12px;
  line-height: 1.5;
  font-weight: 750;
}

.route-head h2 {
  margin: 0;
  font-size: 28px;
  line-height: 1.08;
}

.day-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.route-summary,
.edge-list,
.route-candidates {
  padding: 14px;
  border: 1px solid #e5e8ef;
  border-radius: 20px;
  background: #f8fafc;
}

.route-steps {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.route-step,
.route-step-mode,
.candidate-row {
  display: grid;
  grid-template-columns: 34px 1fr;
  align-items: center;
  gap: 10px;
}

.route-step > span,
.candidate-row > span {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #151d25;
  color: #fff;
  font-size: 12px;
  font-weight: 950;
}

.route-step-mode {
  min-height: 36px;
}

.route-step-line {
  width: 2px;
  min-height: 34px;
  justify-self: center;
  border-radius: 999px;
  background: linear-gradient(#c8d8d1, #2e8f6b, #c8d8d1);
}

.route-mode-inline {
  justify-self: start;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #d9e0ea;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: #fff;
  color: #151d25;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
}

.route-mode-inline.mode-walk {
  border-color: rgba(46, 143, 107, 0.24);
  background: #eef8f3;
  color: #1f6f56;
}

.route-mode-inline.mode-bus {
  border-color: rgba(49, 130, 246, 0.24);
  background: #edf5ff;
  color: #2568c7;
}

.route-mode-inline.mode-subway {
  border-color: rgba(128, 111, 209, 0.24);
  background: #f3f0ff;
  color: #6252bc;
}

.route-mode-inline.mode-taxi {
  border-color: rgba(237, 191, 83, 0.34);
  background: #fff8e6;
  color: #956d10;
}

.route-mode-inline.mode-car {
  border-color: rgba(21, 29, 37, 0.16);
  background: #f2f4f7;
  color: #151d25;
}

.route-steps strong,
.candidate-row strong,
.edge-item strong {
  display: block;
  color: #151d25;
  font-size: 13px;
  font-weight: 950;
}

.route-steps small,
.candidate-row small,
.edge-item small {
  display: block;
  margin-top: 3px;
  color: #687586;
  font-size: 11px;
  font-weight: 750;
}

.edge-items {
  display: grid;
  gap: 8px;
}

.edge-item {
  min-height: 58px;
  padding: 10px;
  border: 1px solid #e5e8ef;
  border-radius: 16px;
  display: grid;
  grid-template-columns: 1fr 94px 36px;
  align-items: center;
  gap: 8px;
  background: #fff;
}

.edge-item select {
  min-height: 36px;
  border: 1px solid #d9e0ea;
  border-radius: 12px;
  padding: 0 8px;
  background: #fff;
  color: #151d25;
  font-weight: 850;
}

.candidate-row {
  width: 100%;
  min-height: 58px;
  padding: 10px;
  border: 1px solid #e5e8ef;
  border-radius: 16px;
  background: #fff;
  color: #151d25;
  text-align: left;
  cursor: pointer;
}

.candidate-row.source {
  border-color: rgba(124, 92, 255, 0.5);
  background: #f3f0ff;
}

.candidate-row.connected > span {
  background: #2e8f6b;
}

.route-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.map-panel {
  min-height: 620px;
  padding: 12px;
}

.mock-map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 596px;
  overflow: hidden;
  border-radius: 22px;
  background:
    linear-gradient(90deg, rgba(36, 46, 58, 0.07) 1px, transparent 1px) 0 0 / 86px 86px,
    linear-gradient(rgba(36, 46, 58, 0.07) 1px, transparent 1px) 0 0 / 86px 86px,
    linear-gradient(135deg, #f6f1e8, #eef4ec 52%, #eef5fb);
}

.road,
.park,
.water {
  position: absolute;
  pointer-events: none;
}

.road {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 3px rgba(225, 218, 207, 0.72);
}

.road-main {
  width: 78%;
  height: 18px;
  left: 9%;
  top: 50%;
  rotate: -16deg;
}

.road-river {
  width: 64%;
  height: 14px;
  left: 17%;
  top: 68%;
  rotate: 8deg;
}

.road-small {
  width: 40%;
  height: 10px;
}

.road-small.one {
  left: 25%;
  top: 28%;
  rotate: 38deg;
}

.road-small.two {
  right: 12%;
  top: 38%;
  rotate: 74deg;
}

.park {
  width: 190px;
  height: 150px;
  right: 10%;
  top: 15%;
  border-radius: 42px;
  background: rgba(114, 171, 122, 0.28);
}

.water {
  width: 58%;
  height: 52px;
  left: 20%;
  bottom: 12%;
  border-radius: 999px;
  background: rgba(93, 166, 216, 0.24);
  rotate: -5deg;
}

.route-svg {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.route-svg marker path {
  fill: #1f6f56;
}

.route-path {
  fill: none;
  stroke: #151d25;
  stroke-width: 0.58;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.18));
}

.route-path.mode-walk {
  stroke: #2e8f6b;
  stroke-dasharray: 1.5 1.2;
}

.route-path.mode-bus {
  stroke: #3182f6;
}

.route-path.mode-subway {
  stroke: #806fd1;
  stroke-width: 0.66;
}

.route-path.mode-taxi {
  stroke: #edbf53;
  stroke-dasharray: 3 1;
}

.route-path.mode-car {
  stroke: #151d25;
}

.map-pin {
  position: absolute;
  z-index: 3;
  transform: translate(-17px, -17px);
  border: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #151d25;
  background: transparent;
  cursor: pointer;
}

.map-pin i {
  width: 34px;
  height: 34px;
  border: 3px solid #fff;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #fff;
  background: #ef5a4d;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.22);
}

.map-pin b {
  position: absolute;
  left: 17px;
  top: 17px;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  pointer-events: none;
}

.map-pin span {
  max-width: 128px;
  padding: 6px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.12);
  font-size: 12px;
  font-weight: 900;
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 0.16s ease, transform 0.16s ease;
  white-space: nowrap;
}

.map-pin:hover span,
.map-pin.selected span,
.map-pin.saved span {
  opacity: 1;
  transform: translateX(0);
}

.map-pin.selected i {
  background: #7c5cff;
}

.map-pin.saved i {
  background: #2e8f6b;
}

.map-pin.source i {
  background: #7c5cff;
  box-shadow: 0 0 0 8px rgba(124, 92, 255, 0.16), 0 12px 30px rgba(15, 23, 42, 0.22);
}

.map-pin.connected i {
  background: #2e8f6b;
}

.detail-visual {
  min-height: 188px;
  border-radius: 24px;
  display: flex;
  align-items: flex-end;
  padding: 18px;
  color: #fff;
  background:
    linear-gradient(0deg, rgba(9, 16, 22, 0.76), rgba(9, 16, 22, 0.06) 66%),
    linear-gradient(135deg, #806fd1, #2e8f6b 56%, #edbf53);
}

.detail-visual span {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.20);
  font-size: 12px;
  font-weight: 900;
}

.detail-copy {
  display: grid;
  gap: 10px;
}

.detail-copy h2 {
  margin: 0;
  font-size: 28px;
  line-height: 1.08;
}

.detail-copy p {
  margin: 0;
  color: #4e5968;
  line-height: 1.6;
  font-weight: 700;
}

.score-row {
  min-height: 58px;
  padding: 0 16px;
  border-radius: 18px;
  background: #f7f9fc;
}

.score-row strong {
  font-size: 24px;
}

.score-row span {
  color: #687586;
  font-size: 13px;
  font-weight: 900;
}

.tag-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.saved-box {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid #e5e8ef;
}

.saved-head {
  margin-bottom: 10px;
}

.saved-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.saved-list button {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e5e8ef;
  border-radius: 14px;
  display: grid;
  gap: 3px;
  background: #fff;
  color: #151d25;
  text-align: left;
  cursor: pointer;
}

.saved-list span {
  font-size: 13px;
  font-weight: 900;
}

@media (max-width: 1180px) {
  .place-shell {
    grid-template-columns: 310px 1fr;
  }

  .place-shell.has-detail,
  .place-shell.route-mode {
    grid-template-columns: 310px 1fr;
  }

  .search-panel {
    grid-column: 1;
    grid-row: 1;
  }

  .detail-panel {
    grid-column: 2;
    grid-row: 1;
  }

  .map-panel {
    grid-column: 2;
    grid-row: 1;
  }

  .place-shell.has-detail .map-panel {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .place-shell.route-mode .map-panel {
    grid-column: 2;
    grid-row: 1;
  }
}

@media (max-width: 820px) {
  .top-bar,
  .place-shell {
    display: flex;
    flex-direction: column;
  }

  .search-panel {
    order: 1;
  }

  .detail-panel {
    order: 2;
  }

  .map-panel {
    order: 3;
  }

  .map-panel {
    min-height: 520px;
  }

  .mock-map {
    min-height: 496px;
  }
}
</style>
