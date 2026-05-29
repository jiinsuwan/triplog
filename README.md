# TripLog

> 지도 기반 여행 계획 · 사진 기반 여행 기록 · AI 기반 공유 콘텐츠 생성을 연결하는 여행 로그 서비스

**팀**: 2인 · **기간**: 약 1개월 · **방식**: AI agent 기반 협업 개발

---

## 이 프로젝트의 정체

TripLog는 단순한 "AI 여행 서비스"가 아닙니다.

> **AI agent를 실제 개발 주체로 활용하는 2인 협업 개발 프로젝트**

사람은 제품 방향을 정하고, 시스템을 설계하고, Sprint/Issue 단위로 작업을 나누고, AI agent의 구현 결과를 테스트와 PR로 감독합니다. AI agent는 단순 보조 도구가 아니라 사람이 합의한 요구사항과 완료 조건에 따라 구현·테스트·리팩터링을 수행하는 개발 주체입니다.

---

## 빠른 시작

| 역할 | 먼저 읽을 문서 |
|---|---|
| 처음 합류한 팀원 | [docs/conventions.md](docs/conventions.md), [AGENTS.md](AGENTS.md) |
| 기능 구현 시작 | [docs/requirements.md](docs/requirements.md), [docs/roadmap.md](docs/roadmap.md) |
| 시스템 구조 파악 | [docs/architecture.md](docs/architecture.md) |
| AI agent에게 일 시키기 | [AGENTS.md](AGENTS.md), Issue 템플릿 |

---

## 문서 인덱스

```
docs/
├── roadmap.md          ← Sprint 0~4 계획
├── requirements.md     ← 기능 목록 (P0/P1/P2) + 완료 조건
├── architecture.md     ← 패키지 구조, DB/API 설계 방향
├── conventions.md      ← Issue/Branch/Commit/PR 규칙, AI agent 운용 원칙
├── decisions/          ← 중요한 의사결정 기록
└── poc/                ← PoC 검증 가이드
```

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend | Vue 3 + Vite |
| Backend | Spring Boot |
| Persistence | MyBatis |
| Security | Spring Security + JWT |
| DB | MySQL |
| Map | Kakao Map |
| Tourism Data | 한국관광공사 TourAPI |
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
