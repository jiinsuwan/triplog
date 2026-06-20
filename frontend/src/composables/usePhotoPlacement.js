import { ref, reactive, computed, onMounted } from 'vue'
import { fetchItinerary } from '@/api/itineraryApi'
import { fetchTripPhotos } from '@/api/photoApi'

// 사진 ↔ 일정 장소(stop) 배치 상태 (S4-LOG-01 기록 뷰).
// 일정(days/stops)은 trip 트랙 itinerary API 를 그대로 재사용한다. 사진↔stop 연결은 아직 스키마에
// 없으므로 여기서 로컬 상태로 관리한다(실제 영속 = photo.stop_id 스키마 = 추후 상호리뷰).
//  - autoPlaceByTime: EXIF 촬영시각(takenAt)에 가장 가까운 시간의 stop 으로 근사 자동 배치.
//  - placePhoto/unplacePhoto: 사용자가 드래그로 배치/해제.
export function usePhotoPlacement(tripId) {
  const days = ref([])
  const photos = ref([])
  const placement = reactive({}) // photoId -> stopId
  const loading = ref(true)
  const error = ref('')

  const stopsFlat = computed(() =>
    days.value.flatMap((day) => (day.stops ?? []).map((stop) => ({ ...stop, dayNumber: day.dayNumber }))),
  )
  const unplaced = computed(() => photos.value.filter((p) => placement[p.id] == null))
  // 장소에 배치된 사진 id — 카드가 되는 대상(미배치는 카드 안 만듦).
  const placedPhotoIds = computed(() =>
    photos.value.filter((p) => placement[p.id] != null).map((p) => p.id),
  )

  function photosForStop(stopId) {
    return photos.value.filter((p) => placement[p.id] === stopId)
  }
  function placePhoto(photoId, stopId) {
    placement[photoId] = stopId
  }
  function unplacePhoto(photoId) {
    delete placement[photoId]
  }

  // EXIF 시각 기준 근사 자동배치 — 같은 stop 시간에 가장 가까운 사진을 그 장소로.
  function autoPlaceByTime() {
    const stops = stopsFlat.value.filter((s) => s.selectedTime)
    if (stops.length === 0) return
    for (const photo of photos.value) {
      if (placement[photo.id] != null || !photo.takenAt) continue
      const taken = new Date(photo.takenAt)
      const minutes = taken.getHours() * 60 + taken.getMinutes()
      let bestId = null
      let bestDiff = Infinity
      for (const stop of stops) {
        const [h, m] = String(stop.selectedTime).split(':').map(Number)
        const diff = Math.abs(h * 60 + m - minutes)
        if (diff < bestDiff) {
          bestDiff = diff
          bestId = stop.id
        }
      }
      if (bestId != null) placement[photo.id] = bestId
    }
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const [itinerary, photoList] = await Promise.all([
        fetchItinerary(tripId),
        fetchTripPhotos(tripId),
      ])
      days.value = Array.isArray(itinerary?.days) ? itinerary.days : []
      photos.value = Array.isArray(photoList) ? photoList : []
      autoPlaceByTime()
    } catch {
      error.value = '일정·사진을 불러오지 못했습니다.'
    } finally {
      loading.value = false
    }
  }
  onMounted(load)

  return {
    days,
    photos,
    placement,
    loading,
    error,
    stopsFlat,
    unplaced,
    placedPhotoIds,
    photosForStop,
    placePhoto,
    unplacePhoto,
    autoPlaceByTime,
    reload: load,
  }
}
