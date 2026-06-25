<script setup>
import { computed, reactive, ref, watch } from 'vue'

import { BaseButton, BaseModal } from '@/components/common'
import { useTripStore } from '@/stores/trip'
import {
  applyTripTags,
  createTripFormFromTrip,
  parseTripTags,
  toDateOnly,
  toTripPayload,
  tripDurationDays,
  validateTripForm,
} from '@/utils/tripForm'

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

const emit = defineEmits(['update:modelValue', 'updated'])
const tripStore = useTripStore()
const isMockTrip = computed(() => !!props.trip?.mock)

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const form = reactive(createTripFormFromTrip(null))
const calendarMonth = ref(new Date())
const tagDraft = ref('')
const errors = ref({})
const submitError = ref('')

const calendarTitle = computed(() => {
  const year = calendarMonth.value.getFullYear()
  const month = calendarMonth.value.getMonth() + 1
  return `${year}년 ${month}월`
})

const calendarDays = computed(() => {
  const year = calendarMonth.value.getFullYear()
  const month = calendarMonth.value.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: firstDay }, (_, index) => ({ key: `blank-${index}` }))

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = toDateOnly(new Date(year, month, day))
    cells.push({
      key: date,
      day,
      date,
      selected: date === form.startDate || date === form.endDate,
      inRange: form.startDate && form.endDate && date > form.startDate && date < form.endDate,
      start: date === form.startDate,
      end: date === form.endDate,
    })
  }

  return cells
})

const rangeLabel = computed(() => {
  if (!form.startDate || !form.endDate) return '기간을 선택해주세요'

  const start = toShortDateLabel(form.startDate)
  const end = toShortDateLabel(form.endDate)
  return `${start} → ${end} · ${tripDurationDays(form)}일`
})

watch(
  () => [props.modelValue, props.trip?.id],
  ([isOpen]) => {
    if (isOpen) resetForm()
  },
  { immediate: true },
)

watch(
  () => form.title,
  () => clearFieldError('title'),
)

watch(
  () => form.region,
  () => clearFieldError('region'),
)

watch(
  () => form.theme,
  () => clearFieldError('theme'),
)

watch(
  () => form.startDate,
  () => {
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      form.endDate = form.startDate
    }
    syncCalendarMonth()
    clearFieldError('startDate')
  },
)

watch(
  () => form.endDate,
  () => clearFieldError('endDate'),
)

function close() {
  if (tripStore.updating) return
  emit('update:modelValue', false)
}

function resetForm() {
  Object.assign(form, createTripFormFromTrip(props.trip))
  syncCalendarMonth()
  tagDraft.value = ''
  errors.value = {}
  submitError.value = ''
  tripStore.clearError()
}

function clearFieldError(field) {
  if (errors.value[field]) {
    errors.value = { ...errors.value, [field]: '' }
  }
}

function syncCalendarMonth() {
  const dateOnly = form.startDate || toDateOnly(new Date())
  calendarMonth.value = new Date(`${dateOnly}T00:00:00`)
}

function moveCalendarMonth(offset) {
  const next = new Date(calendarMonth.value)
  next.setMonth(next.getMonth() + offset)
  calendarMonth.value = next
}

function selectDate(date) {
  if (!form.startDate || (form.startDate && form.endDate)) {
    form.startDate = date
    form.endDate = ''
    return
  }

  if (date < form.startDate) {
    form.endDate = form.startDate
    form.startDate = date
    return
  }

  form.endDate = date
}

function toShortDateLabel(value) {
  const date = new Date(`${value}T00:00:00`)
  const weekday = WEEKDAYS[date.getDay()]
  return `${date.getMonth() + 1}.${date.getDate()} ${weekday}`
}

function commitTags() {
  const nextTags = parseTripTags(tagDraft.value)
  if (!nextTags.length) {
    tagDraft.value = ''
    return
  }

  const existing = new Set(form.tags)
  form.tags = [...form.tags, ...nextTags.filter((tag) => !existing.has(tag))]
  tagDraft.value = ''
}

function removeTag(tag) {
  form.tags = form.tags.filter((item) => item !== tag)
}

function handleTagKeydown(event) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    commitTags()
    return
  }

  if (event.key === 'Backspace' && !tagDraft.value && form.tags.length) {
    form.tags = form.tags.slice(0, -1)
  }
}

