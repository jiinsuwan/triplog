import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import axios from 'axios'

// 라우터는 #21 이전이라 /login 라우트가 없다. push 시도만 검증하면 되므로 모킹한다.
// (vi.mock 은 import 위로 호이스팅되므로 pushMock 도 vi.hoisted 로 함께 끌어올린다.)
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn(() => Promise.resolve()) }))
vi.mock('@/router', () => ({ default: { push: pushMock } }))

import instance from '@/api/instance'

// 인스턴스의 실제 네트워크 호출을 대체하는 어댑터. config 에 따라 401/200 을 흉내낸다.
function makeAdapter(decideStatus) {
  return vi.fn((config) => {
    const status = decideStatus(config)
    const response = { data: { ok: status === 200 }, status, statusText: '', headers: {}, config }
    if (status >= 200 && status < 300) {
      return Promise.resolve(response)
    }
    const error = new Error(`Request failed with status code ${status}`)
    error.config = config
    error.response = response
    return Promise.reject(error)
  })
}

// AxiosHeaders 또는 plain object 모두에서 Authorization 값을 읽는다.
function authHeader(config) {
  const headers = config.headers ?? {}
  return typeof headers.get === 'function' ? headers.get('Authorization') : headers.Authorization
}

describe('axios instance — 401 refresh 인터셉터', () => {
  let postSpy

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    localStorage.setItem('accessToken', 'access-old')
    localStorage.setItem('refreshToken', 'refresh-old')
    pushMock.mockClear()
    // 스토어 refresh() 가 호출하는 /auth/refresh 응답을 모킹(성공: 새 토큰 쌍).
    postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      data: {
        code: 'SUCCESS',
        message: '토큰이 재발급되었습니다.',
        data: { accessToken: 'access-new', refreshToken: 'refresh-new', tokenType: 'Bearer' },
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    instance.defaults.adapter = undefined
  })

  it('401 응답 시 refresh 후 원요청을 재시도해 성공한다', async () => {
    // 새 액세스 토큰이면 200, 아니면 401.
    instance.defaults.adapter = makeAdapter((config) =>
      authHeader(config) === 'Bearer access-new' ? 200 : 401,
    )

    const res = await instance.get('/trips')

    expect(res.status).toBe(200)
    expect(postSpy).toHaveBeenCalledTimes(1)
    // refresh 호출 본문에 기존 refresh 토큰이 담긴다.
    expect(postSpy).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), {
      refreshToken: 'refresh-old',
    })
  })

  it('refresh 성공 시 access·refresh 토큰을 둘 다 새 값으로 저장한다', async () => {
    instance.defaults.adapter = makeAdapter((config) =>
      authHeader(config) === 'Bearer access-new' ? 200 : 401,
    )

    await instance.get('/trips')

    expect(localStorage.getItem('accessToken')).toBe('access-new')
    expect(localStorage.getItem('refreshToken')).toBe('refresh-new')
  })

  it('재시도 후에도 401 이면 한 번만 재시도하고 실패를 전파한다', async () => {
    const adapter = makeAdapter(() => 401) // 항상 401.
    instance.defaults.adapter = adapter

    await expect(instance.get('/trips')).rejects.toMatchObject({ response: { status: 401 } })

    expect(postSpy).toHaveBeenCalledTimes(1) // refresh 1회.
    expect(adapter).toHaveBeenCalledTimes(2) // 원요청 + 재시도 1회.
  })

  it('로그인/회원가입/refresh 요청의 401 은 재시도하지 않는다', async () => {
    const adapter = makeAdapter(() => 401)
    instance.defaults.adapter = adapter

    await expect(
      instance.post('/auth/login', { email: 'a@a.com', password: 'x' }),
    ).rejects.toMatchObject({ response: { status: 401 } })

    expect(postSpy).not.toHaveBeenCalled() // refresh 시도 없음.
    expect(adapter).toHaveBeenCalledTimes(1) // 재시도 없음.
  })

  it('동시 401 이 여러 건이어도 refresh 는 정확히 한 번만 호출한다', async () => {
    instance.defaults.adapter = makeAdapter((config) =>
      authHeader(config) === 'Bearer access-new' ? 200 : 401,
    )

    const results = await Promise.all([
      instance.get('/trips'),
      instance.get('/trips/1'),
      instance.get('/places'),
    ])

    expect(results.every((r) => r.status === 200)).toBe(true)
    expect(postSpy).toHaveBeenCalledTimes(1) // single-flight.
  })

  it('refresh 가 실패하면 토큰을 비우고 로그인 경로로 이동을 시도한다', async () => {
    postSpy.mockRejectedValueOnce(new Error('refresh failed'))
    instance.defaults.adapter = makeAdapter(() => 401)

    await expect(instance.get('/trips')).rejects.toBeTruthy()

    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('refreshToken')).toBeNull()
    expect(pushMock).toHaveBeenCalledWith('/login')
  })
})
