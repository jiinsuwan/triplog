# Architecture — 시스템 구조 (v1)

> **상태**: v1 Accepted (2026-05-29 합의)
> 근거: [decisions/0001-project-blueprint §5](decisions/0001-project-blueprint.md), [requirements.md](requirements.md)
>
> ⚠️ **DB/API 상세 설계는 기능 확정 후 단계적으로 작성합니다** (블루프린트 §18-2 원칙). 이 문서는 **방향성**만 기록합니다.

---

## 1. 시스템 구성

```text
┌────────────────────────┐       ┌──────────────────────────┐       ┌──────────────┐
│  Vue 3 + Vite          │ HTTP  │  Spring Boot (단일 서버)  │ JDBC  │  MySQL       │
│  (frontend/)           │ ────▶ │  (backend/)              │ ────▶ │              │
│  - Pinia / Vue Router  │       │  modular monolith        │       └──────────────┘
│  - Konva.js / rough.js │       │  - REST API              │
└────────────────────────┘       │  - JWT 인증              │
            │                    │  - MyBatis               │
            │                    └─────┬──────┬──────┬──────┘
            │                          │      │      │
            │              (Kakao Map) │      │      │ (LLM API: SSAFY GMS / Anthropic / OpenAI / Google)
            │                          ▼      │      ▼
            └─── 파일 업로드 ────▶ 로컬 디스크   │   외부 AI 모델
                                  (업로드 디렉토리)│
                                              ▼
                                  표준데이터 JSON (관광지 → DB 적재)
                                  + 카카오맵(식당·카페 등 장소 검색)
```

- **MSA 아님**. Spring Boot 단일 서버 + Vue 단일 프론트엔드.
- **백엔드: Java 21 + Maven + Spring Boot** (D1 확정, 2026-05-29 / SSAFY 표준).
- 백엔드는 기능별 패키지를 분리한 **modular monolith**.
- 양 트랙(`trip` / `log`)이 같은 레포·같은 서버 위에서 작업하되, 디렉토리·패키지 단위로 분리.

---

## 2. 백엔드 패키지 구조

```text
backend/src/main/java/.../triplog/
├── auth          ← Spring Security, JWT, 로그인/회원가입
├── user          ← 사용자 도메인
├── trip          ← 여행 CRUD (trip 트랙)
├── place         ← 관광지 어댑터·캐시 (trip 트랙)
├── itinerary     ← 일정 (trip 트랙)
├── photo         ← 사진 업로드·메타 (log 트랙)
├── card          ← AI 카드 생성·렌더링 (log 트랙)
├── ai            ← LLM 호출 어댑터 (공통)
├── common        ← 공통 응답 / 에러 / 유틸 (core)
└── config        ← Security, CORS, etc.
```

**규칙**:
- 각 트랙 담당자는 자기 트랙 패키지를 end-to-end로 책임집니다.
- `ai` / `common` / `auth` / `config` 패키지는 **공유 영역** — 변경 시 PR 리뷰 필수.
- 패키지 간 직접 참조 최소화. 공통 로직은 `common`에 추출.
- **트랙 경계를 넘는 API**(다른 트랙이 호출하는 API, 예: log 카드 화면 → trip 여행 목록 조회)는 **공유 영역으로 취급**: 요청/응답 DTO를 명확히 하고, 변경 시 PR 리뷰. 별도 계약 문서는 만들지 않는다 — agent는 같은 레포의 상대 controller를 직접 읽고, 사람은 SpringDoc로 조망.

### 2-1. 도메인 패키지 내부 계층 표준 (명세 고정 — agent는 이 구조를 따른다)

각 도메인 패키지(예: `trip/`)는 다음 계층으로 구성합니다.

```text
trip/
├── controller/   TripController          ← REST 엔드포인트. DTO 입출력만, 비즈니스 로직 금지
├── service/      TripService             ← 비즈니스 로직. 단일 구현이므로 인터페이스 미사용 (~Impl 금지)
├── mapper/       TripMapper (interface)  ← MyBatis @Mapper
├── dto/          CreateTripRequest, TripResponse ...
└── domain/       Trip                    ← 도메인 모델
```

- **외부 HTTP API 호출 도메인만** `client/` 추가 (예: `place/client/TourApiClient`). 그 외 도메인엔 두지 않음.
- **Mapper XML 위치**: `backend/src/main/resources/mapper/{domain}/{Domain}Mapper.xml`.
- **계층 호출 방향**: controller → service → mapper. 역방향·계층 건너뛰기 금지.
- **DTO 명명**: 요청 `{동사}{도메인}Request` (예: `CreateTripRequest`), 응답 `{도메인}Response`. 엔티티(domain)를 controller에서 직접 노출 금지.

