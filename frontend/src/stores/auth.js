import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import router from '@/router'
import { API_BASE_URL } from '@/api/config'

// 로그인 화면 경로. 실제 라우트는 #21(로그인·회원가입 화면)에서 추가된다.
// 그 전까지는 push 가 실패할 수 있으므로 refresh 실패 처리에서 catch 로 무시한다.
const LOGIN_ROUTE = '/login'

// 인증 스토어 (architecture §3·§7, 공유 영역).
// access/refresh 토큰을 보관하고, 401 시 인터셉터가 호출하는 refresh 액션을 제공한다.
export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref(localStorage.getItem('accessToken'))
  const refreshToken = ref(localStorage.getItem('refreshToken'))
  const user = ref(null)

  const isAuthenticated = computed(() => !!accessToken.value)

  // access·refresh 토큰을 함께 갱신한다. 백엔드가 refresh 토큰 rotation(일회용)을 쓰므로,
  // refresh 성공 시 두 토큰을 모두 새 값으로 저장해야 다음 refresh 가 폐기된 토큰을 재사용하지 않는다.
  function setTokens(access, refresh) {
    accessToken.value = access ?? null
    refreshToken.value = refresh ?? null
    persist('accessToken', access)
    persist('refreshToken', refresh)
  }

  function persist(key, value) {
    if (value) {
      localStorage.setItem(key, value)
    } else {
      localStorage.removeItem(key)
    }
  }

  // 클라이언트 측 인증 상태 초기화.
  // (백엔드 refresh 토큰 무효화/로그아웃 API 연동은 #21 로그인 흐름에서 다룬다.)
  function logout() {
    setTokens(null, null)
    user.value = null
  }

  // 401 시 인터셉터가 호출한다. /auth/refresh 로 토큰을 재발급받아 새 access 토큰을 반환한다.
  // 인터셉터 재귀를 피하려고 공용 instance 가 아닌 기본 axios 로 직접 호출한다.
  async function refresh() {
    try {
      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refreshToken: refreshToken.value,
      })
      // 백엔드 계약(#14): ApiResponse<AuthTokenResponse>
      //   { code, message, data: { accessToken, refreshToken, tokenType } }
      const tokens = data.data
      setTokens(tokens.accessToken, tokens.refreshToken)
      return tokens.accessToken
    } catch (error) {
      // refresh 실패(만료·재사용·네트워크) → 로그아웃 후 로그인 화면으로.
      logout()
      router.push(LOGIN_ROUTE).catch(() => {}) // 라우트 미구현(#21 이전)이면 무시.
      throw error
    }
  }

  return { accessToken, refreshToken, user, isAuthenticated, setTokens, logout, refresh }
})
