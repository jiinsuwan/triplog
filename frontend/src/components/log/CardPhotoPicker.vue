<script setup>
// 카드 위저드 "고르기" 단계 본문 (S3-LOG-06 / #74, 2단계).
// 배치 정본 = docs/design/log-flow-proposal.html ④: 경로 순서대로 장소(여행지/숙소)를 나열하고
// 장소마다 그 장소 사진을 1:1로 매칭해 고른다(장소당 1장 권장 · 전체 최대 10장).
// 선택 상태는 useCardStore 에 두어 단계 이동 간 유지된다. 업로드는 이 화면 책임이 아니다.
//
// 사진↔장소 연결이 스키마에 없어, 장소 구조는 목업(buildMockPlaceGroups)으로 깔고 실제 사진을
// 장소별로 분배한다 — 고른 결과는 실제 photoId.
import { computed, onMounted, onScopeDispose, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import { fetchTripPhotos } from '@/api/photoApi'
import { MAX_CARD_PHOTOS, useCardStore } from '@/stores/card'
import { buildMockPlaceGroups } from '@/card/mock/mockPlaceGroups'

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

// 경로 순서대로 장소별로 묶은 사진(장소 구조는 목업, 사진은 실제).
const placeGroups = computed(() => buildMockPlaceGroups(photos.value))
const isEmpty = computed(() => status.value === 'ready' && photos.value.length === 0)
const selectedCount = computed(() => card.photoIds.length)
const atLimit = computed(() => selectedCount.value >= MAX_CARD_PHOTOS)

// 한도 초과 클릭 피드백(전역 토스트 인프라가 없어 인라인 안내).
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

function isSelected(photoId) {
  return card.photoIds.includes(photoId)
}

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
      <!-- 상단: 안내 + 선택 카운트 -->
      <div class="picker-bar">
        <span class="hint">경로 순서대로 · 장소당 1장 권장</span>
        <span class="grow" />
        <span v-if="showLimitNotice" class="limit-notice" role="status">
          최대 {{ MAX_CARD_PHOTOS }}장까지 선택할 수 있습니다.
        </span>
        <span class="count" :class="{ full: atLimit }">{{ selectedCount }} / {{ MAX_CARD_PHOTOS }} 선택</span>
      </div>

      <!-- 장소별 사진 매칭 -->
      <section v-for="place in placeGroups" :key="place.key" class="place">
        <div class="place-head">
          <span class="num">{{ place.no }}</span>
          <span class="icon" aria-hidden="true">{{ place.icon }}</span>
          <b class="name">{{ place.name }}</b>
          <span class="meta">{{ place.meta }}</span>
        </div>
        <ul class="prow">
          <li v-for="photo in place.photos" :key="photo.id">
            <button
              type="button"
              class="pcell"
              :class="{ sel: isSelected(photo.id), dimmed: atLimit && !isSelected(photo.id) }"
              :aria-pressed="isSelected(photo.id)"
              @click="onPick(photo.id)"
            >
              <PhotoThumb :photo-id="photo.id" :alt="photo.originalFilename || '사진'" />
              <span class="ck" :class="{ on: isSelected(photo.id) }" aria-hidden="true" />
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
  border-bottom: 1px solid #e5e8eb;
}
.picker-bar .grow {
  flex: 1;
}
.hint {
  color: #8b95a1;
  font-size: 0.85rem;
}
.limit-notice {
  color: #f04452;
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
