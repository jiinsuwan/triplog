<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { fetchItinerary } from '@/api/itineraryApi'
import { BaseButton, BaseModal } from '@/components/common'
import RecordPlacementBody from '@/components/log/record/RecordPlacementBody.vue'
import TripInfoEditDialog from '@/components/trip/TripInfoEditDialog.vue'
import { useCardStore } from '@/stores/card'
import { useTripStore } from '@/stores/trip'
import { loadKakaoMaps } from '@/utils/kakaoMap'
import {
  createTripFormFromTrip,
  formatTripDateRange,
  toTripPayload,
  tripDisplayTags,
  tripDurationDays,
} from '@/utils/tripForm'
import { TRIP_STATUS, normalizeTripStatus } from '@/utils/tripStatus'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  trip: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['update:modelValue', 'open-places', 'deleted', 'updated'])
const tripStore = useTripStore()
const router = useRouter()
const card = useCardStore()
// 다녀옴 사진 배치에서 올라온 배치 사진 id(카드 대상). footer 의 "추억 만들러 가기" 활성·진입에 쓴다.
const placedPhotoIds = ref([])

const itinerary = ref(null)
const loading = ref(false)
const error = ref('')
const deleteError = ref('')
const statusError = ref('')
const activeDayNumber = ref(null)
const editDialogOpen = ref(false)
const previewMapRef = ref(null)
const mapUnavailable = ref(false)
let requestSeq = 0
let previewMap = null
let previewMarkers = []
let previewPolyline = null

const isMockTrip = computed(() => !!props.trip?.mock)
const tripStatus = computed(() => normalizeTripStatus(props.trip?.status))
const isPastTrip = computed(() => tripStatus.value === TRIP_STATUS.PAST)
const isUpcomingTrip = computed(() => tripStatus.value === TRIP_STATUS.UPCOMING)
const canEditTrip = computed(() => !!props.trip?.id)
const canMarkPastTrip = computed(() => canEditTrip.value && isUpcomingTrip.value && !isMockTrip.value)
const days = computed(() => itinerary.value?.days ?? [])
const plannedDays = computed(() => days.value.filter((day) => (day.stops ?? []).length > 0))
const activeDay = computed(() => {
  if (!plannedDays.value.length) return null
  return (
    plannedDays.value.find((day) => day.dayNumber === activeDayNumber.value) ?? plannedDays.value[0]
  )
})
const activeStops = computed(() => activeDay.value?.stops ?? [])
const stops = computed(() => days.value.flatMap((day) => day.stops ?? []))
const stopCount = computed(() => stops.value.length)
const previewStatus = computed(() => {
  if (isPastTrip.value) return '다녀옴'
  if (isUpcomingTrip.value) return '예정'
  return '계획 중'
})
const previewStatusClass = computed(() => {
  if (isPastTrip.value) return 'past'
  if (isUpcomingTrip.value) return 'upcoming'
  return 'plan'
})
const dateMeta = computed(() => {
  if (!props.trip?.startDate || !props.trip?.endDate) return '날짜 미정'
  return `${formatTripDateRange(props.trip)} · ${tripDurationDays(props.trip)}일`
})
const placeCountText = computed(() => `담은 장소 ${stopCount.value}곳`)
// 다녀옴(past) + 일정 있음 + 실제 여행(mock 데모 아님) 이면 사진 배치 타임라인(기록 뷰)을 보여준다.
const showPlacement = computed(() => isPastTrip.value && !isMockTrip.value && stopCount.value > 0)
const modalWidth = computed(() => {
  if (showPlacement.value) return 'min(760px, 92vw)'
  return stopCount.value === 0 ? 'min(520px, 92vw)' : 'min(680px, 92vw)'
})
const metaChips = computed(() => [
  props.trip?.region || '지역 미정',
  props.trip?.theme || '테마 미정',
  dateMeta.value,
  placeCountText.value,
])
const ticketTags = computed(() => tripDisplayTags(props.trip))
const activeDayLabel = computed(() => {
  if (!activeDay.value) return ''
  const date = activeDay.value.date ? activeDay.value.date.replaceAll('-', '.') : `DAY ${activeDay.value.dayNumber}`
  return `${date} · ${activeStops.value.length}곳`
})
const mapStops = computed(() =>
  activeStops.value
    .map((stop, index) => ({
      index,
      lat: Number(stop?.place?.latitude ?? stop?.latitude),
      lng: Number(stop?.place?.longitude ?? stop?.longitude),
    }))
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)),
)

