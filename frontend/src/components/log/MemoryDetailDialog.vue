<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { BaseButton, BaseModal, TripStamp } from '@/components/common'
import { fetchCardImage, fetchTripCards } from '@/api/cardApi'
import { formatTripDateRange } from '@/utils/tripForm'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  memory: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'edit'])

const open = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const cards = ref([])
const imageUrls = ref({})
const loading = ref(false)
const error = ref('')
const currentIndex = ref(0)
let controller = null

const currentCard = computed(() => cards.value[currentIndex.value] ?? null)
const currentImageUrl = computed(() => {
  const id = currentCard.value?.id
  return id ? imageUrls.value[id] : ''
})
const stampTitle = computed(() => (props.memory?.region || 'TRIP').slice(0, 4))
const memoryDates = computed(() => formatTripDateRange(props.memory))

watch(
  () => [open.value, props.memory?.tripId],
  ([visible]) => {
    if (!visible || !props.memory?.tripId) {
      reset()
      return
    }
    loadCards()
  },
  { immediate: true },
)

onBeforeUnmount(reset)

async function loadCards() {
  reset()
  loading.value = true
  controller = new AbortController()
  try {
    const result = await fetchTripCards(props.memory.tripId, { signal: controller.signal })
    cards.value = result
    currentIndex.value = 0
    await loadImages(result, controller.signal)
  } catch (e) {
    if (e?.name !== 'CanceledError' && e?.name !== 'AbortError') {
      error.value = e?.response?.data?.message || e?.message || '추억을 불러오지 못했습니다.'
    }
  } finally {
    loading.value = false
  }
}

async function loadImages(nextCards, signal) {
  const entries = await Promise.all(
    nextCards.map(async (card) => {
      const blob = await fetchCardImage(card.id, { signal })
      return [card.id, URL.createObjectURL(blob)]
    }),
  )
  imageUrls.value = Object.fromEntries(entries)
}

function reset() {
  controller?.abort()
  controller = null
  for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url)
  cards.value = []
  imageUrls.value = {}
  loading.value = false
  error.value = ''
  currentIndex.value = 0
}

function close() {
  open.value = false
}

function prev() {
  if (!cards.value.length) return
  currentIndex.value = (currentIndex.value - 1 + cards.value.length) % cards.value.length
}

function next() {
  if (!cards.value.length) return
  currentIndex.value = (currentIndex.value + 1) % cards.value.length
}

function editMemory() {
  emit('edit', props.memory)
  close()
}

function downloadCurrent() {
  if (!currentCard.value || !currentImageUrl.value) return
  const anchor = document.createElement('a')
  anchor.href = currentImageUrl.value
  anchor.download = `triplog-card-${currentCard.value.photoId}.png`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
</script>

<template>
  <BaseModal v-model="open" :title="memory?.title || '추억'" width="min(920px, 94vw)">
    <div v-if="memory" class="memory-detail">
      <aside class="memory-detail__side">
        <TripStamp
          :title="stampTitle"
          :stage="3"
          :start-date="memory.startDate?.replaceAll('-', '.') || ''"
          :end-date="memory.endDate?.replaceAll('-', '.') || ''"
          complete
        />
        <div class="memory-detail__meta">
          <strong>{{ memory.title }}</strong>
          <span>{{ memory.region || '지역 미정' }} · {{ memoryDates }}</span>
          <span>{{ memory.cardCount }}장 저장됨</span>
        </div>
        <div class="memory-detail__actions">
          <BaseButton size="small" variant="primary" @click="editMemory">다시 편집</BaseButton>
          <BaseButton size="small" variant="ghost" :disabled="!currentCard" @click="downloadCurrent">
            PNG 저장
          </BaseButton>
        </div>
      </aside>

      <section class="memory-detail__viewer" aria-live="polite">
        <p v-if="loading" class="memory-detail__state">불러오는 중입니다.</p>
        <p v-else-if="error" class="memory-detail__state memory-detail__state--error">{{ error }}</p>
        <p v-else-if="!cards.length" class="memory-detail__state">저장된 카드가 없습니다.</p>
        <template v-else>
          <div class="memory-detail__stage">
            <button type="button" class="memory-detail__nav" aria-label="이전 카드" @click="prev">‹</button>
            <img :src="currentImageUrl" :alt="`${memory.title} 카드 ${currentIndex + 1}`" />
            <button type="button" class="memory-detail__nav" aria-label="다음 카드" @click="next">›</button>
          </div>
          <div class="memory-detail__thumbs" aria-label="저장된 카드">
            <button
              v-for="(card, index) in cards"
              :key="card.id"
              type="button"
              :class="{ 'is-active': index === currentIndex }"
              @click="currentIndex = index"
            >
              <img :src="imageUrls[card.id]" :alt="`카드 ${index + 1}`" />
            </button>
          </div>
        </template>
      </section>
    </div>
  </BaseModal>
</template>

<style scoped>
.memory-detail {
  display: grid;
  gap: 22px;
  grid-template-columns: 190px minmax(0, 1fr);
}

.memory-detail__side {
  align-content: start;
  display: grid;
  gap: 16px;
}

.memory-detail__meta {
  display: grid;
  gap: 5px;
}

.memory-detail__meta strong {
  font-size: 18px;
  line-height: 1.25;
}

.memory-detail__meta span {
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 700;
}

.memory-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.memory-detail__viewer {
  background: var(--paper-dim);
  border: 1px solid var(--line2);
  border-radius: 8px;
  min-height: 520px;
  padding: 16px;
}

.memory-detail__state {
  color: var(--ink-sub);
  font-weight: 700;
  margin: 0;
}

.memory-detail__state--error {
  color: var(--complete);
}

.memory-detail__stage {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: 42px minmax(0, 1fr) 42px;
}

.memory-detail__stage img {
  background: var(--paper-card);
  border-radius: 4px;
  box-shadow: 0 12px 24px -18px rgba(60, 40, 20, 0.42);
  display: block;
  max-height: 440px;
  max-width: 100%;
  object-fit: contain;
  place-self: center;
}

.memory-detail__nav {
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  font-size: 28px;
  height: 42px;
  line-height: 1;
  width: 42px;
}

.memory-detail__thumbs {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.memory-detail__thumbs button {
  background: var(--paper-card);
  border: 2px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  flex: 0 0 54px;
  height: 74px;
  overflow: hidden;
  padding: 0;
}

.memory-detail__thumbs button.is-active {
  border-color: var(--accent);
}

.memory-detail__thumbs img {
  display: block;
  height: 100%;
  object-fit: cover;
  width: 100%;
}

@media (max-width: 760px) {
  .memory-detail {
    grid-template-columns: 1fr;
  }

  .memory-detail__viewer {
    min-height: 360px;
  }
}
</style>
