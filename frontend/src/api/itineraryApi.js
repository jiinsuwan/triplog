import * as httpApi from './itineraryHttpApi'
import {
  createMockItineraryStop,
  deleteMockItineraryStop,
  fetchMockItinerary,
  listMockItineraryPlaces,
  reorderMockItineraryStops,
  updateMockItineraryStop,
} from '@/mocks/itineraryMockData'

const USE_MOCK =
  import.meta.env.MODE === 'test' ||
  import.meta.env.VITE_USE_MOCK_ITINERARY === 'true'

export function isMockItineraryEnabled() {
  return USE_MOCK
}

export function getItineraryCandidatePlaces() {
  return listMockItineraryPlaces()
}

export async function fetchItinerary(tripId, context = {}) {
  if (USE_MOCK) return fetchMockItinerary(tripId, context.trip)
  return httpApi.fetchItinerary(tripId)
}

export async function createItineraryStop(tripId, dayNumber, payload, context = {}) {
  if (USE_MOCK) return createMockItineraryStop(tripId, dayNumber, payload, context.trip)
  return httpApi.createItineraryStop(tripId, dayNumber, payload)
}

export async function updateItineraryStop(tripId, dayNumber, stopId, payload, context = {}) {
  if (USE_MOCK) return updateMockItineraryStop(tripId, dayNumber, stopId, payload, context.trip)
  return httpApi.updateItineraryStop(tripId, dayNumber, stopId, payload)
}

export async function deleteItineraryStop(tripId, dayNumber, stopId, context = {}) {
  if (USE_MOCK) return deleteMockItineraryStop(tripId, dayNumber, stopId, context.trip)
  return httpApi.deleteItineraryStop(tripId, dayNumber, stopId)
}

export async function reorderItineraryStops(tripId, dayNumber, stopIds, context = {}) {
  if (USE_MOCK) return reorderMockItineraryStops(tripId, dayNumber, stopIds, context.trip)
  return httpApi.reorderItineraryStops(tripId, dayNumber, stopIds)
}
