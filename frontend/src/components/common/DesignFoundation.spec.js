import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'

import BaseModal from './BaseModal.vue'
import TripPolaroid from './TripPolaroid.vue'
import TripStamp from './TripStamp.vue'
import TripTicket from './TripTicket.vue'

describe('design foundation components', () => {
  it('renders trip ticket d-day and tag fallbacks', () => {
    const wrapper = mount(TripTicket, {
      props: {
        title: '제주 동쪽 여행',
        region: '제주',
        dates: '날짜 미정',
        tags: ['바다', '#오름'],
      },
    })

    expect(wrapper.find('.ds-ticket__title').text()).toBe('제주 동쪽 여행')
    expect(wrapper.find('.ds-ticket__tags').text()).toBe('#바다 #오름')
    expect(wrapper.find('.ds-ticket__dday-value').text()).toBe('미정')
    expect(wrapper.find('.ds-ticket__dday-value').classes()).toContain('is-muted')
  })

  it('renders stamp stages with design glyphs', () => {
    const wrapper = mount(TripStamp, {
      props: {
        title: '교토',
        stage: 3,
        complete: true,
      },
    })

    expect(wrapper.classes()).toContain('ds-stamp-stage-3')
    expect(wrapper.text()).toContain('✈')
    expect(wrapper.text()).toContain('★')
    expect(wrapper.text()).toContain('COMPLETE')
  })

  it('renders polaroid image, tags, complete mark, and empty placeholder', () => {
    const filled = mount(TripPolaroid, {
      props: {
        title: '교토 단풍 기록',
        imageUrl: 'https://example.com/photo.jpg',
        tags: ['단풍'],
        completed: true,
      },
    })

    expect(filled.find('.ds-polaroid__photo').attributes('style')).toContain(
      'https://example.com/photo.jpg',
    )
    expect(filled.find('.ds-polaroid__tags').text()).toBe('#단풍')
    expect(filled.find('.ds-polaroid__done-stamp').text()).toBe('COMPLETE')

    const empty = mount(TripPolaroid, {
      props: {
        title: '오사카 봄 여행',
        empty: true,
      },
    })

    expect(empty.classes()).toContain('ds-polaroid--empty')
    expect(empty.find('.ds-polaroid__placeholder').text()).toContain('＋')
    expect(empty.find('.ds-polaroid__placeholder').text()).toContain('추억 만들기')
  })

  it('locks scroll and emits close when modal receives Escape', async () => {
    const wrapper = mount(BaseModal, {
      attachTo: document.body,
      props: {
        modelValue: true,
        title: '여행 삭제',
      },
      slots: {
        default: '<button type="button">모달 안 버튼</button>',
      },
    })

    await nextTick()

    expect(document.body.style.overflow).toBe('hidden')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])

    wrapper.unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
