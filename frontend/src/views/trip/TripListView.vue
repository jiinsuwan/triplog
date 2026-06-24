<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import { AppTopBar, BaseButton, EmptyState, TripTicket } from '@/components/common'
import { useTripStore } from '@/stores/trip'
import { formatTripDateRange, tripDurationDays } from '@/utils/tripForm'
import { isPastTripStatus } from '@/utils/tripStatus'

const router = useRouter()
const tripStore = useTripStore()

const planningTrips = computed(() =>
  tripStore.trips.filter((trip) => !isPastTripStatus(trip.status)),
)
const pastTrips = computed(() =>
  tripStore.trips.filter((trip) => isPastTripStatus(trip.status)),
)
const totalCount = computed(() => tripStore.total || tripStore.trips.length)

onMounted(() => {
  tripStore.fetchTripList().catch(() => {})
})

function goCreate() {
  router.push({ name: 'trip-create' })
}

function goDetail(trip) {
  router.push({ name: 'trip-detail', params: { tripId: trip.id } })
}

function tripStatusText(status) {
  return isPastTripStatus(status) ? 'MEMORY TICKET' : 'TRIP TICKET'
}

function ticketSerial(trip) {
  const year = trip.startDate?.slice(0, 4) || new Date().getFullYear()
  return `TL-${year}-${String(trip.id).padStart(4, '0')}`
}

function ticketColor(trip, index) {
  if (isPastTripStatus(trip.status)) return 'khaki'
  const colors = ['mustard', 'blue', 'sage', 'burgundy', 'plum']
  return colors[index % colors.length]
}

function ticketDday(trip) {
  if (!trip.startDate || isPastTripStatus(trip.status)) return null

  const today = new Date()
  const target = new Date(`${trip.startDate}T00:00:00`)
  today.setHours(0, 0, 0, 0)

  return Math.max(0, Math.ceil((target - today) / 86400000))
}

function tripTags(trip) {
  return [trip.region, trip.theme].filter(Boolean)
}

function stampTitle(trip) {
  return (trip.region || 'TRIP').slice(0, 4)
}
</script>

<template>
  <div class="trip-list-page">
    <AppTopBar active="trips" search-placeholder="여행, 지역 검색" user-initial="T" @create-trip="goCreate">
      <template #actions>
        <BaseButton variant="primary" data-testid="trip-list-create-top" @click="goCreate">
          새 여행
        </BaseButton>
      </template>
    </AppTopBar>

    <main class="trip-list-shell" aria-labelledby="trip-list-title">
      <header class="trip-list-head">
        <div>
          <p class="ds-tag-hand">My trip tickets</p>
          <h1 id="trip-list-title">나의 여행</h1>
          <p>
            계획 중인 여행과 다녀온 기록을 티켓으로 모아봅니다.
          </p>
        </div>
        <div class="trip-list-head__summary" aria-label="여행 요약">
          <span>전체 {{ totalCount }}개</span>
          <span>계획 {{ planningTrips.length }}개</span>
          <span>기록 {{ pastTrips.length }}개</span>
        </div>
      </header>

      <div v-if="tripStore.error" class="trip-list-alert" role="alert">
        {{ tripStore.error }}
      </div>

      <section v-if="tripStore.loading" class="trip-list-loading" aria-live="polite">
        <span class="trip-list-loading__spinner" aria-hidden="true"></span>
        <strong>여행 목록을 불러오는 중입니다.</strong>
      </section>

      <EmptyState
        v-else-if="!tripStore.hasTrips"
        icon="TL"
        title="아직 만든 여행이 없습니다."
        description="제목, 기간, 지역, 테마를 정해 첫 여행 티켓을 만들어보세요."
        action-label="첫 여행 만들기"
        @action="goCreate"
      />

      <template v-else>
        <section class="trip-list-section" aria-labelledby="planning-trips-title">
          <header class="trip-list-section__head">
            <div>
              <h2 id="planning-trips-title">계획 중</h2>
              <p>장소와 일정을 채워갈 여행입니다.</p>
            </div>
            <span>{{ planningTrips.length }}개</span>
          </header>

          <div class="trip-ticket-grid">
            <button class="trip-add-ticket" type="button" data-testid="trip-list-create" @click="goCreate">
              <span class="trip-add-ticket__plus" aria-hidden="true">+</span>
              <strong>새 여행 추가</strong>
              <small>여행 정보를 먼저 만들고 장소를 채워갑니다.</small>
            </button>

            <button
              v-for="(trip, index) in planningTrips"
              :key="trip.id"
              class="trip-ticket-card"
              type="button"
              :data-testid="`trip-ticket-${trip.id}`"
              @click="goDetail(trip)"
            >
              <TripTicket
                :title="trip.title"
                :region="trip.region"
                :dates="formatTripDateRange(trip)"
                :serial="ticketSerial(trip)"
                :status="tripStatusText(trip.status)"
                :color="ticketColor(trip, index)"
                :dday="ticketDday(trip)"
                :tags="tripTags(trip)"
              />
              <span class="trip-ticket-card__meta">
                {{ tripDurationDays(trip) }}일 · {{ trip.theme || '테마 미정' }}
              </span>
            </button>
          </div>
        </section>

        <section v-if="pastTrips.length" class="trip-list-section" aria-labelledby="past-trips-title">
          <header class="trip-list-section__head">
            <div>
              <h2 id="past-trips-title">지난 여행</h2>
              <p>사진과 기록으로 이어질 여행입니다.</p>
            </div>
            <span>{{ pastTrips.length }}개</span>
          </header>

          <div class="trip-ticket-grid trip-ticket-grid--past">
            <button
              v-for="(trip, index) in pastTrips"
              :key="trip.id"
              class="trip-ticket-card trip-ticket-card--past"
              type="button"
              :data-testid="`trip-ticket-${trip.id}`"
              @click="goDetail(trip)"
            >
              <TripTicket
                :title="trip.title"
                :region="trip.region"
                :dates="formatTripDateRange(trip)"
                :serial="ticketSerial(trip)"
                :status="tripStatusText(trip.status)"
                :color="ticketColor(trip, index)"
                :tags="tripTags(trip)"
                :stamp-title="stampTitle(trip)"
                torn
              />
              <span class="trip-ticket-card__meta">
                {{ tripDurationDays(trip) }}일 · 기록 보기
              </span>
            </button>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.trip-list-page {
  min-height: 100vh;
}

