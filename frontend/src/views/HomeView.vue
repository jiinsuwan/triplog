<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { AppTopBar, BaseButton, TripPolaroid, TripStamp, TripTicket } from '@/components/common'
import { fetchCardImage, fetchMemories } from '@/api/cardApi'
import MemoryDetailDialog from '@/components/log/MemoryDetailDialog.vue'
import TripPreviewDialog from '@/components/trip/TripPreviewDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useTripStore } from '@/stores/trip'
import { formatTripDateRange, tripDisplayTags, tripDurationDays } from '@/utils/tripForm'
import { TRIP_STATUS, isPastTripStatus, normalizeTripStatus } from '@/utils/tripStatus'
import { getTripTicketColor } from '@/utils/tripTicket'

const router = useRouter()
const auth = useAuthStore()
const tripStore = useTripStore()
const previewDialogOpen = ref(false)
const memoryDialogOpen = ref(false)
const selectedTrip = ref(null)
const selectedMemory = ref(null)
const memorySummaries = ref([])
const memoryCoverUrls = ref({})
let memoryController = null

const memoryTones = [
  'radial-gradient(80% 70% at 60% 35%, #d39a5a, #9a4b2a 60%, #5a2c18)',
  'radial-gradient(80% 70% at 40% 40%, #7bb0ad, #3d8079 60%, #235650)',
  'radial-gradient(80% 70% at 50% 30%, #8a6a9e, #4a3566 65%, #2a1d3e)',
]

const isLoggedIn = computed(() => auth.isAuthenticated)
const displayName = computed(() => {
  const user = auth.user
  return user?.nickname || user?.name || user?.email?.split('@')[0] || '지인'
})
const userInitial = computed(() => displayName.value.slice(0, 1).toUpperCase() || 'T')

const planningTrips = computed(() =>
  tripStore.trips.filter((trip) => normalizeTripStatus(trip.status) === TRIP_STATUS.PLANNING),
)
const confirmedUpcomingTrips = computed(() =>
  tripStore.trips.filter((trip) => normalizeTripStatus(trip.status) === TRIP_STATUS.UPCOMING),
)
const pastTrips = computed(() =>
  tripStore.trips.filter((trip) => isPastTripStatus(trip.status)),
)
const sortedPlanningTrips = computed(() =>
  [...planningTrips.value].sort((a, b) => activityValue(b) - activityValue(a)),
)
const sortedUpcomingTrips = computed(() =>
  [...confirmedUpcomingTrips.value].sort((a, b) => dateValue(a.startDate) - dateValue(b.startDate)),
)
const sortedPastTrips = computed(() =>
  [...pastTrips.value].sort(
    (a, b) => dateValue(b.endDate || b.startDate) - dateValue(a.endDate || a.startDate),
  ),
)
const resumeTrip = computed(() => sortedPlanningTrips.value[0] || null)
const upcomingTrips = computed(() => sortedUpcomingTrips.value.slice(0, 2))
const hasPlanningTrips = computed(() => planningTrips.value.length > 0)
const resumeTitle = computed(() => {
  if (!isLoggedIn.value) return '새 여행 시작하기'
  return hasPlanningTrips.value ? '이어서 계획하기' : '새 여행 계획하기'
})
const displayPastTrips = computed(() => sortedPastTrips.value)
const recentMemories = computed(() => memorySummaries.value.filter((memory) => memory.completed).slice(0, 3))
const totalTrips = computed(() => tripStore.trips.length)
const totalDays = computed(() =>
  tripStore.trips.reduce((sum, trip) => sum + tripDurationDays(trip), 0),
)

onMounted(() => {
  if (!auth.isAuthenticated) return

  auth.fetchMe().catch(() => {})
  tripStore.fetchTripList().catch(() => {})
  loadMemories().catch(() => {})
})

onBeforeUnmount(() => {
  memoryController?.abort()
  memoryController = null
  resetMemoryCovers()
})

function goToLogin() {
  router.push('/login')
}

function startTrip() {
  if (auth.isAuthenticated) {
    router.push('/trips/new')
    return
  }
  router.push({ path: '/login', query: { redirect: '/trips/new' } })
}

function openTrips() {
  if (auth.isAuthenticated) {
    router.push('/trips')
    return
  }
  router.push({ path: '/login', query: { redirect: '/trips' } })
}

function openTrip(trip) {
  if (!trip) {
    openTrips()
    return
  }

  selectedTrip.value = trip
  previewDialogOpen.value = true
}

function openMemory(memory) {
  selectedMemory.value = memory
  memoryDialogOpen.value = true
}

