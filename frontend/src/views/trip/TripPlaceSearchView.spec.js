import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TripPlaceSearchView from './TripPlaceSearchView.vue'
import { fetchPlaceRegions, fetchPlaces } from '@/api/placeApi'
import { fetchTrip } from '@/api/tripApi'
import { useItineraryStore } from '@/stores/itinerary'
import { resetMockItineraryData } from '@/mocks/itineraryMockData'
import { loadKakaoMaps } from '@/utils/kakaoMap'

const routeMock = vi.hoisted(() => ({
  params: { tripId: '5001' },
  query: {},
}))
const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => routerMock,
}))

vi.mock('@/api/tripApi', () => ({
  fetchTrip: vi.fn(),
}))

vi.mock('@/api/placeApi', () => ({
  fetchPlaceDetail: vi.fn(),
  fetchPlaceRegions: vi.fn(),
  fetchPlaces: vi.fn(),
}))

vi.mock('@/utils/kakaoMap', () => ({
  loadKakaoMaps: vi.fn(),
}))

const trip = {
  id: 5001,
  title: '전주 테스트 여행',
  startDate: '2026-06-11',
  endDate: '2026-06-13',
  status: 'planning',
  region: '전주',
}

const places = [
  {
    id: 7001,
    name: '전주한옥마을',
    category: '관광지',
    region1: '전라북도',
    region2: '전주시',
    address: '전북 전주시 완산구 교동',
    roadAddress: '전북 전주시 완산구 기린대로 99',
    latitude: 35.8149,
    longitude: 127.153,
  },
  {
    id: 7002,
    name: '경기전',
    category: '관광지',
    region1: '전라북도',
    region2: '전주시',
    address: '전북 전주시 완산구 태조로 44',
    roadAddress: '전북 전주시 완산구 태조로 44',
    latitude: 35.8152,
    longitude: 127.1499,
  },
]

