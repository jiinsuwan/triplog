<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import { AppTopBar, BaseButton, TripPolaroid, TripStamp, TripTicket } from '@/components/common'
import { useAuthStore } from '@/stores/auth'
import { useTripStore } from '@/stores/trip'
import { formatTripDateRange, tripDurationDays } from '@/utils/tripForm'
import { isPastTripStatus } from '@/utils/tripStatus'

const router = useRouter()
const auth = useAuthStore()
const tripStore = useTripStore()

const guestStampSamples = [
  { title: '교토', stage: 3, startDate: '2025.11.07', endDate: '2025.11.09', complete: true },
  { title: '도쿄', stage: 3, startDate: '2026.03.02', endDate: '2026.03.05', complete: true },
  { title: '제주', stage: 2, startDate: '2026.09.02', endDate: '2026.09.04', complete: false },
]

const guestMemorySamples = [
  {
    title: '교토 단풍 기록',
    subtitle: '교토 · 2025.11',
    tags: ['단풍', '산책'],
    tone: 'radial-gradient(80% 70% at 60% 35%, #d39a5a, #9a4b2a 60%, #5a2c18)',
  },
  {
    title: '제주 동쪽 바다',
    subtitle: '제주 · 2026.09',
    tags: ['바다', '오름'],
    tone: 'radial-gradient(80% 70% at 40% 40%, #7bb0ad, #3d8079 60%, #235650)',
  },
  {
    title: '도쿄의 밤',
    subtitle: '도쿄 · 2026.03',
    tags: ['야경', '미식'],
    tone: 'radial-gradient(80% 70% at 50% 30%, #8a6a9e, #4a3566 65%, #2a1d3e)',
  },
]

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
  tripStore.trips.filter((trip) => !isPastTripStatus(trip.status)),
)
const pastTrips = computed(() =>
  tripStore.trips.filter((trip) => isPastTripStatus(trip.status)),
)
const sortedPlanningTrips = computed(() =>
  [...planningTrips.value].sort((a, b) => dateValue(a.startDate) - dateValue(b.startDate)),
)
const sortedPastTrips = computed(() =>
  [...pastTrips.value].sort(
    (a, b) => dateValue(b.endDate || b.startDate) - dateValue(a.endDate || a.startDate),
  ),
)
const resumeTrip = computed(() => sortedPlanningTrips.value[0] || null)
const upcomingTrips = computed(() =>
  sortedPlanningTrips.value.filter((trip) => trip.id !== resumeTrip.value?.id).slice(0, 2),
)
const hasPlanningTrips = computed(() => planningTrips.value.length > 0)
const resumeTitle = computed(() =>
  isLoggedIn.value && !hasPlanningTrips.value ? '새 여행 계획하기' : '이어서 계획하기',
)
const recentMemories = computed(() => sortedPastTrips.value.slice(0, 3))
const totalTrips = computed(() => tripStore.trips.length)
const totalDays = computed(() =>
  tripStore.trips.reduce((sum, trip) => sum + tripDurationDays(trip), 0),
)

