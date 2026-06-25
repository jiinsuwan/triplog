import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '@/api/authApi'
import { useAuthStore } from '@/stores/auth'
import AccountDialog from '@/components/common/AccountDialog.vue'

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
}))

vi.mock('@/api/authApi', () => ({
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  withdraw: vi.fn(),
  getMe: vi.fn(),
  updateProfile: vi.fn(),
}))

const BaseModalStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div v-if="modelValue" class="modal-stub"><slot /></div>',
}

const BaseButtonStub = {
  props: ['variant', 'type', 'disabled'],
  emits: ['click'],
  template:
    '<button :type="type || \'button\'" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

function mountDialog() {
  return mount(AccountDialog, {
    props: { modelValue: true },
    global: {
      stubs: {
        BaseModal: BaseModalStub,
        BaseButton: BaseButtonStub,
      },
    },
  })
}

function buttonByText(wrapper, text) {
  return wrapper.findAll('button').find((button) => button.text() === text)
}

describe('AccountDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    routerMock.push.mockClear()
    routerMock.replace.mockClear()
    authApi.withdraw.mockReset()
    authApi.logout.mockReset()
    authApi.getMe.mockReset()
    authApi.updateProfile.mockReset()
  })

  it('닉네임을 인라인 수정하면 저장 후 프로필을 갱신한다', async () => {
    authApi.updateProfile.mockResolvedValue({
      id: 1,
      email: 'a@example.com',
      nickname: '새닉',
      profileImg: null,
    })
    const store = useAuthStore()
    store.setTokens('a1', 'r1')
    store.user = { id: 1, email: 'a@example.com', nickname: 'tester', profileImg: null }
    const wrapper = mountDialog()

    await buttonByText(wrapper, '수정').trigger('click')
    await wrapper.find('#account-nickname').setValue('새닉')
    await buttonByText(wrapper, '저장').trigger('click')

    await vi.waitFor(() => {
      expect(authApi.updateProfile).toHaveBeenCalledWith({ nickname: '새닉', profileImg: null })
    })
    expect(store.user.nickname).toBe('새닉')
  })

  it('닉네임이 비면 검증 에러를 보여주고 API 를 호출하지 않는다', async () => {
    const store = useAuthStore()
    store.setTokens('a1', 'r1')
    store.user = { id: 1, email: 'a@example.com', nickname: 'tester', profileImg: null }
    const wrapper = mountDialog()

    await buttonByText(wrapper, '수정').trigger('click')
    await wrapper.find('#account-nickname').setValue('   ')
    await buttonByText(wrapper, '저장').trigger('click')

    expect(wrapper.text()).toContain('닉네임을 입력하세요.')
    expect(authApi.updateProfile).not.toHaveBeenCalled()
  })

  it('회원 탈퇴 실패 시 에러를 보여주고 세션을 유지한다', async () => {
    authApi.withdraw.mockRejectedValue({
      response: { data: { message: '비밀번호가 올바르지 않습니다.' } },
    })
    const store = useAuthStore()
    store.setTokens('a1', 'r1')
    store.user = { id: 1, email: 'a@example.com', nickname: 'tester' }
    const wrapper = mountDialog()

    await buttonByText(wrapper, '회원 탈퇴').trigger('click')
    await wrapper.find('input[type="password"]').setValue('wrong')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('비밀번호가 올바르지 않습니다.')
    })
    expect(authApi.withdraw).toHaveBeenCalledWith('wrong')
    expect(store.accessToken).toBe('a1')
    expect(store.refreshToken).toBe('r1')
    expect(routerMock.replace).not.toHaveBeenCalled()
  })

  it('회원 탈퇴 성공 시 세션을 비우고 로그인 화면으로 이동한다', async () => {
    authApi.withdraw.mockResolvedValue({ code: 'SUCCESS' })
    const store = useAuthStore()
    store.setTokens('a1', 'r1')
    store.user = { id: 1, email: 'a@example.com', nickname: 'tester' }
    const wrapper = mountDialog()

    await buttonByText(wrapper, '회원 탈퇴').trigger('click')
    await wrapper.find('input[type="password"]').setValue('password123')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith({
        path: '/login',
        query: { withdrawn: '1' },
      })
    })
    expect(store.accessToken).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.user).toBeNull()
  })

  it('소셜 전용 계정은 비밀번호 입력 없이 탈퇴한다', async () => {
    authApi.withdraw.mockResolvedValue({ code: 'SUCCESS' })
    const store = useAuthStore()
    store.setTokens('a1', 'r1')
    store.user = { id: 2, email: null, nickname: 'social tester', hasPassword: false }
    const wrapper = mountDialog()

    await buttonByText(wrapper, '회원 탈퇴').trigger('click')
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith({
        path: '/login',
        query: { withdrawn: '1' },
      })
    })
    expect(authApi.withdraw).toHaveBeenCalledWith(null)
    expect(store.accessToken).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.user).toBeNull()
  })
})