.trip-list-shell {
  --ds-surface: var(--paper);
  margin: 18px auto 44px;
  max-width: 1200px;
  padding: 0 24px;
}

.trip-list-head {
  align-items: flex-end;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 22px;
  justify-content: space-between;
  padding: 20px 0 18px;
}

.trip-list-head h1 {
  font-family: var(--font-hand);
  font-size: 36px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.05;
  margin: 2px 0 0;
}

.trip-list-head p:not(.ds-tag-hand) {
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
  margin: 8px 0 0;
}

.trip-list-head__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  justify-content: flex-end;
  min-width: 260px;
}

.trip-list-head__summary span,
.trip-list-section__head > span {
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 20px;
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 800;
  padding: 5px 11px;
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
  border-top-color: var(--accent);
  border-radius: 50%;
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
  align-items: flex-end;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin-bottom: 14px;
}

.trip-list-section__head h2 {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0;
  margin: 0;
}

.trip-list-section__head p {
  color: var(--ink-sub);
  font-size: 12px;
  margin: 5px 0 0;
}

.trip-ticket-grid {
  align-items: start;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
}

.trip-ticket-grid--past {
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
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
  min-height: 118px;
  padding: 18px;
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
  --ticket-w: min(416px, 100%);
  display: grid;
  gap: 8px;
  justify-items: start;
  transition:
    filter 0.15s ease,
    transform 0.15s ease;
}

.trip-ticket-card:focus-visible,
.trip-add-ticket:focus-visible {
  outline: 3px solid rgba(194, 105, 63, 0.24);
  outline-offset: 4px;
}

.trip-ticket-card__meta {
  color: var(--ink-faint);
  font-size: 11px;
  font-weight: 700;
  padding-left: 8px;
}

.trip-ticket-card--past {
  --ticket-w: min(390px, 100%);
}

.trip-list-shell :deep(.ds-empty-state) {
  margin-top: 18px;
}

@keyframes trip-list-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .trip-list-shell {
    padding: 0 14px;
  }

  .trip-list-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .trip-list-head__summary {
    justify-content: flex-start;
    min-width: 0;
  }

  .trip-ticket-grid,
  .trip-ticket-grid--past {
    grid-template-columns: 1fr;
  }

  .trip-ticket-card,
  .trip-ticket-card--past {
    --ticket-w: min(416px, calc(100vw - 44px));
  }
}
</style>
