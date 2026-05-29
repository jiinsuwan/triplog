import axios from 'axios'

// 공용 axios 인스턴스 (architecture §3). 모든 API 호출은 이 인스턴스를 거친다.
// baseURL 은 .env 의 VITE_API_BASE_URL 로 주입 (기본: 로컬 백엔드).
const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080',
  timeout: 10000,
  withCredentials: true,
})

// 요청 인터셉터: 액세스 토큰 주입 (Sprint 1 인증에서 토큰 저장소와 연결)
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 응답 인터셉터: 공통 에러 처리 골격.
// 401 → refresh 재시도 흐름은 Sprint 1(S1-CORE-02)에서 구현한다.
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    // TODO(Sprint 1): 401 시 /auth/refresh 호출 후 원요청 재시도
    return Promise.reject(error)
  },
)

export default instance
