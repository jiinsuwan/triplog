// CorrectionDialog mount 스모크 — 무커버 화면의 template 드리프트 방지.
// 목적: 매직 스트링을 상수(MODE/ADD_TOOL/MARK/ITEM_SRC)로 바꾼 뒤에도
//       template 이 그 상수 바인딩을 올바로 참조하는지(모드/도구/포함제외/src 태그)를
//       실제 클릭으로 확인한다. 렌더 세부가 아니라 "안 깨지고 상태 전이가 도는가"가 관심사.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/usePhotoContent', () => ({
  usePhotoContent: () => ({ load: vi.fn().mockResolvedValue('blob:stub') }),
}))

import CorrectionDialog from '@/components/log/CorrectionDialog.vue'
import { useCardStore } from '@/stores/card'

const PID = 7
const SQUARE = [
  [
    [0.2, 0.2],
    [0.6, 0.2],
    [0.6, 0.6],
    [0.2, 0.6],
  ],
]

function seedOutline() {
  useCardStore().outlines = {
    [PID]: {
      status: 'READY',
      items: [
        { id: 1, polygons: SQUARE, src: 'auto' },
        { id: 2, polygons: SQUARE, src: 'user' },
      ],
    },
  }
}

function mountDialog() {
  return mount(CorrectionDialog, {
    props: { modelValue: true, photoId: PID },
    global: { stubs: { teleport: true } },
  })
}

function byText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

describe('CorrectionDialog mount 스모크', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('열리면 크래시 없이 헤더·모드 세그·추가 도구를 렌더하고 도구 전환이 돈다', async () => {
    const wrapper = mountDialog()

    expect(wrapper.text()).toContain('외곽선 보정')
    expect(byText(wrapper, '추가')).toBeTruthy()
    expect(byText(wrapper, '보정')).toBeTruthy()

    // 추가 모드(기본) → 점/박스 도구 노출.
    const tools = wrapper.findAll('.toolrow .tool')
    expect(tools).toHaveLength(2)
    expect(tools[0].classes()).toContain('on') // 기본 tap

    await tools[1].trigger('click') // 박스 선택
    expect(wrapper.findAll('.toolrow .tool')[1].classes()).toContain('on')
    expect(wrapper.findAll('.toolrow .tool')[0].classes()).not.toContain('on')
  })

  it('보정 모드 전환 + 대상 목록의 src 태그(직접/자동)를 렌더한다', async () => {
    seedOutline()
    const wrapper = mountDialog()

    const list = wrapper.findAll('.objlist li')
    expect(list).toHaveLength(2)
    expect(wrapper.find('.objlist').text()).toContain('자동') // src=auto
    expect(wrapper.find('.objlist').text()).toContain('직접') // src=user

    await byText(wrapper, '보정').trigger('click')
    expect(wrapper.text()).toContain('화면이나 목록에서 대상을 선택하세요')
  })

  it('대상 선택 → 모양 다듬기 → 포함/제외 토글이 돈다', async () => {
    seedOutline()
    const wrapper = mountDialog()

    await byText(wrapper, '보정').trigger('click')
    await wrapper.findAll('.objlist li')[0].trigger('click') // 객체 1 선택
    await byText(wrapper, '모양 다듬기').trigger('click') // 정제 진입

    const inc = wrapper.find('.toggle button.inc')
    const exc = wrapper.find('.toggle button.exc')
    expect(inc.exists()).toBe(true)
    expect(exc.exists()).toBe(true)
    expect(inc.classes()).toContain('on') // 기본 plus(포함)

    await exc.trigger('click') // 제외로 전환
    expect(wrapper.find('.toggle button.exc').classes()).toContain('on')
    expect(wrapper.find('.toggle button.inc').classes()).not.toContain('on')
  })
})
