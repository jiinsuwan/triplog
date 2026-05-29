# Decision 0001 — Project Blueprint (TripLog AI-Agent 협업 개발 합의안)

- **상태**: Accepted
- **결정일**: 2026-05-22
- **출처**: 사용자/팀 합의 (원본 파일명: `triplog_ai_agent_project_blueprint_v2.md`, 보관: `archive/명세_원본/`)
- **관련 문서**: [0002-scope-pivot](0002-scope-pivot.md), [0003-collaboration-direction](0003-collaboration-direction.md), [requirements](../requirements.md), [roadmap](../roadmap.md), [architecture](../architecture.md), [conventions](../conventions.md)

> 목적: 이 문서는 TripLog 프로젝트를 시작하기 전에 합의된 제품 방향, 역할 분담, GitHub 기반 협업 방식, AI agent 개발 원칙을 정리한다.
> Claude/Codex 등 로컬 agent가 프로젝트 기반을 설계할 때 반드시 참조해야 하는 상위 합의 문서다.
> 상세 구현 방식은 이후 `docs/roadmap.md`, `docs/requirements.md`, `docs/architecture.md`, `docs/conventions.md`로 분리한다.

---

## 1. 프로젝트 정체성

TripLog는 단순히 “AI 기능이 들어간 여행 서비스”가 아니다.

이 프로젝트의 포트폴리오 핵심은 다음이다.

> **AI agent를 실제 개발 주체로 활용하는 2인 협업 개발 프로젝트**

사람의 역할은 모든 코드를 직접 작성하는 것이 아니라, 제품 방향을 정하고, 시스템을 설계하고, Sprint/Issue 단위로 작업을 나누고, AI agent의 구현 결과를 테스트와 PR로 감독하는 것이다.

AI agent는 단순 보조 도구가 아니라, 사람이 합의한 요구사항과 완료 조건에 따라 구현·테스트·리팩터링을 수행하는 개발 주체로 본다.

---

## 2. 제품 방향

TripLog의 제품 흐름은 다음 세 축으로 구성한다.

```text
Plan → Capture → Share
```

| 축 | 의미 | 핵심 기능 |
|---|---|---|
| Plan | 여행을 준비한다 | 여행 생성, 관광지 탐색, 지도, 일정 구성 |
| Capture | 여행을 기록한다 | 사진 업로드, 메모, 위치/시간 메타데이터 |
| Share | 여행을 공유한다 | AI 기반 카드 생성, PNG export |

최종 한 줄 정의:

> **TripLog는 지도 기반 여행 계획, 사진 기반 여행 기록, AI 기반 공유 콘텐츠 생성을 연결하는 여행 로그 서비스다.**

---

## 3. 포트폴리오 핵심 메시지

TripLog의 포트폴리오 메시지는 다음 순서로 잡는다.

1. **AI agent 기반 개발 협업**
   - 2명의 팀원이 직접 모든 구현을 수행하기보다, 기획·설계·감독자로서 AI agent를 운용한다.
   - GitHub Issue, PR, CI, 테스트, 트러블슈팅 기록을 통해 agent 기반 개발 과정을 관리한다.

2. **기능 축 기반 2인 협업**
   - FE/BE로 나누지 않고 `trip` / `log` 기능 축으로 나눈다.
   - 각 담당자는 자기 기능의 프론트·백엔드·DB·테스트를 end-to-end로 책임진다.

3. **여행 서비스로서의 완성도**
   - 지도/관광정보 API를 활용한 계획 기능.
   - 사진 업로드와 기록 기능.
   - AI 기반 공유 카드 생성 기능.

---

## 4. 역할 분담

역할 축은 `trip`, `log`, `core` 세 가지로 고정한다.

| Track | 담당 | 범위 |
|---|---|---|
| `trip` | 팀원 A | 여행 생성, 관광지 탐색, 지도, 일정, 장소 저장 |
| `log` | 팀원 B | 사진 업로드, 사진 기록, AI 카드 생성, export |
| `core` | 공동 | 인증, 공통 구조, DB schema, API convention, CI, 공통 UI |

### 원칙

- FE/BE 기준으로 나누지 않는다.
- 각자 자기 track의 화면, API, DB 접근, 테스트를 end-to-end로 담당한다.
- `core` 변경은 반드시 상호 합의와 PR 리뷰를 거친다.
- 공유 영역은 혼자 임의로 바꾸지 않는다.

---

