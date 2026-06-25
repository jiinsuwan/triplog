<script setup>
// 사진 관리 모달 (카드 만들기 배치 화면에서 띄움). 이미 올라간 사진을 보고 "이 여행에서 빼기" +
// 새 사진 업로드. 사진 목록·빼기는 부모(usePhotoPlacement)가 관리하므로 props/emit 로 받는다.
import { computed } from 'vue'

import { BaseModal } from '@/components/common'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import PhotoUploadPanel from '@/components/log/PhotoUploadPanel.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  tripId: { type: Number, default: null },
  photos: { type: Array, default: () => [] },
  removingIds: { type: Object, default: () => new Set() }, // 빼는 중인 photoId Set
  error: { type: String, default: '' }, // 빼기 실패 안내
})
const emit = defineEmits(['update:visible', 'remove', 'uploaded'])

const open = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
})
</script>

<template>
  <BaseModal v-model="open" title="사진 관리" close-button-variant="primary" width="min(640px, 94vw)">
    <section class="sect">
      <h3>새 사진 올리기</h3>
      <PhotoUploadPanel v-if="tripId" :trip-id="tripId" @linked="emit('uploaded')" />
    </section>

    <section class="sect">
      <h3>이 여행의 사진 <span class="muted">· {{ photos.length }}</span></h3>
      <p v-if="!photos.length" class="muted small">아직 사진이 없습니다. 위에서 올려 주세요.</p>
      <ul v-else class="grid">
        <li v-for="p in photos" :key="p.id" class="cell">
          <PhotoThumb :photo-id="p.id" :alt="p.originalFilename || '사진'" />
          <button
            class="rm"
            :disabled="removingIds.has(p.id)"
            title="이 여행에서 빼기"
            @click="emit('remove', p.id)"
          >
            ✕
          </button>
        </li>
      </ul>
      <p v-if="error" class="err small">{{ error }}</p>
    </section>
  </BaseModal>
</template>

<style scoped>
.sect {
  margin-bottom: 18px;
}
.sect h3 {
  margin: 0 0 10px;
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0;
}
.muted {
  color: var(--ink-faint);
  font-weight: 600;
}
.small {
  font-size: 12.5px;
}
.err {
  margin: 8px 0 0;
  color: var(--complete);
  font-weight: 600;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
}
.cell {
  position: relative;
  aspect-ratio: 1;
}
.rm {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--paper-card) 72%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--ink) 62%, transparent);
  color: var(--on-fill);
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.rm:hover {
  background: var(--complete);
}
.rm:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
