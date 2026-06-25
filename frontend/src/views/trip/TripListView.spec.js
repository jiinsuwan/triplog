import { flushPromises, mount } from '@vue/test-utils'
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
  creating: false,
  updating: false,
  deleting: false,
  fetchTripList: vi.fn(),
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
  deleteTrip: vi.fn(),
  clearError: vi.fn(),
}))

const authStoreMock = vi.hoisted(() => ({
  user: null,
}))

const fetchItineraryMock = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authStoreMock,
}))

vi.mock('@/stores/trip', () => ({
  useTripStore: () => tripStoreMock,
}))

vi.mock('@/api/itineraryApi', () => ({
  fetchItinerary: fetchItineraryMock,
}))

function mountTripListView() {
  return mount(TripListView, {
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

function dispatchPointerEvent(element, type, options) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.entries(options).forEach(([key, value]) => {
    Object.defineProperty(event, key, { value })
  })
  element.dispatchEvent(event)
}

const planningTrip = {
  id: 1,
  title: '제주 가을 여행',
  startDate: '2026-10-18',
  endDate: '2026-10-21',
  region: '제주',
  theme: '골목',
  status: 'planning',
}

const upcomingTrip = {
  id: 2,
  title: '부산 주말 여행',
  startDate: '2026-11-07',
  endDate: '2026-11-08',
  region: '부산',
  theme: '바다',
  status: 'upcoming',
}

const pastTrip = {
  id: 3,
  title: '전주 한옥마을 기록',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  region: '전주',
  theme: '미식',
  status: 'past',
}

describe('TripListView', () => {
  beforeEach(() => {
    routerMock.push.mockClear()
    tripStoreMock.trips = []
    tripStoreMock.total = 0
    tripStoreMock.loading = false
    tripStoreMock.error = ''
    tripStoreMock.hasTrips = false
    tripStoreMock.creating = false
    tripStoreMock.updating = false
    tripStoreMock.deleting = false
    tripStoreMock.fetchTripList.mockReset()
    tripStoreMock.fetchTripList.mockResolvedValue({ items: [] })
    tripStoreMock.createTrip.mockReset()
    tripStoreMock.updateTrip.mockReset()
    tripStoreMock.deleteTrip.mockReset()
    tripStoreMock.deleteTrip.mockResolvedValue(null)
    tripStoreMock.clearError.mockReset()
    authStoreMock.user = null
    fetchItineraryMock.mockReset()
    fetchItineraryMock.mockResolvedValue({ dayCount: 0, days: [] })
  })

  it('renders the trip sections and add ticket in an empty trip list', async () => {
    const wrapper = mountTripListView()

    expect(wrapper.find('h1').text()).toBe('나의 여행')
    expect(wrapper.text()).toContain('계획한 여행과 다녀온 기록을 한 곳에서.')
    expect(wrapper.text()).not.toContain('My trip tickets')
    expect(wrapper.text()).not.toContain('아직 만든 여행이 없습니다.')
    expect(wrapper.text()).toContain('계획 중 0')
    expect(wrapper.text()).toContain('곧 떠날 여행 1')
    expect(wrapper.text()).toContain('다녀온 여행 1')
    expect(wrapper.text()).toContain('새 여행 추가')
    expect(wrapper.text()).toContain('강릉 주말 바다')
    expect(wrapper.text()).toContain('전주 한옥 골목')
    expect(wrapper.find('.trip-list-section__empty').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid^="trip-ticket-"]')).toHaveLength(2)
    expect(wrapper.findAll('.trip-list-section')).toHaveLength(3)
    expect(wrapper.get('main').classes()).toContain('page-canvas')
    expect(wrapper.find('.ds-topbar__search').exists()).toBe(false)
    expect(wrapper.find('[data-testid="trip-list-create-top"]').exists()).toBe(false)
    expect(tripStoreMock.fetchTripList).toHaveBeenCalledTimes(1)

    await wrapper.get('[data-testid="trip-ticket--101"]').trigger('click')
    await flushPromises()

    expect(fetchItineraryMock).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="trip-preview-dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('안목해변')
    expect(wrapper.text()).toContain('강릉 커피거리')
    expect(wrapper.find('[data-testid="trip-preview-detail"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="trip-preview-delete"]').exists()).toBe(false)

    await wrapper.get('[data-testid="trip-preview-detail"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="trip-info-edit-dialog"]').exists()).toBe(true)

    await wrapper.get('.trip-info-edit__head button').trigger('click')

    await wrapper.get('.trip-preview-dialog__close').trigger('click')

    await wrapper.get('[data-testid="trip-list-create"]').trigger('click')

    expect(wrapper.get('[data-testid="trip-create-dialog"]').exists()).toBe(true)
  })

  it('creates a trip from the modal and routes to place search', async () => {
    const wrapper = mountTripListView()
    tripStoreMock.createTrip.mockResolvedValue({
      ...planningTrip,
      id: 9,
    })

    await wrapper.get('[data-testid="trip-list-create"]').trigger('click')
    await wrapper.get('[data-testid="trip-create-title"]').setValue('제주 가을 여행')
    await wrapper.get('[data-testid="trip-create-region"]').setValue('제주 서귀포')
    await wrapper.get('[data-testid="trip-create-theme"]').setValue('바다 산책')
    await wrapper.get('[data-testid="trip-create-tags"]').setValue('#오름 #드라이브')
    await wrapper.get('[data-testid="trip-create-tags"]').trigger('keydown.enter')
    await wrapper.get('[data-testid="trip-create-dialog"]').trigger('submit')
    await flushPromises()

    expect(tripStoreMock.createTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '제주 가을 여행',
        region: '제주 서귀포',
        theme: '바다 산책',
        status: 'planning',
      }),
    )
    expect(routerMock.push).toHaveBeenCalledWith({
      name: 'trip-place-search',
      params: { tripId: 9 },
    })
  })

  it('renders status sections without fetching itinerary per card', () => {
    tripStoreMock.trips = [planningTrip, upcomingTrip, pastTrip]
    tripStoreMock.total = 3
    tripStoreMock.hasTrips = true
    authStoreMock.user = { nickname: '진수' }

    const wrapper = mountTripListView()

    expect(wrapper.find('.ds-avatar').text()).toBe('진')
    expect(wrapper.find('.trip-list-head__summary').exists()).toBe(false)
    expect(wrapper.text()).toContain('계획 중')
    expect(wrapper.text()).toContain('곧 떠날 여행')
    expect(wrapper.text()).toContain('다녀온 여행')
    expect(wrapper.text()).not.toContain('장소와 동선을 채워가는 여행입니다.')
    expect(wrapper.text()).not.toContain('클릭해서 미리보기')
    expect(wrapper.get('[aria-labelledby="trip-section-planning"] h2').text()).toBe('계획 중 1')
    expect(wrapper.findAll('[data-testid^="trip-ticket-"]')).toHaveLength(3)
    const planningItems = wrapper
      .get('[aria-labelledby="trip-section-planning"] .trip-ticket-grid')
      .findAll('button')
    expect(planningItems[0].attributes('data-testid')).toBe('trip-ticket-1')
    expect(planningItems[1].attributes('data-testid')).toBe('trip-list-create')
    expect(fetchItineraryMock).not.toHaveBeenCalled()
  })

  it('does not open the preview when a ticket row drag ends on a card', async () => {
    tripStoreMock.trips = [planningTrip, upcomingTrip]
    tripStoreMock.total = 3
    tripStoreMock.hasTrips = true

    const wrapper = mountTripListView()
    const grid = wrapper.get('[aria-labelledby="trip-section-planning"] .trip-ticket-grid')

    dispatchPointerEvent(grid.element, 'pointerdown', { pointerId: 1, clientX: 240, clientY: 20 })
    dispatchPointerEvent(grid.element, 'pointermove', { pointerId: 1, clientX: 160, clientY: 22 })
    dispatchPointerEvent(grid.element, 'pointerup', { pointerId: 1, clientX: 160, clientY: 22 })
    await wrapper.get('[data-testid="trip-ticket-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="trip-preview-dialog"]').exists()).toBe(false)
    expect(fetchItineraryMock).not.toHaveBeenCalled()
  })

  it('opens the trip preview when a ticket itself receives a tiny pointer movement before click', async () => {
    tripStoreMock.trips = [planningTrip]
    tripStoreMock.total = 1
    tripStoreMock.hasTrips = true

    const wrapper = mountTripListView()
    const ticket = wrapper.get('[data-testid="trip-ticket-1"]')

    dispatchPointerEvent(ticket.element, 'pointerdown', { pointerId: 1, clientX: 240, clientY: 20 })
    dispatchPointerEvent(ticket.element, 'pointermove', { pointerId: 1, clientX: 232, clientY: 22 })
    dispatchPointerEvent(ticket.element, 'pointerup', { pointerId: 1, clientX: 232, clientY: 22 })
    await ticket.trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="trip-preview-dialog"]').exists()).toBe(true)
    expect(fetchItineraryMock).toHaveBeenCalledWith(1, { trip: planningTrip })
  })

  it('drags the ticket row from a ticket and suppresses the accidental preview click', async () => {
    tripStoreMock.trips = [planningTrip, upcomingTrip]
    tripStoreMock.total = 2
    tripStoreMock.hasTrips = true

    const wrapper = mountTripListView()
    const grid = wrapper.get('[aria-labelledby="trip-section-planning"] .trip-ticket-grid')
    const ticket = wrapper.get('[data-testid="trip-ticket-1"]')

    grid.element.scrollLeft = 0
    dispatchPointerEvent(ticket.element, 'pointerdown', { pointerId: 1, clientX: 240, clientY: 20 })
    dispatchPointerEvent(ticket.element, 'pointermove', { pointerId: 1, clientX: 160, clientY: 22 })
    dispatchPointerEvent(ticket.element, 'pointerup', { pointerId: 1, clientX: 160, clientY: 22 })
    await ticket.trigger('click')
    await flushPromises()

    expect(grid.element.scrollLeft).toBe(80)
    expect(wrapper.find('[data-testid="trip-preview-dialog"]').exists()).toBe(false)
    expect(fetchItineraryMock).not.toHaveBeenCalled()
  })

  it('opens the create dialog even when the add ticket receives a small drag gesture', async () => {
    tripStoreMock.trips = [planningTrip]
    tripStoreMock.total = 1
    tripStoreMock.hasTrips = true

    const wrapper = mountTripListView()
    const addTicket = wrapper.get('[data-testid="trip-list-create"]')

    dispatchPointerEvent(addTicket.element, 'pointerdown', { pointerId: 1, clientX: 240, clientY: 20 })
    dispatchPointerEvent(addTicket.element, 'pointermove', { pointerId: 1, clientX: 160, clientY: 22 })
    dispatchPointerEvent(addTicket.element, 'pointerup', { pointerId: 1, clientX: 160, clientY: 22 })
    await addTicket.trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="trip-create-dialog"]').exists()).toBe(true)
  })

  it('fetches itinerary only when a trip preview is opened', async () => {
    tripStoreMock.trips = [planningTrip]
    tripStoreMock.total = 1
    tripStoreMock.hasTrips = true
    fetchItineraryMock.mockResolvedValue({
      dayCount: 2,
      days: [
        {
          dayNumber: 1,
          date: '2026-10-18',
          stops: [{ id: 10, place: { name: '성산일출봉' } }],
        },
        {
          dayNumber: 2,
          date: '2026-10-19',
          stops: [{ id: 11, place: { name: '동문시장' } }],
        },
      ],
    })

    const wrapper = mountTripListView()

    expect(fetchItineraryMock).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="trip-ticket-1"]').trigger('click')
    await flushPromises()

    expect(fetchItineraryMock).toHaveBeenCalledTimes(1)
    expect(fetchItineraryMock).toHaveBeenCalledWith(1, { trip: planningTrip })
    expect(wrapper.text()).toContain('담은 장소 2곳')
    expect(wrapper.text()).toContain('DAY 1')
    expect(wrapper.text()).toContain('성산일출봉')

    await wrapper.get('[data-testid="trip-preview-places"]').trigger('click')

    expect(routerMock.push).toHaveBeenCalledWith({
      name: 'trip-place-search',
      params: { tripId: 1 },
    })
  })

  it('keeps trip info editing available from planning, upcoming, and past ticket previews', async () => {
    tripStoreMock.trips = [planningTrip, upcomingTrip, pastTrip]
    tripStoreMock.total = 2
    tripStoreMock.hasTrips = true
    fetchItineraryMock.mockResolvedValue({ dayCount: 0, days: [] })

    const planningWrapper = mountTripListView()

    await planningWrapper.get('[data-testid="trip-ticket-1"]').trigger('click')
    await flushPromises()
    await planningWrapper.get('[data-testid="trip-preview-detail"]').trigger('click')
    await flushPromises()

    expect(planningWrapper.find('[data-testid="trip-info-edit-dialog"]').exists()).toBe(true)
    planningWrapper.unmount()

    const upcomingWrapper = mountTripListView()

    await upcomingWrapper.get('[data-testid="trip-ticket-2"]').trigger('click')
    await flushPromises()
    await upcomingWrapper.get('[data-testid="trip-preview-detail"]').trigger('click')
    await flushPromises()

    expect(upcomingWrapper.find('[data-testid="trip-info-edit-dialog"]').exists()).toBe(true)
    upcomingWrapper.unmount()

    const pastWrapper = mountTripListView()

    await pastWrapper.get('[data-testid="trip-ticket-3"]').trigger('click')
    await flushPromises()
    await pastWrapper.get('[data-testid="trip-preview-detail"]').trigger('click')
    await flushPromises()

    expect(pastWrapper.find('[data-testid="trip-info-edit-dialog"]').exists()).toBe(true)
  })

  it('renders the empty trip preview from the trips mockup and can delete a trip', async () => {
    tripStoreMock.trips = [planningTrip]
    tripStoreMock.total = 1
    tripStoreMock.hasTrips = true
    fetchItineraryMock.mockResolvedValue({ dayCount: 0, days: [] })

    const wrapper = mountTripListView()

    await wrapper.get('[data-testid="trip-ticket-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('아직 담은 장소가 없어요')
    expect(wrapper.text()).toContain('다음 단계에서 가고 싶은 곳을 담고 일정으로 엮어보세요.')
    expect(wrapper.find('.trip-preview-dialog__suitcase').exists()).toBe(true)
    expect(wrapper.get('[data-testid="trip-preview-places"]').text()).toContain('장소 담으러 가기')

    await wrapper.get('[data-testid="trip-preview-delete"]').trigger('click')
    await flushPromises()

    expect(tripStoreMock.deleteTrip).toHaveBeenCalledWith(1)
  })

  it('opens the info edit dialog from preview and saves only explicit hashtags as ticket tags', async () => {
    tripStoreMock.trips = [planningTrip]
    tripStoreMock.total = 1
    tripStoreMock.hasTrips = true
    tripStoreMock.updateTrip.mockImplementation(async (id, payload) => ({
      ...planningTrip,
      ...payload,
      id,
    }))
    fetchItineraryMock.mockResolvedValue({ dayCount: 0, days: [] })

    const wrapper = mountTripListView()

    await wrapper.get('[data-testid="trip-ticket-1"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="trip-preview-detail"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="trip-info-edit-dialog"]').exists()).toBe(true)

    await wrapper.get('[data-testid="trip-edit-title"]').setValue('제주, 바람의 사흘')
    await wrapper.get('[data-testid="trip-edit-region"]').setValue('제주')
    await wrapper.get('[data-testid="trip-edit-theme"]').setValue('바다')
    await wrapper.get('[data-testid="trip-edit-tags"]').setValue('#바다멍 #드라이브')
    await wrapper.get('[data-testid="trip-edit-tags"]').trigger('keydown.enter')
    await wrapper.get('[data-testid="trip-info-edit-dialog"]').trigger('submit')
    await flushPromises()

    expect(tripStoreMock.updateTrip).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        title: '제주, 바람의 사흘',
        region: '제주',
        theme: '바다',
      }),
    )
    expect(wrapper.text()).toContain('제주, 바람의 사흘')
    expect(wrapper.text()).toContain('#바다멍')
    expect(wrapper.text()).toContain('#드라이브')
    expect(tripStoreMock.updateTrip.mock.calls[0][1]).not.toHaveProperty('tags')
  })
})
