import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as tripApi from '@/api/tripApi'

export const useTripStore = defineStore('trip', () => {
  const trips = ref([])
  const page = ref(0)
  const total = ref(0)
  const loading = ref(false)
  const creating = ref(false)
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

  function clearError() {
    error.value = ''
  }

  return {
    trips,
    page,
    total,
    loading,
    creating,
    error,
    hasTrips,
    fetchTripList,
    createTrip,
    clearError,
  }
})

function toMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback
}
