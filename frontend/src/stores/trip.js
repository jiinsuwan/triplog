import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as tripApi from '@/api/tripApi'

export const useTripStore = defineStore('trip', () => {
  const trips = ref([])
  const selectedTrip = ref(null)
  const page = ref(0)
  const total = ref(0)
  const loading = ref(false)
  const detailLoading = ref(false)
  const creating = ref(false)
  const updating = ref(false)
  const deleting = ref(false)
  const error = ref('')

  const hasTrips = computed(() => trips.value.length > 0)

  async function fetchTripList(options = {}) {
    loading.value = true
    error.value = ''

    try {
      const result = await tripApi.fetchTrips(options)
      trips.value = result.items ?? []
      page.value = result.page ?? options.page ?? 0
      total.value = result.total ?? trips.value.length
      return result
    } catch (fetchError) {
      error.value = toMessage(fetchError, '여행 목록을 불러오지 못했습니다.')
      throw fetchError
    } finally {
      loading.value = false
    }
  }

  async function createTrip(payload) {
    creating.value = true
    error.value = ''

    try {
      const created = await tripApi.createTrip(payload)
      trips.value = [created, ...trips.value.filter((trip) => trip.id !== created.id)]
      total.value += 1
      return created
    } catch (createError) {
      error.value = toMessage(createError, '여행을 생성하지 못했습니다.')
      throw createError
    } finally {
      creating.value = false
    }
  }

  async function fetchTripDetail(id) {
    detailLoading.value = true
    error.value = ''

    try {
      const trip = await tripApi.fetchTrip(id)
      selectedTrip.value = trip
      upsertTrip(trip)
      return trip
    } catch (fetchError) {
      error.value = toMessage(fetchError, '여행 상세 정보를 불러오지 못했습니다.')
      throw fetchError
    } finally {
      detailLoading.value = false
    }
  }

  async function updateTrip(id, payload) {
    updating.value = true
    error.value = ''

    try {
      const updated = await tripApi.updateTrip(id, payload)
      selectedTrip.value = updated
      upsertTrip(updated)
      return updated
    } catch (updateError) {
      error.value = toMessage(updateError, '여행을 수정하지 못했습니다.')
      throw updateError
    } finally {
      updating.value = false
    }
  }

  async function deleteTrip(id) {
    deleting.value = true
    error.value = ''

    try {
      await tripApi.deleteTrip(id)
      trips.value = trips.value.filter((trip) => trip.id !== Number(id))
      if (selectedTrip.value?.id === Number(id)) {
        selectedTrip.value = null
      }
      total.value = Math.max(0, total.value - 1)
    } catch (deleteError) {
      error.value = toMessage(deleteError, '여행을 삭제하지 못했습니다.')
      throw deleteError
    } finally {
      deleting.value = false
    }
  }

  function clearError() {
    error.value = ''
  }

  function upsertTrip(trip) {
    const index = trips.value.findIndex((item) => item.id === trip.id)
    if (index >= 0) {
      trips.value.splice(index, 1, trip)
    } else {
      trips.value = [trip, ...trips.value]
    }
  }

  return {
    trips,
    selectedTrip,
    page,
    total,
    loading,
    detailLoading,
    creating,
    updating,
    deleting,
    error,
    hasTrips,
    fetchTripList,
    createTrip,
    fetchTripDetail,
    updateTrip,
    deleteTrip,
    clearError,
  }
})

function toMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback
}
