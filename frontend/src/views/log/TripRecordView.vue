<script setup>
// 여행 기록 뷰 (S4-LOG-01, 목업 ③). 좌 경로 지도 · 우 일정 타임라인 · 하단 미분류 트레이.
// 사진을 장소(stop)로 끌어다 놓아 동선 위에 배치한다. 일정은 trip 트랙 itinerary 를 재사용,
// 사진↔장소 배치는 usePhotoPlacement(로컬). 여기서 카드 만들기로 진입한다.
import { onScopeDispose } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { usePhotoPlacement } from '@/composables/usePhotoPlacement'
import { useRecordDrag, cancelPhotoDrag } from '@/composables/useRecordDrag'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import RecordRouteMap from '@/components/log/record/RecordRouteMap.vue'
import RecordStop from '@/components/log/record/RecordStop.vue'
import RecordPhotoTray from '@/components/log/record/RecordPhotoTray.vue'

const route = useRoute()
const router = useRouter()
const tripId = Number(route.params.tripId)

const { days, loading, error, stopsFlat, unplaced, photosForStop, placePhoto, unplacePhoto } =
  usePhotoPlacement(tripId)

// 사진 드래그(포인터 기반) 드롭 처리 등록 + 고스트 상태 구독.
const { drag } = useRecordDrag({ place: placePhoto, unplace: unplacePhoto })
onScopeDispose(cancelPhotoDrag)

function goCards() {
  router.push({ name: 'card-create', query: { tripId: String(tripId) } })
}
function goUpload() {
  router.push({ name: 'trip-photos', params: { tripId: String(tripId) } })
}
</script>

<template>
  <main class="record">
    <header class="rec-head">
      <div>
        <span class="eyebrow">여행 기록</span>
        <h1>사진을 일정에 배치</h1>
        <p>사진을 장소로 끌어다 놓아 여행 동선 위에 배치하세요. (촬영시각 기준으로 자동 배치됩니다.)</p>
      </div>
      <div class="actions">
        <Button label="사진 올리기" icon="pi pi-upload" severity="secondary" @click="goUpload" />
        <Button label="카드 만들기" icon="pi pi-images" @click="goCards" />
      </div>
    </header>

    <p v-if="loading" class="status">불러오는 중…</p>
    <Message v-else-if="error" severity="error" :closable="false">{{ error }}</Message>

    <template v-else>
      <div class="cols">
        <div class="map-col">
          <RecordRouteMap :stops="stopsFlat" />
        </div>
        <div class="itin-col">
          <div v-if="!stopsFlat.length" class="empty-itin">
            <p>아직 이 여행의 일정이 없습니다. 일정을 먼저 만들어 주세요.</p>
          </div>
          <section v-for="day in days" :key="day.dayNumber" class="day">
            <h2 class="day-head">
              DAY {{ day.dayNumber }}
              <span v-if="day.date" class="date">{{ day.date }}</span>
            </h2>
            <RecordStop
              v-for="stop in day.stops"
              :key="stop.id"
              :stop="stop"
              :photos="photosForStop(stop.id)"
            />
          </section>
        </div>
      </div>

      <RecordPhotoTray class="tray" :photos="unplaced" />
    </template>

    <!-- 드래그 중 커서를 따라다니는 사진 고스트(드롭 판정을 막지 않도록 pointer-events:none). -->
    <Teleport to="body">
      <div
        v-if="drag.active && drag.photoId != null"
        class="drag-ghost"
        :style="{ left: drag.x + 'px', top: drag.y + 'px' }"
      >
        <PhotoThumb :photo-id="drag.photoId" :alt="drag.alt" />
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.record {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.rec-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.eyebrow {
  color: var(--p-primary-color, #3182f6);
  font-weight: 600;
  font-size: 0.85rem;
}
.rec-head h1 {
  margin: 4px 0 6px;
  font-size: 1.5rem;
}
.rec-head p {
  margin: 0;
  color: #8b95a1;
}
.actions {
  display: flex;
  gap: 8px;
}
.status {
  color: #8b95a1;
  padding: 24px 0;
}
.cols {
  display: flex;
  gap: 18px;
  align-items: stretch;
}
.map-col {
  flex: 1.3;
  min-width: 0;
}
.itin-col {
  flex: 0 0 420px;
  max-width: 420px;
  max-height: 70vh;
  overflow-y: auto;
}
.day-head {
  font-size: 0.95rem;
  margin: 14px 0 8px;
}
.day-head .date {
  color: #8b95a1;
  font-size: 0.8rem;
  font-weight: 400;
}
.empty-itin {
  color: #8b95a1;
}
.tray {
  margin-top: 18px;
}
/* 드래그 고스트 — 커서 따라다니는 사진 미리보기. 드롭 판정(elementFromPoint)을 막지 않게 pointer-events 없음. */
.drag-ghost {
  position: fixed;
  z-index: 1000;
  width: 64px;
  height: 64px;
  transform: translate(-50%, -50%) rotate(-3deg);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  opacity: 0.92;
  pointer-events: none;
}

@media (max-width: 840px) {
  .cols {
    flex-direction: column;
  }
  .itin-col {
    flex: 1 1 auto;
    max-width: none;
    max-height: none;
  }
}
</style>