---

## 3. 프론트엔드 구조

```text
frontend/src/
├── api/              ← axios instance, interceptor, 도메인별 API 함수
├── stores/           ← Pinia 스토어 (auth, trip, photo, card)
├── router/           ← Vue Router 설정
├── components/
│   ├── common/       ← 공유 UI 컴포넌트 (core)
│   ├── trip/         ← trip 트랙 컴포넌트
│   └── log/          ← log 트랙 컴포넌트 (사진·카드·에디터)
├── views/            ← 페이지 단위 컴포넌트
│   ├── auth/
│   ├── trip/
│   └── log/
├── composables/      ← 공통 Composition API 훅
├── utils/            ← 유틸 (EXIF 파싱 등)
└── assets/           ← 정적 자산
```

**규칙**:
- 공유 영역(`api/instance`, `router`, `stores/auth`, `components/common`) 변경 시 PR 리뷰 필수.
- 트랙별 폴더는 자기 트랙 담당자가 자유롭게 수정.

**작명 규칙 (표준 관례 — agent는 이 규칙을 따른다)**:

| 종류 | 규칙 | 예시 |
|---|---|---|
| 컴포넌트 (UI 조각) | PascalCase `.vue` | `TripCard.vue` |
| 뷰 (페이지) | `{이름}View.vue` | `TripListView.vue` |
| Pinia 스토어 (공유 데이터 보관함) | `use{도메인}Store` | `useTripStore` |
| Composable (재사용 로직) | `use{기능}` | `useExif` |
| API 함수 파일 | `{도메인}Api.js` | `tripApi.js` |

- 모든 API 호출은 `api/instance`의 공용 axios 인스턴스를 거친다 (인증 토큰·에러 처리 일원화).

### 3-1. UI 디자인 방침 (2026-05-29)

- **컴포넌트 라이브러리 채택** — 버튼·폼·모달 등 기본 룩과 일관성을 라이브러리로 확보. 직접 커스텀 CSS는 최소화. **PrimeVue (Aura 테마) 확정 (Sprint 0, 2026-05-29).**
- **핵심 화면만 러프 목업** — 전체 정밀 디자인 대신, **카드 생성 흐름 / 일정 에디터 / 여행 목록·상세 / 사진 라이브러리** 정도만 목업. 목업은 agent 구현의 **시각적 명세**(손그림·이미지도 입력 가능). 나머지 화면은 라이브러리 컴포넌트 조합으로.
- **카드 결과물 디자인은 별도** — 스티커·폰트·색 팔레트·레이아웃 템플릿은 앱 UI와 다른 문제로, **카드 PoC([poc/card-poc.md](poc/card-poc.md))에서** 다룬다.

---

## 4. 공통 API 응답 형식 (제안)

```json
{
  "code": "SUCCESS",
  "message": "조회 성공",
  "data": { ... }
}
```

**에러 응답**:

```json
{
  "code": "AUTH_001",
  "message": "토큰이 만료되었습니다",
  "data": null
}
```

**원칙**:
- HTTP 상태 코드는 의미 그대로 사용 (200 / 400 / 401 / 403 / 404 / 409 / 500).
- 비즈니스 코드(`code`)는 도메인별 prefix로 구분 (예: `AUTH_001`, `TRIP_002`, `AI_001`).
- 성공 응답의 `data`는 단일 객체 또는 `{ items, page, total }` 페이지 응답.
- **`code`는 문자열(string) 방식 확정 (A5, 2026-05-29)** — `SUCCESS` / 도메인 prefix 에러코드(`AUTH_001`, `TRIP_002` 등). 숫자 코드 미사용.

**에러코드 카탈로그 틀 (2026-05-29 확정 — agent는 이 틀을 따른다)**:
- **형식**: `{도메인}_{3자리숫자}` (예: `AUTH_001`). 성공은 `SUCCESS` 하나.
- **도메인 prefix(고정)**: `AUTH / USER / TRIP / PLACE / ITIN / PHOTO / CARD / AI / COMMON` — 패키지명과 일치. 새 prefix 임의 생성 금지.
- **단일 카탈로그**: 모든 에러코드는 한 곳(enum + 코드 표)에 모은다. agent는 새 에러 추가 시 반드시 이 카탈로그를 보고 중복·충돌을 피한다.
- **개별 코드는 구현하면서** 위 틀에 맞춰 카탈로그에 누적. 스프린트 회고/머지 시 충돌·중복 점검(PR 리뷰).

