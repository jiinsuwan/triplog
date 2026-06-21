<script setup>
// 카드 만들기 1단계 = "사진을 일정에 배치" 화면 (S3-LOG-06).
// 사진을 일정 장소(stop)로 끌어 배치한다(포인터 드래그, useRecordDrag). 배치한 사진만 카드가 된다
// (미배치 = 제외). 사진은 이미 업로드돼 있고, 백엔드가 외곽선을 백그라운드 전처리하므로 여기서
// 상태를 폴링해 보여주고 card.outlines 에 저장한다 — 에디터 진입 시 대기를 줄인다.
import { computed, ref, watch, onScopeDispose } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import PhotoManageDialog from '@/components/log/PhotoManageDialog.vue'
import RecordRouteMap from '@/components/log/record/RecordRouteMap.vue'
import RecordStop from '@/components/log/record/RecordStop.vue'
import RecordPhotoTray from '@/components/log/record/RecordPhotoTray.vue'
import { useRecordDrag, cancelPhotoDrag } from '@/composables/useRecordDrag'
import { usePhotoPlacement } from '@/composables/usePhotoPlacement'
import { isOutlineTerminal } from '@/composables/useOutlinePolling'
import { fetchPhotoOutline } from '@/api/outlineApi'
import { useCardStore } from '@/stores/card'

const props = defineProps({
  tripId: { type: Number, default: null },
})
const emit = defineEmits(['proceed'])

const card = useCardStore()
const { days, loading, error, photos, stopsFlat, unplaced, placedPhotoIds, photosForStop, placePhoto, unplacePhoto, unplaceAll, refreshPhotos, removeFromTrip } =
  usePhotoPlacement(props.tripId)

// 사진 관리 모달(이미 올린 사진 보기·빼기 + 새 업로드).
const showManage = ref(false)
const removingIds = ref(new Set())
async function onRemovePhoto(photoId) {
  if (removingIds.value.has(photoId)) return
  removingIds.value = new Set(removingIds.value).add(photoId)
  try {
    await removeFromTrip(photoId)
  } catch {
    /* 실패 — 다음 시도 */
  } finally {
    const s = new Set(removingIds.value)
    s.delete(photoId)
    removingIds.value = s
  }
}

// 드래그(포인터 기반) — 배치/해제 처리 등록 + 고스트 상태 구독.
const { drag } = useRecordDrag({ place: placePhoto, unplace: unplacePhoto })
onScopeDispose(cancelPhotoDrag)

// 외곽선 전처리 상태 폴링(백엔드가 업로드 후 백그라운드 처리). 보여주기 + card.outlines 시드.
const outlineStatus = ref({}) // photoId -> 'PENDING' | 'READY' | 'FAILED'
let pollTimer = null
let disposed = false
let pollStart = 0
let polling = false
async function pollOutlines() {
  if (disposed) return
  if (!pollStart) pollStart = performance.now()
  const pending = photos.value.map((p) => p.id).filter((id) => !isOutlineTerminal(outlineStatus.value[id]))
  await Promise.all(
    pending.map(async (id) => {
      try {
        const res = await fetchPhotoOutline(id)
        outlineStatus.value = { ...outlineStatus.value, [id]: res.status }
        if (isOutlineTerminal(res.status)) card.setOutline(id, { status: res.status, items: res.items })
      } catch {
        /* 일시 실패 → 다음 틱 재시도 */
      }
    }),
  )
  if (disposed) return
  const stillPending = photos.value.some((p) => !isOutlineTerminal(outlineStatus.value[p.id]))
  // 무한 대기 방지(워커 다운 시 영영 PENDING) — 90s deadline 후 중단(에디터가 이어서 폴링).
  if (stillPending && performance.now() - pollStart < 90000) pollTimer = setTimeout(pollOutlines, 2500)
}
watch(
  photos,
  (list) => {
    // 사진 로드되면 한 번만 폴링 시작(setTimeout id 는 발사 후에도 truthy 라 가드로 못 씀 → polling 플래그).
    if (list.length && !polling && !disposed) {
      polling = true
      pollOutlines()
    }
  },
  { immediate: true },
)
onScopeDispose(() => {
  disposed = true
  if (pollTimer) clearTimeout(pollTimer)
})

const outlineSummary = computed(() => {
  const ids = photos.value.map((p) => p.id)
  const ready = ids.filter((id) => outlineStatus.value[id] === 'READY').length
  const failed = ids.filter((id) => outlineStatus.value[id] === 'FAILED').length
  return {
    ready,
    failed,
    total: ids.length,
    done: ids.length > 0 && ids.every((id) => isOutlineTerminal(outlineStatus.value[id])),
  }
})

const placedCount = computed(() => placedPhotoIds.value.length)
const isEmpty = computed(() => !loading.value && !error.value && photos.value.length === 0)

function proceed() {
  if (!placedCount.value) return
  card.setPhotoIds(placedPhotoIds.value)
  emit('proceed')
}
</script>

