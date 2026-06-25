<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { AppTopBar, BaseButton, TripPolaroid } from '@/components/common'
import MemoryDetailDialog from '@/components/log/MemoryDetailDialog.vue'
import TripPreviewDialog from '@/components/trip/TripPreviewDialog.vue'
import { fetchCardImage, fetchMemories } from '@/api/cardApi'
import { useAuthStore } from '@/stores/auth'
import { formatTripDateRange, parseTripTags } from '@/utils/tripForm'

const router = useRouter()
const auth = useAuthStore()

const memories = ref([])
const coverUrls = ref({})
const loading = ref(false)
const error = ref('')
const selectedMemory = ref(null)
const detailOpen = ref(false)
const recordOpen = ref(false)
const selectedRecordTrip = ref(null)
let controller = null

const displayName = computed(() => {
  const user = auth.user
  return user?.nickname || user?.name || user?.email?.split('@')[0] || 'T'
})
const userInitial = computed(() => displayName.value.slice(0, 1).toUpperCase() || 'T')
const completedCount = computed(() => memories.value.filter((memory) => memory.completed).length)
const emptyCount = computed(() => memories.value.length - completedCount.value)

onMounted(() => {
  auth.fetchMe().catch(() => {})
  loadMemories()
})

onBeforeUnmount(() => {
  controller?.abort()
  controller = null
  resetCovers()
})

async function loadMemories() {
  controller?.abort()
  resetCovers()
  controller = new AbortController()
  loading.value = true
  error.value = ''
  try {
    const result = await fetchMemories({ signal: controller.signal })
    memories.value = result
    await loadCoverImages(result, controller.signal)
  } catch (e) {
    if (e?.name !== 'CanceledError' && e?.name !== 'AbortError') {
      error.value = e?.response?.data?.message || e?.message || '추억을 불러오지 못했습니다.'
    }
  } finally {
    loading.value = false
  }
}

async function loadCoverImages(nextMemories, signal) {
  const withCovers = nextMemories.filter((memory) => memory.coverCardId)
  const entries = await Promise.all(
    withCovers.map(async (memory) => {
      const blob = await fetchCardImage(memory.coverCardId, { signal })
      return [memory.tripId, URL.createObjectURL(blob)]
    }),
  )
  coverUrls.value = Object.fromEntries(entries)
}

function resetCovers() {
  for (const url of Object.values(coverUrls.value)) URL.revokeObjectURL(url)
  coverUrls.value = {}
}

function openMemory(memory) {
  if (!memory.cardCount) {
    openRecord(memory)
    return
  }
  selectedMemory.value = memory
  detailOpen.value = true
}

function editMemory(memory) {
  openRecord(memory)
}

function openRecord(memory) {
  selectedRecordTrip.value = memoryToTrip(memory)
  recordOpen.value = true
}

function memoryToTrip(memory) {
  if (!memory) return null
  return {
    ...memory,
    id: memory.tripId,
    status: 'past',
  }
}

function goPlaces(trip) {
  if (!trip?.id) return
  router.push({ name: 'trip-place-search', params: { tripId: trip.id } })
}

function tagsOf(memory) {
  if (memory.theme) return parseTripTags(memory.theme)
  return []
}
</script>

<template>
  <div class="logs-page page-bg">
    <AppTopBar
      active="logs"
      show-logs
      :show-default-action="false"
      search-placeholder="추억 검색"
      :user-initial="userInitial"
    >
      <template #actions>
        <BaseButton variant="ghost" size="small" @click="loadMemories">새로고침</BaseButton>
      </template>
    </AppTopBar>

    <main class="logs-shell page-canvas" aria-labelledby="logs-title">
      <header class="logs-head">
        <div>
          <h1 id="logs-title">추억 <span>한 장 한 장</span></h1>
          <p>다녀온 여행을 카드로 남긴 기록 · 완성 {{ completedCount }} · 기록 중 {{ emptyCount }}</p>
        </div>
        <div class="logs-filters" aria-label="추억 필터">
          <button type="button" class="on">전체</button>
          <button type="button">최근순</button>
          <button type="button">연도별</button>
        </div>
      </header>

      <div v-if="error" class="logs-alert" role="alert">{{ error }}</div>

      <section v-if="loading" class="logs-loading" aria-live="polite">
        <span class="logs-loading__spinner" aria-hidden="true"></span>
        <strong>추억을 불러오는 중입니다.</strong>
      </section>

      <p v-else-if="!memories.length" class="logs-empty">
        다녀온 여행이 생기면 이곳에 폴라로이드가 놓입니다.
      </p>

      <section v-else class="logs-board" aria-label="추억 목록">
        <button
          v-for="memory in memories"
          :key="memory.tripId"
          class="logs-polaroid-button"
          type="button"
          @click="openMemory(memory)"
        >
          <TripPolaroid
            :title="memory.title"
            :subtitle="`${memory.region || '지역 미정'} · ${formatTripDateRange(memory)}`"
            :tags="tagsOf(memory)"
            :image-url="coverUrls[memory.tripId]"
            :completed="memory.completed"
            :empty="!memory.completed"
            :placeholder="memory.completed ? '추억 보기' : '추억 만들기'"
          />
        </button>
      </section>

      <p v-if="memories.length" class="logs-hint">
        폴라로이드를 누르면 저장된 카드들을 추억 상세 팝업으로 봅니다 · 빈 폴라로이드는 다녀온 여행 기록뷰로 이어집니다
      </p>
    </main>

    <MemoryDetailDialog v-model="detailOpen" :memory="selectedMemory" @edit="editMemory" />
    <TripPreviewDialog
      v-model="recordOpen"
      :trip="selectedRecordTrip"
      @open-places="goPlaces"
      @deleted="loadMemories"
      @updated="selectedRecordTrip = $event"
    />
  </div>
</template>

<style scoped>
.logs-shell {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.logs-head {
  align-items: flex-end;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 18px;
  justify-content: space-between;
  padding-bottom: 20px;
}

.logs-head h1 {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.15;
  margin: 0;
}

.logs-head h1 span {
  color: var(--accent);
  font-family: var(--font-hand);
  font-size: 26px;
  font-weight: 400;
  margin-left: 4px;
}

.logs-head p {
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 600;
  margin: 8px 0 0;
}

.logs-filters {
  display: flex;
  gap: 6px;
}

.logs-filters button {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink-sub);
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  padding: 6px 12px;
}

.logs-filters button.on {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--on-fill);
}

.logs-alert {
  background: #fff1eb;
  border: 1px solid #e3b3a0;
  border-radius: 10px;
  color: var(--complete);
  font-size: 13px;
  font-weight: 700;
  padding: 12px 14px;
}

.logs-loading {
  align-items: center;
  background: var(--paper-card);
  border: 1px dashed var(--line);
  border-radius: 14px;
  color: var(--ink-sub);
  display: flex;
  gap: 10px;
  justify-content: center;
  min-height: 220px;
}

.logs-loading__spinner {
  animation: logs-spin 0.9s linear infinite;
  border: 2px solid var(--line);
  border-radius: 50%;
  border-top-color: var(--accent);
  height: 22px;
  width: 22px;
}

.logs-board {
  align-items: flex-start;
  display: grid;
  gap: 32px 26px;
  grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
  justify-items: center;
  padding: 8px 0 0;
}

.logs-polaroid-button {
  background: transparent;
  border: 0;
  cursor: pointer;
  display: grid;
  gap: 8px;
  justify-items: center;
  padding: 0;
  text-align: left;
}

.logs-polaroid-button :deep(.ds-polaroid) {
  --pola-w: 232px;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease;
}

.logs-polaroid-button:hover :deep(.ds-polaroid) {
  box-shadow: 0 14px 24px -18px rgba(60, 40, 20, 0.55);
  transform: translateY(-3px) rotate(-1deg);
}

.logs-empty,
.logs-hint {
  color: var(--ink-faint);
  font-size: 11.5px;
  margin: 0;
  text-align: center;
}

.logs-empty {
  background: rgba(255, 253, 248, 0.58);
  border: 1px dashed var(--line);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  padding: 30px 16px;
}

@keyframes logs-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .logs-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .logs-filters {
    width: 100%;
  }
}
</style>
