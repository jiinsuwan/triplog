<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Select from 'primevue/select'

import { AppTopBar, BaseButton, BaseModal, TripStamp, TripTicket } from '@/components/common'
import { useTripStore } from '@/stores/trip'
import {
  REGION_OPTIONS,
  STATUS_OPTIONS,
  THEME_OPTIONS,
  createTripFormFromTrip,
  formatTripDateRange,
  toDateOnly,
  toTripPayload,
  tripDurationDays,
  validateTripForm,
} from '@/utils/tripForm'
import { TRIP_STATUS, isPastTripStatus, normalizeTripStatus, tripStatusLabel } from '@/utils/tripStatus'

const route = useRoute()
const router = useRouter()
const tripStore = useTripStore()

const tripId = computed(() => Number(route.params.tripId))
const isEditing = ref(false)
const deleteDialogOpen = ref(false)
const submitError = ref('')
const errors = ref({})
const form = reactive(createTripFormFromTrip())

const trip = computed(() => tripStore.selectedTrip)
const status = computed(() => normalizeTripStatus(trip.value?.status ?? form.status))
const statusMeta = computed(() => ({
  label: tripStatusLabel(status.value),
  className: statusBadgeClass(status.value),
}))
const workspaceAction = computed(() =>
  isPastTripStatus(status.value)
    ? {
        label: '추억 만들러 가기',
        routeName: 'trip-record-workspace',
      }
    : {
        label: '장소 담으러 가기',
        routeName: 'trip-place-search',
      },
)

const startDateModel = computed({
  get: () => toDate(form.startDate),
  set: (value) => {
    form.startDate = value ? toDateOnly(value) : ''
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      form.endDate = form.startDate
    }
  },
})

const endDateModel = computed({
  get: () => toDate(form.endDate),
  set: (value) => {
    form.endDate = value ? toDateOnly(value) : ''
  },
})

onMounted(() => {
  loadTrip()
})

watch(tripId, (nextId, previousId) => {
  if (nextId && nextId !== previousId) {
    isEditing.value = false
    submitError.value = ''
    errors.value = {}
    loadTrip()
  }
})

watch(
  () => trip.value,
  (nextTrip) => {
    if (nextTrip) {
      fillForm(nextTrip)
    }
  },
  { immediate: true },
)

async function loadTrip() {
  if (!tripId.value) return
  try {
    await tripStore.fetchTripDetail(tripId.value)
  } catch {
    // 화면의 Message 가 store error 를 표시한다.
  }
}

async function save() {
  errors.value = validateTripForm(form)
  submitError.value = ''
  tripStore.clearError()

  if (Object.keys(errors.value).length > 0) return

  try {
    await tripStore.updateTrip(tripId.value, toTripPayload(form))
    isEditing.value = false
  } catch {
    submitError.value = tripStore.error || '여행을 수정하지 못했습니다.'
  }
}

async function confirmDelete() {
  try {
    await tripStore.deleteTrip(tripId.value)
    deleteDialogOpen.value = false
    await router.push({ name: 'trip-list' })
  } catch {
    submitError.value = tripStore.error || '여행을 삭제하지 못했습니다.'
  }
}

function startEdit() {
  if (trip.value) {
    fillForm(trip.value)
  }
  submitError.value = ''
  errors.value = {}
  isEditing.value = true
}

function cancelEdit() {
  if (trip.value) {
    fillForm(trip.value)
  }
  submitError.value = ''
  errors.value = {}
  isEditing.value = false
}

function goList() {
  router.push({ name: 'trip-list' })
}

function goWorkspace() {
  router.push({
    name: workspaceAction.value.routeName,
    params: { tripId: tripId.value },
  })
}

function fillForm(sourceTrip) {
  Object.assign(form, createTripFormFromTrip(sourceTrip))
}

function toDate(dateOnly) {
  return dateOnly ? new Date(`${dateOnly}T00:00:00`) : null
}

function statusBadgeClass(value) {
  if (normalizeTripStatus(value) === TRIP_STATUS.PAST) return 'past'
  if (normalizeTripStatus(value) === TRIP_STATUS.UPCOMING) return 'upcoming'
  return 'plan'
}

function ticketColor(value) {
  if (isPastTripStatus(value.status)) return 'terra'
  if (normalizeTripStatus(value.status) === TRIP_STATUS.UPCOMING) return 'blue'
  return 'mustard'
}

function ticketTags(value) {
  return [value.theme].filter(Boolean)
}

function ticketSerial(value) {
  const source = value.startDate || value.createdAt || `${value.id}`
  return `TL-${String(source).replace(/\D/g, '').slice(0, 8) || value.id}`
}
</script>