## 5. 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend | Vue 3 + Vite |
| Backend | Spring Boot |
| Persistence | MyBatis |
| Security | Spring Security + JWT |
| DB | MySQL |
| Map | Kakao Map 또는 Naver Map |
| Tourism Data | 한국관광공사 TourAPI 또는 공공 관광정보 데이터 |
| AI | SSAFY 제공 GMS key 기반 AI 우선 |
| CI | GitHub Actions |

### 아키텍처 방향

- MSA가 아니다.
- Spring Boot 단일 서버 + Vue 단일 프론트엔드 구조다.
- 백엔드는 기능별 패키지를 분리한 modular monolith로 구성한다.

예시:

```text
backend/src/main/java/.../triplog/
├── auth
├── trip
├── place
├── itinerary
├── photo
├── card
├── ai
└── common
```

---

## 6. AI 기능 범위

서비스 내부 AI 기능은 프로젝트의 전부가 아니라 제품 기능 중 일부다.

### 포함

| 영역 | AI 기능 |
|---|---|
| trip | 여행/장소 관련 간단 챗봇, 관광지 설명 요약, 추천 이유 설명 |
| log | 사진 분석, 카드 문구 생성, 해시태그 생성, 카드 레이아웃 JSON 생성 |

### 제외 또는 후순위

- 전체 여행 자동 일정 생성
- 경로 최적화
- 실시간 예약/가격 비교
- AI 영상 생성
- 인스타 직접 업로드

### 중요한 결정

AI 일정 생성은 P0에서 제외한다.  
사용자 성향에 따라 만족도 편차가 크고, 기대치를 통제하기 어렵기 때문이다.  
대신 trip track에는 지도/관광정보 기반 계획 기능과 간단한 AI 챗봇을 둔다.

---

## 7. AI Agent 개발 원칙

TripLog는 AI agent를 주요 구현 주체로 활용한다.

### 사람의 역할

- 제품 방향 결정
- 기능 우선순위 결정
- 시스템 구조 설계
- Sprint / Issue 단위 작업 분해
- 요구사항과 완료 조건 정의
- 공유 영역 변경 승인
- PR 결과 확인
- CI/test 결과 확인
- 사용자 경험 관점의 최종 판단
- 트러블슈팅과 의사결정 기록

### AI agent의 역할

- Issue 단위 구현
- 테스트 코드 작성
- 리팩터링
- 문서 초안 작성
- 실패 원인 분석
- 수정안 제안

### 핵심 원칙

- AI agent에게 작업을 맡길 때는 Issue 단위로 맡긴다.
- Issue에는 목표, 범위, 제외 범위, 완료 조건, 테스트 기준이 있어야 한다.
- AI가 만든 코드는 사람의 육안 검토만으로 통제하지 않는다.
- 가능한 경우 테스트와 CI로 검증한다.
- 테스트 가능한 로직은 테스트를 먼저 작성하거나 구현과 함께 작성한다.
- PR은 agent 결과물을 검토하고 프로젝트 기록으로 남기는 단위다.

---

## 8. Claude/Codex 혼합 사용 원칙

팀원별 AI toolchain은 달라도 된다.

| 사용자 | 예상 도구 |
|---|---|
| 팀원 A | Codex 중심 |
| 팀원 B | Claude + Codex 혼합 |

### 왜 달라도 되는가

팀이 통일해야 하는 것은 로컬 agent 운용 방식이 아니라, 다음 공통 인터페이스다.

```text
GitHub Issue
→ Branch
→ Commit
→ Pull Request
→ GitHub Actions
→ Merge
```

각자 내부에서 Claude를 오케스트레이터로 쓰든, Codex를 직접 쓰든, 수동으로 일부 수정하든 상관없다.  
단, 팀에게 공유되는 결과는 Issue/PR/CI/문서로 동일하게 남겨야 한다.

### 공통 규칙

- 각자 agent 운영 방식은 사적 영역이다.
- 팀 공통 계약은 `docs/` 문서와 GitHub Issue/PR이다.
- Claude 전용 규칙과 Codex 전용 규칙은 얇게 유지한다.
- `CLAUDE.md`, `AGENTS.md`는 공통 문서의 요약/참조 역할만 한다.
- 진짜 정본은 `docs/conventions.md`, `docs/requirements.md`, `docs/architecture.md`다.

---

## 9. Sprint 기반 작업 구조

TripLog는 Sprint 기반으로 진행한다.

```text
Sprint → Issue → Branch → PR → Merge
```

