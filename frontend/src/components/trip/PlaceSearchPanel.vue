<script setup>
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'

defineProps({
  activeTab: { type: String, required: true },
  canGoNextPage: { type: Boolean, required: true },
  canGoPrevPage: { type: Boolean, required: true },
  categoryOptions: { type: Array, required: true },
  currentPage: { type: Number, required: true },
  isPocketed: { type: Function, required: true },
  keyword: { type: String, required: true },
  mapMarkerType: { type: Function, required: true },
  markerSymbol: { type: Function, required: true },
  pageNumbers: { type: Array, required: true },
  paginatedPlaces: { type: Array, required: true },
  searching: { type: Boolean, required: true },
  selectedPlace: { type: Object, default: null },
  visibleCount: { type: Number, required: true },
})

const emit = defineEmits([
  'go-page',
  'search',
  'select-place',
  'toggle-pocket',
  'update:activeTab',
  'update:keyword',
])
</script>

<template>
  <aside class="place-list-panel">
    <div class="search-card">
      <div class="field-row">
        <InputText
          :model-value="keyword"
          placeholder="카페, 관광지, 식당..."
          @update:model-value="emit('update:keyword', $event)"
          @keyup.enter="emit('search')"
        />
        <Button label="검색" :loading="searching" @click="emit('search')" />
      </div>
      <SelectButton
        :model-value="activeTab"
        :options="categoryOptions"
        option-label="label"
        option-value="value"
        @update:model-value="emit('update:activeTab', $event)"
      />
    </div>
    <div class="list-head"><strong>검색 결과</strong><em>{{ visibleCount }}곳</em></div>
    <div class="place-list">
      <article
        v-for="place in paginatedPlaces"
        :key="place.uid"
        class="place-row"
        :class="{ active: selectedPlace?.uid === place.uid }"
      >
        <button type="button" class="place-row__main" @click="emit('select-place', place)">
          <span class="place-type-dot" :class="mapMarkerType(place)">{{ markerSymbol(place) }}</span>
          <span>
            <strong>{{ place.name }}</strong>
            <small>{{ place.origin === 'kakao' ? '카카오맵' : '한국관광공사' }} · {{ place.category || '장소' }}</small>
          </span>
        </button>
        <Button
          class="place-row__pocket"
          :label="isPocketed(place) ? '✓' : '＋'"
          severity="secondary"
          outlined
          rounded
          :aria-label="place.name + ' 담기'"
          @click="emit('toggle-pocket', place)"
        />
      </article>
    </div>
    <nav class="pagination" aria-label="검색 결과 페이지">
      <Button label="이전" size="small" severity="secondary" outlined :disabled="!canGoPrevPage" @click="emit('go-page', currentPage - 1)" />
      <Button
        v-for="pageNumber in pageNumbers"
        :key="pageNumber"
        :label="String(pageNumber)"
        size="small"
        :severity="pageNumber === currentPage ? 'contrast' : 'secondary'"
        :outlined="pageNumber !== currentPage"
        @click="emit('go-page', pageNumber)"
      />
      <Button label="다음" size="small" severity="secondary" outlined :disabled="!canGoNextPage" @click="emit('go-page', currentPage + 1)" />
    </nav>
  </aside>
</template>