onMounted(() => {
  if (!auth.isAuthenticated) return

  auth.fetchMe().catch(() => {})
  tripStore.fetchTripList().catch(() => {})
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
  router.push({ name: 'trip-detail', params: { tripId: trip.id } })
}

function ticketStatus(trip) {
  return isPastTripStatus(trip.status) ? 'MEMORY TICKET' : 'TRIP TICKET'
}

function ticketSerial(trip) {
  const year = trip.startDate?.slice(0, 4) || new Date().getFullYear()
  return `TL-${year}-${String(trip.id).padStart(4, '0')}`
}

function ticketColor(trip, index = 0) {
  if (isPastTripStatus(trip.status)) return 'khaki'
  const colors = ['mustard', 'blue', 'sage', 'burgundy', 'plum']
  return colors[index % colors.length]
}

function ticketDday(trip) {
  if (!trip?.startDate || isPastTripStatus(trip.status)) return null

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

function memoryTone(index) {
  return memoryTones[index % memoryTones.length]
}

function dateValue(value) {
  if (!value) return Number.MAX_SAFE_INTEGER
  return new Date(`${value}T00:00:00`).getTime()
}
</script>

<template>
  <div class="home-page">
    <AppTopBar
      active="home"
      search-placeholder="여행 검색"
      :user-initial="userInitial"
      @create-trip="startTrip"
    >
      <template #actions>
        <template v-if="isLoggedIn">
          <BaseButton variant="primary" data-testid="home-start-trip-top" @click="startTrip">
            새 여행
          </BaseButton>
        </template>
        <template v-else>
          <BaseButton variant="ghost" data-testid="home-login" @click="goToLogin">로그인</BaseButton>
          <BaseButton variant="primary" data-testid="home-start-trip-top" @click="startTrip">
            새 여행
          </BaseButton>
        </template>
      </template>
    </AppTopBar>

    <main class="home-scrap" aria-labelledby="home-title">
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
                가장 최근에 보던 여행이에요 · 눌러서 이어가기
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

          <button v-else class="home-ticket-button" type="button" @click="openTrips">
            <TripTicket
              title="오사카 가을 여행"
              region="오사카"
              dates="10.18 - 10.21"
              serial="TL-2026-1018"
              status="TRIP TICKET"
              color="mustard"
              :dday="118"
              :tags="['교토', '단풍']"
            />
          </button>
        </section>

        <section class="home-stamps" aria-labelledby="home-stamps-title">
          <h2 id="home-stamps-title" class="home-label">다녀온 도장</h2>
          <div class="home-stamps__note">
            <template v-if="isLoggedIn && pastTrips.length">
              <TripStamp
                v-for="trip in pastTrips.slice(0, 4)"
                :key="trip.id"
                :title="stampTitle(trip)"
                :stage="3"
                :start-date="trip.startDate?.replaceAll('-', '.') || ''"
                :end-date="trip.endDate?.replaceAll('-', '.') || ''"
                complete
              />
            </template>
            <template v-else-if="!isLoggedIn">
              <TripStamp
                v-for="stamp in guestStampSamples"
                :key="stamp.title"
                :title="stamp.title"
                :stage="stamp.stage"
                :start-date="stamp.startDate"
                :end-date="stamp.endDate"
                :complete="stamp.complete"
              />
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
            {{ isLoggedIn ? '최근 추억' : '여행 조각들' }}
          </h2>
          <div class="home-memories__strip">
            <template v-if="isLoggedIn && recentMemories.length">
              <button
                v-for="(trip, index) in recentMemories"
                :key="trip.id"
                class="home-polaroid-button"
                type="button"
                @click="openTrip(trip)"
              >
                <TripPolaroid
                  :title="trip.title"
                  :subtitle="`${trip.region || '지역 미정'} · ${formatTripDateRange(trip)}`"
                  :tags="tripTags(trip)"
                  :tone="memoryTone(index)"
                  completed
                />
              </button>
            </template>
            <template v-else-if="!isLoggedIn">
              <TripPolaroid
                v-for="memory in guestMemorySamples"
                :key="memory.title"
                :title="memory.title"
                :subtitle="memory.subtitle"
                :tags="memory.tags"
                :tone="memory.tone"
                completed
              />
            </template>
            <TripPolaroid
              v-else
              title="다녀온 여행을 기록해요"
              subtitle="사진과 카드가 이곳에 모입니다"
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
                  :color="ticketColor(trip, index + 1)"
                  :dday="ticketDday(trip)"
                  :tags="tripTags(trip)"
                />
              </button>
            </template>
            <p
              v-else-if="isLoggedIn"
              class="home-upcoming-empty"
              data-testid="home-upcoming-empty"
            >
              계획된 여행이 아직 없어요
            </p>
            <template v-else>
              <button class="home-ticket-button" type="button" @click="openTrips">
                <TripTicket
                  title="후쿠오카 주말 여행"
                  region="후쿠오카"
                  dates="07.05 - 07.07"
                  serial="TL-2026-0705"
                  status="TRIP TICKET"
                  color="blue"
                  :dday="13"
                />
              </button>
              <button class="home-ticket-button" type="button" @click="openTrips">
                <TripTicket
                  title="다낭 휴양 여행"
                  region="다낭"
                  dates="12.20 - 12.23"
                  serial="TL-2026-1220"
                  status="TRIP TICKET"
                  color="burgundy"
                  :dday="41"
                />
              </button>
            </template>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
}

.home-scrap {
  --ds-surface: var(--paper);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: 0 12px 34px -18px rgba(60, 40, 20, 0.4);
  margin: 18px auto 42px;
  max-width: 1200px;
  padding: 26px 36px 34px;
}

.home-scrap__head {
  align-items: flex-end;
  display: flex;
  gap: 20px;
  justify-content: flex-start;
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
  gap: 30px 28px;
  grid-template-areas:
    'stats resume resume'
    'stamps memories upcoming';
  grid-template-columns: 0.92fr 1.5fr 1fr;
  margin-top: 20px;
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
  padding: 15px 18px 18px;
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
  min-height: 166px;
  padding: 14px;
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
  min-height: 166px;
  padding: 14px;
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
  margin-bottom: 13px;
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
  --ticket-w: 640px;
  max-width: 100%;
}

.home-resume .home-ticket-button {
  display: flex;
  justify-content: center;
  margin-top: auto;
}

.home-ticket-button,
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
.home-polaroid-button:hover {
  transform: translateY(-2px);
}

.home-ticket-button:focus-visible,
.home-polaroid-button:focus-visible {
  border-radius: var(--radius);
  box-shadow: 0 0 0 3px rgba(194, 105, 63, 0.24);
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
  gap: 14px 12px;
  justify-content: center;
  min-height: 0;
  padding: 10px 6px 8px;
}

.home-stamps__note :deep(.ds-stamp) {
  height: 98px;
  width: 98px;
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
  gap: 14px;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 6px;
}

.home-memories__strip :deep(.ds-polaroid) {
  --pola-w: 146px;
  flex: 0 0 auto;
}

.home-upcoming__list {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 14px;
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
  --ticket-w: 300px;
  max-width: 100%;
}

@media (max-width: 980px) {
  .home-scrap {
    margin: 14px 16px 36px;
    padding: 24px;
  }

  .home-drawer {
    grid-template-areas:
      'resume resume'
      'stats upcoming'
      'stamps memories';
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .home-scrap {
    border-radius: 0;
    border-width: 1px 0;
    margin: 0 0 32px;
    padding: 22px 16px 28px;
  }

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
