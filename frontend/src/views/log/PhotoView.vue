<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import ProgressBar from 'primevue/progressbar'
import Message from 'primevue/message'
import { fetchTrip } from '@/api/tripApi'
import { useUploadQueue, QueueStatus, ACCEPT_ATTR } from '@/composables/useUploadQueue'

const route = useRoute()
// 라우트 파라미터는 문자열 → 서버 계약(Long)에 맞춰 숫자로 변환.
const tripId = Number(route.params.tripId)

const { items, addFiles, retry, remove, failedCount, linkedCount } = useUploadQueue(tripId)

// 모든 항목이 실제로 "연결됨"일 때만 완료 안내(거부·취소가 섞이면 띄우지 않는다).
const allLinked = computed(() => items.length > 0 && linkedCount.value === items.length)

// 어느 여행에 연결되는지 맥락 표시(읽기 전용 cross-track 조회 — 실패해도 화면은 동작).
const tripTitle = ref('')
onMounted(async () => {
  try {
    const trip = await fetchTrip(tripId)
    tripTitle.value = trip?.title ?? ''
  } catch {
    tripTitle.value = ''
  }
})

const fileInput = ref(null)
const dragOver = ref(false)

function openPicker() {
  fileInput.value?.click()
}
function onPicked(event) {
  addFiles(event.target.files)
  event.target.value = '' // 같은 파일 재선택 허용.
}
function onDrop(event) {
  dragOver.value = false
  addFiles(event.dataTransfer?.files)
}
function onKeydown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    openPicker()
  }
}

// 상태 → 배지(라벨·severity). 실패/검증탈락은 사유 문구를 그대로 보여준다.
function statusTag(item) {
  switch (item.status) {
    case QueueStatus.PENDING:
      return { label: '대기 중', severity: 'secondary' }
    case QueueStatus.UPLOADING:
      return { label: `업로드 중 ${item.progress}%`, severity: 'info' }
    case QueueStatus.LINKING:
      return { label: '연결 중', severity: 'info' }
    case QueueStatus.LINKED:
      return { label: '연결됨', severity: 'success' }
    case QueueStatus.FAILED:
      return { label: item.error?.message ?? '실패', severity: 'danger' }
    case QueueStatus.REJECTED:
      return { label: item.error?.message ?? '업로드 불가', severity: 'warn' }
    case QueueStatus.CANCELLED:
      return { label: '취소됨', severity: 'secondary' }
    default:
      return { label: item.status, severity: 'secondary' }
  }
}

const isUploading = (item) =>
  item.status === QueueStatus.UPLOADING || item.status === QueueStatus.LINKING

function takenAtLabel(item) {
  if (!item.takenAt) return '🕐 시간 없음'
  // ISO "2026-06-04T12:17:56" → "2026-06-04 12:17"
  return `🕐 ${item.takenAt.slice(0, 16).replace('T', ' ')}`
}

const connectLabel = computed(() =>
  tripTitle.value ? `${tripTitle.value} 여행에 연결` : '현재 여행에 연결',
)
</script>

