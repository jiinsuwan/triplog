import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// 일정은 props 로 주입하므로 fetchItinerary 는 안 불려야 한다. 사진만 fetchTripPhotos 로.
vi.mock('@/api/itineraryApi', () => ({
  fetchItinerary: vi.fn(() => Promise.resolve({ days: [] })),
}))
vi.mock('@/api/photoApi', () => ({
  fetchTripPhotos: vi.fn(() => Promise.resolve([])),
  fetchPhotoContent: vi.fn(() => Promise.resolve(new Blob())),
  unlinkPhotoFromTrip: vi.fn(() => Promise.resolve()),
}))

import RecordPlacementBody from '@/components/log/record/RecordPlacementBody.vue'
import { fetchTripPhotos } from '@/api/photoApi'
import { fetchItinerary as fetchItineraryApi } from '@/api/itineraryApi'

// 일부러 stop 을 sortOrder 역순으로 둔다 — 화면이 응답 순서가 아니라 시간(sortOrder)으로 정렬하는지 본다.
const days = [
  {
    dayNumber: 1,
    date: '2024-05-01',
    stops: [
      { id: 11, sortOrder: 2, selectedTime: '13:00', place: { name: 'B카페', placeType: 'CAFE', category: '카페' } },
      { id: 10, sortOrder: 1, selectedTime: '09:00', place: { name: 'A명소', placeType: 'ATTRACTION', category: '명소' } },
    ],
  },
]

const mountOpts = {
  global: { stubs: { PhotoManageDialog: true, PhotoThumb: true, teleport: true } },
}

beforeEach(() => vi.clearAllMocks())

describe('RecordPlacementBody — 일정 타임라인 위 사진 배치', () => {
  it('stop 을 응답 순서가 아니라 시간(sortOrder) 순으로 표시한다', async () => {
    const wrapper = mount(RecordPlacementBody, { props: { days, tripId: 3, region: '제주' }, ...mountOpts })
    await flushPromises()

    expect(fetchItineraryApi).not.toHaveBeenCalled() // 일정은 주입받음(중복 fetch 안 함)
    expect(wrapper.findAll('.rec-time').map((n) => n.text())).toEqual(['09:00', '13:00'])
    expect(wrapper.findAll('.rec-nm').map((n) => n.text())).toEqual(['A명소', 'B카페'])
  })

  it('배치된 사진이 없으면 update:placed 로 빈 배열을 올린다', async () => {
    const wrapper = mount(RecordPlacementBody, { props: { days, tripId: 3 }, ...mountOpts })
    await flushPromises()

    const emitted = wrapper.emitted('update:placed')
    expect(emitted[emitted.length - 1][0]).toEqual([])
  })

  it('EXIF 시각으로 자동배치된 사진을 일정 순서로 update:placed 한다', async () => {
    fetchTripPhotos.mockResolvedValueOnce([
      { id: 1, takenAt: '2024-05-01T09:05:00' }, // 09:00(stop10) 근접
      { id: 2, takenAt: '2024-05-01T12:55:00' }, // 13:00(stop11) 근접
    ])
    const wrapper = mount(RecordPlacementBody, { props: { days, tripId: 3 }, ...mountOpts })
    await flushPromises()

    // placedPhotoIds = 일정(DAY/stop) 순서 = stop10(1) → stop11(2)
    const emitted = wrapper.emitted('update:placed')
    expect(emitted[emitted.length - 1][0]).toEqual([1, 2])
  })
})