describe('TripPlaceSearchView itinerary editor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetMockItineraryData()
    routeMock.params.tripId = '5001'
    routeMock.query = {}
    routerMock.push.mockReset()
    routerMock.replace.mockReset()
    fetchTrip.mockResolvedValue(trip)
    fetchPlaceRegions.mockResolvedValue([{ region1: '전라북도', region2: '전주시', count: 2 }])
    fetchPlaces.mockResolvedValue({ items: places, page: 0, size: 60, total: places.length })
    loadKakaoMaps.mockRejectedValue(new Error('Kakao SDK unavailable in test'))
  })

  it('장소 담기 화면은 목업 기준 상단 흐름과 담기 UI를 표시한다', async () => {
    const wrapper = mount(TripPlaceSearchView, {
      global: {
        stubs: primeVueStubs(),
      },
    })
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.place-header').exists()).toBe(true)
    expect(wrapper.find('.step-card').text()).toContain('1 장소 담기')
    expect(wrapper.find('.step-card').text()).toContain('2 일정 배치')
    expect(wrapper.find('.route-start-button').exists()).toBe(true)
    expect(wrapper.find('.place-header h1').text()).toContain('주변 장소를 담아요')
    expect(wrapper.findAll('.search-card button').length).toBeGreaterThan(1)
    expect(wrapper.findAll('.place-row__pocket')).toHaveLength(places.length)
  })

  it('경로 생성 모드는 담긴 장소와 일정 장소만 지도 마커로 표시한다', async () => {
    routeMock.query = { mode: 'itinerary' }
    const wrapper = mount(TripPlaceSearchView, {
      global: {
        stubs: primeVueStubs(),
      },
    })
    await flushPromises()
    await flushPromises()

    expect(wrapper.findAll('.day-tabs button')).toHaveLength(3)
    expect(wrapper.findAll('.fallback-pin')).toHaveLength(0)
    expect(wrapper.findAll('.route-stop-card')).toHaveLength(0)
  })

  it('담긴 지도 마커 클릭으로 현재 날짜 방문지를 추가하고 순서를 보정한다', async () => {
    const wrapper = mount(TripPlaceSearchView, {
      global: {
        stubs: primeVueStubs(),
      },
    })
    await flushPromises()
    await flushPromises()

    await pocketPlacesAndOpenRoute(wrapper, 2)

    const pins = wrapper.findAll('.fallback-pin')
    expect(pins).toHaveLength(2)

    await pins[0].trigger('click')
    await flushPromises()
    await pins[1].trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.route-stop-card')).toHaveLength(2)
    expect(wrapper.findAll('.route-stop-card .p-select')).toHaveLength(0)
    expect(wrapper.findAll('.route-leg .p-select')).toHaveLength(1)
    expect(wrapper.findAll('.route-stop-delete')).toHaveLength(2)
    expect(wrapper.findAll('button[aria-label$="위로 이동"]')).toHaveLength(0)
    expect(wrapper.findAll('button[aria-label$="아래로 이동"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('전주한옥마을')
    expect(wrapper.text()).toContain('경기전')

    const stopNames = wrapper.findAll('.route-stop-main strong').map((item) => item.text())
    expect(stopNames).toEqual(['전주한옥마을', '경기전'])
  })

  it('대중교통 구간은 직접 소요시간을 입력해 표시할 수 있다', async () => {
    const wrapper = mount(TripPlaceSearchView, {
      global: {
        stubs: primeVueStubs(),
      },
    })
    await flushPromises()
    await flushPromises()

    await pocketPlacesAndOpenRoute(wrapper, 2)

    const pins = wrapper.findAll('.fallback-pin')
    await pins[0].trigger('click')
    await flushPromises()
    await pins[1].trigger('click')
    await flushPromises()

    const transportSelect = wrapper.find('.route-leg .p-select')
    transportSelect.element.value = 'public_transit'
    await transportSelect.trigger('change')
    await flushUntil(() => wrapper.find('.route-leg__manual-input').exists())

    const manualInput = wrapper.find('.route-leg__manual-input')
    expect(manualInput.exists()).toBe(true)
    await manualInput.setValue('25')
    await manualInput.trigger('change')
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('직접 25분')
  })

  it('이미 루트에 담긴 지도 마커를 다시 누르면 현재 날짜 방문지에서 제거한다', async () => {
    routeMock.params.tripId = '5002'
    const wrapper = mount(TripPlaceSearchView, {
      global: {
        stubs: primeVueStubs(),
      },
    })
    await flushPromises()
    await flushPromises()

    await pocketPlacesAndOpenRoute(wrapper, 2)

    let pins = wrapper.findAll('.fallback-pin')
    await pins[0].trigger('click')
    await flushPromises()
    await pins[1].trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.route-stop-card')).toHaveLength(2)

    pins = wrapper.findAll('.fallback-pin')
    await pins[0].trigger('click')
    await flushPromises()

    const stopNames = wrapper.findAll('.route-stop-main strong').map((item) => item.text())
    expect(stopNames).toEqual(['경기전'])
    expect(wrapper.text()).toContain('전주한옥마을을(를) 경로 후보로 되돌렸습니다.')
  })

  it('장소 담기 화면으로 돌아가도 이미 루트에 담긴 장소를 담긴 장소 목록에 표시한다', async () => {
    routeMock.params.tripId = '5003'
    const itineraryStore = useItineraryStore()
    await itineraryStore.fetchTripItinerary(5003, { ...trip, id: 5003 })
    const routedPlace = itineraryStore.candidatePlaces[0]
    await itineraryStore.addPlaceToDay(5003, 1, routedPlace, { transport: 'walk' })

    const wrapper = mount(TripPlaceSearchView, {
      global: {
        stubs: primeVueStubs(),
      },
    })
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('담긴 장소')
    expect(wrapper.text()).toContain(routedPlace.name)
    expect(wrapper.text()).toContain('일정 포함')
  })

  it('renders the Kakao map when the SDK loads and uses the same search for button and Enter', async () => {
    const { kakao, keywordSearch } = createKakaoMock()
    loadKakaoMaps.mockResolvedValue(kakao)

    const wrapper = mount(TripPlaceSearchView, {
      global: {
        stubs: primeVueStubs(),
      },
    })
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.map-error').exists()).toBe(false)
    expect(wrapper.find('.fallback-map').exists()).toBe(false)
    const initialSearchCalls = keywordSearch.mock.calls.length

    const searchInput = wrapper.find('.search-card .p-inputtext')
    await searchInput.setValue('한옥 카페')
    await searchInput.trigger('keyup.enter')
    await flushPromises()
    expect(keywordSearch).toHaveBeenCalledTimes(initialSearchCalls + 1)

    const searchButton = wrapper.findAll('.search-card button').find((button) => button.text() === '검색')
    await searchButton.trigger('click')
    await flushPromises()
    expect(keywordSearch).toHaveBeenCalledTimes(initialSearchCalls + 2)
    expect(keywordSearch.mock.calls.at(-1)[0]).toBe(keywordSearch.mock.calls.at(-2)[0])
  })

  it('shows the fallback map when the Kakao SDK fails', async () => {
    const wrapper = mount(TripPlaceSearchView, {
      global: {
        stubs: primeVueStubs(),
      },
    })
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.map-error').text()).toContain('Kakao SDK unavailable in test')
    expect(wrapper.find('.fallback-map').exists()).toBe(true)
    expect(wrapper.findAll('.fallback-pin')).toHaveLength(places.length)
  })

  it('keeps pocket, schedule, and delete state transitions connected', async () => {
    const wrapper = mount(TripPlaceSearchView, {
      global: {
        stubs: primeVueStubs(),
      },
    })
    await flushPromises()
    await flushPromises()

    await wrapper.findAll('.place-row__pocket')[0].trigger('click')
    expect(wrapper.findAll('.pocket-item')).toHaveLength(1)

    await wrapper.find('.route-start-button').trigger('click')
    await flushPromises()
    await flushPromises()
    await wrapper.find('.pocket-item button').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.route-stop-card')).toHaveLength(1)
    expect(wrapper.findAll('.pocket-item')).toHaveLength(0)

    await wrapper.find('.route-stop-delete').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.route-stop-card')).toHaveLength(0)
    expect(wrapper.findAll('.pocket-item')).toHaveLength(1)
  })
})

