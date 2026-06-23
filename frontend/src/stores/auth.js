import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import { API_BASE_URL } from '@/api/config'
import * as authApi from '@/api/authApi'

// 인증 스토어 (architecture §3·§7, 공유 영역).
// access/refresh 토큰·유저 상태를 보관하고, 로그인/회원가입/로그아웃/리프레시를 담당한다.
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

  // 클라이언트 측 인증 상태 초기화(토큰·유저). 서버 호출 없음.
  function clearSession() {
    setTokens(null, null)
    user.value = null
  }

  // 로그인: 토큰 저장 후 프로필 로드(프로필 실패는 로그인 성공을 막지 않음).
  async function login(email, password) {
    const tokens = await authApi.login(email, password)
    setTokens(tokens.accessToken, tokens.refreshToken)
    await fetchMe().catch(() => {})
    return tokens
  }

  async function completeOAuthLogin(tokens) {
    setTokens(tokens.accessToken, tokens.refreshToken)
    await fetchMe().catch(() => {})
    return tokens
  }

  // 회원가입: 백엔드가 토큰을 주지 않으므로 자동 로그인하지 않는다(가입 → 로그인 유도).
  async function signup(email, password, nickname) {
    return authApi.signup(email, password, nickname)
  }

  // 로그아웃: 서버측 refresh 토큰 무효화는 best-effort. 실패해도 클라이언트는 비운다.
  async function logout() {
    const token = refreshToken.value
    try {
      if (token) await authApi.logout(token)
    } catch {
      // 서버 무효화 실패(만료 등)는 무시 — 클라이언트 상태는 어떻든 초기화한다.
    } finally {
      clearSession()
    }
  }

  // 회원 탈퇴: 서버 삭제가 성공한 뒤에만 클라이언트 세션을 비운다.
  async function withdraw(password) {
    await authApi.withdraw(password)
    clearSession()
  }

  // 현재 사용자 프로필 로드.
  async function fetchMe() {
    user.value = await authApi.getMe()
    return user.value
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
      // refresh 실패(만료·재사용·네트워크) → 세션만 비운다.
      // 로그인 화면 이동은 호출 측(인터셉터/가드)이 담당한다 — store 는 router 의존 없음.
      clearSession()
      throw error
    }
  }

  return {
    accessToken,
    refreshToken,
    user,
    isAuthenticated,
    setTokens,
    clearSession,
    login,
    completeOAuthLogin,
    signup,
    logout,
    withdraw,
    fetchMe,
    refresh,
  }
})
