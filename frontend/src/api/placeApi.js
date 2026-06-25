import instance from './instance'

export async function fetchPlaces(params = {}) {
  const { data } = await instance.get('/places', {
    params: compactParams({
      region1: params.region1,
      region2: params.region2,
      placeType: params.placeType,
      category: params.category,
      keyword: params.keyword,
      page: params.page ?? 0,
      size: params.size ?? 60,
    }),
  })
  return data.data
}

export async function fetchPlaceDetail(placeId) {
  const { data } = await instance.get(`/places/${placeId}`)
  return data.data
}

export async function fetchPlaceRegions() {
  const { data } = await instance.get('/places/regions')
  return data.data
}

function compactParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}