| 단위 | 의미 |
|---|---|
| Sprint | 며칠~1주 단위 개발 묶음 |
| Issue | AI agent에게 맡길 수 있는 작업 단위 |
| Branch | Issue 구현을 위한 독립 작업 공간 |
| PR | 구현 결과 검토 및 기록 단위 |
| Merge | main에 반영 |

### 용어 원칙

팀 문서와 대화에서는 `Milestone`이라는 용어를 쓰지 않고 **Sprint**로 통일한다.

GitHub UI의 Milestone 기능을 사용하더라도, 그것은 GitHub가 제공하는 관리 기능일 뿐이다.  
팀 내부 명칭은 항상 Sprint로 유지한다.

예시:

```text
Sprint 0 - Project Setup
Sprint 1 - Core & Trip Base
Sprint 2 - Place & Itinerary
Sprint 3 - Photo Log
Sprint 4 - AI Card & Polish
```

### GitHub Issue

Issue는 Sprint 안의 작업 티켓이다.

예시:

```text
[S1-CORE-01] Spring Security + JWT 인증 구현
[S1-TRIP-01] 여행 CRUD API 구현
[S2-TRIP-01] 관광지 검색 API 연동
[S2-LOG-01] 사진 업로드 API 구현
[S3-LOG-01] AI 카드 JSON 스키마 정의
[S3-LOG-02] 카드 Canvas 렌더링 구현
```

---

## 10. GitHub Issue 사용 규칙

Issue는 단순 메모가 아니라, AI agent에게 전달할 작업 계약서다.

### Issue 제목 규칙

```text
[S{Sprint번호}-{TRACK}-{번호}] 작업명
```

예시:

```text
[S1-CORE-01] Spring Security + JWT 인증 구현
[S1-TRIP-01] 여행 CRUD API 구현
[S2-LOG-01] 사진 업로드 API 구현
```

### Issue 본문 템플릿

```md
## Goal

이 Issue에서 완성할 목표를 적는다.

## Scope

포함할 작업:
- 

포함하지 않을 작업:
- 

## Acceptance Criteria

- [ ] 
- [ ] 
- [ ] 

## Test Criteria

- [ ] 테스트 코드 추가 또는 기존 테스트 통과
- [ ] 예외 케이스 확인
- [ ] GitHub Actions 통과

## Notes

- 관련 API:
- 관련 화면:
- 공유 영역 영향:
```

### Issue 운영 규칙

- 하나의 Issue는 하나의 PR로 닫는 것을 기본으로 한다.
- Issue가 너무 크면 쪼갠다.
- 공유 영역 변경이 있으면 Issue와 PR에 명시한다.
- AI agent에게 넘길 때는 Issue 본문을 그대로 컨텍스트로 사용한다.
- 구현 중 범위가 커지면 새 Issue로 분리한다.

---

## 11. Branch Naming

브랜치 타입은 최소화한다.

| type | 용도 |
|---|---|
| `feat` | 기능 개발 |
| `fix` | 버그 수정 |
| `chore` | 설정, 빌드, CI, 환경 |
| `docs` | 문서 |

### 규칙

```text
{type}/s{sprint}-{track}{number}-{short-name}
```

### 예시

```text
feat/s1-core01-auth
feat/s1-trip01-trip-crud
feat/s2-trip01-place-search
feat/s2-log01-photo-upload
feat/s3-log01-card-json
feat/s3-log02-card-render
fix/s3-log01-card-json
chore/ci
docs/roadmap
```

---

## 12. Commit Convention

커밋은 간단히 유지한다.

### 규칙

```text
{type}({track}): {message}
```

### type

```text
feat
fix
test
docs
chore
refactor
```

### track

```text
trip
log
core
```

### 예시

```text
feat(trip): add trip crud api
feat(trip): add place search page
feat(log): add photo upload api
feat(log): parse ai card layout json
feat(log): render card canvas
feat(core): configure spring security jwt
test(log): add card json validation tests
fix(log): handle invalid ai response
docs(core): add sprint workflow
chore(core): add github actions ci
```

---

## 13. Pull Request 규칙

PR은 구현 결과를 검토하고 프로젝트 기록으로 남기는 단위다.

### PR 제목

Issue 제목과 맞춘다.

```text
[S1-TRIP-01] 여행 CRUD API 구현
```

### PR 본문 템플릿

```md
## Related Issue

- closes #

## Summary

- 

## Test

- [ ] Local test passed
- [ ] GitHub Actions passed
- [ ] Screen/API checked

## Review Point

- 
```

