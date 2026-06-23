import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '@/api/authApi'
import { useAuthStore } from '@/stores/auth'
import ProfileView from '@/views/ProfileView.vue'

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
}))

function mountProfileView() {
  return mount(ProfileView, {
    global: {
      stubs: {
        Button: {
          props: ['label', 'type', 'loading'],
          emits: ['click'],
          template:
            '<button :type="type || \'button\'" @click="$emit(\'click\')">{{ label }}<slot /></button>',
        },
        Dialog: {
          props: ['visible', 'header'],
          emits: ['update:visible', 'hide'],
          template: '<div v-if="visible"><slot /></div>',
        },
        Password: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<input type="password" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        Message: {
          template: '<div><slot /></div>',
        },
      },
    },
  })
}

function buttonByText(wrapper, text) {
  return wrapper.findAll('button').find((button) => button.text() === text)
}

describe('ProfileView withdrawal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    routerMock.push.mockClear()
    routerMock.replace.mockClear()
    authApi.withdraw.mockReset()
    authApi.logout.mockReset()
    authApi.getMe.mockReset()
  })

  it('회원 탈퇴 실패 시 에러를 보여주고 세션을 유지한다', async () => {
    authApi.withdraw.mockRejectedValue({
      response: { data: { message: '비밀번호가 올바르지 않습니다.' } },
    })
    const store = useAuthStore()
    store.setTokens('a1', 'r1')
    store.user = { id: 1, email: 'a@example.com', nickname: 'tester' }
    const wrapper = mountProfileView()

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
    const wrapper = mountProfileView()

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
})
