# Sprint 3 — 일정 & 카드 생성 → P0 완성

> 상태: 🟢 진행 중
> 기간: 2026-06-12 ~ (종료 조건 충족 시)

## 목표
> 일정(stop, 이동수단 포함) 위에서 여행 계획이 완성되고, **사진 → AI 카드 생성 → PNG 다운로드**가 end-to-end로 동작한다 (P0 완성). S2 회고에서 채택한 프로세스(상호 리뷰 + PR guardrail)가 가동된다.

## 지난 스프린트 회고 (이월 포함)
- **완료**: 관광지 탐색·상세 + 사진 파이프라인 + FE 화면 — 종료 조건 4/4 ([sprint-2.md](sprint-2.md) 회고).
- **이월/입력**: #17 잔여(status 검증·size) → `S3-CORE-03`에 흡수(이슈 생성 시 #17 닫기) / #59 → `S3-CORE-04`로 구현(채택 코멘트 후 닫기) / #20(카드 실측) → 카드 동작 후 측정 / 카드 PoC v12 산출물([decisions/0006](../decisions/0006-card-outline-module.md) + [card-poc-v12-report §7](../poc/card-poc-v12-report.md)) = 카드 이슈 분해의 입력 / 주말 스파이크 산출물 발생 시 이슈 계약 후 포팅(poc 직접 머지 금지).

## 이번 스프린트 작업
> 각 항목 = GitHub Issue. **발행 분담(S2 회고): log 담당자 = core + log / trip 담당자 = trip.** 발행자가 본문(Goal/Scope/AC/Test) 작성, core Issue에는 회고 결정 근거를 명시한다.

### trip (전반부 우선 — S4 기록 뷰의 선행 작업)
- [ ] **[S3-TRIP-01]** 일정(stop) 스키마 + CRUD API — 날짜·시간·장소·순서 + **이동수단(필수 필드)**, 사진 선택적 연결 고려([frontend-structure §3-3](../frontend-structure.md)). **스키마 = core 리뷰 필수**
- [ ] **[S3-TRIP-02]** 일정 편집 화면 — 날짜별 장소 추가, 드래그앤드롭 정렬, 지도 핀 순서 동선 (기존 #29를 이 항목으로 재정의 가능 — trip 판단)
- [ ] **[S3-TRIP-03]** 구간 소요시간 표시 — 자동차 = 카카오모빌리티 길찾기 API(#39 공통 인프라 활용) / 도보·대중교통 = 추정·수동 입력. Notes: TMAP(보행)·ODsay(대중교통) 최신 제공 여부 확인. 실이동경로 = P1, 실시간 소요시간 = P2
- (자율) 장소 상세정보·컨텐츠 타입 확장 — 고려사항, 이슈화 여부 trip 판단

### log (카드 생성 — [0004](../decisions/0004-card-poc-result.md) + [0006](../decisions/0006-card-outline-module.md) 기반)
- [ ] **[S3-LOG-01]** 카드 overlay 스키마 확정 — 객체별 짧은 문구 + 좌표·외곽선·장식 (0004 D1·D3, OUTLINE_API 정합)
- [ ] **[S3-LOG-02]** 외곽선 사이드카 도입 — `outline_module`/`serve_outline` 제품 포팅, 업로드 1회 전처리 (0006 D1·D2 — SAM 인코딩 캐시 검토 포함)
- [ ] **[S3-LOG-03]** 텍스트 LLM 어댑터 + 프롬프트 — 객체별 **짧은 문구만**, 배치 = OUTLINE_API §2-1 기반 (S3-CORE-02 위에서)
- [ ] **[S3-LOG-04]** Canvas2D overlay 렌더링 — `legacy-v3/render-overlay.mjs` 포팅, 세로 1080×1920
- [ ] **[S3-LOG-05]** 카드 PNG export (세로 1080×1920) — F07·F08
- [ ] **[S3-LOG-06]** 카드 생성 화면 — 위저드: Trip 선택 → 사진 ≤10 → 자동 초안 → 에디터(탭/박스/그룹 버블 2종/톤다운 슬라이더 35%) → 미리보기 → PNG
- [ ] **[S3-LOG-07]** 자동 초안 폴백·수동 보정 — **P0 합격선 = 초안 + 수동 보정으로 PNG** (0004 D6). #20 실측은 이 동작 후 별도 진행

### core (공통)
- [ ] **[S3-CORE-02]** AI 호출 공통 인프라 — `LlmAdapter`, provider 1개 = GMS 우선, AiCallLog (S2에서 이동)
- [ ] **[S3-CORE-03]** IA 라우팅 + status 체계 — 계획/기록 2워크스페이스·상태 기반 진입([frontend-structure §3-0](../frontend-structure.md)) + Trip `status` 허용값·검증 + 목록 응답 `size` — **#17 잔여 흡수, 리뷰 필수**
- [ ] **[S3-CORE-04]** PR guardrail — 본문 검사 CI(feat·fix = required) + 공유 경로 감지(자동 코멘트 + `track:core` 라벨) + 템플릿 헤더 고정 — **#59 채택 구현**
- [ ] **[S3-CORE-05]** 비밀번호 찾기 — 이메일 인프라 없는 방식 우선 확인, **P0 지장 시 S4 이월** (심사기준 갭)
- (재검토) S3-CORE-01 서빙 권한 보강 — S2에서 인증 엔드포인트 서빙(#38)으로 선반영. 잔여 범위 확인 후 이슈화 여부 결정

## 종료 조건
- [ ] **여행 → 사진 → AI 카드 생성 → PNG 다운로드 end-to-end 동작** (P0)
- [ ] AI 응답(짧은 문구) 검증 테스트가 CI 통과
- [ ] 일정 에디터에서 드래그앤드롭으로 날짜별 일정 구성 (이동수단 입력 포함)
- [ ] PR guardrail CI 동작 (본문 검사 + 공유 경로 감지)

## 의존성·선결
- S3-TRIP-01(stop 스키마) → S4 기록 뷰(사진 배치) — trip 전반부 우선 배치의 사유. trip 완료 + log 여유 시 기록 뷰(S4-LOG-01) 앞당김 가능
- S3-CORE-02(LLM 인프라) → S3-LOG-03(어댑터·프롬프트)
- 카드 흐름(S3-LOG-*)은 일정과 독립 — 사진·여행 연결은 S2에 완비
- S3-CORE-03의 status 값 체계 = frontend-structure §3-3 가안 기준, 확정은 해당 이슈에서

## 회고 (스프린트 종료 시 작성)
- 완료 / 이월:
- 트랙 결정 요약 (서로 검토):
- `proposal` Issue 검토 결과:
- 배운 점 · 다음 입력:
