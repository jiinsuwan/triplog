<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Tag from 'primevue/tag'
import { useTripStore } from '@/stores/trip'
import { formatTripDateRange, tripDurationDays } from '@/utils/tripForm'

const router = useRouter()
const tripStore = useTripStore()

const planningTrips = computed(() =>
  tripStore.trips.filter((trip) => normalizeStatus(trip.status) !== 'DONE'),
)
const pastTrips = computed(() =>
  tripStore.trips.filter((trip) => normalizeStatus(trip.status) === 'DONE'),
)

onMounted(() => {
  tripStore.fetchTripList().catch(() => {})
})

function goCreate() {
  router.push({ name: 'trip-create' })
}

function statusLabel(status) {
  return normalizeStatus(status) === 'DONE' ? '다녀옴' : '계획 중'
}

function statusSeverity(status) {
  return normalizeStatus(status) === 'DONE' ? 'success' : 'info'
}

function normalizeStatus(status = '') {
  const upper = status.toUpperCase()
  if (['DONE', 'PAST', 'COMPLETED'].includes(upper)) return 'DONE'
  return 'PLANNING'
}

function accentFor(region = '') {
  const accents = {
    전주: 'linear-gradient(135deg, #d66c55, #57495f 54%, #edbf53)',
    제주: 'linear-gradient(135deg, #6fb292, #3d6fb6 54%, #edbf53)',
    부산: 'linear-gradient(135deg, #315f8f, #2e8f6b 54%, #f1c86b)',
    서울: 'linear-gradient(135deg, #151d25, #806fd1 52%, #edbf53)',
  }
  return accents[region] || 'linear-gradient(135deg, #2e8f6b, #3182f6 54%, #edbf53)'
}
</script>

<template>
  <main class="trip-page">
    <header class="trip-hero">
      <div>
        <span class="eyebrow">TripLog</span>
        <h1>지난 여행은 카드로, 새 여행은 계획으로.</h1>
        <p>
          Sprint 1에서는 여행 목록과 생성 흐름을 먼저 완성합니다. 지도와 일정 편집은 다음
          단계에서 이어 붙입니다.
        </p>
      </div>
      <Button label="새 여행 만들기" icon="pi pi-plus" size="large" @click="goCreate" />
    </header>

    <Message v-if="tripStore.error" severity="error" :closable="false" class="state-message">
      {{ tripStore.error }}
    </Message>

    <section v-if="tripStore.loading" class="loading-state" aria-live="polite">
      <ProgressSpinner aria-label="여행 목록 불러오는 중" />
      <span>여행 목록을 불러오는 중입니다.</span>
    </section>

    <section v-else-if="!tripStore.hasTrips" class="empty-state">
      <div class="empty-icon">+</div>
      <h2>아직 만든 여행이 없습니다.</h2>
      <p>제목, 기간, 지역, 테마만 먼저 정하고 다음 단계에서 장소와 경로를 채워보세요.</p>
      <Button label="첫 여행 만들기" icon="pi pi-plus" @click="goCreate" />
    </section>

    <template v-else>
      <section class="trip-section">
        <div class="section-title">
          <div>
            <h2>새 여행 준비</h2>
            <p>아직 계획 중인 여행입니다.</p>
          </div>
          <span>{{ planningTrips.length }}개</span>
        </div>

        <div class="trip-grid">
          <button class="new-trip-card" type="button" @click="goCreate">
            <span class="new-plus">+</span>
            <strong>새 여행 추가</strong>
            <small>장소 탐색과 경로 만들기는 다음 Sprint에서 연결합니다.</small>
          </button>

          <article
            v-for="trip in planningTrips"
            :key="trip.id"
            class="trip-card"
            :style="{ '--card-accent': accentFor(trip.region) }"
          >
            <div class="story-lines" aria-hidden="true"><span /><span /><span /></div>
            <Tag :value="statusLabel(trip.status)" :severity="statusSeverity(trip.status)" />
            <div class="trip-card-copy">
              <span>{{ trip.region }}</span>
              <h3>{{ trip.title }}</h3>
              <p>{{ formatTripDateRange(trip) }}</p>
              <div class="trip-meta">
                <em>{{ tripDurationDays(trip) }}일</em>
                <em>{{ trip.theme }}</em>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section v-if="pastTrips.length" class="trip-section">
        <div class="section-title">
          <div>
            <h2>지난 여행</h2>
            <p>다녀온 여행은 기록 카드로 이어질 예정입니다.</p>
          </div>
          <span>{{ pastTrips.length }}개</span>
        </div>

        <div class="trip-grid">
          <article
            v-for="trip in pastTrips"
            :key="trip.id"
            class="trip-card past"
            :style="{ '--card-accent': accentFor(trip.region) }"
          >
            <div class="story-lines" aria-hidden="true"><span /><span /><span /></div>
            <Tag :value="statusLabel(trip.status)" :severity="statusSeverity(trip.status)" />
            <div class="trip-card-copy">
              <span>{{ trip.region }}</span>
              <h3>{{ trip.title }}</h3>
              <p>{{ formatTripDateRange(trip) }}</p>
              <div class="trip-meta">
                <em>{{ tripDurationDays(trip) }}일</em>
                <em>{{ trip.theme }}</em>
              </div>
            </div>
          </article>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.trip-page {
  min-height: 100vh;
  padding: 32px clamp(18px, 4vw, 56px) 56px;
  background:
    linear-gradient(135deg, rgba(46, 143, 107, 0.12), transparent 34%),
    linear-gradient(315deg, rgba(49, 130, 246, 0.10), transparent 38%),
    #f6f8fb;
  color: #151d25;
}

