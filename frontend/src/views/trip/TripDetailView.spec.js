import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TripDetailView from './TripDetailView.vue'

const routeMock = vi.hoisted(() => ({
  params: {
    tripId: '11',
  },
}))

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}))

const tripStoreMock = vi.hoisted(() => ({
  selectedTrip: null,
  detailLoading: false,
  error: '',
  deleting: false,
  updating: false,
  fetchTripDetail: vi.fn(),
  updateTrip: vi.fn(),
  deleteTrip: vi.fn(),
  clearError: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => routerMock,
}))

vi.mock('@/stores/trip', () => ({
  useTripStore: () => tripStoreMock,
}))

const componentStubs = {
  Button: {
    props: ['label'],
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot />{{ label }}</button>',
  },
  DatePicker: {
    template: '<input />',
  },
  Dialog: {
    template: '<section><slot /><slot name="footer" /></section>',
  },
  InputText: {
    template: '<input />',
  },
  Message: {
    template: '<p><slot /></p>',
  },
  ProgressSpinner: {
    template: '<span />',
  },
  Select: {
    template: '<select />',
  },
  Tag: {
    props: ['value'],
    template: '<span>{{ value }}</span>',
  },
}

function mountTripDetailView() {
  return mount(TripDetailView, {
    global: {
      stubs: componentStubs,
    },
  })
}

describe('TripDetailView', () => {
  beforeEach(() => {
    routerMock.push.mockClear()
    routeMock.params.tripId = '11'
    tripStoreMock.selectedTrip = {
      id: 11,
      title: '전주 골목 여행',
      startDate: '2026-06-12',
      endDate: '2026-06-14',
      region: '전주',
      theme: '맛집',
      status: 'planning',
      createdAt: '2026-06-12T15:11:06',
    }
    tripStoreMock.detailLoading = false
    tripStoreMock.error = ''
    tripStoreMock.deleting = false
    tripStoreMock.updating = false
    tripStoreMock.fetchTripDetail.mockReset()
    tripStoreMock.fetchTripDetail.mockResolvedValue(tripStoreMock.selectedTrip)
    tripStoreMock.updateTrip.mockReset()
    tripStoreMock.deleteTrip.mockReset()
    tripStoreMock.clearError.mockReset()
  })

  it('renders the detail summary with the shared ticket component', async () => {
    const wrapper = mountTripDetailView()

    expect(wrapper.find('.summary-card').exists()).toBe(false)
    expect(wrapper.find('.summary-ticket').exists()).toBe(true)
    expect(wrapper.find('.ds-ticket').exists()).toBe(true)
    expect(wrapper.text()).toContain('전주 골목 여행')
    expect(wrapper.text()).toContain('TRIP TICKET')

    await wrapper.get('.summary-ticket').trigger('click')

    expect(routerMock.push).toHaveBeenCalledWith({
      name: 'trip-place-search',
      params: { tripId: 11 },
      query: undefined,
    })
  })
})
