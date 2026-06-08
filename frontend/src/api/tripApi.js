import instance from './instance'

export async function fetchTrips(params = {}) {
  const { data } = await instance.get('/trips', {
    params: {
      page: params.page ?? 0,
      size: params.size ?? 20,
    },
  })
  return data.data
}

export async function createTrip(payload) {
  const { data } = await instance.post('/trips', payload)
  return data.data
}

export async function fetchTrip(id) {
  const { data } = await instance.get(`/trips/${id}`)
  return data.data
}

export async function updateTrip(id, payload) {
  const { data } = await instance.put(`/trips/${id}`, payload)
  return data.data
}

export async function deleteTrip(id) {
  const { data } = await instance.delete(`/trips/${id}`)
  return data.data
}
