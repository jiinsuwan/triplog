// API 공용 설정 (architecture §3). instance 와 auth 스토어가 함께 참조한다.
// .env 의 VITE_API_BASE_URL 로 주입(기본: 로컬 백엔드).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
