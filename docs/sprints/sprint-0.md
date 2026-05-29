# Sprint 0 — 셋업 & core 기반

> 상태: ✅ 완료 (2026-05-29)
> 기간: 2026-05-29 (코어 셋업 집중)

> 사후 기록: Sprint 0의 코어 셋업은 정식 스프린트 시작 절차(주초 문서 작성 → Issue 분해) 없이
> 사람+agent가 직접 구현해 PR #1로 올렸다. 본 문서는 그 결과를 사후 기록한 것이다.
> Sprint 1부터는 conventions §1-1의 정식 사이클(문서 → Issue → 작업)을 따른다.

## 목표
양 트랙(trip/log)이 병렬로 개발을 시작할 수 있는 공통 뼈대(backend·frontend·CI)를 갖춘다.

## 이번 스프린트 작업

### core (공통)
- [x] **[S0-CORE-01]** Repo 생성 ✓ / collaborator 초대(사람 확인) / branch protection은 플랜 제약으로 미적용 → 컨벤션 운용
- [x] **[S0-CORE-02]** Vue 3 + Vite + Pinia + Router + axios + PrimeVue(Aura) + Vitest
- [x] **[S0-CORE-03]** Spring Boot 3.5.3 / Java 21 / Maven(mvnw)
- [x] **[S0-CORE-04]** MySQL 로컬 + 테스트 스키마(`triplog`, `triplog_test`) 연결 확인
- [x] **[S0-CORE-05]** Flyway 도입, V1 골격 (users, refresh_token)
- [x] **[S0-CORE-06]** Spring Security + JWT 골격 + 공통 응답(ApiResponse, string code) + 에러코드 카탈로그 + 전역 핸들러
- [x] **[S0-CORE-07]** GitHub Actions CI (Java 21+Maven으로 교정, MySQL service container) + SpringDoc
- [x] **[S0-CORE-08]** `.env` 정책 정리 (루트/frontend `.env.example`)

### log
- [ ] **[S0-LOG-01]** 카드 PoC 착수 — **미착수, Sprint 1로 이월**

## 종료 조건
- [x] 양 트랙 repo 접근 가능 / frontend build·test · backend test·build 통과 / CI 그린 (PR #1)
- [x] 인증·공통응답 골격 동작 (헬스 엔드포인트·Swagger·보안 차단 확인)
- [ ] 카드 PoC: 미착수(이월)

## 회고 (스프린트 종료 시 작성)
- **완료 / 이월**: core 셋업 8건 중 7건 완료. 이월 = S0-LOG-01(카드 PoC), S0-CORE-01의 branch protection.
- **트랙 결정 요약 (서로 검토)**:
  - **Spring AI 채택** — Sprint 0에선 BOM(1.0.0)만, `ai/` 패키지는 비움. provider 구현은 Sprint 2~3. (→ architecture §6 반영 필요)
  - **컴포넌트 라이브러리 = PrimeVue(Aura)** 확정. (→ architecture §3-1 반영 필요)
  - Spring Boot 4.0이 기본값이나 생태계 성숙도(MyBatis/Spring AI) 위해 **3.5.3** 고정.
- **배운 점 · 다음 입력**:
  - branch protection은 private+Free 플랜에서 불가 → 규칙 강제 대신 **컨벤션(신사협정)** 으로 운용하기로 결정.
  - 협업 진입 구조 보강: 역할은 로컬 `AGENTS.local.md`로 선언, 공유 문서는 관점 중립(trip/log)으로 통일, 진입 절차·현재 스프린트 추적 규칙 명문화.
  - **Sprint 1 입력**: 인증 마무리(F01) / Trip CRUD(F02) / 카드 PoC(이월) + architecture §6·§3-1 문서 반영.
  - **협업 구조 공동 합의(필수)**: 이번에 정한 진입 체계(역할=로컬파일 / 관점 중립 / 진입 절차 / SSOT=Issue)는 한쪽이 먼저 작성한 것 — **다른 트랙 담당자가 합류하는 첫 세션에 함께 1회 리뷰·합의**하고, 이견은 `proposal` Issue로 조정한다.
