<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'

import { AppTopBar, BaseButton, TripTicket } from '@/components/common'
import { useTripStore } from '@/stores/trip'
import {
  REGION_OPTIONS,
  THEME_OPTIONS,
  createDefaultTripForm,
  toDateOnly,
  toTripPayload,
  tripDurationDays,
  validateTripForm,
} from '@/utils/tripForm'

const router = useRouter()
const tripStore = useTripStore()

const form = reactive(createDefaultTripForm())
const errors = ref({})
const submitError = ref('')
const submitIntent = ref('places')

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

const previewDates = computed(() => {
  if (!form.startDate || !form.endDate || form.startDate > form.endDate) {
    return '날짜 미정'
  }
  return `${form.startDate.replaceAll('-', '.')} - ${form.endDate.replaceAll('-', '.')} · ${tripDurationDays(form)}일`
})

const previewTitle = computed(() => form.title.trim() || '여행 제목을 입력해 주세요')
const previewTags = computed(() => [form.theme].filter(Boolean))

async function submit(destination = 'places') {
  if (tripStore.creating) return
  submitIntent.value = destination
  errors.value = validateTripForm(form)
  submitError.value = ''
  tripStore.clearError()

  if (Object.keys(errors.value).length > 0) return

  try {
    const createdTrip = await tripStore.createTrip(toTripPayload(form))
    if (destination === 'places' && createdTrip?.id) {
      await router.push({ name: 'trip-place-search', params: { tripId: createdTrip.id } })
      return
    }
    await router.push({ name: 'trip-list' })
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
  <div class="create-page">
    <AppTopBar active="trips" :show-search="false">
      <template #actions>
        <BaseButton variant="ghost" @click="cancel">목록</BaseButton>
      </template>
    </AppTopBar>

    <main class="create-shell">
      <aside class="preview-panel">
        <p class="tag-hand">New trip</p>
        <h1>여행의 뼈대를 잡아요</h1>
        <p class="preview-copy">제목과 기간, 지역과 테마만 정하면 바로 장소를 담을 수 있습니다.</p>

        <div class="preview-ticket">
          <TripTicket
            :title="previewTitle"
            :region="form.region"
            :dates="previewDates"
            serial="TL-NEW"
            status="TRIP TICKET"
            color="mustard"
            :tags="previewTags"
          />
        </div>
      </aside>

      <form class="panel trip-form" @submit.prevent="submit('places')">
        <div class="form-head">
          <span>새 여행</span>
          <h2>계획을 시작할 정보를 입력해주세요.</h2>
        </div>

        <Message v-if="submitError" severity="error" :closable="false">
          {{ submitError }}
        </Message>

        <label class="field" for="title">
          <span>여행 제목</span>
          <InputText
            id="title"
            v-model="form.title"
            placeholder="예: 제주, 바람의 사흘"
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
          <BaseButton type="button" variant="ghost" :disabled="tripStore.creating" @click="cancel">
            취소
          </BaseButton>
          <BaseButton
            type="button"
            :disabled="tripStore.creating && submitIntent !== 'list'"
            @click="submit('list')"
          >
            {{ tripStore.creating && submitIntent === 'list' ? '저장 중' : '목록에 저장' }}
          </BaseButton>
          <BaseButton
            type="submit"
            variant="primary"
            :disabled="tripStore.creating && submitIntent !== 'places'"
          >
            {{ tripStore.creating && submitIntent === 'places' ? '저장 중' : '계획 시작하기' }}
          </BaseButton>
        </div>
      </form>
    </main>
  </div>
</template>

<style scoped>
.create-page {
  min-height: 100vh;
  --ds-surface: var(--paper);
}

.create-shell {
  align-items: stretch;
  display: grid;
  gap: 22px;
  grid-template-columns: minmax(300px, 0.86fr) minmax(380px, 1fr);
  margin: 0 auto;
  max-width: 1080px;
  min-height: calc(100vh - 54px);
  padding: 30px 26px 80px;
  width: 100%;
}

.preview-panel {
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  padding: clamp(24px, 4vw, 42px);
}

.preview-panel h1 {
  font-size: clamp(34px, 5vw, 58px);
  letter-spacing: 0;
  line-height: 1.04;
  margin: 2px 0 0;
  max-width: 500px;
}

.preview-copy {
  color: var(--ink-sub);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.65;
  margin: 14px 0 0;
  max-width: 420px;
}

.preview-ticket {
  margin-top: 28px;
}

.preview-ticket :deep(.ticket) {
  --ticket-w: min(416px, 100%);
}

.trip-form {
  align-content: center;
  display: grid;
  gap: 18px;
}

.form-head span {
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
}

.form-head h2 {
  font-size: clamp(26px, 4vw, 40px);
  letter-spacing: 0;
  line-height: 1.12;
  margin: 6px 0 0;
  max-width: 520px;
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

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}

@media (max-width: 900px) {
  .create-shell {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .create-shell {
    padding: 22px 16px 64px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: column-reverse;
  }

  .form-actions .btn {
    width: 100%;
  }
}
</style>
