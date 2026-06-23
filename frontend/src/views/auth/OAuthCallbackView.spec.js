import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '@/api/authApi'
import { useAuthStore } from '@/stores/auth'
import OAuthCallbackView from '@/views/auth/OAuthCallbackView.vue'

const routerMock = vi.hoisted(() => ({
  replace: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: routerMock.replace }),
}))

vi.mock('@/api/authApi', () => ({
  getMe: vi.fn(),
}))

function mountView() {
  return mount(OAuthCallbackView, {
    global: {
      stubs: {
        Message: {
          template: '<div><slot /></div>',
        },
      },
    },
  })
}

describe('OAuthCallbackView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    routerMock.replace.mockClear()
    authApi.getMe.mockResolvedValue({ id: 1, email: null, nickname: '소셜 사용자' })
    history.replaceState(null, '', '/oauth/callback')
  })

  it('hash 토큰을 auth store 에 저장하고 redirect 경로로 이동한다', async () => {
    history.replaceState(
      null,
      '',
      '/oauth/callback#accessToken=a1&refreshToken=r1&tokenType=Bearer&redirect=%2Fprofile',
    )

    mountView()

    await vi.waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith('/profile')
    })

    const store = useAuthStore()
    expect(store.accessToken).toBe('a1')
    expect(store.refreshToken).toBe('r1')
    expect(store.user).toEqual({ id: 1, email: null, nickname: '소셜 사용자' })
  })

  it('토큰이 없으면 로그인 화면으로 실패 상태를 전달한다', async () => {
    mountView()

    await vi.waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith({
        path: '/login',
        query: { oauthError: 'failed' },
      })
    })
  })
})
