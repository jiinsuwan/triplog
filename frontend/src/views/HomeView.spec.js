import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { useTripStore } from '@/stores/trip'
import HomeView from './HomeView.vue'

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
}))

function mountHomeView() {
  return mount(HomeView, {
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

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    routerMock.push.mockClear()
    vi.restoreAllMocks()
  })

  it('renders the public scrapbook home without exposing logs navigation', () => {
    const wrapper = mountHomeView()

    expect(wrapper.find('h1').text()).toContain('다음 여행')
    expect(wrapper.text()).toContain('새 여행 시작하기')
    expect(wrapper.text()).toContain('곧 떠날 여행')
    expect(wrapper.text()).toContain('계획된 여행이 아직 없어요')
    expect(wrapper.text()).not.toContain('오사카 가을 여행')
    expect(wrapper.text()).not.toContain('후쿠오카 주말 여행')
    expect(wrapper.text()).not.toContain('교토 단풍 기록')
    expect(wrapper.find('.ds-tabs').text()).not.toContain('LOGS')
    expect(wrapper.find('.ds-topbar__search').exists()).toBe(false)
    expect(wrapper.find('[data-testid="home-start-trip-top"]').exists()).toBe(false)
  })

  it('sends the public ticket start action through a login redirect', async () => {
    const wrapper = mountHomeView()

    await wrapper.get('[data-testid="home-public-create"]').trigger('click')

    expect(routerMock.push).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/trips/new' },
    })
  })

  it('keeps public auth entry actions connected', async () => {
    const wrapper = mountHomeView()

    await wrapper.get('[data-testid="home-login"]').trigger('click')

    expect(routerMock.push).toHaveBeenCalledWith('/login')
  })

  it('renders authenticated home dashboard from trip data', async () => {
    const auth = useAuthStore()
    const tripStore = useTripStore()
    auth.setTokens('access', 'refresh')
    auth.user = { nickname: '지인' }
    tripStore.trips = [
      {
        id: 1,
        title: '후쿠오카 주말 여행',
        region: '후쿠오카',
        theme: '맛집',
        status: 'planning',
        startDate: '2026-07-05',
        endDate: '2026-07-07',
      },
      {
        id: 2,
        title: '다낭 휴양 여행',
        region: '다낭',
        theme: '휴양',
        status: 'past',
        startDate: '2025-12-20',
        endDate: '2025-12-23',
      },
    ]
    tripStore.total = 99
    vi.spyOn(auth, 'fetchMe').mockResolvedValue(auth.user)
    vi.spyOn(tripStore, 'fetchTripList').mockResolvedValue({ items: tripStore.trips, total: 2 })

    const wrapper = mountHomeView()

    expect(wrapper.find('h1').text()).toContain('지인님')
    expect(wrapper.text()).toContain('2번')
    expect(wrapper.text()).toContain('후쿠오카 주말 여행')
    expect(wrapper.text()).toContain('다낭 휴양 여행')
    expect(wrapper.find('[data-testid="home-login"]').exists()).toBe(false)
    expect(wrapper.find('.ds-topbar__search').exists()).toBe(false)
    expect(wrapper.find('[data-testid="home-start-trip-top"]').exists()).toBe(false)
    expect(tripStore.fetchTripList).toHaveBeenCalled()
  })

  it('opens authenticated resume action without login redirects', async () => {
    const auth = useAuthStore()
    const tripStore = useTripStore()
    auth.setTokens('access', 'refresh')
    tripStore.trips = [
      {
        id: 9,
        title: '제주 바람 여행',
        region: '제주',
        theme: '바다',
        status: 'planning',
        startDate: '2026-09-02',
        endDate: '2026-09-04',
      },
    ]
    vi.spyOn(auth, 'fetchMe').mockResolvedValue(auth.user)
    vi.spyOn(tripStore, 'fetchTripList').mockResolvedValue({ items: tripStore.trips, total: 1 })

    const wrapper = mountHomeView()

    await wrapper.get('[data-testid="home-resume-trip"]').trigger('click')

    expect(wrapper.find('[data-testid="home-start-trip-top"]').exists()).toBe(false)
    expect(routerMock.push).toHaveBeenCalledWith({
      name: 'trip-detail',
      params: { tripId: 9 },
    })
  })

  it('renders unissued planning ticket and opens create flow without planned trips', async () => {
    const auth = useAuthStore()
    const tripStore = useTripStore()
    auth.setTokens('access', 'refresh')
    tripStore.trips = []
    tripStore.total = 0
    vi.spyOn(auth, 'fetchMe').mockResolvedValue(auth.user)
    vi.spyOn(tripStore, 'fetchTripList').mockResolvedValue({ items: [], total: 0 })

    const wrapper = mountHomeView()

    expect(wrapper.findAll('.home-stats, .home-stamps, .home-memories, .home-upcoming')).toHaveLength(4)
    expect(wrapper.find('.home-empty-ticket').exists()).toBe(false)
    expect(wrapper.text()).toContain('새 여행 계획하기')
    expect(wrapper.text()).toContain('TripLog로 여행을 계획해보세요.')
    expect(wrapper.find('.home-resume .ds-ticket__meta').text()).toBe('TripLog·여행을 계획해보세요.')
    expect(wrapper.findAll('.ds-ticket')).toHaveLength(1)
    expect(wrapper.find('.ds-ticket--unissued').exists()).toBe(true)
    expect(wrapper.find('.ds-ticket__barcode').exists()).toBe(false)
    expect(wrapper.find('[data-testid="home-empty-create"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-upcoming-empty"]').exists()).toBe(true)
    expect(wrapper.find('.home-upcoming .ds-ticket').exists()).toBe(false)
    expect(wrapper.find('.home-stamp-placeholder').exists()).toBe(true)
    expect(wrapper.text()).toContain('계획된 여행이 아직 없어요')

    await wrapper.get('[data-testid="home-empty-create"]').trigger('click')

    expect(routerMock.push).toHaveBeenCalledWith('/trips/new')
  })
})
