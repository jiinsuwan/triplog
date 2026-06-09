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
