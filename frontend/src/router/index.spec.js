import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import router, { authGuard } from '@/router'
import { useAuthStore } from '@/stores/auth'
import { useTripStore } from '@/stores/trip'

// to 객체 최소 형태(가드는 path·fullPath·meta 만 본다).
function route(path, meta = {}, params = {}) {
  return { path, fullPath: path, meta, params }
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

  it('password reset routes are public for unauthenticated users', () => {
    expect(authGuard(route('/forgot-password'))).toBe(true)
    expect(authGuard(route('/reset-password'))).toBe(true)
  })

  it('authenticated users are redirected away from password reset screens', () => {
    useAuthStore().setTokens('a1', 'r1')

    expect(authGuard(route('/forgot-password'))).toEqual({ path: '/' })
    expect(authGuard(route('/reset-password'))).toEqual({ path: '/' })
  })

  it('여행 상세 라우트는 보호 라우트로 등록한다', () => {
    const detailRoute = router.getRoutes().find((item) => item.name === 'trip-detail')

    expect(detailRoute?.meta.requiresAuth).toBe(true)
  })

  it('장소 탐색 라우트는 보호 라우트로 등록한다', () => {
    const placeRoute = router.getRoutes().find((item) => item.name === 'trip-place-search')

    expect(placeRoute?.path).toBe('/trips/:tripId/places')
    expect(placeRoute?.meta).toMatchObject({ requiresAuth: true, workspace: 'planning' })
  })

  it('계획/기록 워크스페이스 엔트리는 보호 라우트로 등록한다', () => {
    const planRoute = router.getRoutes().find((item) => item.name === 'trip-plan-workspace')
    const recordRoute = router.getRoutes().find((item) => item.name === 'trip-record-workspace')

    expect(planRoute?.path).toBe('/trips/:tripId/plan')
    expect(planRoute?.meta).toMatchObject({ requiresAuth: true, workspace: 'planning' })
    expect(planRoute?.redirect).toBeTypeOf('function')
    expect(recordRoute?.path).toBe('/trips/:tripId/log')
    expect(recordRoute?.meta).toMatchObject({ requiresAuth: true, workspace: 'record' })
  })

  it('plan workspace redirect keeps itinerary mode query', () => {
    const planRoute = router.getRoutes().find((item) => item.name === 'trip-plan-workspace')

    expect(
      planRoute.redirect({
        params: { tripId: '12' },
        query: { mode: 'itinerary' },
      }),
    ).toEqual({
      name: 'trip-place-search',
      params: { tripId: '12' },
      query: { mode: 'itinerary' },
    })
  })

  it('trip photos route belongs to record workspace', () => {
    const photoRoute = router.getRoutes().find((item) => item.name === 'trip-photos')

    expect(photoRoute?.meta).toMatchObject({ requiresAuth: true, workspace: 'record' })
  })

  it('planning trip cannot enter record workspace directly', () => {
    useAuthStore().setTokens('a1', 'r1')
    const tripStore = useTripStore()
    tripStore.trips = [{ id: 10, status: 'planning' }]

    expect(
      authGuard(
        route('/trips/10/log', { requiresAuth: true, workspace: 'record' }, { tripId: '10' }),
      ),
    ).toEqual({
      name: 'trip-place-search',
      params: { tripId: '10' },
      replace: true,
    })
  })

  it('past trip cannot enter planning workspace directly', () => {
    useAuthStore().setTokens('a1', 'r1')
    const tripStore = useTripStore()
    tripStore.trips = [{ id: 11, status: 'past' }]

    expect(
      authGuard(
        route('/trips/11/places', { requiresAuth: true, workspace: 'planning' }, { tripId: '11' }),
      ),
    ).toEqual({
      name: 'trip-record-workspace',
      params: { tripId: '11' },
      replace: true,
    })
  })
})

describe('router 라우트 등록 — 보호 누락 방지 (S2-CORE-02)', () => {
  // 인증 없이 접근 가능한 공개 라우트. 이 목록에 없는 모든 라우트는 requiresAuth 를 가져야 한다.
  // 새 트랙(trip/log)이 화면을 추가하며 requiresAuth 를 깜빡하면 이 테스트가 잡는다(육안 검토 대신 CI).
  const PUBLIC_PATHS = ['/', '/login', '/signup', '/forgot-password', '/reset-password']

  it('공개 목록 외 모든 라우트는 requiresAuth 를 가진다', () => {
    const unprotected = router
      .getRoutes()
      .filter((item) => !PUBLIC_PATHS.includes(item.path))
      .filter((item) => item.meta?.requiresAuth !== true)
      .map((item) => item.path)

    expect(unprotected).toEqual([])
  })
})
