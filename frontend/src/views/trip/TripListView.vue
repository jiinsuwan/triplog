<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { AppTopBar, BaseButton, TripTicket } from '@/components/common'
import TripCreateDialog from '@/components/trip/TripCreateDialog.vue'
import TripPreviewDialog from '@/components/trip/TripPreviewDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useTripStore } from '@/stores/trip'
import { formatTripDateRange, tripDisplayTags } from '@/utils/tripForm'
import { TRIP_STATUS, isPastTripStatus, normalizeTripStatus } from '@/utils/tripStatus'
import { getTripTicketColor } from '@/utils/tripTicket'

const router = useRouter()
const auth = useAuthStore()
const tripStore = useTripStore()

const createDialogOpen = ref(false)
const previewDialogOpen = ref(false)
const selectedTrip = ref(null)
const planningGridRef = ref(null)
const planningOverflow = ref(false)
let resizeObserver = null
let ticketDragState = null
let suppressClickUntil = 0

const DRAG_CLICK_THRESHOLD = 12

const previewMockTrips = {
  upcoming: [
    {
      id: -101,
      title: '강릉 주말 바다',
      startDate: '2026-07-04',
      endDate: '2026-07-06',
      region: '강릉',
      theme: '바다 산책',
      status: TRIP_STATUS.UPCOMING,
      tags: ['#바다', '#카페'],
      serial: 'TL-NEXT-001',
      mock: true,
      itinerary: {
        dayCount: 3,
        days: [
          {
            dayNumber: 1,
            date: '2026-07-04',
            stops: [
              { id: 'mock-next-1', place: { name: '안목해변', category: '바다' }, startTime: '10:00' },
              { id: 'mock-next-2', place: { name: '강릉 커피거리', category: '카페' }, startTime: '13:00' },
            ],
          },
          {
            dayNumber: 2,
            date: '2026-07-05',
            stops: [
              { id: 'mock-next-3', place: { name: '경포호 산책길', category: '산책' }, startTime: '11:00' },
            ],
          },
        ],
      },
    },
  ],
  past: [
    {
      id: -201,
      title: '전주 한옥 골목',
      startDate: '2026-03-14',
      endDate: '2026-03-16',
      region: '전주',
      theme: '골목 미식',
      status: 'past',
      tags: ['#한옥', '#골목'],
      serial: 'TL-MEM-001',
      mock: true,
      itinerary: {
        dayCount: 3,
        days: [
          {
            dayNumber: 1,
            date: '2026-03-14',
            stops: [
              { id: 'mock-memory-1', place: { name: '전주 한옥마을', category: '문화' }, startTime: '10:30' },
              { id: 'mock-memory-2', place: { name: '경기전', category: '역사' }, startTime: '14:00' },
            ],
          },
        ],
      },
    },
  ],
}

const displayName = computed(() => {
  const user = auth.user
  return user?.nickname || user?.name || user?.email?.split('@')[0] || 'T'
})
const userInitial = computed(() => displayName.value.slice(0, 1).toUpperCase() || 'T')
const allTrips = computed(() => tripStore.trips ?? [])
const planningTrips = computed(() =>
  allTrips.value.filter((trip) => normalizeTripStatus(trip.status) === TRIP_STATUS.PLANNING),
)
const upcomingTrips = computed(() =>
  allTrips.value.filter((trip) => normalizeTripStatus(trip.status) === TRIP_STATUS.UPCOMING),
)
const pastTrips = computed(() => allTrips.value.filter((trip) => isPastTripStatus(trip.status)))
const sections = computed(() => [
  {
    key: 'planning',
    title: '계획 중',
    trips: planningTrips.value,
  },
  {
    key: 'upcoming',
    title: '곧 떠날 여행',
    trips: upcomingTrips.value.length ? upcomingTrips.value : previewMockTrips.upcoming,
  },
  {
    key: 'past',
    title: '다녀온 여행',
    trips: pastTrips.value.length ? pastTrips.value : previewMockTrips.past,
  },
])
const visibleSections = computed(() => sections.value)

