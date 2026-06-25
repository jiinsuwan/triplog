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
let loadSeq = 0

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
  const seq = ++loadSeq
  loading.value = true
  controller = new AbortController()
  try {
    const result = await fetchTripCards(props.memory.tripId, { signal: controller.signal })
    if (seq !== loadSeq) return
    cards.value = result
    currentIndex.value = 0
    await loadImages(result, controller.signal, seq)
  } catch (e) {
    if (e?.name !== 'CanceledError' && e?.name !== 'AbortError') {
      error.value = e?.response?.data?.message || e?.message || '추억을 불러오지 못했습니다.'
    }
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

async function loadImages(nextCards, signal, seq) {
  const nextUrls = {}
  try {
    await Promise.all(
      nextCards.map(async (card) => {
        const blob = await fetchCardImage(card.id, { signal })
        nextUrls[card.id] = URL.createObjectURL(blob)
      }),
    )
    if (seq !== loadSeq || signal.aborted) {
      for (const url of Object.values(nextUrls)) URL.revokeObjectURL(url)
      return
    }
    imageUrls.value = nextUrls
  } catch (e) {
    for (const url of Object.values(nextUrls)) URL.revokeObjectURL(url)
    throw e
  }
}

function reset() {
  loadSeq += 1
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
  <BaseModal v-model="open" :title="memory?.title || '추억'" hide-header width="min(540px, 94vw)">
    <section v-if="memory" class="memory-detail">
      <header class="memory-detail__top">
        <TripStamp
          :title="stampTitle"
          :stage="3"
          :start-date="memory.startDate?.replaceAll('-', '.') || ''"
          :end-date="memory.endDate?.replaceAll('-', '.') || ''"
          complete
        />
        <div class="memory-detail__info">
          <h2>{{ memory.title }}</h2>
          <p>{{ memory.region || '지역 미정' }} · {{ memoryDates }} · 카드 {{ memory.cardCount }}장</p>
        </div>
        <div class="memory-detail__actions">
          <BaseButton size="small" variant="ghost" @click="editMemory">수정</BaseButton>
          <BaseButton size="small" variant="ghost" :disabled="!currentCard" @click="downloadCurrent">
            PNG 저장
          </BaseButton>
        </div>
        <button type="button" class="memory-detail__close" aria-label="닫기" @click="close">×</button>
      </header>

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
          <div class="memory-detail__index">{{ currentIndex + 1 }} / {{ cards.length }}</div>
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
    </section>
  </BaseModal>
</template>

<style scoped>
.memory-detail {
  display: block;
  margin: -18px;
}

.memory-detail__top {
  align-items: center;
  border-bottom: 1px solid var(--line2);
  display: flex;
  gap: 14px;
  padding: 18px 22px 15px;
}

.memory-detail__top :deep(.ds-stamp) {
  flex: none;
  height: 64px;
  width: 64px;
}

.memory-detail__info {
  flex: 1;
  min-width: 0;
}

.memory-detail__info h2 {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.25;
  margin: 0;
}

.memory-detail__info p {
  color: var(--ink-sub);
  font-size: 12.5px;
  font-weight: 600;
  margin: 3px 0 0;
}

.memory-detail__actions {
  display: flex;
  flex: none;
  gap: 7px;
}

.memory-detail__close {
  align-self: flex-start;
  background: none;
  border: 0;
  color: var(--ink-faint);
  cursor: pointer;
  flex: none;
  font: inherit;
  font-size: 20px;
  line-height: 1;
  padding: 0;
}

.memory-detail__viewer {
  background: var(--paper);
  min-height: 442px;
  padding: 18px 22px 18px;
}

.memory-detail__state {
  align-items: center;
  color: var(--ink-sub);
  display: flex;
  font-weight: 700;
  justify-content: center;
  margin: 0;
  min-height: 400px;
  text-align: center;
}

.memory-detail__state--error {
  color: var(--complete);
}

.memory-detail__stage {
  align-items: center;
  display: grid;
  gap: 14px;
  grid-template-columns: 36px minmax(0, 300px) 36px;
  height: 330px;
  justify-content: center;
  min-width: 0;
}

.memory-detail__stage img {
  background: var(--paper-card);
  border-radius: 14px;
  box-shadow: var(--shadow-pop);
  display: block;
  height: 330px;
  max-width: 300px;
  object-fit: contain;
  place-self: center;
  width: 300px;
}

.memory-detail__nav {
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  font-size: 22px;
  height: 36px;
  line-height: 1;
  width: 36px;
}

.memory-detail__index {
  color: var(--ink-faint);
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 11px;
  margin: 11px 0 12px;
  text-align: center;
}

.memory-detail__thumbs {
  display: flex;
  gap: 8px;
  justify-content: center;
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
  .memory-detail__top {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .memory-detail__viewer {
    min-height: 392px;
  }

  .memory-detail__state {
    min-height: 350px;
  }

  .memory-detail__stage {
    gap: 10px;
    grid-template-columns: 32px minmax(0, 248px) 32px;
    height: 286px;
  }

  .memory-detail__stage img {
    height: 286px;
    max-width: 248px;
    width: 248px;
  }
}
</style>
