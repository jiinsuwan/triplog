<script setup>
// 다녀옴 미리보기 팝업의 사진 배치 타임라인 (S4-LOG-04, 기록 뷰).
// logs-mockup ① 디자인. 일정 경로 타임라인(DAY 탭 + stop) 위에 사진을 배치해 시간순으로 본다.
// 일정(days)은 부모(TripPreviewDialog)가 이미 받은 걸 props 로 주입받아 재사용한다(중복 fetch 방지).
// 사진만 usePhotoPlacement 가 로드하고, 배치/해제는 포인터 드래그(useRecordDrag)로 한다.
import { computed, ref, watch, onScopeDispose } from 'vue'
import RecordPhotoTray from './RecordPhotoTray.vue'
import RecordRouteMap from './RecordRouteMap.vue'
import RecordStop from './RecordStop.vue'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import PhotoManageDialog from '@/components/log/PhotoManageDialog.vue'
import { usePhotoPlacement } from '@/composables/usePhotoPlacement'
import { useRecordDrag, cancelPhotoDrag } from '@/composables/useRecordDrag'

const props = defineProps({
  days: { type: Array, default: () => [] }, // 부모가 받은 일정(plannedDays)
  tripId: { type: Number, default: null },
  region: { type: String, default: '' },
})
const emit = defineEmits(['update:placed'])

const {
  loading,
  error,
  photos,
  unplaced,
  placedPhotoIds,
  photosForStop,
  placePhoto,
  unplacePhoto,
  refreshPhotos,
  removeFromTrip,
} = usePhotoPlacement(props.tripId, { externalDays: () => props.days })

// 드래그(포인터) 배치/해제 등록 + 언마운트 시 진행 중 드래그 정리.
const { drag } = useRecordDrag({ place: placePhoto, unplace: unplacePhoto })
onScopeDispose(cancelPhotoDrag)

// 표시용 정렬 — 응답 정렬에 의존하지 않고 dayNumber / sortOrder(동률 시 selectedTime) 기준.
function timeKey(value) {
  const [h, m] = String(value ?? '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : Number.POSITIVE_INFINITY
}
const sortedDays = computed(() =>
  [...props.days]
    .filter((day) => (day.stops ?? []).length > 0)
    .sort((a, b) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0)),
)
const activeDayNumber = ref(null)
const activeDay = computed(() => {
  if (!sortedDays.value.length) return null
  return sortedDays.value.find((day) => day.dayNumber === activeDayNumber.value) ?? sortedDays.value[0]
})
const activeStops = computed(() =>
  [...(activeDay.value?.stops ?? [])].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || timeKey(a.selectedTime) - timeKey(b.selectedTime),
  ),
)
function photoCountForDay(day) {
  return (day.stops ?? []).reduce((n, stop) => n + photosForStop(stop.id).length, 0)
}
const activeDayLabel = computed(() => {
  const day = activeDay.value
  if (!day) return ''
  const date = day.date ? day.date.replaceAll('-', '.') : `DAY ${day.dayNumber}`
  return `${date} · ${activeStops.value.length}곳 · 사진 ${photoCountForDay(day)}`
})

// 사진 추가·관리 모달(이미 올린 사진 보기·빼기 + 새 업로드). CardPhotoPicker 와 같은 흐름.
const showManage = ref(false)
const removingIds = ref(new Set())
const manageError = ref('')
async function onRemovePhoto(photoId) {
  if (removingIds.value.has(photoId)) return
  removingIds.value = new Set(removingIds.value).add(photoId)
  manageError.value = ''
  try {
    await removeFromTrip(photoId)
  } catch {
    manageError.value = '사진을 빼지 못했어요. 잠시 후 다시 시도해 주세요.'
  } finally {
    const s = new Set(removingIds.value)
    s.delete(photoId)
    removingIds.value = s
  }
}

// 배치된 사진 id(카드 대상)를 부모로 올린다 — 부모 footer 의 "추억 만들러 가기" 가 활성·진입에 쓴다.
watch(
  placedPhotoIds,
  (ids) => emit('update:placed', [...ids]),
  { immediate: true },
)
</script>