function editMemory(memory) {
  const trip = memoryToTrip(memory)
  if (!trip) return
  selectedTrip.value = trip
  previewDialogOpen.value = true
}

function goPlaces(trip) {
  if (!trip || trip.mock) return
  router.push({ name: 'trip-place-search', params: { tripId: trip.id } })
}

function handleTripDeleted() {
  selectedTrip.value = null
}

function handleTripUpdated(trip) {
  selectedTrip.value = trip
}

async function loadMemories() {
  memoryController?.abort()
  resetMemoryCovers()
  memoryController = new AbortController()
  const result = await fetchMemories({ signal: memoryController.signal })
  memorySummaries.value = result
  const entries = await Promise.all(
    result
      .filter((memory) => memory.coverCardId)
      .map(async (memory) => {
        const blob = await fetchCardImage(memory.coverCardId, { signal: memoryController.signal })
        return [memory.tripId, URL.createObjectURL(blob)]
      }),
  )
  memoryCoverUrls.value = Object.fromEntries(entries)
}

function resetMemoryCovers() {
  for (const url of Object.values(memoryCoverUrls.value)) URL.revokeObjectURL(url)
  memoryCoverUrls.value = {}
}

function memoryToTrip(memory) {
  if (!memory) return null
  return {
    ...memory,
    id: memory.tripId,
    status: 'past',
  }
}

function ticketStatus(trip) {
  return isPastTripStatus(trip.status) ? 'MEMORY TICKET' : 'TRIP TICKET'
}

function ticketSerial(trip) {
  if (trip.serial) return trip.serial

  const year = trip.startDate?.slice(0, 4) || new Date().getFullYear()
  return `TL-${year}-${String(trip.id).padStart(4, '0')}`
}

function ticketColor(trip, index = 0) {
  return getTripTicketColor(trip, index)
}

function ticketDday(trip) {
  if (!trip?.startDate || isPastTripStatus(trip.status)) return null

  const today = new Date()
  const target = new Date(`${trip.startDate}T00:00:00`)
  today.setHours(0, 0, 0, 0)

  return Math.max(0, Math.ceil((target - today) / 86400000))
}

function tripTags(trip) {
  return tripDisplayTags(trip)
}

function memoryTags(memory) {
  return memory.theme ? [memory.theme] : []
}

function stampTitle(trip) {
  return (trip.region || 'TRIP').slice(0, 4)
}

function memoryTone(index) {
  return memoryTones[index % memoryTones.length]
}

function dateValue(value) {
  if (!value) return Number.MAX_SAFE_INTEGER
  return new Date(`${value}T00:00:00`).getTime()
}

function activityValue(trip) {
  const value = trip.updatedAt || trip.modifiedAt || trip.createdAt || trip.startDate || trip.endDate
  const timestamp = parseDateTimeValue(value)

  if (Number.isFinite(timestamp)) return timestamp
  return Number(trip.id) || 0
}

function parseDateTimeValue(value) {
  if (!value) return Number.NaN

  const normalizedValue = String(value)
  const dateText = normalizedValue.includes('T') ? normalizedValue : `${normalizedValue}T00:00:00`
  return new Date(dateText).getTime()
}
</script>

