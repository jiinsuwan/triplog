import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import { fetchPhotoContent } from '@/api/photoApi'

// 컴포저블은 실제로 돌리고, 그 아래 네트워크(photoApi)만 목으로 막는다 → 컴포넌트+컴포저블 통합 검증.
vi.mock('@/api/photoApi', () => ({ fetchPhotoContent: vi.fn() }))

beforeEach(() => {
  fetchPhotoContent.mockReset()
  // jsdom 은 objectURL API 가 없으므로 스텁한다(호출 결과만 검증).
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  })
})
afterEach(() => vi.unstubAllGlobals())

function jpegBlob() {
  return new Blob(['x'], { type: 'image/jpeg' })
}

describe('PhotoThumb', () => {
  it('로딩 중에는 스켈레톤을 보여준다(응답 전, <img> 없음)', () => {
    fetchPhotoContent.mockReturnValue(new Promise(() => {})) // 영원히 pending
    const wrapper = mount(PhotoThumb, { props: { photoId: 1 } })

    expect(wrapper.find('.skeleton').exists()).toBe(true)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('성공: 원본을 받고 <img> 디코딩(@load)에 성공하면 loaded 로 표시한다', async () => {
    fetchPhotoContent.mockResolvedValue(jpegBlob())
    const wrapper = mount(PhotoThumb, { props: { photoId: 1, alt: '제주' } })
    await flushPromises()

    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('blob:fake')

    await img.trigger('load')
    expect(wrapper.find('.skeleton').exists()).toBe(false)
    expect(img.isVisible()).toBe(true)
  })

  it('디코딩 실패: <img> @error(HEIC 등 미표시)면 아이콘 폴백으로 전환한다', async () => {
    fetchPhotoContent.mockResolvedValue(jpegBlob())
    const wrapper = mount(PhotoThumb, { props: { photoId: 1 } })
    await flushPromises()

    await wrapper.find('img').trigger('error')
    expect(wrapper.find('.fallback').exists()).toBe(true)
    expect(wrapper.find('.skeleton').exists()).toBe(false)
  })

  it('fetch 실패: 원본을 못 받으면 아이콘 폴백을 보여준다(<img> 없음)', async () => {
    fetchPhotoContent.mockRejectedValue(new Error('404'))
    const wrapper = mount(PhotoThumb, { props: { photoId: 1 } })
    await flushPromises()

    expect(wrapper.find('.fallback').exists()).toBe(true)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('접근성: 컨테이너가 role=img 와 alt 기반 aria-label 을 가진다', () => {
    fetchPhotoContent.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(PhotoThumb, { props: { photoId: 1, alt: '한라산 정상' } })

    const root = wrapper.find('.photo-thumb')
    expect(root.attributes('role')).toBe('img')
    expect(root.attributes('aria-label')).toBe('한라산 정상')
  })

  it('접근성: alt 가 없으면 기본 aria-label("사진")을 쓴다', () => {
    fetchPhotoContent.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(PhotoThumb, { props: { photoId: 1 } })
    expect(wrapper.find('.photo-thumb').attributes('aria-label')).toBe('사진')
  })

  it('photoId 가 바뀌면 늦게 도착한 이전 응답이 최신 화면을 덮어쓰지 않는다', async () => {
    let resolveOld
    const oldArrival = new Promise((r) => { resolveOld = r })
    // photoId=1 은 보류, photoId=2 는 즉시 도착.
    fetchPhotoContent.mockImplementation((id) =>
      id === 1 ? oldArrival : Promise.resolve(jpegBlob()),
    )
    // 생성 URL 을 구분 가능하게(기본 stub 은 상수라 1·2 를 식별 못 한다).
    let seq = 0
    URL.createObjectURL.mockImplementation(() => `blob:${++seq}`)

    const wrapper = mount(PhotoThumb, { props: { photoId: 1 } })
    await wrapper.setProps({ photoId: 2 })
    await flushPromises()
    await wrapper.find('img').trigger('load')
    const currentSrc = wrapper.find('img').attributes('src')

    // 보류됐던 photoId=1 응답이 뒤늦게 도착해도 현재(2) 이미지를 덮지 않는다.
    resolveOld(jpegBlob())
    await flushPromises()

    expect(wrapper.find('img').attributes('src')).toBe(currentSrc)
  })
})
