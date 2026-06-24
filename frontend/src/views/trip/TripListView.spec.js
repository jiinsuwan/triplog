import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TripListView from './TripListView.vue'

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}))

const tripStoreMock = vi.hoisted(() => ({
  trips: [],
  total: 0,
  loading: false,
  error: '',
  hasTrips: false,
  fetchTripList: vi.fn(),
}))

const authStoreMock = vi.hoisted(() => ({
  user: null,
}))

vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authStoreMock,
}))

vi.mock('@/stores/trip', () => ({
  useTripStore: () => tripStoreMock,
}))

function mountTripListView() {
  return mount(TripListView, {
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
        },
      },
    },
  })
}

describe('TripListView', () => {
  beforeEach(() => {
    routerMock.push.mockClear()
    tripStoreMock.trips = []
    tripStoreMock.total = 0
    tripStoreMock.loading = false
    tripStoreMock.error = ''
    tripStoreMock.hasTrips = false
    tripStoreMock.fetchTripList.mockReset()
    tripStoreMock.fetchTripList.mockResolvedValue({ items: [] })
    authStoreMock.user = null
  })

  it('renders the authenticated trip list instead of the old home copy', () => {
    const wrapper = mountTripListView()

    expect(wrapper.find('h1').text()).toBe('나의 여행')
    expect(wrapper.text()).toContain('아직 만든 여행이 없습니다.')
    expect(wrapper.text()).not.toContain('Sprint 1')
    expect(wrapper.text()).not.toContain('지난 여행은 카드로')
    expect(wrapper.find('.ds-tabs').text()).toContain('TRIPS')
  })

  it('fetches trips when mounted', () => {
    mountTripListView()

    expect(tripStoreMock.fetchTripList).toHaveBeenCalledTimes(1)
  })

  it('routes create actions to the trip creation route', async () => {
    const wrapper = mountTripListView()

    await wrapper.get('[data-testid="trip-list-create-top"]').trigger('click')

    expect(routerMock.push).toHaveBeenCalledWith({ name: 'trip-create' })
  })

  it('renders planning and past trips as tickets and opens detail on click', async () => {
    tripStoreMock.trips = [
      {
        id: 1,
        title: '제주 바다 산책',
        startDate: '2026-07-01',
        endDate: '2026-07-03',
        region: '제주',
        theme: '바다',
        status: 'planning',
      },
      {
        id: 2,
        title: '교토 단풍 기록',
        startDate: '2025-11-07',
        endDate: '2025-11-09',
        region: '교토',
        theme: '골목',
        status: 'past',
      },
    ]
    tripStoreMock.total = 99
    tripStoreMock.hasTrips = true
    authStoreMock.user = { nickname: '지수' }

    const wrapper = mountTripListView()

    expect(wrapper.find('.ds-avatar').text()).toBe('지')
    expect(wrapper.find('.trip-list-head__summary').text()).toContain('전체 2개')
    expect(wrapper.text()).toContain('계획 중')
    expect(wrapper.text()).toContain('지난 여행')
    expect(wrapper.findAll('.ds-ticket')).toHaveLength(2)

    await wrapper.get('[data-testid="trip-ticket-1"]').trigger('click')

    expect(routerMock.push).toHaveBeenCalledWith({
      name: 'trip-detail',
      params: { tripId: 1 },
    })
  })
})
