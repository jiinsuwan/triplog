import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'

import AppTopBar from './AppTopBar.vue'
import BaseModal from './BaseModal.vue'
import TripPolaroid from './TripPolaroid.vue'
import TripStamp from './TripStamp.vue'
import TripTicket from './TripTicket.vue'

describe('design foundation components', () => {
  it('can hide topbar search and default create action while opening profile via avatar', async () => {
    const wrapper = mount(AppTopBar, {
      props: {
        active: 'home',
        showSearch: false,
        showDefaultAction: false,
        userInitial: '지',
      },
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
          },
          // 계정 팝업은 store/router 에 의존하므로 단위 테스트에선 stub 으로 대체하고
          // 아바타 클릭 → modelValue 토글만 검증한다.
          AccountDialog: {
            props: ['modelValue'],
            template: '<div class="account-dialog-stub">{{ modelValue }}</div>',
          },
        },
      },
    })

    expect(wrapper.find('.ds-topbar__search').exists()).toBe(false)
    expect(wrapper.find('.ds-topbar__actions').text()).toBe('')
    expect(wrapper.text()).not.toContain('새 여행')

    const avatar = wrapper.find('.ds-avatar')
    expect(avatar.element.tagName).toBe('BUTTON')
    expect(avatar.text()).toBe('지')
    expect(wrapper.find('.account-dialog-stub').text()).toBe('false')

    await avatar.trigger('click')
    expect(wrapper.find('.account-dialog-stub').text()).toBe('true')
  })

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

  it('renders unissued trip tickets without barcode', () => {
    const wrapper = mount(TripTicket, {
      props: {
        title: '새 여행을 계획해보세요.',
        region: 'TripLog',
        dates: 'TripLog로 여행을 계획해보세요.',
        dday: '+',
        ddayLabel: 'ADD',
        unissued: true,
        showBarcode: false,
      },
    })

    expect(wrapper.classes()).toContain('ds-ticket--unissued')
    expect(wrapper.classes()).toContain('ds-ticket--no-barcode')
    expect(wrapper.find('.ds-ticket__barcode').exists()).toBe(false)
    expect(wrapper.find('.ds-ticket__dday-label').text()).toBe('ADD')
    expect(wrapper.find('.ds-ticket__dday-value').text()).toBe('+')
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
