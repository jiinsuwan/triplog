<script setup>
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'

defineProps({
  activeDay: { type: Object, default: null },
  activeDayNumber: { type: Number, required: true },
  activeDisplayStops: { type: Array, required: true },
  dayTabs: { type: Array, required: true },
  formatDayDate: { type: Function, required: true },
  formatStayMinutes: { type: Function, required: true },
  isManualTravelInputVisible: { type: Function, required: true },
  mutating: { type: Boolean, required: true },
  routeLegMode: { type: Function, required: true },
  routeLegSummary: { type: Function, required: true },
  routeLegTimelineStyle: { type: Function, required: true },
  routeLegTitle: { type: Function, required: true },
  routePlaceTypeLabel: { type: Function, required: true },
  selectedStopId: { type: [Number, String], default: null },
  stopDraft: { type: Function, required: true },
  stopStayMinutes: { type: Function, required: true },
  stopTimelineStyle: { type: Function, required: true },
  timelineCanvasStyle: { type: Object, required: true },
  timelineHourLabel: { type: Function, required: true },
  timelineHourStyle: { type: Function, required: true },
  timelineHours: { type: Array, required: true },
  transportOptions: { type: Array, required: true },
})

const emit = defineEmits([
  'close',
  'delete-stop',
  'resize-stop',
  'start-drag',
  'update:activeDayNumber',
  'update-leg-transport',
  'update-manual-duration',
  'update-stop-draft',
])
</script>

<template>
  <aside class="place-list-panel planning">
    <div class="route-builder-head">
      <Button label="장소 담기로" severity="secondary" outlined @click="emit('close')" />
    </div>
    <SelectButton
      :model-value="activeDayNumber"
      :options="dayTabs"
      option-label="label"
      option-value="value"
      class="day-tabs"
      @update:model-value="emit('update:activeDayNumber', $event)"
    />
    <section class="route-stop-section">
      <header class="route-section-head">
        <strong>DAY {{ activeDay?.dayNumber || 1 }} · {{ formatDayDate(activeDay?.date) }}</strong>
        <small>09:00부터 21:00까지, 카드 높이로 머무는 시간을 조정합니다.</small>
      </header>
      <div class="route-stop-list">
        <div class="route-time-canvas" :style="timelineCanvasStyle">
          <div v-for="hour in timelineHours" :key="hour" class="route-hour-row" :style="timelineHourStyle(hour)">
            <span>{{ timelineHourLabel(hour) }}</span>
            <i aria-hidden="true"></i>
          </div>
          <p v-if="!activeDisplayStops.length" class="empty-pocket route-empty-timeline">지도 마커나 Pocket의 ＋ 버튼으로 장소를 일정에 추가하세요.</p>
          <template v-for="(stop, index) in activeDisplayStops" :key="stop.id">
            <article
              class="route-stop-card"
              :class="{ active: selectedStopId === stop.id }"
              :style="stopTimelineStyle(stop)"
              @pointerdown="emit('start-drag', stop, $event)"
            >
              <span class="route-stop-resize route-stop-resize--top" @pointerdown.stop.prevent="emit('resize-stop', stop, 'top', $event)"></span>
              <div class="route-stop-main">
                <div>
                  <strong>{{ stop.place.name }}</strong>
                  <small><b>{{ routePlaceTypeLabel(stop.place) }}</b>{{ stop.place.category ? ' · ' + stop.place.category : '' }}</small>
                  <em>머무는 시간 {{ formatStayMinutes(stopStayMinutes(stop)) }}</em>
                </div>
              </div>
              <Button class="route-stop-delete" label="×" severity="danger" text rounded :aria-label="stop.place.name + ' 삭제'" @pointerdown.stop @click="emit('delete-stop', stop)" />
              <span class="route-stop-resize route-stop-resize--bottom" @pointerdown.stop.prevent="emit('resize-stop', stop, 'bottom', $event)"></span>
            </article>
            <div v-if="index < activeDisplayStops.length - 1" class="route-leg" :style="routeLegTimelineStyle(stop, activeDisplayStops[index + 1])">
              <div class="route-leg__details" :class="{ 'has-manual': isManualTravelInputVisible(stop) }">
                <Select
                  :model-value="routeLegMode(stop)"
                  :options="transportOptions"
                  option-label="label"
                  option-value="value"
                  :disabled="mutating"
                  @pointerdown.stop
                  @update:model-value="emit('update-leg-transport', stop, $event)"
                />
                <em :title="routeLegTitle(stop, activeDisplayStops[index + 1])">{{ routeLegSummary(stop, activeDisplayStops[index + 1]) }}</em>
                <label v-if="isManualTravelInputVisible(stop)" class="route-leg__manual">
                  <InputText
                    :model-value="stopDraft(stop).manualTravelMinutes"
                    class="route-leg__manual-input"
                    inputmode="numeric"
                    aria-label="대중교통 이동 시간 직접 입력"
                    @update:model-value="emit('update-stop-draft', stop, { manualTravelMinutes: $event })"
                    @change="emit('update-manual-duration', stop)"
                  />
                  <span>분</span>
                </label>
              </div>
            </div>
          </template>
        </div>
      </div>
    </section>
  </aside>
</template>
