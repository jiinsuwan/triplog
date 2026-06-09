<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
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
const statusMeta = computed(() => {
  const status = trip.value?.status ?? form.status
  return normalizeStatus(status) === 'DONE'
    ? { label: '다녀옴', severity: 'success' }
    : { label: '계획 중', severity: 'info' }
})

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

function fillForm(sourceTrip) {
  Object.assign(form, createTripFormFromTrip(sourceTrip))
}

function normalizeStatus(status = '') {
  const upper = status.toUpperCase()
  if (['DONE', 'PAST', 'COMPLETED'].includes(upper)) return 'DONE'
  return 'PLANNING'
}

function toDate(dateOnly) {
  return dateOnly ? new Date(`${dateOnly}T00:00:00`) : null
}
</script>

<template>
  <main class="detail-page">
    <Button
      class="back-button"
      label="목록으로"
      icon="pi pi-arrow-left"
      severity="secondary"
      outlined
      @click="goList"
    />

    <section v-if="tripStore.detailLoading" class="loading-state" aria-live="polite">
      <ProgressSpinner aria-label="여행 상세 불러오는 중" />
      <span>여행 상세 정보를 불러오는 중입니다.</span>
    </section>

    <Message v-else-if="tripStore.error && !trip" severity="error" :closable="false">
      {{ tripStore.error }}
    </Message>

    <section v-else-if="trip" class="detail-shell">
      <aside class="detail-summary">
        <span class="eyebrow">Trip Detail</span>
        <Tag :value="statusMeta.label" :severity="statusMeta.severity" />
        <h1>{{ trip.title }}</h1>
        <p>{{ trip.region }} · {{ trip.theme }} · {{ tripDurationDays(trip) }}일</p>

        <div class="summary-card">
          <span>{{ trip.region }}</span>
          <strong>{{ trip.title }}</strong>
          <small>{{ formatTripDateRange(trip) }}</small>
        </div>

        <div class="summary-actions">
          <Button
            label="수정"
            icon="pi pi-pencil"
            :disabled="isEditing"
            @click="startEdit"
          />
          <Button
            label="삭제"
            icon="pi pi-trash"
            severity="danger"
            outlined
            :disabled="tripStore.deleting"
            @click="deleteDialogOpen = true"
          />
        </div>
      </aside>

      <section class="detail-panel">
        <div class="panel-head">
          <div>
            <span class="eyebrow">기본 정보</span>
            <h2>{{ isEditing ? '여행 정보를 수정합니다.' : '여행 정보를 확인합니다.' }}</h2>
          </div>
          <Tag :value="`ID ${trip.id}`" severity="secondary" />
        </div>

        <Message v-if="submitError" severity="error" :closable="false">
          {{ submitError }}
        </Message>

        <div v-if="!isEditing" class="info-grid">
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

          <div class="form-actions">
            <Button
              type="button"
              label="취소"
              severity="secondary"
              outlined
              :disabled="tripStore.updating"
              @click="cancelEdit"
            />
            <Button
              type="submit"
              label="저장"
              icon="pi pi-check"
              :loading="tripStore.updating"
            />
          </div>
        </form>
      </section>
    </section>

    <Dialog
      v-model:visible="deleteDialogOpen"
      modal
      header="여행 삭제"
      :style="{ width: 'min(420px, calc(100vw - 32px))' }"
    >
      <p class="delete-copy">
        <strong>{{ trip?.title }}</strong> 여행을 삭제할까요? 삭제 후에는 목록에서 사라집니다.
      </p>
      <template #footer>
        <Button
          label="취소"
          severity="secondary"
          outlined
          :disabled="tripStore.deleting"
          @click="deleteDialogOpen = false"
        />
        <Button
          label="삭제"
          severity="danger"
          icon="pi pi-trash"
          :loading="tripStore.deleting"
          @click="confirmDelete"
        />
      </template>
    </Dialog>
  </main>
</template>

<style scoped>
.detail-page {
  min-height: 100vh;
  padding: 28px clamp(18px, 4vw, 56px) 56px;
  background:
    linear-gradient(135deg, rgba(46, 143, 107, 0.12), transparent 34%),
    linear-gradient(315deg, rgba(49, 130, 246, 0.10), transparent 38%),
    #f6f8fb;
  color: #151d25;
}

.back-button {
  margin-bottom: 18px;
}

.detail-shell {
  min-height: calc(100vh - 120px);
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(360px, 1.1fr);
  gap: 22px;
}

.detail-summary,
.detail-panel,
.loading-state {
  border: 1px solid #e5e8ef;
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.10);
}

.detail-summary {
  padding: clamp(24px, 4vw, 42px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.eyebrow {
  display: inline-flex;
  color: #2e8f6b;
  font-size: 13px;
  font-weight: 900;
}

.detail-summary h1 {
  margin: 0;
  font-size: clamp(42px, 6vw, 78px);
  line-height: 0.96;
  letter-spacing: 0;
}

.detail-summary p {
  margin: 0;
  color: #4e5968;
  font-size: 16px;
  font-weight: 750;
}

.summary-card {
  min-height: 260px;
  margin-top: auto;
  padding: 22px;
  border-radius: 28px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  color: #fff;
  background:
    linear-gradient(0deg, rgba(9, 16, 22, 0.82), rgba(9, 16, 22, 0.08) 62%),
    linear-gradient(135deg, #d66c55, #57495f 54%, #edbf53);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.20);
}

.summary-card span {
  align-self: flex-start;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.18);
  font-size: 12px;
  font-weight: 900;
}

.summary-card strong {
  margin-top: 16px;
  font-size: 28px;
  line-height: 1.08;
}

.summary-card small {
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  font-weight: 800;
}

.summary-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-panel {
  padding: clamp(22px, 4vw, 40px);
  align-content: center;
  display: grid;
  gap: 18px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.panel-head h2 {
  margin: 8px 0 0;
  font-size: clamp(30px, 4vw, 48px);
  line-height: 1.02;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.info-grid dl {
  min-height: 108px;
  margin: 0;
  padding: 18px;
  border: 1px solid #e5e8ef;
  border-radius: 20px;
  background: #fff;
}

.info-grid dt {
  color: #687586;
  font-size: 12px;
  font-weight: 900;
}

.info-grid dd {
  margin: 10px 0 0;
  color: #151d25;
  font-size: 20px;
  font-weight: 900;
  overflow-wrap: anywhere;
}

.trip-form {
  display: grid;
  gap: 18px;
}

.field {
  display: grid;
  gap: 7px;
}

.field span {
  color: #2c3745;
  font-size: 13px;
  font-weight: 900;
}

.field small {
  color: #d64d4d;
  font-size: 12px;
  font-weight: 800;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}

.loading-state {
  min-height: 360px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  text-align: center;
}

.loading-state span,
.delete-copy {
  color: #687586;
  font-weight: 700;
}

.delete-copy {
  margin: 0;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .detail-shell,
  .info-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .detail-page {
    padding: 14px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-actions,
  .summary-actions {
    flex-direction: column-reverse;
  }
}
</style>