async function submit() {
  if (!props.trip?.id || tripStore.updating) return
  commitTags()
  submitError.value = ''
  tripStore.clearError()
  errors.value = validateTripForm(form)

  if (Object.values(errors.value).some(Boolean)) return

  try {
    const payload = toTripPayload(form)
    const updated = isMockTrip.value
      ? applyTripTags(
          {
            ...props.trip,
            ...payload,
            id: props.trip.id,
            mock: true,
            itinerary: props.trip.itinerary,
            updatedAt: new Date().toISOString(),
          },
          form.tags,
        )
      : applyTripTags(await tripStore.updateTrip(props.trip.id, payload), form.tags)
    emit('updated', updated)
    emit('update:modelValue', false)
  } catch {
    submitError.value = tripStore.error || '여행 정보를 수정하지 못했습니다.'
  }
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    title="여행 정보 편집"
    hide-header
    width="min(560px, 92vw)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="trip-info-edit" data-testid="trip-info-edit-dialog" @submit.prevent="submit">
      <header class="trip-info-edit__head">
        <div>
          <p>정보 수정</p>
          <h2>여행 정보 편집</h2>
        </div>
        <button type="button" aria-label="닫기" @click="close">×</button>
      </header>

      <div class="trip-info-edit__body">
        <div v-if="submitError" class="trip-info-edit__error" role="alert">
          {{ submitError }}
        </div>

        <label class="trip-info-edit__field" for="trip-edit-title">
          <span>여행 제목</span>
          <input
            id="trip-edit-title"
            v-model="form.title"
            type="text"
            autocomplete="off"
            data-testid="trip-edit-title"
          />
          <small v-if="errors.title">{{ errors.title }}</small>
        </label>

        <section class="trip-info-edit__period" aria-labelledby="trip-edit-period-title">
          <div class="trip-info-edit__period-head">
            <span id="trip-edit-period-title">기간</span>
            <strong>{{ rangeLabel }}</strong>
          </div>

          <div class="trip-info-edit__calendar" data-testid="trip-edit-calendar">
            <div class="trip-info-edit__calendar-nav">
              <button type="button" aria-label="이전 달" @click="moveCalendarMonth(-1)">‹</button>
              <strong>{{ calendarTitle }}</strong>
              <button type="button" aria-label="다음 달" @click="moveCalendarMonth(1)">›</button>
            </div>
            <div class="trip-info-edit__weekdays" aria-hidden="true">
              <span v-for="weekday in WEEKDAYS" :key="weekday">{{ weekday }}</span>
            </div>
            <div class="trip-info-edit__days">
              <template v-for="cell in calendarDays" :key="cell.key">
                <span v-if="!cell.date" aria-hidden="true"></span>
                <button
                  v-else
                  type="button"
                  :class="{
                    selected: cell.selected,
                    'in-range': cell.inRange,
                    start: cell.start,
                    end: cell.end,
                  }"
                  @click="selectDate(cell.date)"
                >
                  {{ cell.day }}
                </button>
              </template>
            </div>
          </div>
          <small v-if="errors.startDate">{{ errors.startDate }}</small>
          <small v-if="errors.endDate">{{ errors.endDate }}</small>
        </section>

        <div class="trip-info-edit__grid">
          <label class="trip-info-edit__field" for="trip-edit-region">
            <span>지역</span>
            <input
              id="trip-edit-region"
              v-model="form.region"
              type="text"
              autocomplete="off"
              data-testid="trip-edit-region"
            />
            <small v-if="errors.region">{{ errors.region }}</small>
          </label>

          <label class="trip-info-edit__field" for="trip-edit-theme">
            <span>테마</span>
            <input
              id="trip-edit-theme"
              v-model="form.theme"
              type="text"
              autocomplete="off"
              data-testid="trip-edit-theme"
            />
            <small v-if="errors.theme">{{ errors.theme }}</small>
          </label>
        </div>

        <label class="trip-info-edit__field" for="trip-edit-tags">
          <span>해시태그</span>
          <div class="trip-info-edit__tags">
            <button v-for="tag in form.tags" :key="tag" type="button" @click="removeTag(tag)">
              {{ tag }}
              <span aria-hidden="true">×</span>
            </button>
            <input
              id="trip-edit-tags"
              v-model="tagDraft"
              type="text"
              placeholder="입력 후 Enter..."
              autocomplete="off"
              data-testid="trip-edit-tags"
              @keydown="handleTagKeydown"
              @blur="commitTags"
            />
          </div>
        </label>
      </div>

      <footer class="trip-info-edit__actions">
        <BaseButton variant="ghost" type="button" :disabled="tripStore.updating" @click="close">
          취소
        </BaseButton>
        <BaseButton variant="primary" type="submit" :disabled="tripStore.updating" data-testid="trip-edit-submit">
          {{ tripStore.updating ? '저장 중' : '변경 사항 저장' }}
        </BaseButton>
      </footer>
    </form>
  </BaseModal>
