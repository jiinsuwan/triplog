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
  PLACE_CATEGORY_OPTIONS,
  MOCK_REGION_OPTIONS,
  filterPlaces,
  getPlacesByRegion,
  isPlaceSaved,
  toggleSavedPlace,
} from '@/utils/placeMock'

const route = useRoute()
const router = useRouter()
const tripStore = useTripStore()

const tripId = computed(() => Number(route.params.tripId))
const keyword = ref('')
const selectedRegion = ref(MOCK_REGION_OPTIONS[0].value)
const selectedCategory = ref(PLACE_CATEGORY_OPTIONS[0].value)
const selectedPlaceId = ref('')
const savedPlaces = ref([])

const trip = computed(() => tripStore.selectedTrip)
const regionPlaces = computed(() => getPlacesByRegion(selectedRegion.value))
const filteredPlaces = computed(() =>
  filterPlaces(regionPlaces.value, {
    category: selectedCategory.value,
    keyword: keyword.value,
  }),
)
const selectedPlace = computed(
  () =>
    regionPlaces.value.find((place) => place.id === selectedPlaceId.value) ??
    filteredPlaces.value[0] ??
    null,
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
    if (!places.some((place) => place.id === selectedPlaceId.value)) {
      selectedPlaceId.value = places[0]?.id ?? ''
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

function togglePlace(place) {
  savedPlaces.value = toggleSavedPlace(savedPlaces.value, place)
  selectedPlaceId.value = place.id
}

function saved(placeId) {
  return isPlaceSaved(savedPlaces.value, placeId)
}

function pinClass(place) {
  return {
    selected: selectedPlace.value?.id === place.id,
    saved: saved(place.id),
  }
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

    <section v-else class="place-shell">
      <aside class="search-panel">
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
            @click="selectPlace(place)"
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
      </aside>

      <section class="map-panel" aria-label="장소 지도">
        <div class="mock-map">
          <span class="road road-main" />
          <span class="road road-river" />
          <span class="road road-small one" />
          <span class="road road-small two" />
          <span class="park" />
          <span class="water" />

          <button
            v-for="place in regionPlaces"
            :key="place.id"
            class="map-pin"
            :class="pinClass(place)"
            type="button"
            :style="{ left: `${place.x}%`, top: `${place.y}%` }"
            @click="selectPlace(place)"
          >
            <i class="pi pi-map-marker" />
            <span>{{ place.name }}</span>
          </button>
        </div>
      </section>

      <aside class="detail-panel">
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
  grid-template-columns: minmax(280px, 0.75fr) minmax(280px, 0.82fr) minmax(420px, 1.45fr);
  gap: 16px;
  min-height: calc(100vh - 136px);
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
  grid-column: 3;
  grid-row: 1;
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

.map-pin {
  position: absolute;
  z-index: 2;
  transform: translate(-50%, -50%);
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

  .search-panel {
    grid-column: 1;
    grid-row: 1;
  }

  .detail-panel {
    grid-column: 2;
    grid-row: 1;
  }

  .map-panel {
    grid-column: 1 / -1;
    grid-row: 2;
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
