<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import { useTripStore } from '@/stores/trip'
import {
  REGION_OPTIONS,
  THEME_OPTIONS,
  createDefaultTripForm,
  toDateOnly,
  toTripPayload,
  validateTripForm,
} from '@/utils/tripForm'

const router = useRouter()
const tripStore = useTripStore()

const form = reactive(createDefaultTripForm())
const errors = ref({})
const submitError = ref('')

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

const previewNights = computed(() => {
  if (!form.startDate || !form.endDate || form.startDate > form.endDate) return '기간을 선택해주세요'
  const start = new Date(`${form.startDate}T00:00:00`)
  const end = new Date(`${form.endDate}T00:00:00`)
  const days = Math.round((end - start) / 86400000) + 1
  return `${days}일 여행`
})

async function submit() {
  errors.value = validateTripForm(form)
  submitError.value = ''
  tripStore.clearError()

  if (Object.keys(errors.value).length > 0) return

  try {
    const created = await tripStore.createTrip(toTripPayload(form))
    await router.push({ name: 'trip-place-search', params: { tripId: created.id } })
  } catch {
    submitError.value = tripStore.error || '여행을 생성하지 못했습니다.'
  }
}

function cancel() {
  router.push({ name: 'trip-list' })
}

function toDate(dateOnly) {
  return dateOnly ? new Date(`${dateOnly}T00:00:00`) : null
}
</script>

<template>
  <main class="create-page">
    <section class="create-shell">
      <aside class="create-preview">
        <span class="eyebrow">New Trip</span>
        <h1>{{ form.title || '새 여행 만들기' }}</h1>
        <p>{{ form.region }} · {{ form.theme }} · {{ previewNights }}</p>
        <div class="mock-card">
          <span>{{ form.region }}</span>
          <strong>{{ form.title || '여행 제목을 입력하면 카드에 표시됩니다' }}</strong>
          <small>{{ form.startDate }} - {{ form.endDate }}</small>
        </div>
      </aside>

      <form class="trip-form" @submit.prevent="submit">
        <div class="form-head">
          <span class="eyebrow">Trip CRUD</span>
          <h2>여행 기본 정보를 입력해주세요.</h2>
          <p>장소 탐색과 지도 경로 편집은 다음 단계에서 연결됩니다.</p>
        </div>

        <Message v-if="submitError" severity="error" :closable="false">
          {{ submitError }}
        </Message>

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

        <div class="form-actions">
          <Button
            type="button"
            label="취소"
            severity="secondary"
            outlined
            :disabled="tripStore.creating"
            @click="cancel"
          />
          <Button
            type="submit"
            label="생성하기"
            icon="pi pi-check"
            :loading="tripStore.creating"
          />
        </div>
      </form>
    </section>
  </main>
</template>

<style scoped>
.create-page {
  min-height: 100vh;
  padding: 32px clamp(18px, 4vw, 56px);
  background:
    linear-gradient(135deg, rgba(46, 143, 107, 0.12), transparent 34%),
    linear-gradient(315deg, rgba(49, 130, 246, 0.10), transparent 38%),
    #f6f8fb;
  color: #151d25;
}

.create-shell {
  min-height: calc(100vh - 64px);
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(360px, 1.05fr);
  gap: 22px;
  align-items: stretch;
}

.create-preview,
.trip-form {
  border: 1px solid #e5e8ef;
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.10);
}

.create-preview {
  padding: clamp(24px, 4vw, 42px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  position: relative;
}

.create-preview::before {
  content: '';
  position: absolute;
  inset: auto -12% -18% 22%;
  height: 58%;
  border-radius: 999px;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.34), transparent 22%),
    linear-gradient(135deg, #6fb292, #3d6fb6 54%, #edbf53);
  opacity: 0.88;
  transform: rotate(-11deg);
}

.eyebrow {
  display: inline-flex;
  margin-bottom: 10px;
  color: #2e8f6b;
  font-size: 13px;
  font-weight: 900;
}

.create-preview h1 {
  max-width: 520px;
  margin: 0;
  font-size: clamp(42px, 7vw, 84px);
  line-height: 0.95;
  letter-spacing: 0;
}

.create-preview p {
  margin: 18px 0 0;
  color: #4e5968;
  font-size: 16px;
  font-weight: 750;
}

.mock-card {
  position: relative;
  z-index: 1;
  min-height: 240px;
  padding: 22px;
  border-radius: 28px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  color: #fff;
  background:
    linear-gradient(0deg, rgba(9, 16, 22, 0.82), rgba(9, 16, 22, 0.08) 62%),
    linear-gradient(135deg, #d66c55, #57495f 54%, #edbf53);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
}

.mock-card span {
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

.mock-card strong {
  margin-top: 16px;
  font-size: 28px;
  line-height: 1.08;
}

.mock-card small {
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  font-weight: 800;
}

.trip-form {
  padding: clamp(22px, 4vw, 40px);
  display: grid;
  align-content: center;
  gap: 18px;
}

.form-head h2 {
  max-width: 520px;
  margin: 0;
  font-size: clamp(30px, 4vw, 48px);
  line-height: 1.02;
}

.form-head p {
  margin: 12px 0 0;
  color: #687586;
  font-weight: 700;
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

@media (max-width: 900px) {
  .create-shell {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .create-page {
    padding: 14px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: column-reverse;
  }
}
</style>
