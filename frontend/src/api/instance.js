import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import { API_BASE_URL } from './config'

// 공용 axios 인스턴스 (architecture §3). 모든 API 호출은 이 인스턴스를 거친다.
// refresh 는 쿠키가 아니라 body 기반(#14)이라 withCredentials 불필요 → 사용 안 함.
const instance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
})

// refresh 로 회복할 수 없는 인증 엔드포인트. 이들의 401 은 액세스 토큰 만료가 아니라
// 인증 실패(잘못된 자격증명·만료/재사용된 refresh)이므로 재시도하지 않는다.
const AUTH_ENDPOINTS = ['/auth/login', '/auth/signup', '/auth/refresh']

function isAuthEndpoint(url = '') {
  return AUTH_ENDPOINTS.some((path) => url.includes(path))
}

// 요청 인터셉터: 액세스 토큰 주입.
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// single-flight: 동시에 여러 요청이 401 을 받아도 /auth/refresh 는 한 번만 호출한다.
// 백엔드가 refresh 토큰 rotation(일회용)을 쓰므로, 중복 refresh 는 폐기된 토큰 재사용
// → AUTH_006(해당 유저 전체 세션 무효화)을 유발한다. 따라서 single-flight 는
// 최적화가 아니라 정합성 요구사항이다.
let refreshPromise = null

// 응답 인터셉터: 401 → refresh → 원요청 1회 재시도.
instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error

    // 응답이 없는 에러(네트워크·타임아웃 등)나 401 이 아니면 그대로 전파.
    if (!response || !config || response.status !== 401) {
      return Promise.reject(error)
    }
    // 인증 엔드포인트의 401 또는 이미 재시도한 요청은 회복 불가 → 전파(무한 루프 방지).
    if (isAuthEndpoint(config.url) || config._retry) {
      return Promise.reject(error)
    }

    config._retry = true // 재시도 1회 제한.
    const authStore = useAuthStore()

    try {
      // 진행 중인 refresh 가 있으면 그것을 공유한다(중복 호출 방지).
      if (!refreshPromise) {
        refreshPromise = authStore.refresh().finally(() => {
          refreshPromise = null
        })
      }
      const newAccessToken = await refreshPromise

      // 새 액세스 토큰으로 원요청 재시도.
      config.headers = config.headers ?? {}
      config.headers.Authorization = `Bearer ${newAccessToken}`
      return instance(config)
    } catch (refreshError) {
      // refresh 실패 시 토큰 clear + 로그인 이동은 authStore.refresh() 가 처리한다.
      return Promise.reject(refreshError)
    }
  },
)

export default instance