</template>

<style scoped>
.trip-info-edit {
  display: grid;
  margin: -18px;
}

.trip-info-edit__head {
  align-items: center;
  border-bottom: 1px solid var(--line2);
  display: flex;
  justify-content: space-between;
  padding: 18px 22px 16px;
}

.trip-info-edit__head p {
  color: var(--accent);
  font-size: 12px;
  font-weight: 900;
  margin: 0 0 4px;
}

.trip-info-edit__head h2 {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0;
  margin: 0;
}

.trip-info-edit__head button {
  background: none;
  border: 0;
  color: var(--ink-faint);
  cursor: pointer;
  font: inherit;
  font-size: 30px;
  line-height: 1;
}

.trip-info-edit__body {
  display: grid;
  gap: 16px;
  padding: 22px;
}

.trip-info-edit__grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.trip-info-edit__field {
  display: grid;
  gap: 8px;
}

.trip-info-edit__field span,
.trip-info-edit__period-head span {
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 900;
}

.trip-info-edit__field input {
  background: var(--on-fill);
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--ink);
  font: inherit;
  min-height: 48px;
  padding: 0 12px;
}

.trip-info-edit__field input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(194, 105, 63, 0.16);
  outline: none;
}

.trip-info-edit__field small,
.trip-info-edit__period small,
.trip-info-edit__error {
  color: var(--complete);
  font-size: 12px;
  font-weight: 800;
}

.trip-info-edit__error {
  background: #fff1eb;
  border: 1px solid #e3b3a0;
  border-radius: 10px;
  padding: 10px 12px;
}

.trip-info-edit__period {
  display: grid;
  gap: 9px;
}

.trip-info-edit__period-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.trip-info-edit__period-head strong {
  color: var(--ink);
  font-size: 13px;
}

.trip-info-edit__calendar {
  background: var(--on-fill);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 13px 14px 15px;
}

.trip-info-edit__calendar-nav {
  align-items: center;
  display: grid;
  grid-template-columns: 32px 1fr 32px;
  margin-bottom: 10px;
  text-align: center;
}

.trip-info-edit__calendar-nav button,
.trip-info-edit__days button {
  background: none;
  border: 0;
  color: var(--ink-sub);
  cursor: pointer;
  font: inherit;
}

.trip-info-edit__calendar-nav strong {
  color: var(--ink);
  font-size: 15px;
}

.trip-info-edit__weekdays,
.trip-info-edit__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  text-align: center;
}

.trip-info-edit__weekdays {
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 6px;
}

.trip-info-edit__weekdays span:first-child {
  color: var(--accent);
}

.trip-info-edit__days button,
.trip-info-edit__days span {
  align-items: center;
  display: flex;
  height: 34px;
  justify-content: center;
}

.trip-info-edit__days button {
  border-radius: 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
}

.trip-info-edit__days button:hover {
  background: var(--paper);
}

.trip-info-edit__days button.in-range {
  background: #f4eadc;
}

.trip-info-edit__days button.selected {
  background: var(--accent);
  color: #fffdf8;
}

.trip-info-edit__days button.start {
  border-radius: 9px 0 0 9px;
}

.trip-info-edit__days button.end {
  border-radius: 0 9px 9px 0;
}

.trip-info-edit__days button.start.end {
  border-radius: 9px;
}

.trip-info-edit__tags {
  align-items: center;
  background: var(--on-fill);
  border: 1px solid var(--line);
  border-radius: 9px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 48px;
  padding: 7px 11px;
}

.trip-info-edit__tags:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(194, 105, 63, 0.16);
}

.trip-info-edit__tags button {
  background: #f7eee4;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--accent);
  cursor: pointer;
  font-family: var(--font-hand);
  font-size: 16px;
  padding: 2px 9px;
}

.trip-info-edit__tags button span {
  color: var(--ink-faint);
  margin-left: 4px;
}

.trip-info-edit__tags input {
  border: 0;
  box-shadow: none;
  flex: 1 1 180px;
  min-height: 30px;
  padding: 0;
}

.trip-info-edit__tags input:focus {
  box-shadow: none;
}

.trip-info-edit__actions {
  align-items: center;
  border-top: 1px solid var(--line2);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px 22px;
}

@media (max-width: 620px) {
  .trip-info-edit__grid {
    grid-template-columns: 1fr;
  }

  .trip-info-edit__actions {
    align-items: stretch;
    flex-direction: column-reverse;
  }
}
</style>
