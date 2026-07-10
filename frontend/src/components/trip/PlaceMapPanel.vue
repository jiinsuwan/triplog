<script setup>
import Button from 'primevue/button'
import Message from 'primevue/message'

defineProps({
  canComplete: { type: Boolean, required: true },
  canSearchCurrentMapArea: { type: Boolean, required: true },
  fallbackPinStyle: { type: Function, required: true },
  hasCoordinates: { type: Function, required: true },
  isPocketed: { type: Function, required: true },
  itineraryMode: { type: Boolean, required: true },
  mapMarkerType: { type: Function, required: true },
  mapPlaces: { type: Array, required: true },
  mapRef: { type: Function, required: true },
  sdkError: { type: String, default: '' },
  searching: { type: Boolean, required: true },
  tripRegion: { type: String, required: true },
  tripUpdating: { type: Boolean, required: true },
})

const emit = defineEmits(['complete', 'fallback-place-click', 'search-current-area'])
</script>

<template>
  <section class="map-panel">
    <div class="map-toolbar">
      <div>
        <span class="eyebrow">{{ itineraryMode ? 'Itinerary Map' : 'Kakao Map' }}</span>
        <h2>{{ itineraryMode ? tripRegion + ' 일정 지도' : tripRegion + ' 주변 지도' }}</h2>
      </div>
      <div class="map-tools">
        <Button
          v-if="itineraryMode"
          class="route-complete-button"
          label="완료"
          :disabled="!canComplete"
          :loading="tripUpdating"
          @click="emit('complete')"
        />
        <Button
          v-if="canSearchCurrentMapArea"
          label="이 위치에서 재검색"
          severity="secondary"
          outlined
          size="small"
          :loading="searching"
          @click="emit('search-current-area')"
        />
      </div>
    </div>
    <div class="map-stage">
      <div :ref="mapRef" class="kakao-map" :class="{ disabled: sdkError }" />
      <Message v-if="sdkError" severity="error" :closable="false" class="map-error">카카오맵을 불러오지 못했습니다. {{ sdkError }}</Message>
      <div v-if="sdkError" class="fallback-map">
        <button
          v-for="place in mapPlaces.filter(hasCoordinates)"
          :key="place.uid"
          type="button"
          class="fallback-pin"
          :class="[mapMarkerType(place), { pocketed: isPocketed(place) }]"
          :style="fallbackPinStyle(place)"
          @click="emit('fallback-place-click', place)"
        >
          <span aria-hidden="true" />
          <strong>{{ place.name }}</strong>
        </button>
      </div>
    </div>
  </section>
</template>
