<script setup>
// 사진 관리 모달 (카드 만들기 배치 화면에서 띄움). 이미 올라간 사진을 보고 "이 여행에서 빼기" +
// 새 사진 업로드. 사진 목록·빼기는 부모(usePhotoPlacement)가 관리하므로 props/emit 로 받는다.
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import PhotoUploadPanel from '@/components/log/PhotoUploadPanel.vue'

defineProps({
  visible: { type: Boolean, default: false },
  tripId: { type: Number, default: null },
  photos: { type: Array, default: () => [] },
  removingIds: { type: Object, default: () => new Set() }, // 빼는 중인 photoId Set
  error: { type: String, default: '' }, // 빼기 실패 안내
})
const emit = defineEmits(['update:visible', 'remove', 'uploaded'])
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="사진 관리"
    :style="{ width: '640px', maxWidth: '94vw' }"
    @update:visible="emit('update:visible', $event)"
  >
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
      <p class="muted small note">✕ = 이 여행에서 빼기(사진 자체는 남습니다). 중복·불필요한 사진을 정리하세요.</p>
    </section>

    <template #footer>
      <Button label="닫기" @click="emit('update:visible', false)" />
    </template>
  </Dialog>
</template>

<style scoped>
.sect {
  margin-bottom: 18px;
}
.sect h3 {
  margin: 0 0 10px;
  font-size: 0.95rem;
}
.muted {
  color: #8b95a1;
  font-weight: 400;
}
.small {
  font-size: 0.82rem;
}
.note {
  margin-top: 8px;
}
.err {
  margin: 8px 0 0;
  color: #f04452;
  font-weight: 600;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
}
.cell {
  position: relative;
  aspect-ratio: 1;
}
.rm {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: rgba(20, 20, 20, 0.62);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
}
.rm:hover {
  background: #f04452;
}
.rm:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