function createKakaoMock() {
  const keywordSearch = vi.fn((query, callback) => {
    callback([], 'ZERO_RESULT', { hasNextPage: false })
  })
  const listeners = new Map()

  class LatLng {
    constructor(lat, lng) {
      this.lat = lat
      this.lng = lng
    }

    getLat() {
      return this.lat
    }

    getLng() {
      return this.lng
    }
  }

  class LatLngBounds {
    extend() {}

    getNorthEast() {
      return new LatLng(35.9, 127.2)
    }

    getSouthWest() {
      return new LatLng(35.7, 127.0)
    }
  }

  class MapMock {
    constructor() {
      this.center = new LatLng(35.8149, 127.153)
      this.level = 5
      this.bounds = new LatLngBounds()
    }

    addControl() {}
    getBounds() { return this.bounds }
    getCenter() { return this.center }
    getLevel() { return this.level }
    panTo(position) { this.center = position }
    relayout() {}
    setBounds() {}
    setCenter(position) { this.center = position }
    setLevel(level) { this.level = level }
    setMinLevel() {}
  }

  class CustomOverlay {
    setMap() {}
    setPosition() {}
  }

  class Polyline {
    setMap() {}
  }

  const event = {
    addListener: vi.fn((target, name, handler) => listeners.set(`${name}:${listeners.size}`, handler)),
    removeListener: vi.fn(),
  }
  const kakao = {
    maps: {
      ControlPosition: { RIGHT: 'RIGHT' },
      CustomOverlay,
      LatLng,
      LatLngBounds,
      Map: MapMock,
      Polyline,
      ZoomControl: class {},
      event,
      services: {
        Places: class {
          categorySearch(query, callback) { callback([], 'ZERO_RESULT', { hasNextPage: false }) }
          keywordSearch(query, callback) { keywordSearch(query, callback) }
        },
        SortBy: { DISTANCE: 'DISTANCE' },
        Status: { OK: 'OK' },
      },
    },
  }
  return { event, kakao, keywordSearch, listeners }
}

async function pocketPlacesAndOpenRoute(wrapper, count = 1) {
  const pocketButtons = wrapper.findAll('.place-row__pocket')
  for (const button of pocketButtons.slice(0, count)) {
    await button.trigger('click')
  }
  await wrapper.find('.route-start-button').trigger('click')
  await flushPromises()
  await flushPromises()
}

async function flushUntil(predicate, attempts = 6) {
  for (let index = 0; index < attempts; index += 1) {
    await flushPromises()
    if (predicate()) return
  }
}

function primeVueStubs() {
  return {
    Button: {
      props: ['label', 'disabled', 'loading'],
      emits: ['click'],
      template: `
        <button
          type="button"
          :disabled="disabled || loading"
          :aria-label="$attrs['aria-label'] || label"
          @click="$emit('click', $event)"
        >
          <span v-if="label">{{ label }}</span>
          <slot />
        </button>
      `,
    },
    InputText: {
      props: ['modelValue'],
      emits: ['update:modelValue', 'change'],
      template: `
        <input
          class="p-inputtext"
          :value="modelValue"
          @input="$emit('update:modelValue', $event.target.value)"
          @change="$emit('change', $event)"
        />
      `,
    },
    Message: {
      template: '<div><slot /></div>',
    },
    ProgressSpinner: {
      template: '<div />',
    },
    RouterLink: {
      props: ['to'],
      template: '<a><slot /></a>',
    },
    Select: {
      props: ['modelValue', 'options', 'optionLabel', 'optionValue'],
      emits: ['update:modelValue', 'change'],
      template: `
        <select
          class="p-select"
          :value="modelValue"
          @change="$emit('update:modelValue', $event.target.value); $emit('change', $event)"
        >
          <option
            v-for="option in options"
            :key="option[optionValue]"
            :value="option[optionValue]"
          >
            {{ option[optionLabel] }}
          </option>
        </select>
      `,
    },
    SelectButton: {
      props: ['modelValue', 'options'],
      emits: ['update:modelValue'],
      template: `
        <div>
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            @click="$emit('update:modelValue', option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      `,
    },
  }
}