<template>
  <div class="home-page page-bg">
    <AppTopBar
      active="home"
      :show-search="false"
      :show-default-action="false"
      :show-logs="isLoggedIn"
      :user-initial="userInitial"
      @create-trip="startTrip"
    >
      <template #actions>
        <template v-if="!isLoggedIn">
          <BaseButton variant="ghost" data-testid="home-login" @click="goToLogin">로그인</BaseButton>
        </template>
      </template>
    </AppTopBar>

    <main class="home-scrap page-canvas" aria-labelledby="home-title">
      <header class="home-scrap__head">
        <div>
          <h1 v-if="isLoggedIn" id="home-title">
            {{ displayName }}님, 다음 여행 떠나볼까요 <b>?</b>
          </h1>
          <h1 v-else id="home-title">다음 여행을 한 장의 티켓으로 시작해요</h1>
          <p class="home-scrap__subtitle">
            <template v-if="isLoggedIn">
              하던 계획을 이어가고, 다녀온 여행을 추억으로 남겨요.
            </template>
            <template v-else>
              가고 싶은 곳을 담고, 다녀온 시간은 나중에 다시 펼쳐볼 수 있게 남겨요.
            </template>
          </p>
        </div>
      </header>

      <section class="home-drawer" aria-label="TripLog 홈 대시보드">
        <section class="home-stats" aria-labelledby="home-stats-title">
          <h2 id="home-stats-title" class="home-label">
            {{ isLoggedIn ? '지금까지 기록' : '여행 준비 흐름' }}
          </h2>

          <template v-if="isLoggedIn">
            <p class="home-stats__copy">
              {{ displayName }}님, TripLog와<br />
              <b>{{ totalTrips }}번</b>의 여행을 떠났어요
            </p>
            <dl class="home-stats__steps">
              <div>
                <dt>{{ totalTrips }}<small>번</small></dt>
                <dd>전체 여행</dd>
              </div>
              <div>
                <dt>{{ planningTrips.length }}<small>개</small></dt>
                <dd>계획 중</dd>
              </div>
              <div>
                <dt>{{ pastTrips.length }}<small>개</small></dt>
                <dd>다녀온 여행</dd>
              </div>
              <div>
                <dt>{{ totalDays }}<small>일</small></dt>
                <dd>여행 일수</dd>
              </div>
            </dl>
          </template>

          <template v-else>
            <p class="home-stats__copy">
              티켓으로 계획하고<br />
              장소를 담은 뒤<br />
              다녀온 시간을 남겨요
            </p>
            <dl class="home-stats__steps">
              <div>
                <dt>01</dt>
                <dd>여행 만들기</dd>
              </div>
              <div>
                <dt>02</dt>
                <dd>장소 담기</dd>
              </div>
              <div>
                <dt>03</dt>
                <dd>추억 기록</dd>
              </div>
              <div>
                <dt>04</dt>
                <dd>다시 보기</dd>
              </div>
            </dl>
          </template>
        </section>

        <section class="home-resume" aria-labelledby="home-resume-title">
          <div class="home-resume__head">
            <h2 id="home-resume-title">{{ resumeTitle }}</h2>
            <p>
              <template v-if="isLoggedIn && resumeTrip">
                가장 최근에 만들거나 수정한 여행이에요 · 눌러서 이어가기
              </template>
              <template v-else-if="isLoggedIn">TripLog로 여행을 계획해보세요.</template>
              <template v-else>로그인하면 최근 여행 티켓에서 바로 이어갈 수 있어요.</template>
            </p>
          </div>

          <button
            v-if="isLoggedIn && resumeTrip"
            class="home-ticket-button"
            type="button"
            data-testid="home-resume-trip"
            @click="openTrip(resumeTrip)"
          >
            <TripTicket
              :title="resumeTrip.title"
              :region="resumeTrip.region"
              :dates="formatTripDateRange(resumeTrip)"
              :serial="ticketSerial(resumeTrip)"
              :status="ticketStatus(resumeTrip)"
              :color="ticketColor(resumeTrip)"
              :dday="ticketDday(resumeTrip)"
              :tags="tripTags(resumeTrip)"
              :torn="isPastTripStatus(resumeTrip.status)"
              :stamp-title="stampTitle(resumeTrip)"
            />
          </button>

          <button
            v-else-if="isLoggedIn"
            class="home-ticket-button"
            type="button"
            data-testid="home-empty-create"
            @click="startTrip"
          >
            <TripTicket
              title="새 여행을 계획해보세요."
              region="TripLog"
              dates="여행을 계획해보세요."
              serial="TL-READY"
              status="NEW TRIP"
              color="mustard"
              dday="+"
              dday-label="ADD"
              unissued
              :show-barcode="false"
            />
          </button>

          <button
            v-else
            class="home-ticket-button"
            type="button"
            data-testid="home-public-create"
            @click="startTrip"
          >
            <TripTicket
              title="로그인하고 여행을 계획해보세요."
              region="TripLog"
              dates="여행 티켓이 이곳에 표시됩니다."
              serial="TL-READY"
              status="NEW TRIP"
              color="mustard"
              dday="+"
              dday-label="ADD"
              unissued
              :show-barcode="false"
            />
          </button>
        </section>

        <section class="home-stamps" aria-labelledby="home-stamps-title">
          <h2 id="home-stamps-title" class="home-label">다녀온 도장</h2>
          <div class="home-stamps__note">
            <template v-if="isLoggedIn && displayPastTrips.length">
              <button
                v-for="trip in displayPastTrips.slice(0, 4)"
                :key="trip.id"
                class="home-stamp-button"
                type="button"
                @click="openTrip(trip)"
              >
                <TripStamp
                  :title="stampTitle(trip)"
                  :stage="3"
                  :start-date="trip.startDate?.replaceAll('-', '.') || ''"
                  :end-date="trip.endDate?.replaceAll('-', '.') || ''"
                  complete
                />
              </button>
            </template>
            <div v-else class="home-stamp-placeholder">
              <TripStamp
                title="NEXT"
                :stage="2"
                start-date="----.--.--"
                end-date="----.--.--"
                label="TL"
                side-glyph="+"
              />
              <p class="home-muted">다녀온 여행이 생기면 도장이 찍혀요.</p>
            </div>
          </div>
        </section>

        <section class="home-memories" aria-labelledby="home-memories-title">
          <h2 id="home-memories-title" class="home-label">
            최근 추억
          </h2>
          <div class="home-memories__strip">
            <template v-if="isLoggedIn && recentMemories.length">
              <button
                v-for="(memory, index) in recentMemories"
                :key="memory.tripId"
                class="home-polaroid-button"
                type="button"
                @click="openMemory(memory)"
              >
                <TripPolaroid
                  :title="memory.title"
                  :subtitle="`${memory.region || '지역 미정'} · ${formatTripDateRange(memory)}`"
                  :tags="memoryTags(memory)"
                  :image-url="memoryCoverUrls[memory.tripId]"
                  :tone="memoryTone(index)"
                  completed
                />
              </button>
            </template>
            <TripPolaroid
              v-else
              title="아직 기록된 추억이 없어요"
              subtitle="로그인하면 사진과 카드가 이곳에 모입니다"
              empty
            />
          </div>
        </section>

        <section class="home-upcoming" aria-labelledby="home-upcoming-title">
          <h2 id="home-upcoming-title" class="home-label">곧 떠날 여행</h2>
          <div class="home-upcoming__list">
            <template v-if="isLoggedIn && upcomingTrips.length">
              <button
                v-for="(trip, index) in upcomingTrips"
                :key="trip.id"
                class="home-ticket-button"
                type="button"
                @click="openTrip(trip)"
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
                />
              </button>
            </template>
            <p v-else class="home-upcoming-empty" data-testid="home-upcoming-empty">
              계획된 여행이 아직 없어요
            </p>
          </div>
        </section>
      </section>
    </main>

    <TripPreviewDialog
      v-model="previewDialogOpen"
      :trip="selectedTrip"
      @open-places="goPlaces"
      @deleted="handleTripDeleted"
      @updated="handleTripUpdated"
    />
    <MemoryDetailDialog v-model="memoryDialogOpen" :memory="selectedMemory" @edit="editMemory" />
  </div>