---

## 5. DB 엔티티 방향 (상세 ERD는 Sprint별 작성)

**규칙 (2026-05-29 확정)**:
- **마이그레이션 도구 (N1)**: **Flyway**. `backend/src/main/resources/db/migration/`에 `V{n}__{설명}.sql` 형식으로 버전 관리. 운영 중 스키마 변경도 새 V 파일로만.
- **명명 규칙 (N2)**: 테이블·컬럼 **snake_case** / 기본키 **`id`** / 외래키 **`{테이블}_id`**. Java는 camelCase, MyBatis `map-underscore-to-camel-case`로 매핑.

**Sprint 1 (P0 코어)**:

| 엔티티 | 핵심 컬럼 | 트랙 |
|---|---|---|
| User | id, email, password(bcrypt), nickname, profileImg, createdAt | core |
| Trip | id, userId, title, startDate, endDate, region, theme, status, createdAt | trip |

**Sprint 2 (관광지·일정)**:

| 엔티티 | 핵심 컬럼 | 트랙 |
|---|---|---|
| Place | id, externalId(표준데이터 JSON), name, lat, lng, category, address, description, imgUrl | trip |
| Itinerary | id, tripId, day, sort_order(`order`는 MySQL 예약어라 회피), placeId, memo | trip |
| Favorite (P1) | userId, placeId, createdAt | trip |

**Sprint 3 (사진)**:

| 엔티티 | 핵심 컬럼 | 트랙 |
|---|---|---|
| Photo | id, tripId, userId, url, lat, lng, takenAt, memo, autoTags(**P2**), createdAt | log |

**Sprint 4 (카드)**:

| 엔티티 | 핵심 컬럼 | 트랙 |
|---|---|---|
| Card | id, tripId, type(**STORY 세로=기본** / FEED 정사각=P1), layoutJson, exportedPngUrl, source(AI/MANUAL), createdAt | log |
| CardElement (P1) | id, cardId, type, x, y, w, h, rotation, contentJson, style | log |
| AiCallLog | id, kind, model, prompt, responseJson, promptTokens, completionTokens, totalTokens, costMs, success, errorMessage, createdAt | log |

> **원천 기획서에는 13개 엔티티가 있었으나, 경량화 결정에 따라 P0/P1에 필요한 것만 단계적으로 도입합니다.**

**오늘 추가된 기능의 엔티티 방향 (상세는 해당 Sprint에서)**:
- **소셜 로그인 (F23, P1)**: User에 OAuth 연동 정보(`provider`, `provider_id`) 추가 또는 별도 `social_account` 테이블. Sprint 1 인증 확장 시 확정.
- **협업 공유 (F22, P2)**: `trip_member`(trip_id, user_id, role) 신설 — 동행자 초대·권한. 사진 공동 업로드는 Photo.user_id로 구분.
- **열람 공유 (F18, P2)**: Trip에 공유용 `share_slug`(nullable) 컬럼.

---

## 6. AI 호출 인프라

### 6-1. 위치

**기반 라이브러리 = Spring AI (BOM `1.0.0`, 2026-05-29 확정).** Sprint 0에선 **BOM만 도입**하고 `ai/` 패키지는 비워 둔다. provider 구현은 PoC로 모델을 확정한 뒤 **Sprint 2~3**에 작성한다. Spring AI의 `ChatClient`/모델 추상화 위에 아래 `LlmAdapter`/`VisionAdapter`를 얇게 둔다 (벤더 종속 최소화).

`backend/src/main/java/.../triplog/ai/` 패키지에 어댑터를 둡니다.

```text
ai/
├── LlmAdapter.java            ← 텍스트 LLM 인터페이스
├── VisionAdapter.java         ← Vision LLM 인터페이스
├── providers/                 ← 초기엔 PoC 확정 1개만 구현 (§6-2)
│   ├── SsafyGmsProvider.java  ← 우선 사용 (기본)
│   └── (Anthropic / OpenAi / Google — fallback 필요 시 추가)
├── card/
│   └── CardJsonService.java   ← 카드 JSON 생성 도메인 로직
└── log/
    └── AiCallLogger.java      ← 호출 비용·시간 기록
```

