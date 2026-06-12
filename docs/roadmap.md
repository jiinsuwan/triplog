# Roadmap — Sprint 0 ~ 4 (v1)

> **상태**: v1 Accepted (2026-05-29 합의)
> 근거: [decisions/0001-project-blueprint §17](decisions/0001-project-blueprint.md), [requirements.md](requirements.md), [architecture.md](architecture.md)
> 전제: 2인, **AI agent 기반 개발** (낮=사람 / 밤=agent)

---

## 0. 설계 원칙

- **Sprint는 기간이 아니라 작업 묶음**이다. 종료 조건을 충족하면 다음 Sprint로 넘어간다. (일수/주 단위 추정은 하지 않는다.)
- **P0 = Sprint 0~3** 에서 "여행 → 사진 → AI 카드 → PNG" **end-to-end 완성** (목표: 2주 내).
- **P1 = Sprint 4** 에 정식 포함 — 버퍼가 아니라 차별화 핵심. 야간 agent 활용으로 P0가 빨리 끝나면 P1을 앞당긴다.
- **매 Sprint 두 사람 모두 자기 파트 작업**이 있다 (한쪽만 일하는 구간 없음).
  - `trip`: 여행 → 관광지 → 일정 → 챗봇·즐겨찾기
  - `log`: 카드 PoC → 사진 → 카드 생성 → 카드 편집·정사각
  - `core`(공통): 누가 맡아도 되는 토대. 셋업 직후 기본만 깔고, 이후 필요한 걸 가벼운 쪽이.
- **막히면 P2 > P1 순으로 잘라 P0를 보호**한다.

### 작업 사이클 (에이전틱 운영)

```text
낮 (사람)  : Issue 정의(Goal/Scope/AC) → 방향 설정 → 전날 밤 결과 리뷰·머지
밤 (agent) : 잘 정의된 Issue 구현 + 테스트 작성
```

- 야간 자율 실행의 전제: ①Issue가 명확(AC) ②테스트가 가드레일(통과/실패 자동 판별) ③아침에 사람이 리뷰·머지.
- 모호한 Issue를 야간에 돌리면 잘못된 산출물을 되돌리는 비용이 크다 → Issue 품질이 곧 진척 속도.

---

## 1. 한눈에 보는 흐름

```text
Sprint 0  ─ 셋업 & core 기반 & 카드 PoC 착수      (둘이 함께 + log PoC)
   │
Sprint 1  ─ 인증 완성 & Trip CRUD & 카드 PoC 완료  ┐
Sprint 2  ─ 관광지 탐색 & 사진 업로드             ├ P0 (end-to-end)
Sprint 3  ─ 일정 에디터 & 카드 생성  → P0 완성     ┘
   │
Sprint 4  ─ P1 추가 (소셜로그인·즐겨찾기·챗봇 / 사진 라이브러리·카드 편집·정사각)
```

각 Sprint 종료 시 demo-able 상태를 유지한다.

---

## Sprint 0 — 셋업 & core 기반 & PoC 착수

### 둘이 함께 (core)
- [x] **[S0-CORE-01]** Repo 생성 ✓ / collaborator 초대(사람 확인) / **branch protection은 플랜 제약으로 미적용 → 컨벤션 운용** (AGENTS §3·§5)
- [x] **[S0-CORE-02]** Vue 3 + Vite 초기 세팅 (`frontend/`)
- [x] **[S0-CORE-03]** Spring Boot 초기 세팅 (`backend/`), **Java 21 / Maven**
- [x] **[S0-CORE-04]** MySQL 로컬 DB + 테스트 스키마(`triplog_test`) 세팅, 연결 확인
- [x] **[S0-CORE-05]** Flyway 도입, 첫 마이그레이션 골격 (V1: users, refresh_token)
- [x] **[S0-CORE-06]** 인증 골격(Spring Security + JWT) + 공통 응답 형식 + 글로벌 에러 핸들러 (간단히)
- [x] **[S0-CORE-07]** GitHub Actions CI 활성화 (frontend build·test / backend test·build, MySQL service container) + SpringDoc 세팅
- [x] **[S0-CORE-08]** `.env` 정책 정리 (DB·JWT·카카오맵·SSAFY GMS·UPLOAD_DIR) — `.env.example`