</template>

<style scoped>
.home-scrap {
  display: flex;
  flex-direction: column;
}

.home-scrap__head {
  align-items: flex-end;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 20px;
  justify-content: flex-start;
  padding-bottom: 20px;
}

.home-scrap__head h1 {
  font-family: var(--font-hand);
  font-size: 31px;
  font-weight: 400;
  letter-spacing: 0.5px;
  line-height: 1.05;
  margin: 0;
}

.home-scrap__head h1 b,
.home-stats__copy b {
  color: var(--accent);
}

.home-scrap__subtitle {
  color: var(--ink-sub);
  font-size: 13px;
  margin: 6px 0 0;
}

.home-drawer {
  align-items: stretch;
  display: grid;
  flex: 1 1 auto;
  gap: 30px 26px;
  grid-template-areas:
    'stats resume resume'
    'stamps memories upcoming';
  grid-template-columns: 0.92fr 1.5fr 1fr;
  grid-template-rows: minmax(0, 266px) minmax(0, 1fr);
  height: auto;
  margin-top: 22px;
  min-height: 0;
}

.home-stats {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  grid-area: stats;
  justify-content: flex-start;
}

.home-resume {
  --ds-surface: #f1e7d3;
  background: #f1e7d3;
  border: 1px solid #e3d7bd;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  grid-area: resume;
  min-height: 0;
  padding: 14px 18px 16px;
}

.home-stamps {
  display: flex;
  flex-direction: column;
  grid-area: stamps;
}

.home-memories {
  display: flex;
  flex-direction: column;
  grid-area: memories;
  min-width: 0;
}

.home-upcoming {
  display: flex;
  flex-direction: column;
  grid-area: upcoming;
}

.home-upcoming {
  background: rgba(255, 253, 248, 0.58);
  border: 1px dashed rgba(190, 166, 126, 0.64);
  border-radius: 12px;
  min-height: 0;
  padding: 10px 12px;
}

.home-stamps {
  background: #f6efde;
  background-image: repeating-linear-gradient(
    #f6efde 0 26px,
    #e8dbc0 26px,
    #e8dbc0 27px,
    #f6efde 27px
  );
  border: 1px solid #e3d7bd;
  border-radius: 8px;
  min-height: 0;
  padding: 10px 12px;
}

.home-stats,
.home-memories {
  background: transparent;
  border: 0;
  border-radius: 0;
  min-height: 0;
  padding: 0;
}