### 6-2. 규칙

- **AI 응답 JSON 파싱은 반드시 검증 + 폴백 처리**. 실패 시 에러 응답으로 변환, 사용자 안내.
- 모든 AI 호출은 `AiCallLog` 테이블에 기록 (비용 감사, 디버깅용).
- 모델 선택은 `application.yml` 환경별 설정으로 분리. 기본값은 SSAFY GMS key 우선.
- **과설계 방지 (2026-05-29)**: 어댑터 인터페이스(`LlmAdapter`/`VisionAdapter`)는 두되, **provider 구현은 PoC에서 확정한 1개만** 먼저 작성한다. Anthropic/OpenAI/Google fallback은 실제로 필요해질 때 추가 (인터페이스가 있으므로 그때 붙이면 됨). 안 쓸 provider 4개를 미리 만들지 않는다.

상세 가이드 / 모델 선정 근거: [poc/card-poc.md](poc/card-poc.md), 결정 로그 [decisions/0004](decisions/0004-card-poc-result.md).

> **PoC 반영 (2026-06-05, decisions/0004)**: 카드 = "사진 위 overlay(canvas 합성·편집 가능)" 구조. **텍스트 LLM = 짧은 문구만**(전체 카드 JSON 생성 폐기) → provider 1순위 = GMS 텍스트 어댑터. **Vision = per-card API 미사용** — 객체 외곽/위치는 업로드 시 1회 SAM2 세그멘테이션 + 경량 CV로 처리하므로 `VisionAdapter`는 "로컬 세그 어댑터"로 충족 가능. 렌더는 Canvas2D 공용 코어(**Konva 미채택**).
>
> **외곽선 모듈 확정 (2026-06-12, [decisions/0006](decisions/0006-card-outline-module.md))**: 세그 전처리 = **Python 사이드카**(로컬 보조 프로세스 — Java 직접 실행 X, MSA 아님, 0004 D2 구체화). 모듈 계약 = `poc/card/OUTLINE_API.md`.

---

## 7. 인증

- Spring Security + JWT.
- **Access + Refresh Token (A3 확정, Sprint 1부터)**. Access는 짧은 수명, 만료 시 `/auth/refresh`로 무중단 재발급.
  - Refresh 저장: **`refresh_token` 테이블 (DB)** — Redis 등 인프라 추가 없이 시작. 로그아웃·재발급 시 무효화.
  - 프론트: axios 인터셉터에서 401 → refresh 자동 호출 → 원요청 재시도.
- 비밀번호: `BCryptPasswordEncoder` (cost factor 12).
- 보호 API에 `@PreAuthorize` 또는 SecurityFilter 적용.

> Sprint 1에서 양 트랙 담당자가 함께 구축. 이후 변경은 PR 리뷰 필수.

---

## 8. 환경변수 / 비밀 관리

```text
.env (gitignore됨)
├── DB_URL / DB_USER / DB_PASSWORD
├── JWT_SECRET
├── KAKAO_MAP_KEY (프론트는 클라이언트 키, 백엔드는 REST 키)
├── TOUR_API_KEY
├── SSAFY_GMS_KEY
├── (P1) OAUTH_KAKAO_* / OAUTH_GOOGLE_* / OAUTH_NAVER_* (소셜 로그인 F23, client id·secret)
├── UPLOAD_DIR (사진 로컬 저장 디렉토리 경로)
└── (선택) ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY
```

`.env.example`을 레포에 커밋하여 새 팀원·CI가 참고할 수 있게 합니다 (값은 빈 문자열).

---

## 9. 테스트 & CI / 빌드

### 9-1. 테스트 전략 (에이전틱 검증 축, 2026-05-29 확정)

