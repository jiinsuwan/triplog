import { describe, expect, it } from 'vitest'
import {
  buildFallbackPinStyle,
  buildKakaoMapSearchPlan,
  buildMapGridViewports,
  centerFocusedRadius,
  distanceMeters,
  isWithinSearchViewport,
  limitPlacesForViewport,
  mapBoundsToPlain,
} from './placeMapSearch'

describe('placeMapSearch', () => {
  const viewport = {
    center: { lat: 5, lng: 5 },
    bounds: { minLat: 0, maxLat: 10, minLng: 0, maxLng: 10 },
    radius: 20000,
    useRadiusFilter: false,
  }

  it('splits close map levels into four bounded search tiles', () => {
    const tiles = buildMapGridViewports(viewport)
    expect(tiles).toHaveLength(4)
    expect(tiles.map((tile) => tile.center)).toEqual([
      { lat: 2.5, lng: 2.5 },
      { lat: 2.5, lng: 7.5 },
      { lat: 7.5, lng: 2.5 },
      { lat: 7.5, lng: 7.5 },
    ])
    expect(tiles.every((tile) => tile.useRadiusFilter === false)).toBe(true)
  })

  it('keeps level-dependent Kakao result limits and grid policy', () => {
    expect(buildKakaoMapSearchPlan(viewport, 1)).toMatchObject({
      pageLimit: 2,
      pageSize: 10,
      maxResults: 56,
    })
    expect(buildKakaoMapSearchPlan(viewport, 1).viewports).toHaveLength(4)
    expect(buildKakaoMapSearchPlan(viewport, 5)).toMatchObject({
      viewports: [viewport],
      pageLimit: 1,
      pageSize: 8,
      maxResults: 28,
    })
  })

  it('balances close-level results across viewport cells before truncating', () => {
    const places = [
      { id: 'nw-1', latitude: 9, longitude: 1 },
      { id: 'nw-2', latitude: 8.5, longitude: 1.5 },
      { id: 'ne', latitude: 9, longitude: 9 },
      { id: 'sw', latitude: 1, longitude: 1 },
      { id: 'se', latitude: 1, longitude: 9 },
    ]
    const limited = limitPlacesForViewport(places, viewport, 4, 2)
    expect(limited.map((place) => place.id)).toEqual(expect.arrayContaining(['nw-1', 'ne', 'sw', 'se']))
    expect(limited).toHaveLength(4)
  })

  it('uses bounds or radius filtering without Kakao objects', () => {
    expect(isWithinSearchViewport({ latitude: 6, longitude: 4 }, viewport)).toBe(true)
    expect(isWithinSearchViewport({ latitude: 12, longitude: 4 }, viewport)).toBe(false)
    expect(isWithinSearchViewport(
      { latitude: 37.5665, longitude: 126.978 },
      { center: { lat: 37.5665, lng: 126.978 }, radius: 100, useRadiusFilter: true },
    )).toBe(true)
    expect(distanceMeters(37.5665, 126.978, 37.5665, 126.978)).toBe(0)
  })

  it('converts map bounds and keeps fallback pins inside the stage', () => {
    const point = (lat, lng) => ({ getLat: () => lat, getLng: () => lng })
    expect(mapBoundsToPlain({
      getNorthEast: () => point(10, 20),
      getSouthWest: () => point(1, 2),
    })).toEqual({ minLat: 1, maxLat: 10, minLng: 2, maxLng: 20 })

    const places = [
      { latitude: 0, longitude: 0 },
      { latitude: 10, longitude: 10 },
    ]
    expect(buildFallbackPinStyle(places, places[0])).toEqual({ left: '10%', top: '84%' })
    expect(buildFallbackPinStyle(places, places[1])).toEqual({ left: '88%', top: '12%' })
    expect(centerFocusedRadius(2000, 5)).toBe(840)
  })
})
