<script setup>
// 카드 위저드 "고르기" 단계 본문 (S3-LOG-06 / #74, 2단계).
// 이 여행에 연결된 사진을 촬영 날짜로 묶어 보여주고, 최대 10장 고른다.
// 선택 상태는 useCardStore(직렬화 도메인)에 두어 단계 이동 간 유지된다.
// 업로드는 이 화면 책임이 아니다 — 사진이 없으면 사진 화면으로 안내한다.
import { computed, onMounted, onScopeDispose, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import { fetchTripPhotos } from '@/api/photoApi'
import { groupPhotosByDay, MAX_CARD_PHOTOS, useCardStore } from '@/stores/card'

const props = defineProps({
  tripId: { type: Number, default: null },
})

const router = useRouter()
const card = useCardStore()

const status = ref('loading') // 'loading' | 'ready' | 'error'
const photos = ref([])

let disposed = false
onScopeDispose(() => {
  disposed = true
})

async function loadPhotos() {
  if (!props.tripId) {
    photos.value = []
    status.value = 'ready'
    return
  }
  status.value = 'loading'
  try {
    const list = await fetchTripPhotos(props.tripId)
    if (disposed) return
    photos.value = Array.isArray(list) ? list : []
    status.value = 'ready'
  } catch {
    if (disposed) return
    status.value = 'error'
  }
}
onMounted(loadPhotos)

const groups = computed(() => groupPhotosByDay(photos.value))
const isEmpty = computed(() => status.value === 'ready' && photos.value.length === 0)
const selectedCount = computed(() => card.photoIds.length)
const atLimit = computed(() => selectedCount.value >= MAX_CARD_PHOTOS)

// 한도 초과 클릭 피드백. 전역 토스트 인프라가 없어 인라인 안내로 처리한다(잠깐 보였다 사라짐).
const showLimitNotice = ref(false)
let noticeTimer = null
function onPick(photoId) {
  const blocked = card.togglePhoto(photoId)
  if (!blocked) return
  showLimitNotice.value = true
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    showLimitNotice.value = false
  }, 2200)
}
onScopeDispose(() => clearTimeout(noticeTimer))

function goUpload() {
  if (props.tripId) {
    router.push({ name: 'trip-photos', params: { tripId: String(props.tripId) } })
  }
}
</script>

<template>
  <div class="picker">
    <p v-if="status === 'loading'" class="picker-msg">사진을 불러오는 중…</p>

    <Message v-else-if="status === 'error'" severity="error" :closable="false">
      사진을 불러오지 못했습니다.
      <Button label="다시 시도" link @click="loadPhotos" />
    </Message>

    <div v-else-if="!tripId" class="picker-empty">
      <p>여행 정보가 없습니다. 사진 화면에서 다시 시작해 주세요.</p>
    </div>

    <div v-else-if="isEmpty" class="picker-empty">
      <p>이 여행에 사진이 없습니다. 먼저 사진을 올려 주세요.</p>
      <Button label="사진 올리러 가기" icon="pi pi-upload" @click="goUpload" />
    </div>

    <template v-else>
      <div class="picker-bar">
        <span class="count" :class="{ full: atLimit }">
          {{ selectedCount }}/{{ MAX_CARD_PHOTOS }}장 선택
        </span>
        <span v-if="showLimitNotice" class="limit-notice" role="status">
          최대 {{ MAX_CARD_PHOTOS }}장까지 선택할 수 있습니다.
        </span>
      </div>

      <section v-for="group in groups" :key="group.key" class="day-group">
        <h3 class="day-head">
          <span class="day">{{ group.dayLabel }}</span>
          <span v-if="group.dateLabel" class="date">{{ group.dateLabel }}</span>
        </h3>
        <ul class="grid">
          <li v-for="photo in group.photos" :key="photo.id">
            <button
              type="button"
              class="cell"
              :class="{
                selected: card.photoIds.includes(photo.id),
                dimmed: atLimit && !card.photoIds.includes(photo.id),
              }"
              :aria-pressed="card.photoIds.includes(photo.id)"
              @click="onPick(photo.id)"
            >
              <PhotoThumb :photo-id="photo.id" :alt="photo.originalFilename || '사진'" />
              <span v-if="card.photoIds.includes(photo.id)" class="check" aria-hidden="true">✓</span>
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
  gap: 12px;
  padding: 10px 0;
  background: #fff;
}
.count {
  font-weight: 600;
}
.count.full {
  color: #3182f6;
}
.limit-notice {
  color: #f04452;
  font-size: 0.9rem;
}
.day-group {
  margin-top: 16px;
}
.day-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 1rem;
}
.day-head .date {
  color: #8b95a1;
  font-size: 0.85rem;
  font-weight: 400;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}
.cell {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  border-radius: 10px;
}
.cell::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 10px;
  box-shadow: inset 0 0 0 0 #3182f6;
  transition: box-shadow 0.12s ease;
  pointer-events: none;
}
.cell.selected::after {
  box-shadow: inset 0 0 0 3px #3182f6;
}
.cell.dimmed {
  opacity: 0.45;
}
.check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #3182f6;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
}
</style>