<template>
  <main class="photo-page">
    <header class="photo-head">
      <div>
        <span class="eyebrow">사진</span>
        <h1>사진 업로드</h1>
        <p>{{ connectLabel }} · 업로드하면 EXIF(촬영시간·GPS)를 추출합니다.</p>
      </div>
      <!-- 카드 생성은 다음 스프린트(S3) — 비활성 + 안내 -->
      <Button
        label="카드 만들기"
        icon="pi pi-images"
        disabled
        title="카드 기능은 다음 스프린트에 제공됩니다."
      />
    </header>

    <!-- 드롭존: 끌어다 놓거나 클릭/Enter 로 파일 선택 -->
    <div
      class="dropzone"
      :class="{ 'drag-over': dragOver }"
      role="button"
      tabindex="0"
      aria-label="사진을 끌어다 놓거나 눌러서 업로드"
      @click="openPicker"
      @keydown="onKeydown"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <i class="pi pi-cloud-upload" aria-hidden="true" />
      <strong>사진을 끌어다 놓거나 클릭해서 업로드</strong>
      <small>JPEG · PNG · WebP · HEIC (최대 20MB)</small>
      <input
        ref="fileInput"
        type="file"
        class="hidden-input"
        multiple
        :accept="ACCEPT_ATTR"
        @change="onPicked"
      />
    </div>

    <section class="queue-section">
      <div class="queue-head">
        <h2>업로드 큐</h2>
        <span v-if="items.length" class="queue-summary">
          연결 {{ linkedCount }} / {{ items.length }}
          <template v-if="failedCount">· 실패 {{ failedCount }}</template>
        </span>
      </div>

      <Message v-if="allLinked" severity="success" :closable="false">
        모든 사진을 여행에 연결했습니다.
      </Message>

      <p v-if="!items.length" class="empty">아직 업로드한 사진이 없습니다.</p>

      <ul v-else class="queue" aria-label="업로드 큐">
        <li v-for="item in items" :key="item.id" class="row">
          <div class="thumb">
            <img v-if="item.previewUrl" :src="item.previewUrl" :alt="item.name" />
            <i v-else class="pi pi-image" aria-hidden="true" />
          </div>

          <div class="info">
            <strong class="name">{{ item.name }}</strong>
            <div class="meta">
              <Tag
                :value="item.hasGps ? '📍 GPS 있음' : '📍 GPS 없음'"
                :severity="item.hasGps ? 'success' : 'secondary'"
                rounded
              />
              <Tag :value="takenAtLabel(item)" severity="secondary" rounded />
            </div>
            <ProgressBar
              v-if="isUploading(item)"
              :value="item.progress"
              :show-value="false"
              class="bar"
            />
          </div>

          <div class="state">
            <Tag :value="statusTag(item).label" :severity="statusTag(item).severity" />
            <div class="actions">
              <Button
                v-if="item.status === QueueStatus.FAILED"
                icon="pi pi-refresh"
                label="재시도"
                size="small"
                text
                :aria-label="`${item.name} 재시도`"
                @click="retry(item.id)"
              />
              <Button
                v-if="!isUploading(item)"
                icon="pi pi-times"
                size="small"
                text
                severity="secondary"
                :aria-label="`${item.name} 목록에서 제거`"
                @click="remove(item.id)"
              />
            </div>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.photo-page {
  min-height: 100vh;
  max-width: 920px;
  margin: 0 auto;
  padding: 32px clamp(16px, 4vw, 40px) 64px;
  color: #191f28;
}

.photo-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.eyebrow {
  color: #3182f6;
  font-size: 13px;
  font-weight: 800;
}

.photo-head h1 {
  margin: 4px 0 6px;
  font-size: clamp(26px, 4vw, 36px);
}

.photo-head p {
  margin: 0;
  color: #8b95a1;
  font-weight: 600;
  font-size: 14px;
}

.dropzone {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 36px 20px;
  border: 1.5px dashed #c9d2dc;
  border-radius: 16px;
  background: #fff;
  color: #3182f6;
  text-align: center;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.dropzone:hover,
.dropzone:focus-visible {
  border-color: #3182f6;
  outline: none;
}

.dropzone.drag-over {
  background: #eaf2ff;
  border-color: #3182f6;
}

.dropzone .pi-cloud-upload {
  font-size: 28px;
}

.dropzone strong {
  font-size: 15px;
}

.dropzone small {
  color: #8b95a1;
  font-weight: 600;
}

.hidden-input {
  display: none;
}

.queue-section {
  margin-top: 28px;
}

.queue-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.queue-head h2 {
  font-size: 16px;
  color: #4e5968;
}

.queue-summary {
  font-size: 13px;
  font-weight: 700;
  color: #8b95a1;
}

.empty {
  padding: 28px 0;
  text-align: center;
  color: #b0b8c1;
  font-weight: 600;
}

.queue {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.row {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 12px;
  border: 1px solid #e5e8eb;
  border-radius: 14px;
  background: #fff;
}

.thumb {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  overflow: hidden;
  background: #f2f4f6;
  display: grid;
  place-items: center;
  color: #b0b8c1;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb .pi-image {
  font-size: 22px;
}

.info {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.name {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bar {
  height: 6px;
  margin-top: 2px;
}

.state {
  display: grid;
  justify-items: end;
  gap: 6px;
}

.actions {
  display: flex;
  gap: 2px;
}

@media (max-width: 560px) {
  .row {
    grid-template-columns: 48px 1fr;
  }

  .state {
    grid-column: 1 / -1;
    justify-items: stretch;
    grid-auto-flow: column;
    align-items: center;
    justify-content: space-between;
  }
}
</style>
