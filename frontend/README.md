# TripLog Frontend

Vue 3 · Vite · Pinia · Vue Router · axios · PrimeVue(Aura) · Vitest

구조·작명 규칙은 [`../docs/architecture.md §3`](../docs/architecture.md) 참고. 이 문서는 **로컬 셋업/실행**만 다룬다.

## 1. 사전 준비

- **Node 20+ / npm**
- 환경변수: [`.env.example`](.env.example)를 복사해 `.env` 작성
  | 키 | 설명 |
  |---|---|
  | `VITE_API_BASE_URL` | 백엔드 API 베이스 URL (기본 `http://localhost:8080`) |
  | `VITE_USE_MOCK_ITINERARY` | 일정 편집을 backend 없이 mock/local state로 확인할 때만 `true` |
  | `VITE_KAKAO_MAP_KEY` | 카카오맵 JavaScript 키 (trip 트랙) |

> `VITE_` 접두사 변수만 클라이언트에 노출된다. `.env` 는 커밋 금지.

## 2. 실행 / 테스트

```bash
npm install
npm run dev      # 개발 서버 → http://localhost:5173
npm run test     # Vitest 1회 실행
npm run build    # 프로덕션 빌드
```

홈 화면(`/`)은 백엔드 `/api/health` 를 호출해 프론트↔백엔드 연결을 확인한다.

## 3. 구조 (architecture §3)

```
src/
├── api/         # 공용 axios 인스턴스(instance.js) + 도메인별 API 함수
├── stores/      # Pinia 스토어 (auth ...)
├── router/      # Vue Router
├── components/  # common(공유) / trip / log
├── views/       # auth / trip / log + 페이지 단위
├── composables/ # 재사용 로직 훅
├── utils/       # 유틸 (EXIF 파싱, 날짜 등) — Vitest 대상
└── assets/
```

- 모든 API 호출은 `api/instance.js` 의 공용 axios 인스턴스를 거친다(토큰 주입·에러 처리 일원화).
- 공유 영역(`api/instance`, `router`, `stores/auth`, `components/common`) 변경은 PR 리뷰 필수.
- UI는 PrimeVue 컴포넌트 우선, 커스텀 CSS 최소화.