<template>
  <div class="place">
    <p v-if="loading" class="msg">사진·일정을 불러오는 중…</p>
    <Message v-else-if="error" severity="error" :closable="false">{{ error }}</Message>

    <div v-else-if="!tripId" class="empty">
      <p>여행 정보가 없습니다. 사진 화면에서 다시 시작해 주세요.</p>
    </div>

    <div v-else-if="isEmpty" class="empty">
      <p>이 여행에 사진이 없습니다. 먼저 사진을 올려 주세요.</p>
      <Button label="＋ 사진 추가" icon="pi pi-upload" @click="showManage = true" />
    </div>

    <div v-else-if="!stopsFlat.length" class="empty">
      <p>이 여행의 일정이 없습니다. 일정을 먼저 만들어 주세요(사진을 배치할 장소가 필요합니다).</p>
    </div>

    <template v-else>
      <!-- 상단 바: 전처리 상태 + 에디터로 -->
      <div class="bar">
        <span class="prep" :class="{ done: outlineSummary.done }">
          <template v-if="outlineSummary.done">✓ 사진 준비 완료</template>
          <template v-else>AI가 사진을 준비하고 있어요 · {{ outlineSummary.ready }}/{{ outlineSummary.total }}</template>
          <template v-if="outlineSummary.failed"> · 실패 {{ outlineSummary.failed }}</template>
        </span>
        <span class="grow" />
        <span v-if="!placedCount" class="nudge">사진을 장소에 끌어다 놓으면 카드를 만들 수 있어요</span>
        <Button
          v-if="placedCount"
          label="전체 빼기"
          icon="pi pi-times"
          size="small"
          severity="secondary"
          text
          @click="unplaceAll"
        />
        <Button
          :label="`에디터로 (${placedCount}장)`"
          icon="pi pi-chevron-right"
          icon-pos="right"
          :disabled="!placedCount"
          @click="proceed"
        />
      </div>

      <!-- 좌: 경로 지도 / 우: 일정 장소 목록(드롭 타깃) -->
      <div class="cols">
        <div class="map-wrap">
          <RecordRouteMap :stops="stopsFlat" />
        </div>
        <div class="list">
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
              @remove="unplacePhoto"
            />
          </section>
        </div>
      </div>

      <!-- 미배치 트레이 — 카드로 만들어지지 않음을 명시. 사진 관리(추가·빼기)도 여기서. -->
      <p class="tray-note">📷 미배치 사진은 <b>카드로 만들어지지 않습니다.</b> 장소에 끌어다 놓으세요.</p>
      <RecordPhotoTray :photos="unplaced">
        <template #action>
          <Button label="사진 추가·관리" icon="pi pi-images" size="small" severity="secondary" @click="showManage = true" />
        </template>
      </RecordPhotoTray>
    </template>

    <!-- 사진 관리 모달(보기·빼기 + 새 업로드) -->
    <PhotoManageDialog
      v-model:visible="showManage"
      :trip-id="tripId"
      :photos="photos"
      :removing-ids="removingIds"
      @remove="onRemovePhoto"
      @uploaded="refreshPhotos"
    />

    <!-- 드래그 고스트(커서 따라다님, 드롭 판정 막지 않게 pointer-events:none) -->
    <Teleport to="body">
      <div
        v-if="drag.active && drag.photoId != null"
        class="drag-ghost"
        :style="{ left: drag.x + 'px', top: drag.y + 'px' }"
      >
        <PhotoThumb :photo-id="drag.photoId" :alt="drag.alt" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.msg {
  color: #8b95a1;
  padding: 24px 0;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  color: #8b95a1;
}
.bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  background: #fff;
  border-bottom: 1px solid #e5e8eb;
}
.bar .grow {
  flex: 1;
}
.prep {
  font-size: 0.85rem;
  font-weight: 600;
  color: #6d40d6;
  background: #f1ecfb;
  border-radius: 99px;
  padding: 4px 12px;
}
.prep.done {
  color: #16a866;
  background: #e7f7ee;
}
.nudge {
  color: #8b95a1;
  font-size: 0.82rem;
}
/* 좌(지도) / 우(배치 목록) 2열. 지도를 ✕로 접으면 목록이 전폭. */
.cols {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-top: 12px;
}
.list {
  flex: 1;
  min-width: 0;
}
.map-wrap {
  position: sticky;
  top: 56px;
  flex: 0 0 360px;
}
/* 지도(정사각형 SVG)는 칼럼 높이로 고정 캡 — 안 그러면 너비만큼 세로로 커진다. */
.map-wrap :deep(.map),
.map-wrap :deep(.canvas) {
  min-height: 0;
  height: 380px;
}
@media (max-width: 760px) {
  .cols {
    flex-direction: column;
  }
  .map-wrap {
    position: relative;
    top: 0;
    flex: 1 1 auto;
    width: 100%;
  }
}
.day {
  margin-top: 8px;
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
.tray-note {
  margin: 18px 0 8px;
  color: #6b7684;
  font-size: 0.85rem;
}
.tray-note b {
  color: #f04452;
}
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
</style>
