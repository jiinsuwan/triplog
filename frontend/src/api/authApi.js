import instance from './instance'
import { API_BASE_URL } from './config'

// 인증/프로필 API 함수 (architecture §3, core 공유 영역).
// 백엔드 계약: AuthController(/auth/*), UserController(/users/me).
// 응답은 공통 ApiResponse<T> 래퍼이므로 data.data(payload)만 꺼내 반환한다.

// POST /auth/login → AuthTokenResponse { accessToken, refreshToken, tokenType }
export function login(email, password) {
  return instance.post('/auth/login', { email, password }).then((res) => res.data.data)
}

export function oauthAuthorizeUrl(provider, redirect) {
  const url = new URL(`/auth/oauth/${provider}/authorize`, API_BASE_URL)
  if (redirect) {
    url.searchParams.set('redirect', redirect)
  }
  return url.toString()
}

export function startOAuthLogin(provider, redirect) {
  window.location.assign(oauthAuthorizeUrl(provider, redirect))
}

// POST /auth/signup → UserProfileResponse (토큰 미발급 — 가입 후 로그인 필요)
export function signup(email, password, nickname) {
  return instance.post('/auth/signup', { email, password, nickname }).then((res) => res.data.data)
}

export function requestPasswordReset(email) {
  return instance.post('/auth/password-reset/request', { email }).then((res) => res.data.data)
}

export function confirmPasswordReset(token, newPassword) {
  return instance.post('/auth/password-reset/confirm', { token, newPassword }).then((res) => res.data)
}

// POST /auth/logout (Authorization + refreshToken) → 서버측 refresh 토큰 무효화
export function logout(refreshToken) {
  return instance.post('/auth/logout', { refreshToken }).then((res) => res.data)
}

// DELETE /users/me (보호) → 비밀번호 확인 후 회원 탈퇴
export function withdraw(password) {
  return instance.delete('/users/me', { data: { password } }).then((res) => res.data)
}

// GET /users/me (보호) → UserProfileResponse { id, email, nickname, profileImg, createdAt }
export function getMe() {
  return instance.get('/users/me').then((res) => res.data.data)
}

// PUT /users/me (보호) → UserProfileResponse
// 백엔드 UpdateUserProfileRequest = { nickname(필수), profileImg(옵션) }.
// 매퍼가 profileImg 를 그대로 덮으므로, 닉네임만 바꿀 때도 기존 profileImg 를 함께 보내 보존한다.
export function updateProfile({ nickname, profileImg }) {
  return instance.put('/users/me', { nickname, profileImg }).then((res) => res.data.data)
}
