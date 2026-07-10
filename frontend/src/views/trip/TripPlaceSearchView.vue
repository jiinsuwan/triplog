<script setup>
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import { AppTopBar } from '@/components/common'
import ItineraryTimelinePanel from '@/components/trip/ItineraryTimelinePanel.vue'
import PlaceMapPanel from '@/components/trip/PlaceMapPanel.vue'
import PlacePocketPanel from '@/components/trip/PlacePocketPanel.vue'
import PlaceSearchPanel from '@/components/trip/PlaceSearchPanel.vue'
import { useTripPlaceSearchController } from '@/composables/useTripPlaceSearchController'

const {
  CATEGORY_OPTIONS,
  TRANSPORT_VIEW_OPTIONS,
  activeDay,
  activeDayNumber,
  activeDisplayStops,
  activeTab,
  addPocketPlaceToRoute,
  canGoNextPage,
  canGoPrevPage,
  canSearchCurrentMapArea,
  closeItineraryBuilder,
  completeItineraryBuilder,
  currentPage,
  dayTabs,
  deleteStop,
  fallbackPinStyle,
  formatDayDate,
  formatStayMinutes,
  goBack,
  goToPage,
  handleMapPlaceClick,
  hasCoordinates,
  hasScheduledStops,
  isManualTravelInputVisible,
  isPocketed,
  isRoutedPlace,
  itineraryMode,
  itineraryNotice,
  itineraryStore,
  keyword,
  loading,
  mapMarkerType,
  mapPlaces,
  markerSymbol,
  openItineraryBuilder,
  pageNumbers,
  paginatedPlaces,
  placeError,
  pocketDisplayPlaces,
  routeCandidatePlaces,
  routeLegMode,
  routeLegSummary,
  routeLegTimelineStyle,
  routeLegTitle,
  routePlaceTypeLabel,
  sdkError,
  searchCurrentMapArea,
  searchKakaoPlaces,
  searching,
  selectPlace,
  selectedPlace,
  selectedStopId,
  setMapElement,
  setStopDraft,
  startStayResize,
  startStopDrag,
  stopDraft,
  stopStayMinutes,
  stopTimelineStyle,
  timelineCanvasStyle,
  timelineHourLabel,
  timelineHourStyle,
  timelineHours,
  togglePocket,
  trip,
  tripRegion,
  tripStore,
  updateLegTransport,
  updateManualTravelDuration,
  visiblePlaces,
} = useTripPlaceSearchController()
</script>