### log 트랙 — 병렬 착수
- [ ] **[S0-LOG-01]** 카드 PoC 착수 — Vision/텍스트 LLM 비교, Vue+Konva 합성 실험 ([poc/card-poc.md](poc/card-poc.md)) — **미착수 (Sprint 1로 이월)**

### 종료 조건
- [x] 양 트랙 repo 접근 가능 / `frontend` build·test·`backend` test·build 통과 / CI 그린 (PR #1)
- [ ] 인증·공통응답 골격 동작 ✓ / **카드 PoC 미착수(이월)**

---

## Sprint 1 — 인증 완성 & Trip CRUD & PoC 완료

### trip 트랙
- [x] **[S1-TRIP-01]** Trip CRUD API (제목·기간·지역·테마·상태, 삭제 포함) — F02
- [x] **[S1-TRIP-02]** Trip 목록 / 생성 화면
- [x] **[S1-TRIP-03]** Trip 상세 / 수정 / 삭제 화면

### log 트랙
- [x] **[S1-LOG-01]** 카드 PoC 완료 — 정성 평가 + 비용 실측
- [x] **[S1-LOG-02]** `decisions/0004-card-poc-result.md` 작성, **텍스트/Vision 모델 확정(Q6)** + Vision·텍스트 합침 여부 결정

### core 트랙 (공통)
- [x] **[S1-CORE-01]** 인증 마무리 — 회원가입/로그인/로그아웃/프로필 (F01), Access+Refresh(DB)
- [x] **[S1-CORE-02]** 프론트 axios interceptor (토큰 주입, 401 → refresh 재시도)
- [x] **[S1-CORE-04]** 로그인·회원가입 화면 + 라우트 가드 (#21) — 프론트 인증 동작 (종료조건① 보완)

### 종료 조건
- 회원가입·로그인이 프론트에서 동작, 보호 API 인증 동작
- 로그인 사용자가 Trip CRUD 가능
- 카드 PoC 결과로 P0 카드 생성 실현 가능성 + 모델 확정

---

## Sprint 2 — 관광지 탐색 & 사진 업로드

### trip 트랙
- [x] **[S2-TRIP-01]** 관광지 표준데이터 JSON 적재 (Flyway seed 또는 적재 스크립트) — Q3. **데모 지역 일부부터**(전국 X)
- [x] **[S2-TRIP-02]** 카카오맵 SDK 연동 + 장소 검색·지도 탐색 화면(식당·카페 포함) + 마커 — F03. **(이월 #28 장소/지도 화면 흡수 — 목업→실 SDK 재작성)**
- [x] **[S2-TRIP-03]** 관광지 상세 화면

### log 트랙
- [x] **[S2-LOG-01]** 사진 업로드 API (다중) — F06
- [x] **[S2-LOG-02]** EXIF 자동 추출 (GPS·촬영시간)
- [x] **[S2-LOG-03]** 사진 ↔ 여행 연결 (테이블 + API)
- [x] **[S2-LOG-04]** 사진 로컬 저장(`UPLOAD_DIR`) + 정적 서빙

### core 트랙 (공통)
- [x] **[S2-CORE-01]** 외부 API 호출 공통 인프라 (재시도·타임아웃·로깅)
- [x] **[S2-CORE-02]** 라우트 보호 `requiresAuth` 자동 테스트 (회고 B-2 채택 — conventions §6-3)
> AI 호출 공통 인프라는 **Sprint 3로 이동**(AI는 카드 생성=Sprint 3에서 처음 사용 — 회고 결정).

### 종료 조건
- 지도에서 관광지·식당 검색 가능, 관광지 상세 확인
- 사진 다중 업로드 → EXIF 추출 → 여행 연결 → 저장·서빙

---

## Sprint 3 — 일정 에디터 & 카드 생성 → **P0 완성**

### trip 트랙 (스프린트 전반부 우선 — S4 기록 뷰의 선행 작업, S2 회고)
- [ ] **[S3-TRIP-01]** 일정 에디터 — 날짜별 장소·메모 + **드래그앤드롭** — F04. **stop 스키마 = 시간·장소·순서 + 이동수단(필수 필드), 사진 선택적 연결 고려** — 스키마는 core 리뷰 필수 (S2 회고)
- [ ] **[S3-TRIP-02]** 일정에 관광지/검색 장소 추가, 단순 위치 핀 동선
- [ ] **[S3-TRIP-03]** 구간 소요시간 표시 — 자동차 = 카카오모빌리티 길찾기 API(S2 외부 API 인프라 활용), 도보·대중교통 = 추정/수동 입력 (S2 회고 — P1 실이동경로 / P2 실시간 소요시간)

### log 트랙
- [ ] **[S3-LOG-01]** 카드 overlay 스키마 확정 (객체별 짧은 문구 + 좌표·외곽선·장식, PoC 0004 기반)
- [ ] **[S3-LOG-02]** 로컬 SAM2 세그 전처리 (업로드 1회 — 접시 외곽선) + 경량 CV(freespace) — **SAM2 = 카드 핵심 품질(격상)**
- [ ] **[S3-LOG-03]** 텍스트 LLM 어댑터 (객체별 **짧은 문구만** — 전체 카드 JSON 폐기)
- [ ] **[S3-LOG-04]** Canvas2D overlay 렌더링 (`render-overlay.mjs`, **Konva 미채택**) — 세로 1080×1920
- [ ] **[S3-LOG-05]** 카드 PNG export (세로 1080×1920) — F07·F08
- [ ] **[S3-LOG-06]** 카드 생성 화면 (Trip 선택 → 사진 최대 10장 → 자동 초안 → 편집 → 미리보기)
- [ ] **[S3-LOG-07]** 자동 초안 폴백·편집(드래그 보정) — **P0 합격선 = 초안+수동보정으로 PNG**(완벽 자동 아님, 0004 D6)

> **SAM2 3제약**: ①Sprint 2 사진 파이프라인 블로커 아님 ②카드 baseline은 세그 없이 동작(수동 폴백) ③Java 직접 실행 X — 필요 시 로컬 Python 추론(MSA 아님).

### core 트랙 (공통)
- [ ] **[S3-CORE-01]** 사진/카드 서빙·권한 검증 보강 — **S2에서 인증 엔드포인트 서빙으로 선반영(#38), 잔여 범위 재검토 후 이슈화**
- [ ] **[S3-CORE-02]** AI 호출 공통 인프라 (`LlmAdapter`, provider 1개=GMS 우선, AiCallLog) — **Sprint 2에서 이동**
- [ ] **[S3-CORE-03]** IA 라우팅 + status 체계 — 계획/기록 2워크스페이스·상태 기반 진입([frontend-structure §3-0](frontend-structure.md)), status 허용값·검증, 목록 응답 size (**#17 잔여 흡수 → #17 닫기**) — S2 회고
- [ ] **[S3-CORE-04]** PR guardrail — 본문 검사 CI(feat·fix = required) + 공유 경로 감지(자동 코멘트 + `track:core` 라벨) + reviewer 미지정 경고 (**#59 채택** — required check 가능 여부 선행 확인) — S2 회고
- [ ] **[S3-CORE-05]** 비밀번호 찾기 — 이메일 인프라 없는 방식 우선 확인, P0 지장 시 S4 이월 (S2 회고, 심사기준 갭)

### 종료 조건 (P0 완성)
- **여행 → 사진 → AI 카드 생성 → PNG 다운로드 end-to-end 동작**
- AI 응답 JSON 검증 테스트가 CI 통과
- 일정 에디터에서 드래그앤드롭으로 날짜별 일정 구성

---

## Sprint 4 — P1 추가

### trip 트랙
- [ ] **[S4-TRIP-01]** 즐겨찾기 / 위시리스트 — F10
- [ ] **[S4-TRIP-02]** trip 챗봇 — 관광지 설명 요약·추천 이유 — F16
- [ ] **[S4-TRIP-03]** 소셜 로그인 — 카카오·구글·네이버 OAuth — F23 (core 성격, 인증 담당이 주도)

### log 트랙
- [ ] **[S4-LOG-01]** 여행 기록(로그) 뷰 — 일정 경로 타임라인 위 사진 배치(일괄 업로드 → EXIF 자동 배치 → 드래그 보정 + 미분류 트레이) — **F14 재정의(S2 회고, 와이어프레임 v3)**. trip 일정(S3) 선행 — 충족 시 앞당김 가능
- [ ] **[S4-LOG-02]** 카드 수동 편집 — 요소 제외/글씨 수정/스티커 추가·이동 — F12
- [ ] **[S4-LOG-03]** 정사각 피드 카드 (1080×1080) 포맷 토글 — F09

### 둘이 함께 (core)
- [ ] **[S4-CORE-01]** README 정비 (사용 방법, 시연 시나리오)
- [ ] **[S4-CORE-02]** 통합 점검 + 트러블슈팅 기록 (`docs/troubleshooting/`)
- [ ] **[S4-CORE-03]** 배포 (옵션, 사용자 결정)
- [ ] **[S4-CORE-04]** 회원 탈퇴 — 사진 파일 정리 포함(**#50 통합**) — F07 보강 (S2 회고, 심사기준 갭)
- [ ] **[S4-CORE-05]** 제출 산출물 — 다이어그램(유스케이스·클래스·ERD·WBS)·발표 PPT·AI 사용 보고서 (S2 회고, 심사기준 — AI 사용 보고서는 docs·PR 기록 기반)

### 종료 조건
- P1 기능이 P0 위에 안정적으로 동작
- 시연 가능한 상태로 README·시나리오 정리

> **P2** (자동태깅 F11 / 자연어 일정 F17 / 열람공유 F18 / 회고록 F19 / 자동일정 F20 / 협업공유 F22)는 여력이 있을 때만. P0·P1을 해치지 않는 선에서.

---

## 의존성과 리스크

### 의존성
- **Sprint 0 카드 PoC 통과 → Sprint 3 P0 카드 생성** 성립
- **인증(S0~S1) → 모든 보호 API**
- **Trip CRUD(S1) → 사진 연결(S2) → 카드 생성(S3)**
- **관광지(S2) → 일정 에디터(S3)**

### 리스크 및 대응
| # | 리스크 | 대응 |
|---|---|---|
| R1 | AI 카드 결과 일관성 부족 | PoC 폴백 (사전 템플릿 + 사용자 수동 위치 지정) — `poc/card-poc.md §7` |
| R2 | 토큰 비용 폭주 | 일일 호출 제한 + SSAFY GMS key 우선 + AiCallLog 감사 |
| R3 | 야간 자율 실행이 잘못된 방향으로 진행 | Issue AC 명확화 + 테스트 가드 + 아침 리뷰·머지 |
| R4 | 기간 부족 | P2 > P1 순으로 잘라 P0 보호 |

---

## 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| v0 | 2026-05-22 | 블루프린트 §17 + 기획서 v1 일정 + scope pivot 통합 초안 |
| v1 | 2026-05-29 | **2인 병렬 분담으로 전면 재구성** — 매 Sprint trip/log 동시 진행. PoC를 선행 단계가 아닌 log 트랙 병렬 작업으로. P0=S0~S3 / P1=S4 정식 포함. 기간 추정 제거(작업 묶음 기준). 에이전틱 운영 사이클(낮 사람/밤 agent) 명시. Java 21+Maven·표준데이터 JSON·로컬 저장·테스트 스키마 등 오늘 결정 반영 |
| v1.1 | 2026-06-09 | **Sprint 1 회고 반영**: S3 log를 0004(overlay·SAM2·짧은문구·Konva 미채택)로 갱신 / SAM2 카드 핵심품질 격상(3제약) / AI 호출 인프라 S2→S3 이동 / S2-TRIP-02에 장소·지도 화면(#28) 흡수 / 표준데이터 데모지역 일부 / requiresAuth 자동 테스트(S2-CORE-02) |
| v1.2 | 2026-06-12 | **Sprint 2 회고 반영**: S1·S2 체크박스 정산 / S3에 stop 스키마(이동수단 필수)·구간 소요시간(S3-TRIP-03)·IA+status 체계(S3-CORE-03, #17 흡수)·PR guardrail(S3-CORE-04, #59 채택)·비밀번호 찾기(S3-CORE-05) 추가 / S4-LOG-01 = 여행 기록 뷰로 재정의(F14, 와이어프레임 v3 채택) / S4에 회원 탈퇴(+#50)·제출 산출물 추가 |
