<script setup>
import { computed, reactive, ref, watch } from 'vue'

import { BaseButton, BaseModal } from '@/components/common'
import { useTripStore } from '@/stores/trip'
import {
  createDefaultTripForm,
  applyTripTags,
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
})

const emit = defineEmits(['update:modelValue', 'created'])
const tripStore = useTripStore()

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const form = reactive(createDefaultTripForm())
const calendarMonth = ref(new Date(`${form.startDate}T00:00:00`))
const tagDraft = ref('')
const errors = ref({})
const submitError = ref('')
const submitIntent = ref('')

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

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) resetForm()
  },
)

function close() {
  if (tripStore.creating) return
  emit('update:modelValue', false)
}

function handleModalUpdate(value) {
  if (value === false && tripStore.creating) return
  emit('update:modelValue', value)
}

function resetForm() {
  Object.assign(form, createDefaultTripForm())
  calendarMonth.value = new Date(`${form.startDate}T00:00:00`)
  tagDraft.value = ''
  errors.value = {}
  submitError.value = ''
  submitIntent.value = ''
  tripStore.clearError()
}

function clearFieldError(field) {
  if (errors.value[field]) {
    errors.value = { ...errors.value, [field]: '' }
  }
}

function syncCalendarMonth() {
  if (!form.startDate) return
  const selected = new Date(`${form.startDate}T00:00:00`)
  if (
    selected.getFullYear() !== calendarMonth.value.getFullYear() ||
    selected.getMonth() !== calendarMonth.value.getMonth()
  ) {
    calendarMonth.value = selected
  }
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

async function submit(destination) {
  if (tripStore.creating) return
  commitTags()
  submitIntent.value = destination
  submitError.value = ''
  tripStore.clearError()
  errors.value = validateTripForm(form)

  if (Object.values(errors.value).some(Boolean)) return

  try {
    const created = applyTripTags(await tripStore.createTrip(toTripPayload(form)), form.tags)
    emit('created', { trip: created, destination })
    emit('update:modelValue', false)
    resetForm()
  } catch {
    submitError.value = tripStore.error || '여행을 생성하지 못했습니다.'
  }
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    title="여행의 뼈대를 잡아요"
    @update:model-value="handleModalUpdate"
  >
    <form class="trip-create-dialog" data-testid="trip-create-dialog" @submit.prevent="submit('places')">
      <p class="trip-create-dialog__eyebrow">새 여행</p>

      <div v-if="submitError" class="trip-create-dialog__error" role="alert">
        {{ submitError }}
      </div>

      <label class="trip-create-dialog__field" for="trip-create-title">
        <span>여행 제목</span>
        <input
          id="trip-create-title"
          v-model="form.title"
          type="text"
          placeholder="예: 제주, 바람의 사흘"
          autocomplete="off"
          data-testid="trip-create-title"
        />
        <small v-if="errors.title">{{ errors.title }}</small>
      </label>

      <section class="trip-create-dialog__period" aria-labelledby="trip-create-period-title">
        <div class="trip-create-dialog__period-head">
          <span id="trip-create-period-title">기간</span>
          <strong>{{ rangeLabel }}</strong>
        </div>

        <div class="trip-create-dialog__calendar" data-testid="trip-create-calendar">
          <div class="trip-create-dialog__calendar-nav">
            <button type="button" aria-label="이전 달" @click="moveCalendarMonth(-1)">‹</button>
            <strong>{{ calendarTitle }}</strong>
            <button type="button" aria-label="다음 달" @click="moveCalendarMonth(1)">›</button>
          </div>
          <div class="trip-create-dialog__weekdays" aria-hidden="true">
            <span v-for="weekday in WEEKDAYS" :key="weekday">{{ weekday }}</span>
          </div>
          <div class="trip-create-dialog__days">
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

      <div class="trip-create-dialog__grid">
        <label class="trip-create-dialog__field" for="trip-create-region">
          <span>지역</span>
          <input
            id="trip-create-region"
            v-model="form.region"
            type="text"
            placeholder="예: 제주"
            autocomplete="off"
            data-testid="trip-create-region"
          />
          <small v-if="errors.region">{{ errors.region }}</small>
        </label>

        <label class="trip-create-dialog__field" for="trip-create-theme">
          <span>테마</span>
          <input
            id="trip-create-theme"
            v-model="form.theme"
            type="text"
            placeholder="예: 바다, 힐링"
            autocomplete="off"
            data-testid="trip-create-theme"
          />
          <small v-if="errors.theme">{{ errors.theme }}</small>
        </label>
      </div>

      <label class="trip-create-dialog__field" for="trip-create-tags">
        <span>해시태그 <em>선택</em></span>
        <div class="trip-create-dialog__tags">
          <button v-for="tag in form.tags" :key="tag" type="button" @click="removeTag(tag)">
            {{ tag }}
            <span aria-hidden="true">×</span>
          </button>
          <input
            id="trip-create-tags"
            v-model="tagDraft"
            type="text"
            placeholder="입력 후 Enter… 예: #바다멍 #드라이브"
            autocomplete="off"
            data-testid="trip-create-tags"
            @keydown="handleTagKeydown"
            @blur="commitTags"
          />
        </div>
      </label>

      <div class="trip-create-dialog__actions">
        <BaseButton variant="ghost" type="button" :disabled="tripStore.creating" @click="close">
          취소
        </BaseButton>
        <BaseButton
          variant="primary"
          type="submit"
          :disabled="tripStore.creating"
          data-testid="trip-create-submit"
        >
          {{ tripStore.creating && submitIntent === 'places' ? '생성 중' : '계획 시작하기' }}
        </BaseButton>
      </div>
    </form>
  </BaseModal>
</template>

<style scoped>
.trip-create-dialog {
  display: grid;
  gap: 15px;
}

.trip-create-dialog__eyebrow {
  color: var(--accent);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  margin: 0;
}

.trip-create-dialog__error {
  background: #fff1eb;
  border: 1px solid #e3b3a0;
  border-radius: 10px;
  color: var(--complete);
  font-size: 13px;
  font-weight: 700;
  padding: 10px 12px;
}

.trip-create-dialog__grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.trip-create-dialog__field {
  display: grid;
  gap: 7px;
}

.trip-create-dialog__field span,
.trip-create-dialog__period-head span {
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 900;
}

.trip-create-dialog__field span em {
  color: var(--ink-faint);
  font-style: normal;
  font-weight: 500;
}

.trip-create-dialog__field input {
  background: var(--on-fill);
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--ink);
  font: inherit;
  min-height: 46px;
  padding: 0 12px;
}

.trip-create-dialog__field input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(194, 105, 63, 0.16);
  outline: none;
}