<template>
  <div class="detail-page">
    <AppTopBar active="trips" :show-search="false">
      <template #actions>
        <BaseButton variant="ghost" @click="goList">목록</BaseButton>
      </template>
    </AppTopBar>

    <main class="detail-main">
      <section v-if="tripStore.detailLoading" class="loading-state" aria-live="polite">
        <ProgressSpinner aria-label="여행 상세 불러오는 중" />
        <span>여행 상세 정보를 불러오는 중입니다.</span>
      </section>

      <Message v-else-if="tripStore.error && !trip" severity="error" :closable="false">
        {{ tripStore.error }}
      </Message>

      <section v-else-if="trip" class="detail-shell">
        <aside class="summary-panel">
          <div>
            <span class="badge" :class="statusMeta.className">{{ statusMeta.label }}</span>
            <h1>{{ trip.title }}</h1>
            <p>{{ trip.region }} · {{ trip.theme }} · {{ tripDurationDays(trip) }}일</p>
          </div>

          <div class="summary-ticket">
            <TripTicket
              :title="trip.title"
              :region="trip.region"
              :dates="`${formatTripDateRange(trip)} · ${tripDurationDays(trip)}일`"
              :serial="ticketSerial(trip)"
              :status="statusMeta.label"
              :color="ticketColor(trip)"
              :tags="ticketTags(trip)"
              :stamp-title="trip.region"
              :torn="isPastTripStatus(trip.status)"
            />
          </div>

          <button
            v-if="isPastTripStatus(trip.status)"
            class="stamp-action"
            type="button"
            @click="goWorkspace"
          >
            <TripStamp :title="trip.region" :stage="2" />
            <span class="tag-hand">눌러 추억 만들기</span>
          </button>
        </aside>

        <section class="panel detail-panel">
          <div class="panel-head">
            <div>
              <span class="panel-eyebrow">여행 정보</span>
              <h2>{{ isEditing ? '여행 정보 편집' : '여행 개요' }}</h2>
            </div>
            <span class="id-chip">ID {{ trip.id }}</span>
          </div>

          <Message v-if="submitError" severity="error" :closable="false">
            {{ submitError }}
          </Message>

          <template v-if="!isEditing">
            <div class="info-grid">
              <dl>
                <dt>여행 제목</dt>
                <dd>{{ trip.title }}</dd>
              </dl>
              <dl>
                <dt>기간</dt>
                <dd>{{ formatTripDateRange(trip) }}</dd>
              </dl>
              <dl>
                <dt>지역</dt>
                <dd>{{ trip.region }}</dd>
              </dl>
              <dl>
                <dt>테마</dt>
                <dd>{{ trip.theme }}</dd>
              </dl>
              <dl>
                <dt>상태</dt>
                <dd>{{ statusMeta.label }}</dd>
              </dl>
              <dl>
                <dt>생성일</dt>
                <dd>{{ trip.createdAt?.replace('T', ' ') ?? '확인 불가' }}</dd>
              </dl>
            </div>

            <div class="detail-actions">
              <BaseButton variant="ghost" @click="startEdit">정보 수정</BaseButton>
              <BaseButton variant="danger" :disabled="tripStore.deleting" @click="deleteDialogOpen = true">
                삭제
              </BaseButton>
              <BaseButton variant="primary" @click="goWorkspace">
                {{ workspaceAction.label }}
              </BaseButton>
            </div>
          </template>

          <form v-else class="trip-form" @submit.prevent="save">
            <label class="field" for="title">
              <span>여행 제목</span>
              <InputText
                id="title"
                v-model="form.title"
                placeholder="예: 전주 새 일정"
                :invalid="!!errors.title"
                fluid
              />
              <small v-if="errors.title">{{ errors.title }}</small>
            </label>

            <div class="form-grid">
              <label class="field" for="startDate">
                <span>시작일</span>
                <DatePicker
                  id="startDate"
                  v-model="startDateModel"
                  date-format="yy-mm-dd"
                  show-icon
                  fluid
                  :invalid="!!errors.startDate"
                />
                <small v-if="errors.startDate">{{ errors.startDate }}</small>
              </label>

              <label class="field" for="endDate">
                <span>종료일</span>
                <DatePicker
                  id="endDate"
                  v-model="endDateModel"
                  date-format="yy-mm-dd"
                  show-icon
                  fluid
                  :invalid="!!errors.endDate"
                />
                <small v-if="errors.endDate">{{ errors.endDate }}</small>
              </label>
            </div>

            <div class="form-grid">
              <label class="field" for="region">
                <span>지역</span>
                <Select
                  id="region"
                  v-model="form.region"
                  :options="REGION_OPTIONS"
                  option-label="label"
                  option-value="value"
                  placeholder="지역 선택"
                  fluid
                  :invalid="!!errors.region"
                />
                <small v-if="errors.region">{{ errors.region }}</small>
              </label>

              <label class="field" for="theme">
                <span>테마</span>
                <Select
                  id="theme"
                  v-model="form.theme"
                  :options="THEME_OPTIONS"
                  option-label="label"
                  option-value="value"
                  placeholder="테마 선택"
                  fluid
                  :invalid="!!errors.theme"
                />
                <small v-if="errors.theme">{{ errors.theme }}</small>
              </label>
            </div>

            <label class="field" for="status">
              <span>상태</span>
              <Select
                id="status"
                v-model="form.status"
                :options="STATUS_OPTIONS"
                option-label="label"
                option-value="value"
                fluid
                :invalid="!!errors.status"
              />
              <small v-if="errors.status">{{ errors.status }}</small>
            </label>

            <div class="detail-actions">
              <BaseButton type="button" variant="ghost" :disabled="tripStore.updating" @click="cancelEdit">
                취소
              </BaseButton>
              <BaseButton type="submit" variant="primary" :disabled="tripStore.updating">
                {{ tripStore.updating ? '저장 중' : '변경 사항 저장' }}
              </BaseButton>
            </div>
          </form>
        </section>
      </section>
    </main>

    <BaseModal v-model="deleteDialogOpen" title="여행 삭제">
      <p class="delete-copy">
        <strong>{{ trip?.title }}</strong> 여행을 삭제할까요? 삭제 후에는 목록에서 사라집니다.
      </p>
      <template #footer>
        <BaseButton variant="ghost" :disabled="tripStore.deleting" @click="deleteDialogOpen = false">
          취소
        </BaseButton>
        <BaseButton variant="danger" :disabled="tripStore.deleting" @click="confirmDelete">
          {{ tripStore.deleting ? '삭제 중' : '삭제' }}
        </BaseButton>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.detail-page {
  min-height: 100vh;
  --ds-surface: var(--paper);
}

