import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '@/api/authApi'
import { AUTHENTICATED_ENTRY_PATH } from '@/router/entryPaths'
import LoginView from '@/views/auth/LoginView.vue'

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  routeQuery: {},
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerMock.push }),
  useRoute: () => ({ query: routerMock.routeQuery }),
}))

vi.mock('@/api/authApi', () => ({
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  startOAuthLogin: vi.fn(),
  getMe: vi.fn(),
}))

function mountLoginView() {
  return mount(LoginView, {
    global: {
      stubs: {
        InputText: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        Password: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        Button: {
          props: ['label', 'loading'],
          template: '<button type="submit">{{ label }}<slot /></button>',
        },
        Message: {
          template: '<div><slot /></div>',
        },
        RouterLink: {
          props: ['to'],
          template: '<a><slot /></a>',
        },
      },
    },
  })
}

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    routerMock.push.mockClear()
    routerMock.routeQuery = {}
    authApi.login.mockResolvedValue({ accessToken: 'a1', refreshToken: 'r1', tokenType: 'Bearer' })
    authApi.getMe.mockResolvedValue({ id: 1, email: 'a@a.com', nickname: '사용자' })
    authApi.startOAuthLogin.mockReset()
  })

  it('로그인 성공 시 redirect query가 없으면 여행 목록으로 이동한다', async () => {
    const wrapper = mountLoginView()

    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(routerMock.push).toHaveBeenCalledWith(AUTHENTICATED_ENTRY_PATH)
    })
  })

  it('로그인 성공 시 redirect query가 있으면 기존 목적지로 이동한다', async () => {
    routerMock.routeQuery = { redirect: '/profile' }
    const wrapper = mountLoginView()

    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(routerMock.push).toHaveBeenCalledWith('/profile')
    })
  })

  it('회원 탈퇴 완료 query가 있으면 안내 메시지를 보여준다', () => {
    routerMock.routeQuery = { withdrawn: '1' }
    const wrapper = mountLoginView()

    expect(wrapper.text()).toContain('회원 탈퇴가 완료되었습니다.')
  })

  it('OAuth 실패 query가 있으면 안전한 오류 메시지를 보여준다', () => {
    routerMock.routeQuery = { oauthError: 'email_conflict' }
    const wrapper = mountLoginView()

    expect(wrapper.text()).toContain('이미 같은 이메일로 가입된 계정이 있습니다.')
  })

  it('소셜 로그인 버튼은 백엔드 authorize 흐름을 시작한다', async () => {
    routerMock.routeQuery = { redirect: '/profile' }
    const wrapper = mountLoginView()

    await wrapper.findAll('button').find((button) => button.text().includes('구글로 계속하기')).trigger('click')

    expect(authApi.startOAuthLogin).toHaveBeenCalledWith('google', '/profile')
  })
})