.trip-create-dialog__field small,
.trip-create-dialog__period small {
  color: var(--complete);
  font-size: 11px;
  font-weight: 700;
}

.trip-create-dialog__period {
  display: grid;
  gap: 9px;
}

.trip-create-dialog__period-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.trip-create-dialog__period-head strong {
  color: var(--ink);
  font-size: 13px;
}

.trip-create-dialog__calendar {
  background: var(--on-fill);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 13px 14px 15px;
}

.trip-create-dialog__calendar-nav {
  align-items: center;
  display: grid;
  grid-template-columns: 32px 1fr 32px;
  margin-bottom: 10px;
  text-align: center;
}

.trip-create-dialog__calendar-nav button,
.trip-create-dialog__days button {
  background: none;
  border: 0;
  color: var(--ink-sub);
  cursor: pointer;
  font: inherit;
}

.trip-create-dialog__calendar-nav strong {
  color: var(--ink);
  font-size: 15px;
}

.trip-create-dialog__weekdays,
.trip-create-dialog__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  text-align: center;
}

.trip-create-dialog__weekdays {
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 6px;
}

.trip-create-dialog__weekdays span:first-child {
  color: var(--accent);
}

.trip-create-dialog__days button,
.trip-create-dialog__days span {
  align-items: center;
  display: flex;
  height: 34px;
  justify-content: center;
}

.trip-create-dialog__days button {
  border-radius: 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
}

.trip-create-dialog__days button:hover {
  background: var(--paper);
}

.trip-create-dialog__days button.in-range {
  background: #f4eadc;
}

.trip-create-dialog__days button.selected {
  background: var(--accent);
  color: #fffdf8;
}

.trip-create-dialog__days button.start {
  border-radius: 9px 0 0 9px;
}

.trip-create-dialog__days button.end {
  border-radius: 0 9px 9px 0;
}

.trip-create-dialog__days button.start.end {
  border-radius: 9px;
}

.trip-create-dialog__tags {
  align-items: center;
  background: var(--on-fill);
  border: 1px solid var(--line);
  border-radius: 9px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 46px;
  padding: 7px 11px;
}

.trip-create-dialog__tags:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(194, 105, 63, 0.16);
}

.trip-create-dialog__tags button {
  background: #f7eee4;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--accent);
  cursor: pointer;
  font-family: var(--font-hand);
  font-size: 16px;
  padding: 2px 9px;
}

.trip-create-dialog__tags button span {
  color: var(--ink-faint);
  margin-left: 4px;
}

.trip-create-dialog__tags input {
  border: 0;
  box-shadow: none;
  flex: 1 1 190px;
  min-height: 30px;
  padding: 0;
}

.trip-create-dialog__tags input:focus {
  box-shadow: none;
}

.trip-create-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 620px) {
  .trip-create-dialog__grid {
    grid-template-columns: 1fr;
  }

  .trip-create-dialog__actions {
    flex-direction: column-reverse;
  }

  .trip-create-dialog__actions :deep(.ds-btn) {
    width: 100%;
  }
}
</style>