### 리뷰 필수 영역

다음 변경은 상대 리뷰가 필요하다.

```text
- DB schema
- Spring Security / 인증
- 공통 API 응답 형식
- 공통 UI 컴포넌트
- router/layout 구조
- build 설정
- GitHub Actions
- 환경변수 구조
```

---

## 14. GitHub Labels

Label은 많이 만들지 않는다.

추천 label:

```text
track:core
track:trip
track:log
type:feature
type:bug
type:docs
type:chore
status:blocked
status:review-needed
priority:p0
priority:p1
priority:p2
```

최소 운영만 원하면 다음만 사용한다.

```text
track:core
track:trip
track:log
status:blocked
priority:p0
priority:p1
priority:p2
```

---

## 15. 테스트와 CI 원칙

AI agent 기반 개발에서는 테스트와 CI가 중요하다.

### 테스트 우선 적용 대상

| 대상 | 테스트 필요도 |
|---|---|
| AI 응답 JSON 파싱 | 매우 높음 |
| 카드 레이아웃 검증 | 매우 높음 |
| 인증 / Security | 높음 |
| MyBatis Mapper / Repository | 높음 |
| 관광지 API adapter | 높음 |
| 단순 Vue 화면 | 선택 |
| CSS/레이아웃 | 수동 확인 중심 |

### CI 최소 구성

GitHub Actions에서 다음을 실행한다.

```text
frontend build
backend test
backend build
```

추후 여유가 있으면 다음을 추가한다.

```text
frontend lint
frontend unit test
backend integration test
```

---

## 16. 문서 구조

처음부터 문서를 많이 만들지 않는다.

최소 문서 구조:

```text
docs/
├── roadmap.md
├── requirements.md
├── architecture.md
├── conventions.md
├── decisions/
└── troubleshooting/
```

### 문서 역할

| 문서 | 역할 |
|---|---|
| `roadmap.md` | 1개월 Sprint 계획 |
| `requirements.md` | 기능 목록, P0/P1/P2, 완료 조건 |
| `architecture.md` | 시스템 구조, 패키지 구조, DB/API 설계 방향 |
| `conventions.md` | 브랜치, 커밋, PR, Issue, AI agent 운용 규칙 |
| `decisions/` | 중요한 결정만 기록 |
| `troubleshooting/` | 포트폴리오용 문제 해결 기록 |

### 주의

- PlanP식 복잡한 spec/handoff/workflow 시스템을 그대로 가져오지 않는다.
- TripLog는 2인/1개월 프로젝트이므로 문서는 작고 실행 중심이어야 한다.
- 추가 문서는 실제 문제가 생긴 뒤에 만든다.

---

## 17. 로드맵 초안

### Sprint 0 - Project Setup

- GitHub repository 생성
- Vue/Spring Boot/MyBatis 초기 세팅
- GitHub Issue/PR 템플릿 추가
- GitHub Actions 기본 CI 추가
- docs 기본 문서 생성
- API key/env 정책 정리

### Sprint 1 - Core & Trip Base

- Spring Security + JWT
- User/Auth 기본 기능
- Trip CRUD
- Trip 목록/생성 화면
- 공통 API 응답 형식

### Sprint 2 - Place & Itinerary

- 관광정보 API 연동
- 지도 API 연동
- 장소 검색/마커 표시
- 장소 저장
- 날짜별 일정 구성

### Sprint 3 - Photo Log

- 사진 업로드
- 사진 목록
- 여행별 사진 연결
- 사진 메타데이터 추출
- 기록 메모

### Sprint 4 - AI Card & Polish

- AI 카드 JSON 스키마
- 카드 문구/해시태그 생성
- Canvas 카드 렌더링
- PNG export
- UI 정리
- README/트러블슈팅 정리

---

## 18. Claude에게 요청할 다음 작업

Claude는 이 문서를 읽고, 먼저 확정된 합의와 아직 사용자와 함께 정해야 할 항목을 분리해야 한다.

### 18-1. 확정된 합의로 바로 문서화할 것

1. `docs/conventions.md`
   - Issue/Branch/Commit/PR 규칙
   - AI agent 개발 원칙
   - 공유 영역 리뷰 규칙
   - Claude/Codex 혼합 사용 원칙

2. `.github/ISSUE_TEMPLATE/feature_issue.md`
   - Issue 템플릿

3. `.github/pull_request_template.md`
   - PR 템플릿

