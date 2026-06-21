<script setup>
// 사진 업로드 패널 (log 트랙). 드롭존 + 업로드 큐 — PhotoView 와 카드 만들기 모달이 공유한다.
// 로직은 useUploadQueue 그대로. 업로드 항목이 "연결됨"이 될 때마다 linked 이벤트로 알린다
// (호출자가 사진 목록을 갱신하도록).
import { computed, watch } from 'vue'
import Tag from 'primevue/tag'
import ProgressBar from 'primevue/progressbar'
import Message from 'primevue/message'
import Button from 'primevue/button'
import { useUploadQueue, QueueStatus, ACCEPT_ATTR } from '@/composables/useUploadQueue'
import { ref } from 'vue'

const props = defineProps({
  tripId: { type: Number, required: true },
  canUpload: { type: Boolean, default: true },
})
const emit = defineEmits(['linked'])

const { items, addFiles, retry, remove, failedCount, linkedCount } = useUploadQueue(props.tripId)

const allLinked = computed(() => items.length > 0 && linkedCount.value === items.length)
// 연결된 사진 수가 늘면 호출자에게 알린다(목록 reload).
watch(linkedCount, (n, prev) => {
  if (n > prev) emit('linked')
})

const fileInput = ref(null)
const dragOver = ref(false)

function openPicker() {
  if (!props.canUpload) return
  fileInput.value?.click()
}
function onPicked(event) {
  addFiles(event.target.files)
  event.target.value = ''
}
function onDrop(event) {
  dragOver.value = false
  if (!props.canUpload) return
  addFiles(event.dataTransfer?.files)
}
function onKeydown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    openPicker()
  }
}

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
    default:
      return { label: item.status, severity: 'secondary' }
  }
}
const isUploading = (item) =>
  item.status === QueueStatus.UPLOADING || item.status === QueueStatus.LINKING
function takenAtLabel(item) {
  if (!item.takenAt) return '🕐 시간 없음'
  return `🕐 ${item.takenAt.slice(0, 16).replace('T', ' ')}`
}
</script>

<template>
  <div class="upload-panel">
    <div
      class="dropzone"
      :class="{ 'drag-over': dragOver, disabled: !canUpload }"
      role="button"
      :tabindex="canUpload ? 0 : -1"
      :aria-disabled="!canUpload"
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

    <section v-if="items.length" class="queue-section">
      <div class="queue-head">
        <h3>업로드 큐</h3>
        <span class="queue-summary">
          연결 {{ linkedCount }} / {{ items.length }}
          <template v-if="failedCount">· 실패 {{ failedCount }}</template>
        </span>
      </div>

      <Message v-if="allLinked" severity="success" :closable="false">
        모든 사진을 여행에 연결했습니다.
      </Message>

      <ul class="queue" aria-label="업로드 큐">
        <li v-for="item in items" :key="item.id" class="row">
          <div class="thumb">
            <img v-if="item.previewUrl" :src="item.previewUrl" :alt="item.name" />
            <i v-else class="pi pi-image" aria-hidden="true" />
          </div>
          <div class="info">
            <strong class="name">{{ item.name }}</strong>
            <div class="meta">
              <Tag :value="item.hasGps ? '📍 GPS 있음' : '📍 GPS 없음'" :severity="item.hasGps ? 'success' : 'secondary'" rounded />
              <Tag :value="takenAtLabel(item)" severity="secondary" rounded />
            </div>
            <ProgressBar v-if="isUploading(item)" :value="item.progress" :show-value="false" class="bar" />
          </div>
          <div class="state">
            <Tag :value="statusTag(item).label" :severity="statusTag(item).severity" />
            <div class="actions">
              <Button v-if="item.status === QueueStatus.FAILED" icon="pi pi-refresh" label="재시도" size="small" text :aria-label="`${item.name} 재시도`" @click="retry(item.id)" />
              <Button v-if="!isUploading(item)" icon="pi pi-times" size="small" text severity="secondary" :aria-label="`${item.name} 목록에서 제거`" @click="remove(item.id)" />
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.dropzone {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 28px 20px;
  border: 1.5px dashed #c9d2dc;
  border-radius: 14px;
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
.dropzone.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.dropzone .pi-cloud-upload {
  font-size: 26px;
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
  margin-top: 16px;
}
.queue-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}
.queue-head h3 {
  margin: 0;
  font-size: 15px;
  color: #4e5968;
}
.queue-summary {
  font-size: 13px;
  font-weight: 700;
  color: #8b95a1;
}
.queue {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
}
.row {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid #e5e8eb;
  border-radius: 12px;
  background: #fff;
}
.thumb {
  width: 48px;
  height: 48px;
  border-radius: 9px;
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
.info {
  min-width: 0;
  display: grid;
  gap: 5px;
}
.name {
  font-size: 13px;
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
</style>