onMounted(() => {
  tripStore.fetchTripList().catch(() => {})
  nextTick(syncPlanningOverflow)

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(syncPlanningOverflow)
    if (planningGridRef.value) {
      resizeObserver.observe(planningGridRef.value)
    }
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

watch(
  () => planningTrips.value.length,
  () => nextTick(syncPlanningOverflow),
)

function openCreateDialog() {
  createDialogOpen.value = true
}

function handleCreateClick(event) {
  if (shouldSuppressClick(event)) return
  openCreateDialog()
}

function openPreview(trip) {
  selectedTrip.value = trip
  previewDialogOpen.value = true
}

function handleTicketClick(trip, event) {
  if (shouldSuppressClick(event)) return
  openPreview(trip)
}

function goPlaces(trip) {
  router.push({ name: 'trip-place-search', params: { tripId: trip.id } })
}

function handleTripCreated({ trip, destination }) {
  if (destination === 'places' && trip?.id) {
    goPlaces(trip)
    return
  }
  selectedTrip.value = trip
  previewDialogOpen.value = true
}

function handleTripDeleted() {
  selectedTrip.value = null
}

function handleTripUpdated(trip) {
  selectedTrip.value = trip
}

function setPlanningGridRef(element) {
  if (element === planningGridRef.value) return

  if (planningGridRef.value) {
    resizeObserver?.unobserve(planningGridRef.value)
  }

  planningGridRef.value = element

  if (element) {
    resizeObserver?.observe(element)
  }

  nextTick(syncPlanningOverflow)
}

function syncPlanningOverflow() {
  const element = planningGridRef.value
  planningOverflow.value = !!element && element.scrollWidth > element.clientWidth + 1
}

function startTicketDrag(event) {
  if (event.button != null && event.button !== 0) return
  if (event.target?.closest?.('[data-ticket-drag-ignore]')) return

  const element = event.currentTarget
  ticketDragState = {
    element,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: element.scrollLeft,
    dragging: false,
    captured: false,
  }
}

function moveTicketDrag(event) {
  if (!ticketDragState || ticketDragState.pointerId !== event.pointerId) return

  const deltaX = event.clientX - ticketDragState.startX
  const deltaY = event.clientY - ticketDragState.startY

  if (!ticketDragState.dragging && Math.hypot(deltaX, deltaY) > DRAG_CLICK_THRESHOLD) {
    ticketDragState.dragging = true
    ticketDragState.captured = true
    ticketDragState.element.classList.add('is-dragging')
    ticketDragState.element.setPointerCapture?.(event.pointerId)
  }

  if (!ticketDragState.dragging) return

  event.preventDefault()
  ticketDragState.element.scrollLeft = ticketDragState.scrollLeft - deltaX
}

function endTicketDrag(event) {
  if (!ticketDragState || ticketDragState.pointerId !== event.pointerId) return

  const { element, dragging, captured } = ticketDragState
  element.classList.remove('is-dragging')
  if (captured) {
    element.releasePointerCapture?.(event.pointerId)
  }
  ticketDragState = null

  if (dragging) {
    suppressClickUntil = Date.now() + 250
  }
}

function cancelTicketDrag(event) {
  if (!ticketDragState) return

  ticketDragState.element.classList.remove('is-dragging')
  if (ticketDragState.captured) {
    ticketDragState.element.releasePointerCapture?.(event.pointerId)
  }
  ticketDragState = null
}

function shouldSuppressClick(event) {
  if (Date.now() > suppressClickUntil) return false

  event?.preventDefault()
  event?.stopPropagation()
  return true
}

function ticketStatus(trip) {
  return isPastTripStatus(trip.status) ? 'MEMORY TICKET' : 'TRIP TICKET'
}

function ticketSerial(trip) {
  if (trip.serial) return trip.serial

  const year = trip.startDate?.slice(0, 4) || new Date().getFullYear()
  return `TL-${year}-${String(trip.id).padStart(4, '0')}`
}

function ticketColor(trip, index) {
  return getTripTicketColor(trip, index)
}

function ticketDday(trip) {
  if (!trip.startDate || isPastTripStatus(trip.status)) return null

  const today = new Date()
  const target = new Date(`${trip.startDate}T00:00:00`)
  today.setHours(0, 0, 0, 0)

  return Math.max(0, Math.ceil((target - today) / 86400000))
}

function tripTags(trip) {
  return tripDisplayTags(trip)
}

function stampTitle(trip) {
  return (trip.region || 'TRIP').slice(0, 4)
}

function sectionEmptyText(section) {
  if (section.key === 'upcoming') return '곧 떠날 여행이 아직 없습니다.'
  if (section.key === 'past') return '다녀온 여행이 아직 없습니다.'
  return '아직 만든 여행이 없습니다.'
}
</script>

<template>
  <div class="trip-list-page page-bg">
    <AppTopBar
      active="trips"
      :show-search="false"
      :user-initial="userInitial"
      :show-default-action="false"
    />

    <main class="trip-list-shell page-canvas" aria-labelledby="trip-list-title">
      <header class="trip-list-head">
        <div>
          <h1 id="trip-list-title">나의 여행</h1>
          <p>계획한 여행과 다녀온 기록을 한 곳에서.</p>
        </div>
      </header>

      <div v-if="tripStore.error" class="trip-list-alert" role="alert">
        {{ tripStore.error }}
      </div>

      <section v-if="tripStore.loading" class="trip-list-loading" aria-live="polite">
        <span class="trip-list-loading__spinner" aria-hidden="true"></span>
        <strong>여행 목록을 불러오는 중입니다.</strong>
      </section>

      <template v-else>
        <section
          v-for="section in visibleSections"
          :key="section.key"
          class="trip-list-section"
          :aria-labelledby="`trip-section-${section.key}`"
        >
          <header class="trip-list-section__head">
            <h2 :id="`trip-section-${section.key}`">
              {{ section.title }}
              <em>{{ section.trips.length }}</em>
            </h2>
            <BaseButton
              v-if="section.key === 'planning' && planningOverflow"
              variant="ghost"
              size="small"
              class="trip-list-section__quick-add"
              data-testid="trip-list-create-inline"
              @click="handleCreateClick"
            >
              + 새 여행
            </BaseButton>
          </header>

          <div
            v-if="section.trips.length || section.key === 'planning'"
            :ref="section.key === 'planning' ? setPlanningGridRef : undefined"
            class="trip-ticket-grid"
            @pointerdown="startTicketDrag"
            @pointermove="moveTicketDrag"
            @pointerup="endTicketDrag"
            @pointercancel="cancelTicketDrag"
          >
            <button
              v-for="(trip, index) in section.trips"
              :key="trip.id"
              class="trip-ticket-card"
              :class="{ 'is-mock': trip.mock }"
              type="button"
              :data-testid="`trip-ticket-${trip.id}`"
              @click="handleTicketClick(trip, $event)"
            >
              <TripTicket
                :title="trip.title"
                :region="trip.region"
                :dates="formatTripDateRange(trip)"
                :serial="ticketSerial(trip)"
                :status="ticketStatus(trip)"
                :color="ticketColor(trip, index)"
                :dday="ticketDday(trip)"
                :tags="tripTags(trip)"
                :torn="isPastTripStatus(trip.status)"
                :stamp-title="stampTitle(trip)"
              />
            </button>

            <button
              v-if="section.key === 'planning'"
              class="trip-add-ticket"
              type="button"
              data-testid="trip-list-create"
              data-ticket-drag-ignore
              @click="handleCreateClick"
            >
              <span class="trip-add-ticket__plus" aria-hidden="true">+</span>
              <strong>새 여행 추가</strong>
              <small>기본 정보를 정하고 장소 담기로 이어갑니다.</small>
            </button>
          </div>

          <div
            v-else
            class="trip-list-section__empty"
            :class="`trip-list-section__empty--${section.key}`"
          >
            <template v-if="section.key === 'upcoming'">
              <TripTicket
                title="계획된 여행이 아직 없어요."
                region="TripLog"
                dates="계획을 확정하면 이곳에 모입니다."
                serial="TL-NEXT"
                status="NEXT TRIP"
                color="blue"
                dday="+"
                dday-label="READY"
                unissued
                :show-barcode="false"
              />
              <p>장소와 일정을 확정한 여행이 여기에 쌓입니다.</p>
            </template>
            <template v-else-if="section.key === 'past'">
              <TripTicket
                title="다녀온 여행 기록이 아직 없어요."
                region="TripLog"
                dates="여행을 마치면 기록으로 정리됩니다."
                serial="TL-MEMORY"
                status="MEMORY TICKET"
                color="khaki"
                :tags="['기록대기']"
                torn
                stamp-title="NEXT"
                :stamp-stage="2"
              />
              <p>다녀온 여행은 나중에 기록 카드와 함께 모입니다.</p>
            </template>
            <template v-else>
              {{ sectionEmptyText(section) }}
            </template>
          </div>
        </section>
      </template>
    </main>

    <TripCreateDialog v-model="createDialogOpen" @created="handleTripCreated" />
    <TripPreviewDialog
      v-model="previewDialogOpen"
      :trip="selectedTrip"
      @open-places="goPlaces"
      @deleted="handleTripDeleted"
      @updated="handleTripUpdated"
    />
  </div>
</template>

<style scoped>
.trip-list-head {
  align-items: flex-start;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 18px;
  justify-content: space-between;
  padding-bottom: 20px;
}

.trip-list-head h1 {
  font-family: var(--font-hand);
  font-size: 38px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.05;
  margin: 0;
}

.trip-list-head p {
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
  margin: 8px 0 0;
}

.trip-list-alert {
  background: #fff1eb;
  border: 1px solid #e3b3a0;
  border-radius: 10px;
  color: var(--complete);
  font-size: 13px;
  font-weight: 700;
  margin: 18px 0 0;
  padding: 12px 14px;
}

.trip-list-loading {
  align-items: center;
  background: var(--paper-card);
  border: 1px dashed var(--line);
  border-radius: 14px;
  color: var(--ink-sub);
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 18px;
  min-height: 180px;
}

.trip-list-loading__spinner {
  animation: trip-list-spin 0.9s linear infinite;
  border: 2px solid var(--line);
  border-radius: 50%;
  border-top-color: var(--accent);
  height: 22px;
  width: 22px;
}

.trip-list-section {
  padding: 24px 0 4px;
}

.trip-list-section + .trip-list-section {
  border-top: 1px solid var(--line2);
  margin-top: 20px;
}

.trip-list-section__head {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
}

.trip-list-section__head h2 {
  align-items: center;
  color: var(--ink-sub);
  display: flex;
  font-size: 13px;
  gap: 8px;
  font-weight: 800;
  letter-spacing: 0;
  margin: 0;
}

.trip-list-section__head h2 em {
  background: var(--bg);
  border-radius: 999px;
  color: var(--ink-faint);
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  padding: 2px 9px;
}

.trip-list-section__quick-add {
  flex: none;
}

.trip-ticket-grid {
  align-items: flex-start;
  display: flex;
  cursor: grab;
  gap: 14px;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 4px 8px 0;
  scroll-padding-inline: 4px;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  touch-action: pan-y;
  user-select: none;
}

.trip-ticket-grid::-webkit-scrollbar {
  display: none;
}

.trip-ticket-grid.is-dragging {
  cursor: grabbing;
  scroll-snap-type: none;
}

.trip-add-ticket,
.trip-ticket-card {
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: left;
}

.trip-add-ticket {
  align-items: center;
  background: #fffdf855;
  border: 1.5px dashed var(--line);
  border-radius: var(--radius);
  color: var(--ink-sub);
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
  flex: 0 0 300px;
  min-height: 110px;
  padding: 16px;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.trip-add-ticket:hover,
.trip-ticket-card:hover {
  transform: translateY(-2px);
}

.trip-add-ticket:hover {
  border-color: var(--accent);
}

.trip-add-ticket__plus {
  color: var(--accent);
  font-size: 24px;
  line-height: 1;
}

.trip-add-ticket strong {
  font-size: 14px;
  font-weight: 800;
}

.trip-add-ticket small {
  color: var(--ink-faint);
  font-size: 12px;
  text-align: center;
}

.trip-ticket-card {
  --ticket-w: 390px;
  display: grid;
  flex: 0 0 390px;
  gap: 8px;
  justify-items: start;
  scroll-snap-align: start;
  transition:
    filter 0.15s ease,
    transform 0.15s ease;
}

.trip-ticket-card :deep(.ds-ticket) {
  --ticket-w: 390px;
}

.trip-ticket-card:focus-visible {
  box-shadow: none;
  outline: none;
}

.trip-add-ticket:focus-visible {
  outline: 3px solid rgba(194, 105, 63, 0.24);
  outline-offset: 4px;
}

.trip-list-section__empty {
  align-items: center;
  background: rgba(255, 253, 248, 0.58);
  border: 1px dashed rgba(190, 166, 126, 0.64);
  border-radius: 12px;
  color: var(--ink-sub);
  display: grid;
  font-size: 13px;
  font-weight: 800;
  gap: 12px;
  justify-items: start;
  min-height: 150px;
  overflow: hidden;
  padding: 16px;
  text-align: left;
}

.trip-list-section__empty p {
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 700;
  margin: 0;
}

.trip-list-section__empty :deep(.ds-ticket) {
  --ticket-w: 390px;
  max-width: 100%;
}

.trip-list-section__empty--past :deep(.ds-ticket) {
  --ticket-w: 370px;
}

.trip-list-shell :deep(.ds-empty-state) {
  margin-top: 18px;
}

@keyframes trip-list-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 980px) {
  .trip-ticket-card {
    --ticket-w: min(390px, calc(100vw - 72px));
    flex-basis: min(390px, calc(100vw - 72px));
  }

  .trip-ticket-card :deep(.ds-ticket) {
    --ticket-w: min(390px, calc(100vw - 72px));
  }

  .trip-add-ticket {
    flex-basis: min(300px, calc(100vw - 72px));
  }
}

@media (max-width: 720px) {
  .trip-list-head h1 {
    font-size: 32px;
  }

  .trip-list-head {
    flex-direction: column;
  }

  .trip-ticket-card {
    --ticket-w: min(390px, calc(100vw - 44px));
    flex-basis: min(390px, calc(100vw - 44px));
  }

  .trip-ticket-card :deep(.ds-ticket) {
    --ticket-w: min(390px, calc(100vw - 44px));
  }

  .trip-add-ticket {
    flex-basis: min(300px, calc(100vw - 44px));
  }
}
</style>
