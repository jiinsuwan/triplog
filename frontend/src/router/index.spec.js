import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import router, { authGuard } from '@/router'
import { useAuthStore } from '@/stores/auth'

// to 객체 최소 형태(가드는 path·fullPath·meta 만 본다).
function route(path, meta = {}) {
  return { path, fullPath: path, meta }
}

describe('router authGuard — 보호 라우트 가드', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('미인증 상태로 보호 라우트 접근 시 /login 으로 리다이렉트(redirect 보존)', () => {
    expect(authGuard(route('/profile', { requiresAuth: true }))).toEqual({
      path: '/login',
      query: { redirect: '/profile' },
    })
  })

  it('인증 상태면 보호 라우트 접근을 허용한다', () => {
    useAuthStore().setTokens('a1', 'r1')
    expect(authGuard(route('/profile', { requiresAuth: true }))).toBe(true)
  })

  it('미인증이어도 공개 라우트는 허용한다', () => {
    expect(authGuard(route('/'))).toBe(true)
  })

  it('이미 로그인한 사용자가 /login 접근 시 홈으로 보낸다', () => {
    useAuthStore().setTokens('a1', 'r1')
    expect(authGuard(route('/login'))).toEqual({ path: '/' })
  })

  it('미인증 사용자는 /login 에 그대로 접근한다', () => {
    expect(authGuard(route('/login'))).toBe(true)
  })

  it('여행 상세 라우트는 보호 라우트로 등록한다', () => {
    const detailRoute = router.getRoutes().find((item) => item.name === 'trip-detail')

    expect(detailRoute?.meta.requiresAuth).toBe(true)
  })
})

describe('router 라우트 등록 — 보호 누락 방지 (S2-CORE-02)', () => {
  // 인증 없이 접근 가능한 공개 라우트. 이 목록에 없는 모든 라우트는 requiresAuth 를 가져야 한다.
  // 새 트랙(trip/log)이 화면을 추가하며 requiresAuth 를 깜빡하면 이 테스트가 잡는다(육안 검토 대신 CI).
  const PUBLIC_PATHS = ['/', '/login', '/signup']

  it('공개 목록 외 모든 라우트는 requiresAuth 를 가진다', () => {
    const unprotected = router
      .getRoutes()
      .filter((item) => !PUBLIC_PATHS.includes(item.path))
      .filter((item) => item.meta?.requiresAuth !== true)
      .map((item) => item.path)

    expect(unprotected).toEqual([])
  })
})