.trip-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-end;
  margin-bottom: 28px;
}

.eyebrow {
  display: inline-flex;
  margin-bottom: 10px;
  color: #2e8f6b;
  font-size: 13px;
  font-weight: 900;
}

.trip-hero h1 {
  max-width: 720px;
  margin: 0;
  font-size: clamp(38px, 7vw, 74px);
  line-height: 0.98;
  letter-spacing: 0;
}

.trip-hero p {
  max-width: 720px;
  margin: 18px 0 0;
  color: #4e5968;
  font-size: 16px;
  line-height: 1.65;
  font-weight: 650;
}

.state-message {
  margin-bottom: 18px;
}

.loading-state,
.empty-state {
  min-height: 360px;
  border: 1px solid #e5e8ef;
  border-radius: 28px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
  text-align: center;
}

.loading-state span,
.empty-state p {
  color: #687586;
  font-weight: 700;
}

.empty-icon,
.new-plus {
  width: 58px;
  height: 58px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  color: #fff;
  background: #2e8f6b;
  font-size: 32px;
  font-weight: 950;
}

.empty-state h2 {
  margin: 0;
  font-size: 28px;
}

.trip-section {
  display: grid;
  gap: 12px;
  margin-top: 28px;
}

.section-title {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px;
}

.section-title h2 {
  margin: 0;
  font-size: 24px;
}

.section-title p {
  margin: 5px 0 0;
  color: #687586;
  font-size: 13px;
  font-weight: 750;
}

.section-title span {
  min-height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.74);
  border: 1px solid #e5e8ef;
  color: #687586;
  font-size: 12px;
  font-weight: 900;
}

.trip-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 16px;
}

.trip-card,
.new-trip-card {
  min-height: 360px;
  border-radius: 28px;
  overflow: hidden;
  position: relative;
  text-align: left;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.14);
}

.new-trip-card {
  padding: 22px;
  border: 1px dashed rgba(49, 130, 246, 0.42);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background:
    linear-gradient(135deg, rgba(49, 130, 246, 0.14), transparent 42%),
    linear-gradient(315deg, rgba(139, 92, 246, 0.14), transparent 38%),
    #fff;
  color: #151d25;
  cursor: pointer;
}

.new-trip-card strong {
  display: block;
  font-size: 28px;
  line-height: 1.1;
}

.new-trip-card small {
  display: block;
  margin-top: 10px;
  color: #687586;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.55;
}

.trip-card {
  padding: 18px;
  color: #fff;
  background: var(--card-accent);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.trip-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(0deg, rgba(9, 16, 22, 0.82), rgba(9, 16, 22, 0.08) 62%),
    linear-gradient(115deg, rgba(255, 255, 255, 0.18), transparent 34%);
}

.trip-card :deep(.p-tag),
.trip-card-copy,
.story-lines {
  position: relative;
  z-index: 1;
}

.story-lines {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin-bottom: 16px;
}

.story-lines span {
  height: 3px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.76);
}

.trip-card-copy {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 18px;
}

.trip-card-copy span {
  display: inline-flex;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  align-items: center;
  background: rgba(255, 255, 255, 0.18);
  font-size: 12px;
  font-weight: 900;
  backdrop-filter: blur(10px);
}

.trip-card-copy h3 {
  margin: 18px 0 0;
  font-size: 26px;
  line-height: 1.05;
}

.trip-card-copy p {
  margin: 8px 0 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  line-height: 1.5;
}

.trip-meta {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.trip-meta em {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.82);
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
  backdrop-filter: blur(10px);
}

@media (max-width: 1120px) {
  .trip-grid {
    grid-template-columns: repeat(2, minmax(170px, 1fr));
  }
}

@media (max-width: 720px) {
  .trip-page {
    padding: 18px 14px 36px;
  }

  .trip-hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .trip-grid {
    grid-template-columns: 1fr;
  }

  .trip-card,
  .new-trip-card {
    min-height: 300px;
  }
}
</style>