watch(
  () => [props.modelValue, props.trip?.id],
  ([isOpen]) => {
    if (isOpen) loadItinerary()
  },
  { immediate: true },
)

watch(
  plannedDays,
  (nextDays) => {
    if (!nextDays.length) {
      activeDayNumber.value = null
      return
    }

    if (!nextDays.some((day) => day.dayNumber === activeDayNumber.value)) {
      activeDayNumber.value = nextDays[0].dayNumber
    }
  },
  { immediate: true },
)

watch(
  [
    () => props.modelValue,
    activeDayNumber,
    () => mapStops.value.map((stop) => `${stop.lat},${stop.lng}`).join('|'),
  ],
  () => {
    renderPreviewMap()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  clearPreviewMap()
})

async function loadItinerary() {
  if (!props.modelValue || !props.trip?.id) return

  const seq = ++requestSeq
  loading.value = true
  error.value = ''
  deleteError.value = ''
  statusError.value = ''
  itinerary.value = null

  try {
    const result = await fetchItinerary(props.trip.id, { trip: props.trip })
    if (seq === requestSeq) itinerary.value = itineraryWithEmbedded(result)
  } catch {
    if (seq === requestSeq) {
      const embedded = embeddedItinerary()
      itinerary.value = embedded
      if (!hasItineraryStops(embedded)) error.value = '일정 요약을 불러오지 못했습니다.'
    }
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function embeddedItinerary() {
  const value = props.trip?.itinerary
  return hasItineraryStops(value) ? value : { dayCount: tripDurationDays(props.trip), days: [] }
}

function hasItineraryStops(value) {
  return (value?.days ?? []).some((day) => (day.stops ?? []).length > 0)
}

function itineraryWithEmbedded(value) {
  return hasItineraryStops(value) ? value : embeddedItinerary()
}

function close() {
  emit('update:modelValue', false)
}

function clearPreviewMap() {
  previewMarkers.forEach((marker) => marker.setMap?.(null))
  previewMarkers = []
  previewPolyline?.setMap?.(null)
  previewPolyline = null
  previewMap = null
}

async function renderPreviewMap() {
  clearPreviewMap()
  mapUnavailable.value = false

  if (!props.modelValue || showPlacement.value || stopCount.value === 0 || !previewMapRef.value) return
  if (!mapStops.value.length) {
    mapUnavailable.value = true
    return
  }

  try {
    await nextTick()
    const kakao = await loadKakaoMaps()
    const positions = mapStops.value.map(
      (stop) => new kakao.maps.LatLng(stop.lat, stop.lng),
    )

    previewMap = new kakao.maps.Map(previewMapRef.value, {
      center: positions[0],
      level: positions.length > 1 ? 6 : 5,
    })

    if (positions.length > 1) {
      const bounds = new kakao.maps.LatLngBounds()
      positions.forEach((position) => bounds.extend(position))
      previewMap.setBounds(bounds)
      previewPolyline = new kakao.maps.Polyline({
        path: positions,
        strokeWeight: 4,
        strokeColor: '#c2693f',
        strokeOpacity: 0.86,
        strokeStyle: 'solid',
      })
      previewPolyline.setMap(previewMap)
    }

    previewMarkers = positions.map((position, index) => {
      const markerNode = document.createElement('span')
      markerNode.className = 'trip-preview-dialog__kakao-pin'
      const label = document.createElement('b')
      label.textContent = String(index + 1)
      markerNode.appendChild(label)
      const marker = new kakao.maps.CustomOverlay({
        content: markerNode,
        position,
        yAnchor: 1.2,
      })
      marker.setMap(previewMap)
      return marker
    })
  } catch {
    mapUnavailable.value = true
  }
}

// 다녀옴 팝업에서 배치한 사진을 들고 카드 에디터로 진입한다.
// startForTrip + setPhotoIds 로 카드 컨텍스트를 미리 채운 뒤 step=editor 로 직행한다.
// (CardCreateView 는 같은 여행 + photoIds 가 이미 있으면 진입 시 재초기화를 건너뛴다.)
function goEditor(placedIds) {
  if (!props.trip?.id) return
  card.startForTrip(props.trip.id)
  card.setPhotoIds(placedIds)
  close()
  router.push({ name: 'card-create', query: { tripId: props.trip.id, step: 'editor' } })
}

function openPlaces() {
  if (!props.trip || isMockTrip.value) return
  emit('open-places', props.trip)
  close()
}

function openDetail() {
  if (!canEditTrip.value) return
  editDialogOpen.value = true
}

function handleTripUpdated(updatedTrip) {
  emit('updated', updatedTrip)
}

async function markPastTrip() {
  if (!canMarkPastTrip.value || tripStore.updating) return

  statusError.value = ''
  tripStore.clearError()

  try {
    const updated = await tripStore.updateTrip(
      props.trip.id,
      toTripPayload({
        ...createTripFormFromTrip(props.trip),
        status: TRIP_STATUS.PAST,
      }),
    )
    emit('updated', updated)
    close()
  } catch {
    statusError.value = tripStore.error || '다녀온 여행으로 변경하지 못했습니다.'
  }
}

async function deleteTrip() {
  if (!props.trip?.id || isMockTrip.value || tripStore.deleting) return

  deleteError.value = ''

  try {
    await tripStore.deleteTrip(props.trip.id)
    emit('deleted', props.trip)
    close()
  } catch {
    deleteError.value = tripStore.error || '여행을 삭제하지 못했습니다.'
  }
}

function stopName(stop) {
  return stop?.place?.name || stop?.placeName || '장소 이름 미정'
}

function stopType(stop) {
  return stop?.place?.category || stop?.place?.categoryGroup || stop?.category || '장소'
}

function stopTime(stop, index) {
  const value = stop?.startTime || stop?.time
  if (value) return String(value).slice(0, 5)
  return `${String(10 + index * 2).padStart(2, '0')}:00`
}

function stopMoveText(stop) {
  return stop?.transportSummary || stop?.memo || ''
}

function mapPinStyle(index) {
  const positions = [
    { left: 32, top: 52 },
    { left: 58, top: 40 },
    { left: 70, top: 66 },
    { left: 48, top: 76 },
  ]
  const selected = positions[index % positions.length]
  return {
    left: `${selected.left}%`,
    top: `${selected.top}%`,
  }
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    title="여행 미리보기"
    hide-header
    :width="modalWidth"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <section v-if="trip" class="trip-preview-dialog" data-testid="trip-preview-dialog">
      <header class="trip-preview-dialog__head">
        <span class="trip-preview-dialog__badge" :class="`is-${previewStatusClass}`">
          {{ previewStatus }}
        </span>
        <h2>{{ trip.title }}</h2>
        <button class="trip-preview-dialog__close" type="button" aria-label="닫기" @click="close">×</button>
      </header>

      <div class="trip-preview-dialog__meta" aria-label="여행 요약">
        <span v-for="chip in metaChips" :key="chip">{{ chip }}</span>
      </div>

      <p v-if="deleteError" class="trip-preview-dialog__error" role="alert">{{ deleteError }}</p>
      <p v-if="statusError" class="trip-preview-dialog__error" role="alert">{{ statusError }}</p>
      <p v-if="error" class="trip-preview-dialog__error" role="alert">{{ error }}</p>

      <div v-if="loading" class="trip-preview-dialog__loading" aria-live="polite">
        일정 요약을 불러오는 중입니다.
      </div>

      <div v-else-if="stopCount === 0" class="trip-preview-dialog__empty">
        <div class="trip-preview-dialog__suitcase" aria-hidden="true">
          <span></span>
        </div>
        <strong>아직 담은 장소가 없어요</strong>
        <p>다음 단계에서 가고 싶은 곳을 담고 일정으로 엮어보세요.</p>
        <BaseButton
          v-if="!isPastTrip && !isMockTrip"
          variant="primary"
          type="button"
          data-testid="trip-preview-places"
          @click="openPlaces"
        >
          장소 담으러 가기 →
        </BaseButton>
      </div>

      <RecordPlacementBody
        v-else-if="showPlacement"
        :key="trip.id"
        :days="plannedDays"
        :trip-id="trip.id"
        :region="trip.region"
        @update:placed="placedPhotoIds = $event"
      />

      <div v-else class="trip-preview-dialog__body">
        <div class="trip-preview-dialog__map" aria-label="여행 경로 미리보기">
          <div ref="previewMapRef" class="trip-preview-dialog__map-canvas"></div>
          <div v-if="mapUnavailable" class="trip-preview-dialog__map-fallback">
            <span
              v-for="(stop, index) in activeStops.slice(0, 4)"
              :key="stop.id ?? `${activeDay?.dayNumber}-${index}`"
              class="trip-preview-dialog__pin"
              :style="mapPinStyle(index)"
            >
              <b>{{ index + 1 }}</b>
            </span>
          </div>
          <span class="trip-preview-dialog__legend">
            {{ trip.region || '여행지' }} · DAY {{ activeDay?.dayNumber || 1 }} 경로
          </span>
        </div>

        <div class="trip-preview-dialog__plan">
          <div class="trip-preview-dialog__tabs">
            <button
              v-for="day in plannedDays.slice(0, 4)"
              :key="day.dayNumber"
              type="button"
              :class="{ active: day.dayNumber === activeDay?.dayNumber }"
              @click="activeDayNumber = day.dayNumber"
            >
              DAY {{ day.dayNumber }}
            </button>
            <span>{{ activeDayLabel }}</span>
          </div>

          <div class="trip-preview-dialog__stops">
            <article
              v-for="(stop, index) in activeStops"
              :key="stop.id ?? `${activeDay?.dayNumber}-${index}`"
              class="trip-preview-dialog__stop"
            >
              <time>{{ stopTime(stop, index) }}</time>
              <i aria-hidden="true"></i>
              <div>
                <strong>{{ stopName(stop) }}</strong>
                <span>{{ stopType(stop) }}</span>
                <p v-if="stopMoveText(stop)">{{ stopMoveText(stop) }}</p>
              </div>
            </article>
          </div>
        </div>
      </div>

      <div v-if="ticketTags.length" class="trip-preview-dialog__tags" aria-label="여행 태그">
        <span v-for="tag in ticketTags" :key="tag">
          {{ tag.startsWith('#') ? tag : `#${tag}` }}
        </span>
      </div>

      <footer class="trip-preview-dialog__actions">
        <BaseButton
          v-if="canEditTrip"
          variant="ghost"
          type="button"
          data-testid="trip-preview-detail"
          @click="openDetail"
        >
          정보 수정
        </BaseButton>
        <BaseButton
          v-if="canMarkPastTrip"
          variant="ghost"
          size="small"
          type="button"
          class="trip-preview-dialog__past-action"
          data-testid="trip-preview-mark-past"
          :disabled="tripStore.updating"
          @click="markPastTrip"
        >
          {{ tripStore.updating ? '변경 중' : '다녀온 여행으로' }}
        </BaseButton>
        <BaseButton
          v-if="!isMockTrip && !showPlacement"
          variant="ghost"
          type="button"
          class="trip-preview-dialog__delete"
          data-testid="trip-preview-delete"
          :disabled="tripStore.deleting"
          @click="deleteTrip"
        >
          {{ tripStore.deleting ? '삭제 중' : '삭제' }}
        </BaseButton>
        <BaseButton
          v-if="stopCount > 0 && !isPastTrip && !isMockTrip"
          variant="primary"
          type="button"
          data-testid="trip-preview-places"
          @click="openPlaces"
        >
          계획 수정하기 →
        </BaseButton>
        <BaseButton
          v-if="showPlacement"
          variant="primary"
          type="button"
          data-testid="trip-preview-record"
          :disabled="!placedPhotoIds.length"
          @click="goEditor(placedPhotoIds)"
        >
          추억 만들러 가기 →
        </BaseButton>
      </footer>
    </section>

    <TripInfoEditDialog
      v-model="editDialogOpen"
      :trip="trip"
      @updated="handleTripUpdated"
    />
  </BaseModal>
</template>

<style scoped>
.trip-preview-dialog {
  --preview-inner-width: calc(100% - 44px);
  display: grid;
  gap: 0;
  margin: 0;
  width: 100%;
}

.trip-preview-dialog__head {
  align-items: center;
  display: flex;
  gap: 11px;
  padding: 16px 22px 12px;
}

.trip-preview-dialog__head h2 {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.2;
  margin: 0;
}

.trip-preview-dialog__badge {
  border-radius: 999px;
  color: #fffdf8;
  flex: none;
  font-size: 12px;
  font-weight: 800;
  padding: 4px 10px;
}

.trip-preview-dialog__badge.is-plan {
  background: var(--accent);
}

.trip-preview-dialog__badge.is-upcoming {
  background: #6f8fa5;
}

.trip-preview-dialog__badge.is-past {
  background: var(--ink-sub);
}

.trip-preview-dialog__close {
  background: none;
  border: 0;
  color: var(--ink-faint);
  cursor: pointer;
  font: inherit;
  font-size: 24px;
  line-height: 1;
  margin-left: auto;
}

.trip-preview-dialog__meta {
  border-bottom: 1px solid var(--line2);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-self: center;
  padding: 0 0 14px;
  width: var(--preview-inner-width);
}

.trip-preview-dialog__meta span {
  background: #f5efe2;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 11px;
}

.trip-preview-dialog__error {
  background: #fff1eb;
  border: 1px solid #e3b3a0;
  border-radius: 10px;
  color: var(--complete);
  font-size: 13px;
  font-weight: 700;
  margin: 14px 22px 0;
  padding: 10px 12px;
}

.trip-preview-dialog__loading,
.trip-preview-dialog__empty {
  justify-self: center;
  margin: 6px 0 0;
  width: var(--preview-inner-width);
}

.trip-preview-dialog__loading {
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 700;
  padding: 40px 16px;
  text-align: center;
}

.trip-preview-dialog__empty {
  align-items: center;
  display: grid;
  gap: 10px;
  justify-items: center;
  min-height: 190px;
  padding: 34px 0 34px;
  text-align: center;
}

.trip-preview-dialog__suitcase {
  height: 62px;
  position: relative;
  width: 48px;
}

.trip-preview-dialog__suitcase::before {
  border: 4px solid #aeb7c9;
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
  content: '';
  height: 18px;
  left: 13px;
  position: absolute;
  top: 0;
  width: 22px;
}

.trip-preview-dialog__suitcase::after {
  background:
    linear-gradient(90deg, transparent 31%, rgba(255, 253, 248, 0.5) 31% 38%, transparent 38% 62%, rgba(255, 253, 248, 0.5) 62% 69%, transparent 69%),
    linear-gradient(135deg, #c8ddf1, #8fb9dd);
  border: 4px solid #a9bdd7;
  border-radius: 10px;
  box-shadow:
    inset 0 -7px 0 rgba(82, 125, 165, 0.16),
    0 4px 10px rgba(70, 70, 70, 0.1);
  content: '';
  height: 42px;
  left: 4px;
  position: absolute;
  top: 17px;
  width: 40px;
}

.trip-preview-dialog__suitcase span {
  background: #f2d28b;
  border-radius: 2px;
  height: 24px;
  position: absolute;
  right: 11px;
  top: 24px;
  transform: rotate(-42deg);
  width: 6px;
  z-index: 1;
}

.trip-preview-dialog__empty strong {
  font-size: 20px;
  margin-top: 2px;
}

.trip-preview-dialog__empty p {
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 4px;
}

/* 다녀옴 사진 배치(RecordPlacementBody)도 메타칩·구분선과 같은 inner-width 로 정렬한다. */
.trip-preview-dialog > :deep(.rec) {
  justify-self: center;
  width: var(--preview-inner-width);
  padding: 16px 0 6px;
}

.trip-preview-dialog__body {
  display: grid;
  gap: 16px;
  grid-template-columns: 236px 1fr;
  justify-self: center;
  padding: 16px 0 6px;
  width: var(--preview-inner-width);
}

.trip-preview-dialog__map {
  background: #ebe4d1;
  border: 1px solid var(--line);
  border-radius: 14px;
  min-height: 270px;
  overflow: hidden;
  position: relative;
}

.trip-preview-dialog__map-canvas,
.trip-preview-dialog__map-fallback {
  inset: 0;
  position: absolute;
}

.trip-preview-dialog__map-fallback {
  background:
    radial-gradient(circle at 32% 52%, rgba(194, 105, 63, 0.12), transparent 12%),
    radial-gradient(circle at 58% 40%, rgba(194, 105, 63, 0.12), transparent 12%),
    linear-gradient(135deg, #e9e2cf, #e3dcc4 50%, #ece6d4);
}

.trip-preview-dialog__pin {
  align-items: center;
  background: var(--accent);
  border: 2px solid var(--on-fill);
  border-radius: 50% 50% 50% 0;
  box-shadow: 0 3px 7px rgba(0, 0, 0, 0.25);
  color: #fffdf8;
  display: flex;
  font-size: 11px;
  font-weight: 900;
  height: 24px;
  justify-content: center;
  position: absolute;
  transform: translate(-50%, -100%) rotate(-45deg);
  width: 24px;
}

.trip-preview-dialog__pin b {
  display: block;
  transform: rotate(45deg);
}

.trip-preview-dialog__legend {
  background: rgba(255, 253, 248, 0.84);
  border: 1px solid var(--line);
  border-radius: 999px;
  bottom: 12px;
  color: var(--ink-sub);
  font-size: 11px;
  font-weight: 800;
  left: 12px;
  padding: 5px 10px;
  position: absolute;
  z-index: 2;
}

:global(.trip-preview-dialog__kakao-pin) {
  align-items: center;
  background: var(--accent);
  border: 2px solid #fffdf8;
  border-radius: 50% 50% 50% 0;
  box-shadow: 0 3px 7px rgba(0, 0, 0, 0.25);
  color: #fffdf8;
  display: flex;
  font-size: 11px;
  font-weight: 900;
  height: 24px;
  justify-content: center;
  transform: rotate(-45deg);
  width: 24px;
}

:global(.trip-preview-dialog__kakao-pin)::before {
  content: none;
}

:global(.trip-preview-dialog__kakao-pin b) {
  display: block;
  transform: rotate(45deg);
}

.trip-preview-dialog__plan {
  display: flex;
  flex-direction: column;
  min-height: 270px;
}

.trip-preview-dialog__tabs {
  align-items: center;
  display: flex;
  gap: 5px;
  margin-bottom: 12px;
}

.trip-preview-dialog__tabs button {
  background: var(--on-fill);
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--ink-sub);
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 700;
  padding: 5px 12px;
}

.trip-preview-dialog__tabs button.active {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--on-fill);
}

.trip-preview-dialog__tabs span {
  color: var(--ink-faint);
  font-size: 11px;
  margin-left: auto;
}

.trip-preview-dialog__stops {
  flex: 1;
  overflow: auto;
}

.trip-preview-dialog__stop {
  align-items: flex-start;
  display: grid;
  grid-template-columns: 44px 13px 1fr;
}

.trip-preview-dialog__stop time {
  color: var(--accent);
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
  padding-right: 9px;
  text-align: right;
}

.trip-preview-dialog__stop i {
  align-self: stretch;
  display: flex;
  justify-content: center;
  position: relative;
}

.trip-preview-dialog__stop i::before {
  background: var(--accent);
  border-radius: 50%;
  content: '';
  height: 7px;
  margin-top: 5px;
  width: 7px;
}

.trip-preview-dialog__stop i::after {
  background: var(--line);
  bottom: 0;
  content: '';
  position: absolute;
  top: 14px;
  width: 1px;
}

.trip-preview-dialog__stop div {
  padding: 0 0 18px 8px;
}

.trip-preview-dialog__stop strong {
  display: block;
  font-size: 14px;
}

.trip-preview-dialog__stop span {
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 700;
}

.trip-preview-dialog__stop p {
  color: var(--ink-faint);
  font-size: 11px;
  margin: 4px 0 0;
}

.trip-preview-dialog__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  justify-self: center;
  padding: 10px 0 0;
  width: var(--preview-inner-width);
}

.trip-preview-dialog__tags span {
  color: var(--accent);
  font-family: var(--font-hand);
  font-size: 16px;
}

.trip-preview-dialog__actions {
  align-items: center;
  border-top: 1px solid var(--line2);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  justify-self: center;
  margin-top: 16px;
  padding: 16px 0;
  width: var(--preview-inner-width);
}

.trip-preview-dialog__actions :deep(.ds-btn:first-child) {
  margin-right: auto;
}

.trip-preview-dialog__delete {
  border-color: #e3b3a0;
  color: var(--complete);
}

.trip-preview-dialog__past-action {
  border-color: var(--line-strong);
  color: var(--stamp);
  white-space: nowrap;
}

@media (max-width: 720px) {
  .trip-preview-dialog__body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .trip-preview-dialog__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .trip-preview-dialog__actions :deep(.ds-btn:first-child) {
    margin-right: 0;
  }
}
</style>
