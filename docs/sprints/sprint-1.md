# Sprint 1 — 인증 완성 & Trip CRUD & 카드 PoC 완료

> 상태: 🟢 진행 중
> 기간: 2026-05-29 ~ (종료 조건 충족 시)

## 목표
> 로그인한 사용자가 프론트에서 **여행을 만들고·고치고·지울 수 있다**. 인증은 Access+Refresh로 무중단 동작. 카드 PoC를 끝내 **카드 생성 모델(Q6)을 확정**한다.

## 지난 스프린트 회고 (이월 포함)
- **완료**: core 셋업 7건 (Vue/Spring/MySQL/Flyway/인증골격/CI/.env) — PR #1 머지, CI 그린.
- **이월**: `S0-LOG-01` 카드 PoC **착수** → 이번 스프린트 `S1-LOG-01`에 흡수.
- **이월 아님(결정 완료)**: branch protection은 Free 플랜 제약으로 **컨벤션 운용** 확정 (작업 아님).

## 이번 스프린트 작업
> 각 항목 = GitHub Issue 1개 (conventions §3). 실행/진행상황 SSOT는 Issue/PR. 아래 체크박스는 종료(회고) 때 한 번 맞춘다.

### trip
- [ ] **[S1-TRIP-01]** Trip CRUD API (F02) — Trip 엔티티(title·startDate·endDate·region·theme·status) + 생성/목록/상세/수정/삭제. 본인 소유 Trip만 접근(인증 사용자 스코프). service 로직·MockMvc 통합테스트.
- [ ] **[S1-TRIP-02]** Trip 목록 / 생성 화면 — 목록 뷰 + 생성 폼(PrimeVue). `tripApi.js` + `useTripStore`로 API 연동.
- [ ] **[S1-TRIP-03]** Trip 상세 / 수정 / 삭제 화면 — 상세 뷰 + 수정 폼 + 삭제 확인.

> trip 트랙 작업은 담당자에게 **프롬프트로 전달** → 담당자가 로컬 agent(Codex 등)로 진행한다. 첫 로컬 셋업(clone·Java·MySQL·`.env`)은 담당자가 직접, AGENTS.md / `.env.example` 따라.

### log
- [ ] **[S1-LOG-01]** 카드 PoC 완료 ([poc/card-poc.md](../poc/card-poc.md)) — Vision/텍스트 LLM 비교 + Vue+Konva 합성 실험을 끝내고, **정성 평가 + 비용 실측** 정리. **AC에 "세로(1080×1920) 레이아웃에서 사진·텍스트·하단 정보 배치가 자연스러운지 확인" 포함** (치수 정정만으론 세로 카드 품질이 보장되지 않으므로). (S0 이월 착수분 흡수)
- [ ] **[S1-LOG-02]** `decisions/0004-card-poc-result.md` 작성 — PoC 결과로 **텍스트/Vision 모델 확정(Q6)** + Vision·텍스트 합침 여부 결정.

### core (공통)
- [ ] **[S1-CORE-01]** 인증 마무리 (F01) — 회원가입/로그인/로그아웃/프로필 + Access+Refresh(DB `refresh_token`). 공유 영역 → PR 리뷰 필수.
- [ ] **[S1-CORE-02]** 프론트 axios interceptor — 토큰 주입 + 401 → `/auth/refresh` 자동 재발급 → 원요청 재시도. 공유 영역 → PR 리뷰 필수.
- [ ] **[S1-CORE-03]** architecture 문서 반영 (docs) — §3-1 PrimeVue(Aura)·§6-1 Spring AI(BOM) 확정 반영. **초안 작성 완료(이 세션) → docs PR로 머지만 남음.**
- [ ] **[S1-CORE-04]** 로그인·회원가입 화면 + 라우트 가드 (#21) — 종료조건① "프론트 인증 동작"을 담는 항목(기존 분해 누락 보완). LoginView/SignupView + auth store(login·signup·logout) + 보호 라우트 가드. 공유 영역 → PR 리뷰 필수.

## 종료 조건
- [ ] 회원가입·로그인이 프론트에서 동작하고, 보호 API 인증이 동작한다.
- [ ] 로그인 사용자가 Trip을 생성·조회·수정·삭제할 수 있다.
- [ ] 카드 PoC 결과로 P0 카드 생성 실현 가능성이 확인되고 모델(Q6)이 확정된다 (`decisions/0004`).

## 회고 (스프린트 종료 시 작성)
- 완료 / 이월:
- 트랙 결정 요약 (서로 검토):
- `proposal` Issue 검토 결과:
- 배운 점 · 다음 입력:
