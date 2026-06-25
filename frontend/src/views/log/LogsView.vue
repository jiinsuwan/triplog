<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { AppTopBar, BaseButton, EmptyState, TripPolaroid } from '@/components/common'
import MemoryDetailDialog from '@/components/log/MemoryDetailDialog.vue'
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
    editMemory(memory)
    return
  }
  selectedMemory.value = memory
  detailOpen.value = true
}

function editMemory(memory) {
  router.push({ name: 'card-create', query: { tripId: memory.tripId } })
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
          <h1 id="logs-title">LOGS</h1>
          <p>다녀온 여행의 카드가 한 장씩 쌓입니다.</p>
        </div>
        <dl class="logs-summary">
          <div>
            <dt>{{ completedCount }}</dt>
            <dd>완성</dd>
          </div>
          <div>
            <dt>{{ emptyCount }}</dt>
            <dd>대기</dd>
          </div>
        </dl>
      </header>

      <div v-if="error" class="logs-alert" role="alert">{{ error }}</div>

      <section v-if="loading" class="logs-loading" aria-live="polite">
        <span class="logs-loading__spinner" aria-hidden="true"></span>
        <strong>추억을 불러오는 중입니다.</strong>
      </section>

      <EmptyState
        v-else-if="!memories.length"
        icon="LOG"
        title="아직 다녀온 여행이 없습니다."
        description="여행을 마치면 이곳에서 추억 카드를 만들 수 있습니다."
        action-label="여행 보기"
        @action="router.push('/trips')"
      />

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
          <span class="logs-polaroid-button__count">{{ memory.cardCount }}장</span>
        </button>
      </section>
    </main>

    <MemoryDetailDialog v-model="detailOpen" :memory="selectedMemory" @edit="editMemory" />
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
  font-family: var(--font-hand);
  font-size: 42px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1;
  margin: 0;
}

.logs-head p {
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 600;
  margin: 8px 0 0;
}

.logs-summary {
  display: flex;
  gap: 10px;
  margin: 0;
}

.logs-summary div {
  background: var(--paper-card);
  border: 1px solid var(--line2);
  border-radius: 8px;
  min-width: 74px;
  padding: 8px 12px;
  text-align: center;
}

.logs-summary dt {
  color: var(--accent);
  font-size: 20px;
  font-weight: 900;
}

.logs-summary dd {
  color: var(--ink-sub);
  font-size: 11px;
  font-weight: 800;
  margin: 2px 0 0;
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
  gap: 28px 22px;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  padding: 4px 0 40px;
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
  --pola-w: min(210px, 100%);
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease;
}

.logs-polaroid-button:hover :deep(.ds-polaroid) {
  box-shadow: 0 14px 24px -18px rgba(60, 40, 20, 0.55);
  transform: translateY(-3px) rotate(-1deg);
}

.logs-polaroid-button__count {
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 800;
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

  .logs-summary {
    width: 100%;
  }

  .logs-summary div {
    flex: 1;
  }
}
</style>
