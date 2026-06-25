<script setup>
// 사진 업로드 패널 (log 트랙). 드롭존만 표시하고 업로드 상태는 사진 목록 갱신으로 반영한다.
// 로직은 useUploadQueue 그대로. 업로드 항목이 "연결됨"이 될 때마다 linked 이벤트로 알린다
// (호출자가 사진 목록을 갱신하도록).
import { ref, watch } from 'vue'
import { useUploadQueue, ACCEPT_ATTR } from '@/composables/useUploadQueue'

const props = defineProps({
  tripId: { type: Number, required: true },
  canUpload: { type: Boolean, default: true },
})
const emit = defineEmits(['linked'])

const { addFiles, linkedCount } = useUploadQueue(props.tripId)

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
  </div>
</template>

<style scoped>
.dropzone {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 28px 20px;
  border: 1.5px dashed var(--line-strong, var(--line));
  border-radius: 14px;
  background: var(--paper-card);
  color: var(--accent);
  text-align: center;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    box-shadow 0.12s,
    transform 0.12s;
}
.dropzone:hover,
.dropzone:focus-visible {
  background: var(--paper);
  border-color: var(--accent);
  box-shadow: var(--shadow-card);
  outline: none;
  transform: translateY(-1px);
}
.dropzone.drag-over {
  background: var(--paper);
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.dropzone.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.dropzone .pi-cloud-upload {
  font-size: 26px;
}
.dropzone strong {
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
}
.dropzone small {
  color: var(--ink-faint);
  font-weight: 600;
}
.hidden-input {
  display: none;
}
</style>