<template>
  <div class="place-page-shell">
    <AppTopBar active="trips" search-placeholder="장소, 골목, 맛집 검색">
      <template #actions>
        <Button label="여행으로" severity="secondary" outlined @click="goBack" />
      </template>
    </AppTopBar>

    <main class="place-page">
      <header class="place-header">
        <div>
          <span class="tag-hand">{{ itineraryMode ? 'Route Builder' : 'Place Search' }}</span>
          <h1>{{ itineraryMode ? '담은 장소를 일정으로 엮어요' : tripRegion + ' 주변 장소를 담아요' }}</h1>
          <p>{{ itineraryMode ? '날짜별로 방문 순서와 머무는 시간을 빠르게 정합니다.' : '관광 데이터와 카카오맵 검색 결과를 한 화면에서 확인하고 보관함에 담습니다.' }}</p>
        </div>
        <div class="step-card">
          <span :class="{ on: !itineraryMode }">1 장소 담기</span>
          <i aria-hidden="true">›</i>
          <span :class="{ on: itineraryMode }">2 일정 배치</span>
        </div>
      </header>

      <Message v-if="tripStore.error && !trip" severity="error" :closable="false" class="state-message">{{ tripStore.error }}</Message>
      <Message v-if="placeError" severity="error" :closable="false" class="state-message">{{ placeError }}</Message>
      <Message v-if="itineraryNotice" severity="success" :closable="false" class="state-message">{{ itineraryNotice }}</Message>

      <section v-if="loading" class="loading-state" aria-live="polite">
        <ProgressSpinner aria-label="장소 정보를 불러오는 중" />
        <span>장소 정보를 불러오고 있습니다.</span>
      </section>

      <section v-else class="search-shell" :class="{ planning: itineraryMode }">
        <PlaceSearchPanel
          v-if="!itineraryMode"
          v-model:keyword="keyword"
          v-model:active-tab="activeTab"
          :can-go-next-page="canGoNextPage"
          :can-go-prev-page="canGoPrevPage"
          :category-options="CATEGORY_OPTIONS"
          :current-page="currentPage"
          :is-pocketed="isPocketed"
          :map-marker-type="mapMarkerType"
          :marker-symbol="markerSymbol"
          :page-numbers="pageNumbers"
          :paginated-places="paginatedPlaces"
          :searching="searching"
          :selected-place="selectedPlace"
          :visible-count="visiblePlaces.length"
          @go-page="goToPage"
          @search="searchKakaoPlaces"
          @select-place="selectPlace"
          @toggle-pocket="togglePocket"
        />

        <ItineraryTimelinePanel
          v-else
          v-model:active-day-number="activeDayNumber"
          :active-day="activeDay"
          :active-display-stops="activeDisplayStops"
          :day-tabs="dayTabs"
          :format-day-date="formatDayDate"
          :format-stay-minutes="formatStayMinutes"
          :is-manual-travel-input-visible="isManualTravelInputVisible"
          :mutating="itineraryStore.mutating"
          :route-leg-mode="routeLegMode"
          :route-leg-summary="routeLegSummary"
          :route-leg-timeline-style="routeLegTimelineStyle"
          :route-leg-title="routeLegTitle"
          :route-place-type-label="routePlaceTypeLabel"
          :selected-stop-id="selectedStopId"
          :stop-draft="stopDraft"
          :stop-stay-minutes="stopStayMinutes"
          :stop-timeline-style="stopTimelineStyle"
          :timeline-canvas-style="timelineCanvasStyle"
          :timeline-hour-label="timelineHourLabel"
          :timeline-hour-style="timelineHourStyle"
          :timeline-hours="timelineHours"
          :transport-options="TRANSPORT_VIEW_OPTIONS"
          @close="closeItineraryBuilder"
          @delete-stop="deleteStop"
          @resize-stop="startStayResize"
          @start-drag="startStopDrag"
          @update-leg-transport="updateLegTransport"
          @update-manual-duration="updateManualTravelDuration"
          @update-stop-draft="setStopDraft"
        />

        <PlaceMapPanel
          :can-complete="hasScheduledStops && !itineraryStore.loading && !itineraryStore.mutating && !tripStore.updating"
          :can-search-current-map-area="canSearchCurrentMapArea"
          :fallback-pin-style="fallbackPinStyle"
          :has-coordinates="hasCoordinates"
          :is-pocketed="isPocketed"
          :itinerary-mode="itineraryMode"
          :map-marker-type="mapMarkerType"
          :map-places="mapPlaces"
          :map-ref="setMapElement"
          :sdk-error="sdkError"
          :searching="searching"
          :trip-region="tripRegion"
          :trip-updating="tripStore.updating"
          @complete="completeItineraryBuilder"
          @fallback-place-click="handleMapPlaceClick"
          @search-current-area="searchCurrentMapArea"
        />

        <PlacePocketPanel
          :is-pocketed="isPocketed"
          :is-routed-place="isRoutedPlace"
          :itinerary-loading="itineraryStore.loading"
          :itinerary-mode="itineraryMode"
          :map-marker-type="mapMarkerType"
          :marker-symbol="markerSymbol"
          :pocket-display-places="pocketDisplayPlaces"
          :route-candidate-places="routeCandidatePlaces"
          @add-route-place="addPocketPlaceToRoute"
          @open-itinerary="openItineraryBuilder"
          @toggle-pocket="togglePocket"
        />
      </section>
    </main>
  </div>
</template>

<style src="./TripPlaceSearchView.css"></style>
