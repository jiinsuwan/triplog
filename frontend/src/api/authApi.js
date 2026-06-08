import instance from './instance'

// 인증/프로필 API 함수 (architecture §3, core 공유 영역).
// 백엔드 계약: AuthController(/auth/*), UserController(/users/me).
// 응답은 공통 ApiResponse<T> 래퍼이므로 data.data(payload)만 꺼내 반환한다.

// POST /auth/login → AuthTokenResponse { accessToken, refreshToken, tokenType }
export function login(email, password) {
  return instance.post('/auth/login', { email, password }).then((res) => res.data.data)
}

// POST /auth/signup → UserProfileResponse (토큰 미발급 — 가입 후 로그인 필요)
export function signup(email, password, nickname) {
  return instance.post('/auth/signup', { email, password, nickname }).then((res) => res.data.data)
}

// POST /auth/logout (Authorization + refreshToken) → 서버측 refresh 토큰 무효화
export function logout(refreshToken) {
  return instance.post('/auth/logout', { refreshToken }).then((res) => res.data)
}

// GET /users/me (보호) → UserProfileResponse { id, email, nickname, profileImg, createdAt }
export function getMe() {
  return instance.get('/users/me').then((res) => res.data.data)
}