4. `CLAUDE.md`
   - Claude가 읽을 얇은 지침
   - 정본은 `docs/`임을 명시

5. `AGENTS.md`
   - Codex가 읽을 얇은 지침
   - 정본은 `docs/`임을 명시

### 18-2. 사용자와 함께 Sprint 기획으로 확정할 것

다음 문서는 Claude가 단독 확정하지 않는다.  
먼저 초안을 제안하고, 사용자와 함께 기능 우선순위와 Sprint 배치를 조정한 뒤 확정한다.

1. `docs/roadmap.md`
   - Sprint별 목표
   - Sprint별 Issue 후보
   - 작업 순서와 의존성

2. `docs/requirements.md`
   - P0/P1/P2 기능 목록
   - track별 담당 구분
   - 기능별 Acceptance Criteria

3. `docs/architecture.md`
   - Spring Boot/Vue/MyBatis 구조
   - 주요 패키지 구조
   - DB/API 설계 방향
   - 단, DB/API 상세는 기능 확정 이후 단계적으로 작성한다.

### Claude에게 금지할 것

- 과도한 workflow 문서 생성
- PlanP 구조 그대로 복제
- spec/handoff/agent archive 같은 복잡한 체계 도입
- DB/API 상세 설계를 기능 확정 전에 과하게 선행
- MSA 구조 제안
- AI 일정 자동 생성 기능을 P0로 복귀
- GitLab을 개발 정본으로 설정

---

## 19. Claude 시작 프롬프트 초안

```text
너는 TripLog 프로젝트의 로컬 개발 오케스트레이터다.

먼저 `triplog_ai_agent_project_blueprint.md`를 정독하고, 이 합의안을 기준으로 프로젝트 초기 문서와 GitHub 협업 템플릿을 설계해라.

목표는 2인/1개월/AI agent 기반 개발에 맞는 가벼운 협업 구조를 만드는 것이다.

중요 원칙:
- TripLog의 포트폴리오 핵심은 “AI 기능이 있는 서비스”가 아니라 “AI agent 기반 2인 협업 개발”이다.
- 팀 공통 인터페이스는 GitHub Issue / Branch / PR / GitHub Actions / docs다.
- 각자의 로컬 agent 운용 방식은 달라도 된다. 나는 Claude+Codex, 팀원은 Codex 중심이다.
- 역할 축은 `trip`, `log`, `core`다.
- 브랜치, 커밋, Issue, PR 규칙은 blueprint에 있는 단순안을 따른다.
- 문서를 과하게 만들지 말고 `docs/roadmap.md`, `docs/requirements.md`, `docs/architecture.md`, `docs/conventions.md` 중심으로 정리한다.
- PlanP식 복잡한 spec/handoff/workflow 시스템을 복제하지 마라.

먼저 현재 디렉토리 상태를 확인한 뒤, 다음 순서로 진행해라.

1. 이 blueprint에서 이미 확정된 결정과 아직 Sprint 기획이 필요한 항목을 분리해 보고한다.
2. 생성할 파일 목록과 각 파일의 목적을 짧게 제안한다.
3. `docs/conventions.md`, Issue 템플릿, PR 템플릿, `CLAUDE.md`, `AGENTS.md`는 확정 합의 기반으로 작성한다.
4. `docs/roadmap.md`, `docs/requirements.md`, `docs/architecture.md`는 초안을 먼저 제시하고, 사용자와 함께 Sprint 기획을 조정한 뒤 확정한다.
5. 내가 승인하면 파일을 생성한다.
```

---

## 20. 현재 확정된 결정 요약

| 항목 | 결정 |
|---|---|
| 개발 정본 | GitHub |
| SSAFY GitLab | 제출용 산출물 업로드 |
| 프로젝트 관리 | GitHub Issue / PR / Sprint |
| 개발 방식 | AI agent 기반 구현 |
| 사람 역할 | 기획, 설계, 감독, 검증, 의사결정 |
| AI 역할 | 구현, 테스트, 리팩터링, 문서 초안 |
| 역할 축 | `trip`, `log`, `core` |
| 브랜치 전략 | Sprint 기반 feature branch |
| 커밋 컨벤션 | `{type}({track}): {message}` |
| 아키텍처 | MSA 아님, Spring Boot 단일 서버 |
| 기술 스택 | Vue, Spring Boot, MyBatis, Spring Security, MySQL |
| 서비스 AI | 일정 자동생성 제외, 챗봇/카드 생성 중심 |
| CI | GitHub Actions로 build/test |
