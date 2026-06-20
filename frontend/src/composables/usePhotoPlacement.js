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
    days.value.flatMap((day) =>
      (day.stops ?? []).map((stop) => ({ ...stop, dayNumber: day.dayNumber, date: day.date })),
    ),
  )
  const unplaced = computed(() => photos.value.filter((p) => placement[p.id] == null))
  // 배치된 사진 id = 카드 대상(미배치 제외). 순서는 화면과 같게 일정(DAY/stop) 순서로.
  const placedPhotoIds = computed(() =>
    stopsFlat.value.flatMap((stop) =>
      photos.value.filter((p) => placement[p.id] === stop.id).map((p) => p.id),
    ),
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
  // 배치된 사진 전부를 미배치로(전체 빼기).
  function unplaceAll() {
    for (const key of Object.keys(placement)) delete placement[key]
  }

  // EXIF 시각 기준 근사 자동배치 — 같은 stop 시간에 가장 가까운 사진을 그 장소로.
  function autoPlaceByTime() {
    const stops = stopsFlat.value.filter((s) => s.selectedTime)
    if (stops.length === 0) return
    for (const photo of photos.value) {
      if (placement[photo.id] != null || !photo.takenAt) continue
      const taken = new Date(photo.takenAt)
      const minutes = taken.getHours() * 60 + taken.getMinutes()
      const takenDate = `${taken.getFullYear()}-${String(taken.getMonth() + 1).padStart(2, '0')}-${String(taken.getDate()).padStart(2, '0')}`
      // 같은 날짜 stop 우선(다일자 여행에서 다른 날에 붙는 것 방지) — 없으면 전체에서 시각 근사.
      const sameDay = stops.filter((s) => s.date === takenDate)
      const candidates = sameDay.length ? sameDay : stops
      let bestId = null
      let bestDiff = Infinity
      for (const stop of candidates) {
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
    unplaceAll,
    autoPlaceByTime,
    reload: load,
  }
}
