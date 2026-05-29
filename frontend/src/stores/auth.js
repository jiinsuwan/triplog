import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 인증 스토어 골격 (architecture §3, 공유 영역).
// 실제 로그인/로그아웃/리프레시 로직은 Sprint 1(S1-CORE-01/02)에서 채운다.
export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref(localStorage.getItem('accessToken'))
  const user = ref(null)

  const isAuthenticated = computed(() => !!accessToken.value)

  function setToken(token) {
    accessToken.value = token
    if (token) {
      localStorage.setItem('accessToken', token)
    } else {
      localStorage.removeItem('accessToken')
    }
  }

  function logout() {
    setToken(null)
    user.value = null
  }

  return { accessToken, user, isAuthenticated, setToken, logout }
})
