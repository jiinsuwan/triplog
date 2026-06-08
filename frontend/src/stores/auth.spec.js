import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import axios from 'axios'

// 라우터는 #21 이전이라 /login 라우트가 없다. push 시도만 검증하면 되므로 모킹한다.
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn(() => Promise.resolve()) }))
vi.mock('@/router', () => ({ default: { push: pushMock } }))

import { useAuthStore } from '@/stores/auth'

describe('auth 스토어', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    pushMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('setTokens 는 access·refresh 토큰을 상태와 localStorage 에 함께 저장한다', () => {
    const store = useAuthStore()

    store.setTokens('a1', 'r1')

    expect(store.accessToken).toBe('a1')
    expect(store.refreshToken).toBe('r1')
    expect(store.isAuthenticated).toBe(true)
    expect(localStorage.getItem('accessToken')).toBe('a1')
    expect(localStorage.getItem('refreshToken')).toBe('r1')
  })

  it('refresh 성공 시 두 토큰을 새 값으로 갱신하고 새 access 토큰을 반환한다', async () => {
    localStorage.setItem('accessToken', 'a-old')
    localStorage.setItem('refreshToken', 'r-old')
    const store = useAuthStore() // 위 localStorage 값으로 초기화된다.

    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { code: 'SUCCESS', data: { accessToken: 'a-new', refreshToken: 'r-new', tokenType: 'Bearer' } },
    })

    const returned = await store.refresh()

    expect(returned).toBe('a-new')
    expect(postSpy).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), {
      refreshToken: 'r-old',
    })
    expect(store.accessToken).toBe('a-new')
    expect(store.refreshToken).toBe('r-new')
    expect(localStorage.getItem('accessToken')).toBe('a-new')
    expect(localStorage.getItem('refreshToken')).toBe('r-new')
  })

  it('refresh 실패 시 토큰을 비우고 로그인 경로로 이동을 시도하며 에러를 전파한다', async () => {
    localStorage.setItem('accessToken', 'a-old')
    localStorage.setItem('refreshToken', 'r-old')
    const store = useAuthStore()

    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh failed'))

    await expect(store.refresh()).rejects.toThrow('refresh failed')

    expect(store.accessToken).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('refreshToken')).toBeNull()
    expect(pushMock).toHaveBeenCalledWith('/login')
  })

  it('logout 은 토큰과 사용자 상태를 모두 비운다', () => {
    const store = useAuthStore()
    store.setTokens('a1', 'r1')
    store.user = { id: 1 }

    store.logout()

    expect(store.accessToken).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.user).toBeNull()
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('refreshToken')).toBeNull()
  })
})
