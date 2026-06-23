import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import axios from 'axios'

// 로그인/회원가입/로그아웃/프로필 HTTP 는 authApi 를 모킹해 격리한다.
// (store 는 더 이상 router 에 의존하지 않는다 — 화면 이동은 인터셉터/가드 책임)
vi.mock('@/api/authApi', () => ({
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  withdraw: vi.fn(),
  getMe: vi.fn(),
}))

import * as authApi from '@/api/authApi'
import { useAuthStore } from '@/stores/auth'

describe('auth 스토어', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
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

  // --- login ---
  it('login 성공 시 토큰 저장 + 프로필 로드 후 인증 상태가 된다', async () => {
    authApi.login.mockResolvedValue({ accessToken: 'a1', refreshToken: 'r1', tokenType: 'Bearer' })
    authApi.getMe.mockResolvedValue({ id: 1, email: 'a@a.com', nickname: '지인' })
    const store = useAuthStore()

    await store.login('a@a.com', 'pw12345678')

    expect(authApi.login).toHaveBeenCalledWith('a@a.com', 'pw12345678')
    expect(store.isAuthenticated).toBe(true)
    expect(store.accessToken).toBe('a1')
    expect(store.refreshToken).toBe('r1')
    expect(store.user).toEqual({ id: 1, email: 'a@a.com', nickname: '지인' })
  })

  it('login 실패 시 토큰을 저장하지 않고 에러를 전파한다', async () => {
    authApi.login.mockRejectedValue(new Error('invalid credentials'))
    const store = useAuthStore()

    await expect(store.login('a@a.com', 'wrong')).rejects.toThrow('invalid credentials')

    expect(store.isAuthenticated).toBe(false)
    expect(store.accessToken).toBeNull()
    expect(authApi.getMe).not.toHaveBeenCalled()
  })

  it('login 은 프로필 로드(getMe)가 실패해도 로그인 성공으로 처리한다', async () => {
    authApi.login.mockResolvedValue({ accessToken: 'a1', refreshToken: 'r1', tokenType: 'Bearer' })
    authApi.getMe.mockRejectedValue(new Error('me failed'))
    const store = useAuthStore()

    await store.login('a@a.com', 'pw12345678')

    expect(store.isAuthenticated).toBe(true)
    expect(store.user).toBeNull()
  })

  it('completeOAuthLogin 은 토큰 저장 후 프로필을 로드한다', async () => {
    authApi.getMe.mockResolvedValue({ id: 7, email: null, nickname: '소셜 사용자' })
    const store = useAuthStore()

    await store.completeOAuthLogin({ accessToken: 'oauth-a', refreshToken: 'oauth-r', tokenType: 'Bearer' })

    expect(store.accessToken).toBe('oauth-a')
    expect(store.refreshToken).toBe('oauth-r')
    expect(store.user).toEqual({ id: 7, email: null, nickname: '소셜 사용자' })
  })

  // --- signup ---
  it('signup 은 가입만 하고 자동 로그인하지 않는다(토큰 미저장)', async () => {
    authApi.signup.mockResolvedValue({ id: 1, email: 'a@a.com', nickname: '지인' })
    const store = useAuthStore()

    const profile = await store.signup('a@a.com', 'pw12345678', '지인')

    expect(authApi.signup).toHaveBeenCalledWith('a@a.com', 'pw12345678', '지인')
    expect(profile).toEqual({ id: 1, email: 'a@a.com', nickname: '지인' })
    expect(store.isAuthenticated).toBe(false)
  })

  // --- logout ---
  it('logout 은 서버 무효화 후 토큰·유저 상태를 비운다', async () => {
    authApi.logout.mockResolvedValue({ code: 'SUCCESS' })
    localStorage.setItem('accessToken', 'a1')
    localStorage.setItem('refreshToken', 'r1')
    const store = useAuthStore()
    store.user = { id: 1 }

    await store.logout()

    expect(authApi.logout).toHaveBeenCalledWith('r1')
    expect(store.accessToken).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.user).toBeNull()
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('refreshToken')).toBeNull()
  })

  it('logout 은 서버 무효화가 실패해도 클라이언트 상태를 비운다(best-effort)', async () => {
    authApi.logout.mockRejectedValue(new Error('logout failed'))
    localStorage.setItem('accessToken', 'a1')
    localStorage.setItem('refreshToken', 'r1')
    const store = useAuthStore()

    await store.logout()

    expect(store.isAuthenticated).toBe(false)
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('refreshToken')).toBeNull()
  })

  // --- withdraw ---
  it('withdraw 성공 시 서버 탈퇴 후 토큰·유저 상태를 비운다', async () => {
    authApi.withdraw.mockResolvedValue({ code: 'SUCCESS' })
    localStorage.setItem('accessToken', 'a1')
    localStorage.setItem('refreshToken', 'r1')
    const store = useAuthStore()
    store.user = { id: 1 }

    await store.withdraw('password123')

    expect(authApi.withdraw).toHaveBeenCalledWith('password123')
    expect(store.accessToken).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.user).toBeNull()
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('refreshToken')).toBeNull()
  })

  it('withdraw 실패 시 토큰·유저 상태를 유지한다', async () => {
    authApi.withdraw.mockRejectedValue(new Error('wrong password'))
    localStorage.setItem('accessToken', 'a1')
    localStorage.setItem('refreshToken', 'r1')
    const store = useAuthStore()
    store.user = { id: 1 }

    await expect(store.withdraw('wrong')).rejects.toThrow('wrong password')

    expect(store.accessToken).toBe('a1')
    expect(store.refreshToken).toBe('r1')
    expect(store.user).toEqual({ id: 1 })
    expect(localStorage.getItem('accessToken')).toBe('a1')
    expect(localStorage.getItem('refreshToken')).toBe('r1')
  })

  // --- refresh (S1-CORE-02 동작 유지) ---
  it('refresh 성공 시 두 토큰을 새 값으로 갱신하고 새 access 토큰을 반환한다', async () => {
    localStorage.setItem('accessToken', 'a-old')
    localStorage.setItem('refreshToken', 'r-old')
    const store = useAuthStore()

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
  })

  it('refresh 실패 시 세션을 비우고 에러를 전파한다(화면 이동은 store 책임 아님)', async () => {
    localStorage.setItem('accessToken', 'a-old')
    localStorage.setItem('refreshToken', 'r-old')
    const store = useAuthStore()

    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh failed'))

    await expect(store.refresh()).rejects.toThrow('refresh failed')

    expect(store.accessToken).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('clearSession 은 토큰·유저 상태를 비운다', () => {
    const store = useAuthStore()
    store.setTokens('a1', 'r1')
    store.user = { id: 1 }

    store.clearSession()

    expect(store.accessToken).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.user).toBeNull()
  })
})
