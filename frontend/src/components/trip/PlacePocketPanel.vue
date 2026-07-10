<script setup>
import Button from 'primevue/button'

defineProps({
  isPocketed: { type: Function, required: true },
  isRoutedPlace: { type: Function, required: true },
  itineraryLoading: { type: Boolean, required: true },
  itineraryMode: { type: Boolean, required: true },
  mapMarkerType: { type: Function, required: true },
  markerSymbol: { type: Function, required: true },
  pocketDisplayPlaces: { type: Array, required: true },
  routeCandidatePlaces: { type: Array, required: true },
})

const emit = defineEmits(['add-route-place', 'open-itinerary', 'toggle-pocket'])
</script>

<template>
  <aside class="pocket-panel">
    <template v-if="!itineraryMode">
      <div class="pocket-head"><div><span class="eyebrow">Pocket</span><h2>담긴 장소</h2></div><strong>{{ pocketDisplayPlaces.length }}</strong></div>
      <div v-if="pocketDisplayPlaces.length" class="pocket-list">
        <article v-for="place in pocketDisplayPlaces" :key="place.uid" class="pocket-item" :class="{ routed: isRoutedPlace(place) }">
          <span class="pocket-dot" :class="mapMarkerType(place)">{{ markerSymbol(place) }}</span>
          <span class="pocket-item__text"><strong>{{ place.name }}</strong><small>{{ place.category || '장소' }}</small></span>
          <Button v-if="isPocketed(place)" label="×" severity="secondary" text rounded aria-label="담기 취소" @click="emit('toggle-pocket', place)" />
          <em v-else>일정 포함</em>
        </article>
      </div>
      <p v-else class="empty-pocket">지도나 목록에서 장소를 골라 담아보세요.</p>
      <Button class="route-start-button" label="일정 배치하기" severity="success" :disabled="!pocketDisplayPlaces.length" :loading="itineraryLoading" @click="emit('open-itinerary')" />
    </template>
    <template v-else>
      <div class="pocket-head"><div><span class="eyebrow">Pocket</span><h2>경로 후보</h2></div><strong>{{ routeCandidatePlaces.length }}</strong></div>
      <div v-if="routeCandidatePlaces.length" class="pocket-list">
        <article v-for="place in routeCandidatePlaces" :key="place.uid" class="pocket-item">
          <span class="pocket-dot" :class="mapMarkerType(place)">{{ markerSymbol(place) }}</span>
          <span class="pocket-item__text"><strong>{{ place.name }}</strong><small>{{ place.category || '장소' }}</small></span>
          <Button label="＋" severity="secondary" text rounded :aria-label="place.name + ' 일정 추가'" @click="emit('add-route-place', place)" />
        </article>
      </div>
      <p v-else class="empty-pocket">추가할 경로 후보가 없습니다.</p>
    </template>
  </aside>
</template>
