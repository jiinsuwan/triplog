<script setup>
// 카드 위저드 "고르기" 단계 본문 (S3-LOG-06 2단계).
// 배치 정본 = 목업 ④: 경로 순서대로 장소(여행지/숙소)를 나열하고 장소마다 그 장소 사진을 고른다.
// 일정·사진↔장소 배치는 기록 뷰와 동일하게 usePhotoPlacement(실제 일정 stop + EXIF 자동배치)를
// 재사용한다 — 가짜 장소 목업을 버리고 실제 장소로 묶는다. 배치 안 된 사진은 "미배치" 묶음.
// 선택(≤10)은 useCardStore.photoIds(단계 이동 간 유지).
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import { MAX_CARD_PHOTOS, useCardStore } from '@/stores/card'
import { usePhotoPlacement } from '@/composables/usePhotoPlacement'

const props = defineProps({
  tripId: { type: Number, default: null },
})

const router = useRouter()
const card = useCardStore()
const { loading, error, stopsFlat, unplaced, photosForStop, photos } = usePhotoPlacement(props.tripId)

const TYPE_ICON = { ATTRACTION: '🏛', RESTAURANT: '🍽', CAFE: '☕', LODGING: '🏨' }

// 실제 일정 장소(사진 있는 곳)별 + 미배치 묶음. 가짜 장소 없음.
const groups = computed(() => {
  const result = stopsFlat.value
    .map((stop) => ({
      key: `stop-${stop.id}`,
      no: stop.sortOrder,
      name: stop.place?.name ?? '장소',
      icon: TYPE_ICON[stop.place?.placeType] ?? '📍',
      meta: `DAY${stop.dayNumber}${stop.selectedTime ? ' ' + stop.selectedTime : ''} · 사진 ${photosForStop(stop.id).length}`,
      photos: photosForStop(stop.id),
    }))
    .filter((group) => group.photos.length > 0)
  if (unplaced.value.length > 0) {
    result.push({ key: 'unplaced', no: null, name: '미배치', icon: '📷', meta: `사진 ${unplaced.value.length}`, photos: unplaced.value })
  }
  return result
})

const isEmpty = computed(() => !loading.value && !error.value && photos.value.length === 0)
const selectedCount = computed(() => card.photoIds.length)
const atLimit = computed(() => selectedCount.value >= MAX_CARD_PHOTOS)

function onPick(photoId) {
  card.togglePhoto(photoId)
}

function goUpload() {
  if (props.tripId) router.push({ name: 'trip-photos', params: { tripId: String(props.tripId) } })
}
function goRecord() {
  if (props.tripId) router.push({ name: 'trip-record', params: { tripId: String(props.tripId) } })
}
</script>

<template>
  <div class="picker">
    <p v-if="loading" class="picker-msg">사진·일정을 불러오는 중…</p>

    <Message v-else-if="error" severity="error" :closable="false">{{ error }}</Message>

    <div v-else-if="!tripId" class="picker-empty">
      <p>여행 정보가 없습니다. 사진 화면에서 다시 시작해 주세요.</p>
    </div>

    <div v-else-if="isEmpty" class="picker-empty">
      <p>이 여행에 사진이 없습니다. 먼저 사진을 올려 주세요.</p>
      <Button label="사진 올리러 가기" icon="pi pi-upload" @click="goUpload" />
    </div>

    <template v-else>
      <div class="picker-bar">
        <span class="hint">경로 순서대로 · 장소당 1장 권장</span>
        <Button label="일정에 배치" icon="pi pi-map" size="small" text @click="goRecord" />
        <span class="grow" />
        <span class="count" :class="{ full: atLimit }">{{ selectedCount }} / {{ MAX_CARD_PHOTOS }} 선택</span>
      </div>

      <section v-for="place in groups" :key="place.key" class="place">
        <div class="place-head">
          <span v-if="place.no != null" class="num">{{ place.no }}</span>
          <span class="icon" aria-hidden="true">{{ place.icon }}</span>
          <b class="name">{{ place.name }}</b>
          <span class="meta">{{ place.meta }}</span>
        </div>
        <ul class="prow">
          <li v-for="photo in place.photos" :key="photo.id">
            <button
              type="button"
              class="pcell"
              :class="{
                sel: card.photoIds.includes(photo.id),
                dimmed: atLimit && !card.photoIds.includes(photo.id),
              }"
              :aria-pressed="card.photoIds.includes(photo.id)"
              @click="onPick(photo.id)"
            >
              <PhotoThumb :photo-id="photo.id" :alt="photo.originalFilename || '사진'" />
              <span class="ck" :class="{ on: card.photoIds.includes(photo.id) }" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.picker-msg {
  color: #8b95a1;
  padding: 24px 0;
}
.picker-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  color: #8b95a1;
}
.picker-bar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  background: #fff;
  border-bottom: 1px solid #e5e8eb;
}
.picker-bar .grow {
  flex: 1;
}
.hint {
  color: #8b95a1;
  font-size: 0.85rem;
}
.count {
  font-weight: 700;
  font-size: 0.85rem;
  color: #6d40d6;
  background: #f1ecfb;
  border-radius: 99px;
  padding: 4px 12px;
}
.count.full {
  color: #fff;
  background: #6d40d6;
}
.place {
  margin-top: 18px;
}
.place-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
}
.place-head .num {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 99px;
  background: #3182f6;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
}
.place-head .name {
  font-size: 0.95rem;
}
.place-head .meta {
  color: #8b95a1;
  font-size: 0.8rem;
  font-weight: 600;
}
.prow {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.pcell {
  position: relative;
  width: 96px;
  height: 96px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  border-radius: 11px;
}
.pcell::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 11px;
  box-shadow: inset 0 0 0 0 #16c47e;
  transition: box-shadow 0.12s ease;
  pointer-events: none;
}
.pcell.sel::after {
  box-shadow: inset 0 0 0 3px #16c47e;
}
.pcell.dimmed {
  opacity: 0.45;
}
.ck {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 20px;
  height: 20px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.85);
  border: 1.5px solid #8b95a1;
}
.ck.on {
  background: #16c47e;
  border-color: #16c47e;
}
.ck.on::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
}
</style>
