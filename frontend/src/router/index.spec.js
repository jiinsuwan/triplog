import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { authGuard } from '@/router'
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
})
