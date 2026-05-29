# AGENTS.md — TripLog AI Agent 가이드 (정본)

> 이 파일은 Claude / Codex 등 로컬 AI agent가 TripLog 작업을 시작할 때 가장 먼저 읽는 정본 가이드입니다.
> 본문은 **얇게 유지**하고, 상세 규칙은 항상 `docs/`를 가리킵니다.

---

## 0. 이 프로젝트의 핵심

TripLog는 "AI 기능이 있는 여행 서비스"가 아니라, **AI agent를 실제 개발 주체로 활용하는 2인 협업 개발 프로젝트**입니다. 포트폴리오 메시지의 1순위는 **AI agent 기반 개발 방법론** 자체입니다.

한 줄 정의: **지도 기반 여행 계획 · 사진 기반 여행 기록 · AI 기반 공유 콘텐츠 생성을 연결하는 여행 로그 서비스.**

---

> 🟢 **현재 단계 (2026-05-29)**: 기획 v1 확정 + **Sprint 0 코어 셋업 완료** (backend·frontend·CI 골격, PR #1 머지 — [sprint-0 회고](docs/sprints/sprint-0.md)). 남은 것: `S0-LOG-01`(카드 PoC) 미착수 · `S0-CORE-01`(branch protection)은 플랜 제약으로 **컨벤션 운용** · Q6(LLM 모델)은 PoC 후 결정.
>
> **다음 단계 = Sprint 1.** 주초에 [`_template.md`](docs/sprints/_template.md)를 복사해 `docs/sprints/sprint-1.md`를 작성하고 Issue로 분해한다 ([conventions §1-1](docs/conventions.md)).

### 🚦 세션 진입 절차 — 이 순서로 시작한다 (맥락 없이 문서만으로 따라갈 수 있어야 함)

1. **내 트랙 확인** — repo 루트의 `AGENTS.local.md`(개인 로컬 파일, git 공유 안 함)를 읽어 자신이 맡은 트랙(`trip` / `log` / `core`)을 확인한다. 파일이 없으면 [`AGENTS.local.md.example`](AGENTS.local.md.example)를 복사해 만든다. **트랙을 확정할 수 없으면 작업을 멈추고 사람에게 확인한다** (역할 모른 채 아무 트랙이나 건드리지 않는다).
2. **현재 스프린트 찾기** — `docs/sprints/`에서 **가장 최신 `sprint-{N}.md`** 가 현재 스프린트다. 문서 상단 **상태줄**(🟢 진행 중 / ✅ 완료)로 진행 여부를 판별한다. **최신 문서가 `✅ 완료`면 다음 스프린트가 아직 생성되지 않은 상태** — 그 문서의 회고 "다음 입력"과 위 "현재 단계" 박스가 가리키는 다음 스프린트를 따른다.
3. **내 할 일만** — 그 스프린트 문서의 **내 트랙 섹션**과, 나에게 할당된 **열린 GitHub Issue**만 따라간다. 다른 트랙 파일은 건드리기 전 사람에게 확인한다.

## 1. 가장 먼저 읽어야 할 문서

| 우선순위 | 문서 | 용도 |
|---|---|---|
| **필수** | [docs/conventions.md](docs/conventions.md) | Issue/Branch/Commit/PR 규칙, AI agent 운용 원칙 — **이 문서가 유일한 정본** |
| 필수 | [docs/requirements.md](docs/requirements.md) | 기능 목록 (P0/P1/P2), track별 담당, 완료 조건 |
| 필수 | [docs/roadmap.md](docs/roadmap.md) | Sprint 0~4 계획 |
| 권장 | [docs/architecture.md](docs/architecture.md) | 패키지 구조, DB/API 설계 방향 |
| 권장 | [docs/decisions/](docs/decisions/) | 의사결정 로그 (블루프린트, 범위 피벗, 협업 방향) |
| 작업별 | [docs/poc/card-poc.md](docs/poc/card-poc.md) | AI 카드 생성 PoC 가이드 (Sprint 0~1) |
| 작업별 | [docs/sprints/](docs/sprints/) | 스프린트 실행 문서. 주초에 `sprint-{N}.md` 작성 후 Issue 분해 ([conventions §1-1](docs/conventions.md)) |

---

## 2. 작업 인터페이스

```text
GitHub Issue → Branch → Commit → Pull Request → GitHub Actions → Merge
```

- **스프린트 시작(주초)**: 사람과 함께 `docs/sprints/sprint-{N}.md`를 작성하고, 그 할일을 Issue로 분해합니다 ([conventions §1-1](docs/conventions.md)).
- 작업은 **Issue 단위**로 받습니다. Issue 본문(`Goal / Scope / Acceptance Criteria / Test Criteria / Notes`)이 작업 계약서입니다.
- Issue에 명시된 범위 밖으로 나가지 마세요. 범위 확장이 필요하면 새 Issue 분리를 제안하세요.
- 공유 영역(`core` 트랙) 변경은 PR 리뷰가 필수입니다. PR에 반드시 명시하세요.

상세 규칙: [docs/conventions.md §3~§6](docs/conventions.md).

---

## 3. 역할 분담

| Track | AI agent의 작업 영역 | 공유 |
|---|---|---|
| `trip` | 여행 CRUD, 관광지 탐색, 지도, 일정, 장소 저장 | 한 명 담당 |
| `log` | 사진 업로드, 사진 기록, AI 카드 생성, export | 한 명 담당 |
| `core` | 인증, 공통 구조, DB schema, API convention, CI, 공통 UI | 둘 다 (PR 리뷰 필수) |

- **누가 어느 트랙인지는 공유 문서에 적지 않는다** (관점 종속을 피함). 각 작업자가 자신의 `AGENTS.local.md`(로컬, 공유 안 함)에 선언하고, agent는 위 "🚦 세션 진입 절차" 1번에서 그 파일을 읽어 자기 역할을 안다.
- AI agent는 **자기 트랙 안에서만** 작업한다. 다른 트랙의 파일을 건드리려면 사람에게 먼저 확인한다.

---

## 4. 사람과 AI의 역할

- **사람**: 제품 방향 / 우선순위 / 설계 / Sprint·Issue 분해 / 완료 조건 정의 / 공유 영역 변경 승인 / PR·CI 검증 / UX 최종 판단
- **AI agent**: Issue 단위 구현 / 테스트 코드 작성 / 리팩터링 / 문서 초안 / 실패 원인 분석 / 수정안 제안

AI가 만든 코드는 **육안 검토만으로 통제하지 않습니다**. 가능한 경우 테스트와 CI로 검증합니다. 테스트 가능한 로직은 테스트를 먼저 작성하거나 구현과 함께 작성하세요.

---

## 5. 절대 하지 말 것

- ❌ Issue 없이 main에 직접 push
- ❌ 공유 영역(`core`) 변경을 단독 결정으로 진행
- ❌ `docs/conventions.md`에 정의되지 않은 새로운 워크플로우 도입 (무거운 spec/handoff 구조 등)
- ❌ AI 자동 일정 생성을 P0로 끌어올리기 (블루프린트 §6, decisions/0002)
- ❌ MSA 구조 제안
- ❌ DB/API 상세 설계를 기능 확정 전에 과하게 선행
- ❌ 환경변수·비밀 키를 커밋

---

## 6. 툴체인 자유

각자 로컬 agent 운용 방식(Claude / Codex / 혼합)은 사적 영역입니다. 팀이 보는 것은 GitHub Issue · PR · CI · `docs/`뿐입니다.

- Claude 사용자는 `CLAUDE.md`가 이 파일을 import합니다 (`@AGENTS.md`).
- Codex 사용자는 이 파일을 직접 읽습니다.
- 두 toolchain에서 **공통으로 봐야 할 규칙은 모두 이 파일과 `docs/`에 있습니다**.

---

## 7. 막혔을 때

1. `docs/conventions.md`와 `docs/requirements.md`를 다시 읽어보세요.
2. Issue 본문에 모호한 점이 있으면 댓글로 사람에게 질문합니다.
3. 공유 영역에 손대야 한다면 PR 전에 먼저 의논합니다.
4. 트러블슈팅 기록이 필요한 사안은 `docs/troubleshooting/`에 짧게 정리합니다.