<template>
  <div class="rec">
    <p v-if="loading" class="rec-msg">사진을 불러오는 중…</p>
    <p v-else-if="error" class="rec-msg is-err">{{ error }}</p>

    <template v-else>
      <div class="rec-cols">
        <!-- 좌: 경로 지도(스키매틱) — 렌더는 공용 RecordRouteMap, 프레임(격자·범례)은 여기서 -->
        <div class="rec-map">
          <div class="rec-map-grid"></div>
          <RecordRouteMap :stops="activeStops" bare caption="" />
          <span class="rec-legend">{{ region || '여행지' }} · DAY {{ activeDay?.dayNumber || 1 }} 경로</span>
        </div>

        <!-- 우: DAY 탭 + stop 타임라인 -->
        <div class="rec-plan">
          <div class="rec-tabs">
            <button
              v-for="day in sortedDays"
              :key="day.dayNumber"
              type="button"
              :class="{ on: day.dayNumber === activeDay?.dayNumber }"
              @click="activeDayNumber = day.dayNumber"
            >
              DAY {{ day.dayNumber }}
            </button>
            <span class="rec-tabs-meta">{{ activeDayLabel }}</span>
          </div>
          <p class="rec-drag-hint">사진을 끌어 다른 장소로 옮길 수 있어요</p>

          <div class="rec-stops">
            <RecordStop
              v-for="stop in activeStops"
              :key="stop.id"
              variant="timeline"
              :stop="stop"
              :photos="photosForStop(stop.id)"
              @remove="unplacePhoto"
            >
              <template #empty-action>
                <button type="button" class="rec-add" @click="showManage = true">사진 관리</button>
              </template>
            </RecordStop>
          </div>
        </div>
      </div>

      <!-- 미배치 트레이 -->
      <div class="rec-tray-wrap">
        <RecordPhotoTray :photos="unplaced">
          <template #action>
            <button type="button" class="rec-tray-add" @click="showManage = true">사진 관리</button>
          </template>
        </RecordPhotoTray>
      </div>

      <!-- 사진 추가·관리 모달 -->
      <PhotoManageDialog
        v-model:visible="showManage"
        :trip-id="tripId"
        :photos="photos"
        :removing-ids="removingIds"
        :error="manageError"
        @remove="onRemovePhoto"
        @uploaded="refreshPhotos"
      />

      <!-- 드래그 고스트(커서 따라다님, 드롭 판정 막지 않게 pointer-events:none) -->
      <Teleport to="body">
        <div
          v-if="drag.active && drag.photoId != null"
          class="rec-ghost"
          :style="{ left: drag.x + 'px', top: drag.y + 'px' }"
        >
          <PhotoThumb :photo-id="drag.photoId" :alt="drag.alt" />
        </div>
      </Teleport>
    </template>
  </div>
</template>

<style scoped>
.rec {
  width: 100%;
}
.rec-msg {
  color: var(--ink-sub);
  font-size: 13px;
  padding: 28px 0;
  text-align: center;
}
.rec-msg.is-err {
  color: var(--complete);
}

/* 좌(지도) / 우(타임라인) 2열 — logs-mockup ① pv-body */
.rec-cols {
  display: grid;
  grid-template-columns: 236px 1fr;
  gap: 16px;
  align-items: start;
}

/* 경로 지도 */
.rec-map {
  position: relative;
  height: 340px;
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  background: linear-gradient(135deg, var(--paper), var(--paper-dim) 50%, var(--bg));
}
.rec-map-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--ink-sub) 8%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--ink-sub) 8%, transparent) 1px, transparent 1px);
  background-size: 38px 38px;
}
.rec-legend {
  position: absolute;
  left: 12px;
  bottom: 12px;
  font-size: 11px;
  font-weight: 800;
  color: var(--ink-sub);
  background: color-mix(in srgb, var(--paper-card) 84%, transparent);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 5px 10px;
}

/* DAY 탭 + 타임라인 */
/* 일정 영역 높이 고정 — 일정이 길어도 팝업이 커지지 않고 타임라인만 스크롤된다. */
.rec-plan {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 340px;
}
.rec-tabs {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.rec-tabs button {
  background: var(--on-fill);
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--ink-sub);
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 700;
  padding: 5px 12px;
}
.rec-tabs button.on {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--on-fill);
}
.rec-tabs-meta {
  margin-left: auto;
  color: var(--ink-faint);
  font-size: 11px;
}
.rec-drag-hint {
  font-family: var(--font-hand);
  color: var(--accent);
  font-size: 14px;
  margin: 6px 0 10px;
}

.rec-stops {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* 스크롤은 되지만 스크롤바는 숨긴다 */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* 구 Edge/IE */
}
.rec-stops::-webkit-scrollbar {
  display: none; /* Chrome·Safari */
}
/* stop 행 자체(.rec-stop 계열)는 공용 RecordStop(variant="timeline")으로 이동 */
.rec-add {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  border: 1.5px dashed var(--line-strong);
  background: var(--paper-dim);
  display: grid;
  place-items: center;
  color: var(--ink-faint);
  font-size: 11px;
  cursor: pointer;
}

/* 미배치 트레이 액션 / 하단 */
.rec-tray-add {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  border: 1px solid var(--accent);
  background: var(--on-fill);
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
}
/* 미배치 트레이 — 위 타임라인과 여백 + logs① 흰 배경·주황 점선으로 오버라이드 */
.rec-tray-wrap {
  margin-top: 20px;
}
.rec-tray-wrap :deep(.tray) {
  background: var(--paper-card);
  border-color: var(--accent);
}
.rec-tray-wrap :deep(.tray.over) {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.rec-tray-wrap :deep(.count),
.rec-tray-wrap :deep(.empty) {
  color: var(--ink-faint);
}

.rec-ghost {
  position: fixed;
  z-index: 1000;
  width: 64px;
  height: 64px;
  transform: translate(-50%, -50%) rotate(-3deg);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: var(--shadow-pop);
  opacity: 0.92;
  pointer-events: none;
}

@media (max-width: 720px) {
  .rec-cols {
    grid-template-columns: 1fr;
  }
}
</style>