- **원칙**: agent는 구현과 함께 테스트를 작성한다. 테스트 통과 = 산출물이 맞는지에 대한 자동 검증. 사람의 육안 검토를 대신한다(AGENTS.md §4).
- **범위는 "시간"이 아니라 "가치"로 결정**한다. agent가 테스트도 생성하므로 작성 시간은 변수가 아니다. 깨지기만 하고 잡아주는 게 없는 테스트(거짓 안전)를 피하는 게 기준.
- **의무 대상**: ①service 비즈니스 로직, ②AI 응답 JSON 검증·폴백, ③인증·공통 응답 등 공유 영역, ④각 API 통합테스트(MockMvc).
- **제외**: 단순 getter, 흘려보내는 매핑, UI 컴포넌트 전체 렌더 등 유지보수 부담만 큰 것.
- **도구**: 백엔드 **JUnit 5 + Mockito**(로직) + **MockMvc**(API). 프론트 **Vitest**(핵심 유틸·로직 — EXIF 파싱, 카드 좌표 계산 등).
- **DB 테스트**: mapper(SQL)는 **로컬 MySQL의 테스트 전용 스키마(`triplog_test`)** 에서 검증. 실제 MySQL이라 방언 문제 없음(**H2 미사용** 유지). 테스트 격리는 `@Transactional` 자동 롤백. 단위 테스트는 DB 불필요(mock). **Testcontainers 미사용** — 시연용 규모엔 과함, 개발용 MySQL 재활용.

### 9-2. CI / 빌드

- GitHub Actions: `frontend build` / `backend test` / `backend build` ([conventions §8-3](conventions.md#8-3-ci-최소-구성)).
- `.github/workflows/ci.yml`은 **Sprint 0에서 활성화 완료** (frontend build · backend test/build). **CI는 MySQL service container**를 띄워 mapper 테스트 실행(`triplog_test` 스키마).
- 빌드 시 `.env`는 Repository Secret으로 주입.

---

## 10. 결정 현황 (architecture 관점)

**2026-05-29 확정**:
- **A2 / Q5 사진 저장소** → **로컬 디스크**(업로드 디렉토리, `UPLOAD_DIR`). 정적 리소스로 서빙. S3·저장소 추상화 미사용(규모상 과설계).
- **A1 ORM** → MyBatis
- **A3 인증** → Access + Refresh Token (DB `refresh_token` 테이블)
- **A4 AI provider** → 어댑터 인터페이스 + provider 1개만 (PoC 확정 모델), fallback은 필요 시
- **A5 응답 형식** → 문자열(string) code
- **D1** → Java 21 + Maven
- **N1** → Flyway / **N2** → snake_case·PK `id`·FK `{table}_id`
- **N3 API 명세 도구** → **SpringDoc OpenAPI 도입**. 어노테이션은 agent가 코드와 함께 생성하므로 사람 작성 부담 ≈ 0. 용도: 사람의 전체 API 조망 + 데모/SSAFY 제출용 명세 초안 자동 확보(웹 → 제출 양식 변환은 필요 시). agent의 개발 참조는 여전히 코드 직접 읽기로 충분하지만, 산출물 가치 때문에 도입이 이득.

---

## 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| v0 | 2026-05-22 | 블루프린트 §5 + 기획서 v1 §7 + 경량화 결정 통합 초안 |
| v1 | 2026-05-29 | 합의 확정: ORM=MyBatis / Java 21+Maven / 응답 string code / Access+Refresh(DB) / Flyway / snake_case 명명 / AI 어댑터+provider 1개. 계층 표준(controller·service·mapper·dto·domain, 인터페이스 미사용)·프론트 작명 규칙 추가. 엔티티에 소셜로그인·협업공유·열람공유·카드 세로기본 반영 |
| v1.1 | 2026-05-29 | 에이전틱 렌즈 재점검 보완: 테스트 전략 신설(가치 기준·JUnit5/Mockito/MockMvc/Vitest, mapper는 로컬 MySQL `triplog_test` 스키마·@Transactional 롤백·H2/Testcontainers 미사용) / 에러코드 카탈로그 틀(형식·prefix·단일 카탈로그) / N3=SpringDoc 도입(어노테이션 agent 생성) / 트랙 경계 API=공유 영역 취급 |
| v1.2 | 2026-05-29 | F-3 데이터·저장소 확정: Q3 관광지=표준데이터 JSON(DB 적재)+식당은 카카오맵 / Q5 사진=로컬 디스크 저장(S3·추상화 미사용) / DB 테스트 Testcontainers→로컬 MySQL 테스트 스키마로 완화 |
| v1.3 | 2026-05-29 | Sprint 0 결과 반영: §3-1 컴포넌트 라이브러리 **PrimeVue(Aura) 확정** / §6-1 AI 기반 라이브러리 **Spring AI(BOM 1.0.0) 확정** — Sprint 0은 BOM만, provider는 Sprint 2~3 |
| v1.4 | 2026-06-12 | **Sprint 2 회고 반영**: §6에 외곽선 모듈 = Python 사이드카 확정 주석 추가 ([decisions/0006](decisions/0006-card-outline-module.md)) |
