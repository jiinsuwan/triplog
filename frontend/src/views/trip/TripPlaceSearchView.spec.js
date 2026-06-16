import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TripPlaceSearchView from './TripPlaceSearchView.vue'
import { fetchPlaceRegions, fetchPlaces } from '@/api/placeApi'
import { fetchTrip } from '@/api/tripApi'
import { loadKakaoMaps } from '@/utils/kakaoMap'

const routeMock = vi.hoisted(() => ({
  params: { tripId: '5001' },
  query: { mode: 'itinerary' },
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
    routerMock.push.mockReset()
    routerMock.replace.mockReset()
    fetchTrip.mockResolvedValue(trip)
    fetchPlaceRegions.mockResolvedValue([{ region1: '전라북도', region2: '전주시', count: 2 }])
    fetchPlaces.mockResolvedValue({ items: places, page: 0, size: 60, total: places.length })
    loadKakaoMaps.mockRejectedValue(new Error('Kakao SDK unavailable in test'))
  })

  it('fallback 지도 마커 클릭으로 현재 날짜 방문지를 추가하고 순서를 보정한다', async () => {
    const wrapper = mount(TripPlaceSearchView, {
      global: {
        stubs: primeVueStubs(),
      },
    })
    await flushPromises()
    await flushPromises()

    expect(wrapper.findAll('[role="tab"]')).toHaveLength(3)

    const pins = wrapper.findAll('.fallback-pin')
    expect(pins).toHaveLength(2)

    await pins[0].trigger('click')
    await flushPromises()
    await pins[1].trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.route-stop-card')).toHaveLength(2)
    expect(wrapper.findAll('.route-stop-card .p-select')).toHaveLength(2)
    expect(wrapper.text()).toContain('전주한옥마을')
    expect(wrapper.text()).toContain('경기전')

    await wrapper.find('button[aria-label="전주한옥마을 아래로 이동"]').trigger('click')
    await flushPromises()

    const stopNames = wrapper.findAll('.route-stop-main strong').map((item) => item.text())
    expect(stopNames).toEqual(['경기전', '전주한옥마을'])
  })
})

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