.detail-main {
  margin: 0 auto;
  max-width: 1120px;
  padding: 30px 26px 80px;
  width: 100%;
}

.detail-shell {
  align-items: stretch;
  display: grid;
  gap: 22px;
  grid-template-columns: minmax(300px, 0.9fr) minmax(420px, 1.1fr);
  min-height: calc(100vh - 140px);
}

.summary-panel,
.loading-state {
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}

.summary-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  justify-content: space-between;
  overflow: hidden;
  padding: clamp(24px, 4vw, 42px);
}

.summary-panel h1 {
  font-size: clamp(36px, 5vw, 62px);
  letter-spacing: 0;
  line-height: 1.02;
  margin: 14px 0 0;
}

.summary-panel p {
  color: var(--ink-sub);
  font-size: 14px;
  font-weight: 700;
  margin: 12px 0 0;
}

.summary-ticket :deep(.ticket) {
  --ticket-w: min(416px, 100%);
}

.stamp-action {
  align-items: center;
  align-self: flex-start;
  background: transparent;
  border: 0;
  color: var(--accent);
  cursor: pointer;
  display: inline-grid;
  gap: 2px;
  justify-items: center;
  padding: 0;
}

.stamp-action :deep(.stamp-svg) {
  height: 72px;
  width: 72px;
}

.detail-panel {
  align-content: center;
  display: grid;
  gap: 18px;
}

.panel-head {
  align-items: flex-start;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.panel-eyebrow,
.id-chip {
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 800;
}

.panel-head h2 {
  font-size: clamp(28px, 4vw, 42px);
  letter-spacing: 0;
  line-height: 1.12;
  margin: 6px 0 0;
}

.id-chip {
  background: var(--paper-dim);
  border: 1px solid var(--line2);
  border-radius: 999px;
  padding: 5px 10px;
  white-space: nowrap;
}

.info-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.info-grid dl {
  background: var(--on-fill);
  border: 1px solid var(--line2);
  border-radius: var(--radius-sm);
  margin: 0;
  min-height: 92px;
  padding: 15px;
}

.info-grid dt {
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 750;
}

.info-grid dd {
  color: var(--ink);
  font-size: 17px;
  font-weight: 800;
  line-height: 1.35;
  margin: 9px 0 0;
  overflow-wrap: anywhere;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}

.trip-form {
  display: grid;
  gap: 18px;
}

.field {
  display: grid;
  gap: 7px;
  margin: 0;
}

.field span {
  color: var(--ink-sub);
  font-size: 12.5px;
  font-weight: 700;
}

.field small {
  color: var(--complete);
  font-size: 12px;
  font-weight: 700;
}

.form-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.loading-state {
  align-content: center;
  display: grid;
  gap: 14px;
  min-height: 280px;
  place-items: center;
}

.loading-state span,
.delete-copy {
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 700;
}

.delete-copy {
  line-height: 1.65;
  margin: 0;
}

@media (max-width: 920px) {
  .detail-shell,
  .info-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .detail-main {
    padding: 22px 16px 64px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .detail-actions {
    flex-direction: column-reverse;
  }

  .detail-actions .btn {
    width: 100%;
  }
}
</style>
