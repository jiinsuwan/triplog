import instance from './instance'

export async function fetchItinerary(tripId) {
  const { data } = await instance.get(`/trips/${tripId}/itinerary`)
  return data.data
}

export async function createItineraryStop(tripId, dayNumber, payload) {
  const { data } = await instance.post(`/trips/${tripId}/itinerary/days/${dayNumber}/stops`, payload)
  return data.data
}

export async function updateItineraryStop(tripId, dayNumber, stopId, payload) {
  const { data } = await instance.put(
    `/trips/${tripId}/itinerary/days/${dayNumber}/stops/${stopId}`,
    payload,
  )
  return data.data
}

export async function deleteItineraryStop(tripId, dayNumber, stopId) {
  const { data } = await instance.delete(`/trips/${tripId}/itinerary/days/${dayNumber}/stops/${stopId}`)
  return data.data
}

export async function reorderItineraryStops(tripId, dayNumber, stopIds) {
  const { data } = await instance.put(`/trips/${tripId}/itinerary/days/${dayNumber}/stops/order`, {
    stopIds,
  })
  return data.data
}
