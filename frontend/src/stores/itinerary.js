import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createItineraryStop,
  deleteItineraryStop,
  fetchItinerary,
  getItineraryCandidatePlaces,
  isMockItineraryEnabled,
  reorderItineraryStops,
  updateItineraryStop,
} from '@/api/itineraryApi'
import { moveStop, toItineraryPlaceRequest } from '@/utils/itinerary'

export const useItineraryStore = defineStore('itinerary', () => {
  const itinerary = ref(null)
  const candidatePlaces = ref([])
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref('')

  const isMock = computed(() => isMockItineraryEnabled())
  const days = computed(() => itinerary.value?.days ?? [])
  const totalStops = computed(() =>
    days.value.reduce((sum, day) => sum + (day.stops?.length ?? 0), 0),
  )

  async function fetchTripItinerary(tripId, trip) {
    loading.value = true
    error.value = ''
    try {
      itinerary.value = await fetchItinerary(tripId, { trip })
      candidatePlaces.value = getItineraryCandidatePlaces()
      return itinerary.value
    } catch (fetchError) {
      error.value = toMessage(fetchError, '일정을 불러오지 못했습니다.')
      throw fetchError
    } finally {
      loading.value = false
    }
  }

  async function addPlaceToDay(tripId, dayNumber, place, options = {}) {
    mutating.value = true
    error.value = ''
    try {
      const stop = await createItineraryStop(
        tripId,
        dayNumber,
        {
          selectedTime: options.selectedTime || '',
          memo: options.memo || '',
          transport: options.transport || 'walk',
          place: toItineraryPlaceRequest(place),
        },
        { trip: itinerary.value?.trip },
      )
      replaceDayStops(dayNumber, [...findDay(dayNumber).stops, stop])
      return stop
    } catch (createError) {
      error.value = toMessage(createError, '방문지를 추가하지 못했습니다.')
      throw createError
    } finally {
      mutating.value = false
    }
  }

  async function updateStop(tripId, dayNumber, stopId, payload) {
    mutating.value = true
    error.value = ''
    try {
      const updated = await updateItineraryStop(tripId, dayNumber, stopId, payload, {
        trip: itinerary.value?.trip,
      })
      const day = findDay(dayNumber)
      replaceDayStops(
        dayNumber,
        day.stops.map((stop) => (stop.id === Number(stopId) ? updated : stop)),
      )
      return updated
    } catch (updateError) {
      error.value = toMessage(updateError, '방문지를 수정하지 못했습니다.')
      throw updateError
    } finally {
      mutating.value = false
    }
  }

  async function deleteStop(tripId, dayNumber, stopId) {
    mutating.value = true
    error.value = ''
    try {
      await deleteItineraryStop(tripId, dayNumber, stopId, { trip: itinerary.value?.trip })
      itinerary.value = await fetchItinerary(tripId, { trip: itinerary.value?.trip })
    } catch (deleteError) {
      error.value = toMessage(deleteError, '방문지를 삭제하지 못했습니다.')
      throw deleteError
    } finally {
      mutating.value = false
    }
  }

  async function moveStopWithinDay(tripId, dayNumber, stopId, direction) {
    const reorderedStops = moveStop(findDay(dayNumber).stops, stopId, direction)
    const stopIds = reorderedStops.map((stop) => stop.id)

    mutating.value = true
    error.value = ''
    try {
      const response = await reorderItineraryStops(tripId, dayNumber, stopIds, {
        trip: itinerary.value?.trip,
      })
      if (response?.days) {
        itinerary.value = response
      } else {
        replaceDayStops(dayNumber, reorderedStops)
      }
    } catch (reorderError) {
      error.value = toMessage(reorderError, '방문지 순서를 바꾸지 못했습니다.')
      throw reorderError
    } finally {
      mutating.value = false
    }
  }

  function findDay(dayNumber) {
    const day = itinerary.value?.days?.find((item) => item.dayNumber === Number(dayNumber))
    if (!day) throw new Error('여행 날짜를 찾지 못했습니다.')
    return day
  }

  function replaceDayStops(dayNumber, stops) {
    if (!itinerary.value) return
    itinerary.value = {
      ...itinerary.value,
      days: itinerary.value.days.map((day) =>
        day.dayNumber === Number(dayNumber)
          ? {
              ...day,
              stops: stops.map((stop, index) => ({
                ...stop,
                dayNumber: Number(dayNumber),
                sortOrder: index + 1,
              })),
            }
          : day,
      ),
    }
  }

  function clearError() {
    error.value = ''
  }

  return {
    itinerary,
    candidatePlaces,
    loading,
    mutating,
    error,
    isMock,
    days,
    totalStops,
    fetchTripItinerary,
    addPlaceToDay,
    updateStop,
    deleteStop,
    moveStopWithinDay,
    clearError,
  }
})

function toMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback
}