.home-label {
  background: rgba(208, 170, 90, 0.34);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  color: var(--ink);
  display: inline-block;
  font-family: var(--font-hand);
  font-size: 19px;
  font-weight: 400;
  line-height: 1.3;
  margin: 0 0 14px;
  padding: 2px 12px;
  transform: none;
  width: fit-content;
}

.home-stats__copy {
  font-family: var(--font-hand);
  font-size: 22px;
  line-height: 1.3;
  margin: 0 0 14px;
}

.home-stats__steps {
  display: grid;
  gap: 9px 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
}

.home-stats__steps div {
  border-bottom: 1px dotted var(--line);
  padding-bottom: 6px;
}

.home-stats__steps dt {
  font-family: var(--font-hand);
  font-size: 31px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1;
}

.home-stats__steps dt small {
  color: var(--ink-sub);
  font-family: var(--font-hand);
  font-size: 17px;
  font-weight: 400;
  margin-left: 2px;
}

.home-stats__steps dd {
  color: var(--ink-sub);
  font-size: 11px;
  margin: 1px 0 0;
}

.home-resume__head {
  margin-bottom: 0;
}

.home-resume__head h2 {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.3px;
  margin: 0;
}

.home-resume__head p {
  color: var(--ink-sub);
  font-size: 12px;
  margin: 3px 0 0;
}

.home-resume :deep(.ds-ticket) {
  --ticket-w: 560px;
  max-width: 100%;
}

.home-resume .home-ticket-button {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  justify-content: center;
  margin-top: 10px;
  min-height: 0;
}

.home-ticket-button,
.home-stamp-button,
.home-polaroid-button {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: block;
  font: inherit;
  padding: 0;
  text-align: left;
  width: 100%;
}

.home-ticket-button:hover,
.home-stamp-button:hover,
.home-polaroid-button:hover {
  transform: translateY(-2px);
}

.home-ticket-button:focus-visible,
.home-stamp-button:focus-visible,
.home-polaroid-button:focus-visible {
  border-radius: var(--radius);
  box-shadow: none;
  outline: none;
}

.home-stamps__note {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 0;
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  min-height: 0;
  padding: 6px 4px;
}

.home-stamps__note :deep(.ds-stamp) {
  height: 82px;
  width: 82px;
}

.home-stamps__note :deep(.ds-stamp-stage-2) {
  transform: rotate(2.5deg);
}

.home-stamps__note :deep(.ds-stamp-stage-3:first-child) {
  transform: rotate(-3deg);
}

.home-stamp-placeholder {
  align-items: center;
  display: grid;
  gap: 8px;
  justify-items: center;
  width: 100%;
}

.home-stamp-placeholder :deep(.ds-stamp) {
  opacity: 0.72;
}

.home-muted {
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 700;
  margin: 0;
  text-align: center;
}

.home-memories__strip {
  display: flex;
  flex: 1;
  gap: 12px;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 6px;
}

.home-memories__strip :deep(.ds-polaroid) {
  --pola-w: 124px;
  flex: 0 0 auto;
}

.home-upcoming__list {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 12px;
}

.home-upcoming-empty {
  align-items: center;
  color: var(--ink-sub);
  display: flex;
  flex: 1;
  font-family: var(--font-hand);
  font-size: 22px;
  justify-content: center;
  line-height: 1.25;
  margin: 0;
  text-align: center;
}

.home-upcoming :deep(.ds-ticket) {
  --ticket-w: 280px;
  max-width: 100%;
}

.home-upcoming :deep(.ds-ticket__body) {
  padding: 0.82em 1em;
}

.home-upcoming :deep(.ds-ticket__title) {
  font-size: 1.18em;
  line-height: 1.28;
  white-space: normal;
}

.home-upcoming :deep(.ds-ticket__label) {
  letter-spacing: 0.2em;
}

.home-upcoming :deep(.ds-ticket__meta) {
  font-size: 0.8em;
}

@media (max-width: 980px) {
  .home-drawer {
    grid-template-areas:
      'resume resume'
      'stats upcoming'
      'stamps memories';
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .home-scrap__head {
    align-items: flex-start;
    flex-direction: column;
  }

  .home-scrap__head h1 {
    font-size: 29px;
  }

  .home-drawer {
    gap: 22px;
    grid-template-areas:
      'resume'
      'stats'
      'upcoming'
      'stamps'
      'memories';
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    height: auto;
    min-height: 0;
  }

  .home-resume {
    padding: 14px;
  }

  .home-resume :deep(.ds-ticket),
  .home-upcoming :deep(.ds-ticket) {
    --ticket-w: min(416px, calc(100vw - 60px));
  }
}
</style>
