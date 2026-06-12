# TripLog

[![CI](https://github.com/jiinsuwan/triplog/actions/workflows/ci.yml/badge.svg)](https://github.com/jiinsuwan/triplog/actions/workflows/ci.yml)

> 지도 기반 여행 계획 · 사진 기반 여행 기록 · AI 기반 공유 콘텐츠 생성을 연결하는 여행 로그 서비스

**팀**: 2인 · **기간**: 약 1개월 · **방식**: AI agent 기반 협업 개발

---

## 🟢 Project Status — Sprint 3 진행 중

> 2026-06-12 기준. 스프린트 상세: [docs/sprints/sprint-3.md](docs/sprints/sprint-3.md) · 전체 계획: [docs/roadmap.md](docs/roadmap.md)

| 상태 | 내용 |
|---|---|
| ✅ 완료 (S0~S1) | JWT 인증(Access/Refresh) · 로그인/회원가입/프로필 · 여행 CRUD + 화면 · AI 카드 PoC ([decisions/0004](docs/decisions/0004-card-poc-result.md)) |
| ✅ 완료 (S2) | 관광지 데이터 적재·카카오맵 탐색·상세 화면 · 사진 업로드 → EXIF → 여행 연결 → 인증 서빙 + 업로드 화면 · 외부 API 공통 인프라 · requiresAuth 자동 테스트 |
| 🔨 진행 (S3) | 일정 에디터(stop·이동수단·소요시간) · AI 카드 생성(외곽선 사이드카, [decisions/0006](docs/decisions/0006-card-outline-module.md)) → **P0 완성** |
| 📋 프로세스 | S2 회고: 상호 리뷰 단일화 + PR guardrail 채택 ([decisions/0007](docs/decisions/0007-pr-process.md)) |

---

## 이 프로젝트의 정체

TripLog는 단순한 "AI 여행 서비스"가 아닙니다.

> **AI agent를 실제 개발 주체로 활용하는 2인 협업 개발 프로젝트**

사람은 제품 방향을 정하고, 시스템을 설계하고, Sprint/Issue 단위로 작업을 나누고, AI agent의 구현 결과를 테스트와 PR로 감독합니다. AI agent는 단순 보조 도구가 아니라 사람이 합의한 요구사항과 완료 조건에 따라 구현·테스트·리팩터링을 수행하는 개발 주체입니다.

---

## 처음 보는 분들께 — How to Review

개발 진행 중인 레포입니다. 아래 순서로 보면 범위와 진행 흐름을 파악하기 쉽습니다.

1. 이 README — 개요와 현재 상태
2. [docs/requirements.md](docs/requirements.md) — 확정된 기능 범위 (P0/P1/P2)와 완료 조건
3. [docs/architecture.md](docs/architecture.md) — 시스템 구조와 설계 원칙
4. [docs/conventions.md](docs/conventions.md) — Issue/Branch/Commit/PR 규칙과 AI agent 운용 원칙
5. [docs/sprints/](docs/sprints/) · [docs/decisions/](docs/decisions/) — 스프린트 기록과 의사결정 로그
6. GitHub Issues / Pull Requests — 실제 구현·리뷰 기록
   - 대표 예시: [PR #14](https://github.com/jiinsuwan/triplog/pull/14) (공유 영역 리뷰 → 반영 → 승인 흐름) · [PR #46](https://github.com/jiinsuwan/triplog/pull/46) (에이전틱 협업 로그 + AC↔테스트 매핑)

---

## 실행 방법 (Quick Run)

```bash
# 0. 최초 1회 — 환경 점검 (Node 20+ / Java 21 / MySQL 8 / .env)
#    .env는 .env.example를 복사해 작성한다
bash scripts/preflight.sh

# 1. Backend — http://localhost:8080 (Swagger: /swagger-ui.html)
cd backend && ./mvnw spring-boot:run

# 2. Frontend — http://localhost:5173
cd frontend && npm install && npm run dev
```

환경변수·DB 셋업 상세: [backend/README.md](backend/README.md) · [frontend/README.md](frontend/README.md)

---

## 팀원 · AI agent 온보딩

| 역할 | 먼저 읽을 문서 |
|---|---|
| 처음 합류한 팀원 | [docs/conventions.md](docs/conventions.md), [AGENTS.md](AGENTS.md) |
| 기능 구현 시작 | [docs/requirements.md](docs/requirements.md), [docs/roadmap.md](docs/roadmap.md) |
| 시스템 구조 파악 | [docs/architecture.md](docs/architecture.md) |
| AI agent에게 일 시키기 | [AGENTS.md](AGENTS.md), Issue 템플릿 |

**에이전트 진입(첫 세션 셋업)**: [AGENTS.md](AGENTS.md)의 "🚦 세션 진입 절차"를 따른다. 처음이라면 루트의 `AGENTS.local.md.example`를 `AGENTS.local.md`로 복사해 **자기 트랙을 선언**한다(이 파일은 git 공유 안 함).

- **Codex 사용자**: `AGENTS.md`를 자동으로 읽으므로 추가 설정 없음.
- **Claude 사용자**: 루트에 `CLAUDE.md`(git 미추적)를 만들고 `@AGENTS.md` 한 줄을 넣으면 `AGENTS.md`를 자동 로드한다.

**최초 로컬 셋업(클론 직후 1회)**: `bash scripts/install-hooks.sh`로 git hook을 설치한다 — `main` 직접 push를 차단한다(plan 제약으로 branch protection을 못 쓰는 대체 수단). 이어서 `bash scripts/preflight.sh`로 Node/Java/.env/MySQL을 점검한다.

---

## 문서 인덱스

```
docs/
├── roadmap.md          ← Sprint 0~4 계획
├── requirements.md     ← 기능 목록 (P0/P1/P2) + 완료 조건
├── architecture.md     ← 패키지 구조, DB/API 설계 방향
├── conventions.md      ← Issue/Branch/Commit/PR 규칙, AI agent 운용 원칙
├── decisions/          ← 중요한 의사결정 기록
├── sprints/            ← 스프린트 실행 문서 (주초 작성, conventions §1-1)
└── poc/                ← PoC 검증 가이드
```

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend | Vue 3 + Vite |
| Backend | Spring Boot (Java 21 + Maven) |
| Persistence | MyBatis |
| Security | Spring Security + JWT (Access + Refresh) |
| DB | MySQL |
| Map | Kakao Map (식당·카페 등 장소 검색 포함) |
| Tourism Data | 공공데이터 표준데이터 JSON (DB 적재) · TourAPI는 P2 |
| AI | SSAFY 제공 GMS key 우선 |
| CI | GitHub Actions |

상세는 [docs/architecture.md](docs/architecture.md) 참조.

---

## 협업 흐름

```text
GitHub Issue → Branch → Commit → Pull Request → GitHub Actions → Merge
```

- 각자 로컬 agent 운용 방식은 자유 (Claude / Codex / 혼합).
- 팀 공통 인터페이스는 GitHub Issue · PR · CI · `docs/` 정본.
- 자세한 규칙은 [docs/conventions.md](docs/conventions.md).
