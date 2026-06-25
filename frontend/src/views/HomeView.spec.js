import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { useTripStore } from '@/stores/trip'
import HomeView from './HomeView.vue'

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}))

const fetchItineraryMock = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
}))

vi.mock('@/api/itineraryApi', () => ({
  fetchItinerary: fetchItineraryMock,
}))

function mountHomeView() {
  return mount(HomeView, {
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
        },
        Teleport: true,
      },
    },
  })
}

describe('HomeView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
    routerMock.push.mockClear()
    fetchItineraryMock.mockReset()
    fetchItineraryMock.mockResolvedValue({ dayCount: 0, days: [] })
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
    expect(wrapper.get('main').classes()).toContain('page-canvas')
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

  it('keeps planning drafts out of upcoming trips and resumes the latest unfinished trip', async () => {
    const auth = useAuthStore()
    const tripStore = useTripStore()
    auth.setTokens('access', 'refresh')
    auth.user = { nickname: '지인' }
    tripStore.trips = [
      {
        id: 1,
        title: '오래된 계획',
        region: '전주',
        theme: '골목',
        status: 'planning',
        startDate: '2026-06-24',
        endDate: '2026-06-26',
        createdAt: '2026-06-20T09:00:00',
      },
      {
        id: 2,
        title: '최근 수정 계획',
        region: '제주',
        theme: '바다',
        status: 'planning',
        startDate: '2026-07-01',
        endDate: '2026-07-03',
        updatedAt: '2026-06-25T12:00:00',
      },
      {
        id: 3,
        title: '확정된 여행',
        region: '부산',
        theme: '미식',
        status: 'upcoming',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
      },
    ]
    vi.spyOn(auth, 'fetchMe').mockResolvedValue(auth.user)
    vi.spyOn(tripStore, 'fetchTripList').mockResolvedValue({ items: tripStore.trips, total: 3 })

    const wrapper = mountHomeView()
    const resumeText = wrapper.get('[data-testid="home-resume-trip"]').text()
    const upcomingText = wrapper.get('.home-upcoming').text()

    expect(resumeText).toContain('최근 수정 계획')
    expect(resumeText).not.toContain('오래된 계획')
    expect(upcomingText).toContain('확정된 여행')
    expect(upcomingText).not.toContain('최근 수정 계획')
    expect(upcomingText).not.toContain('오래된 계획')
  })

  it('opens authenticated home tickets in the shared trip preview dialog', async () => {
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
    await flushPromises()

    expect(wrapper.find('[data-testid="home-start-trip-top"]').exists()).toBe(false)
    expect(routerMock.push).not.toHaveBeenCalled()
    expect(fetchItineraryMock).toHaveBeenCalledWith(9, { trip: expect.objectContaining({ id: 9 }) })
    expect(wrapper.get('[data-testid="trip-preview-dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('제주 바람 여행')
    expect(wrapper.find('[data-testid="trip-preview-detail"]').exists()).toBe(true)
  })

  it('opens upcoming and memory home items in the shared trip preview dialog', async () => {
    const auth = useAuthStore()
    const tripStore = useTripStore()
    auth.setTokens('access', 'refresh')
    auth.user = { nickname: '지인' }
    tripStore.trips = [
      {
        id: 10,
        title: '확정 부산 여행',
        region: '부산',
        theme: '바다',
        status: 'upcoming',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
      },
      {
        id: 11,
        title: '전주 기록 여행',
        region: '전주',
        theme: '골목',
        status: 'past',
        startDate: '2026-05-01',
        endDate: '2026-05-03',
      },
    ]
    vi.spyOn(auth, 'fetchMe').mockResolvedValue(auth.user)
    vi.spyOn(tripStore, 'fetchTripList').mockResolvedValue({ items: tripStore.trips, total: 2 })

    const wrapper = mountHomeView()

    await wrapper.get('.home-upcoming .home-ticket-button').trigger('click')
    await flushPromises()

    expect(fetchItineraryMock).toHaveBeenCalledWith(10, {
      trip: expect.objectContaining({ id: 10 }),
    })
    expect(wrapper.get('[data-testid="trip-preview-dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('확정 부산 여행')

    await wrapper.get('.trip-preview-dialog__close').trigger('click')
    await wrapper.get('.home-memories .home-polaroid-button').trigger('click')
    await flushPromises()

    expect(fetchItineraryMock).toHaveBeenCalledWith(11, {
      trip: expect.objectContaining({ id: 11 }),
    })
    expect(wrapper.get('[data-testid="trip-preview-dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('전주 기록 여행')
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
    expect(wrapper.find('.home-resume .ds-ticket__barcode').exists()).toBe(false)
    expect(wrapper.find('[data-testid="home-empty-create"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-upcoming-empty"]').exists()).toBe(true)
    expect(wrapper.find('.home-upcoming .home-ticket-button').exists()).toBe(false)
    expect(wrapper.find('.home-stamp-placeholder').exists()).toBe(true)
    expect(wrapper.find('.home-memories .home-polaroid-button').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('강릉 주말 바다')
    expect(wrapper.text()).not.toContain('전주 한옥 골목')

    await wrapper.get('[data-testid="home-empty-create"]').trigger('click')

    expect(routerMock.push).toHaveBeenCalledWith('/trips/new')
  })

  it('does not expose mock preview tickets for authenticated empty users', async () => {
    const auth = useAuthStore()
    const tripStore = useTripStore()
    auth.setTokens('access', 'refresh')
    tripStore.trips = []
    tripStore.total = 0
    vi.spyOn(auth, 'fetchMe').mockResolvedValue(auth.user)
    vi.spyOn(tripStore, 'fetchTripList').mockResolvedValue({ items: [], total: 0 })

    const wrapper = mountHomeView()

    expect(wrapper.find('.home-upcoming .home-ticket-button').exists()).toBe(false)
    expect(wrapper.find('.home-memories .home-polaroid-button').exists()).toBe(false)
    expect(fetchItineraryMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="trip-preview-dialog"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('안목해변')
    expect(wrapper.text()).not.toContain('전주 한옥마을')
  })
})
