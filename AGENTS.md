# AGENTS.md — TripLog AI Agent 진입 가이드

> 이 파일은 Claude / Codex 등 로컬 AI agent가 TripLog 작업을 시작할 때 가장 먼저 읽는 진입 가이드입니다. 규칙 정본은 `docs/`(공통 운영 규칙은 `conventions.md`)이고, 이 파일은 그 정본을 가리키는 얇은 진입점입니다.
> 본문은 **얇게 유지**하고, 상세 규칙은 항상 `docs/`를 가리킵니다.

---

## 0. 이 프로젝트의 핵심

TripLog는 "AI 기능이 있는 여행 서비스"가 아니라, **AI agent를 실제 개발 주체로 활용하는 2인 협업 개발 프로젝트**입니다. 포트폴리오 메시지의 1순위는 **AI agent 기반 개발 방법론** 자체입니다.

한 줄 정의: **지도 기반 여행 계획 · 사진 기반 여행 기록 · AI 기반 공유 콘텐츠 생성을 연결하는 여행 로그 서비스.**

---

> 🟢 **현재 단계 (2026-06-22)**: **Sprint 4 시작** — [`docs/sprints/sprint-4.md`](docs/sprints/sprint-4.md). 디자인 반영 · 필수 완비 · 제출 마무리. Sprint 3 완료(회고 = [sprint-3.md](docs/sprints/sprint-3.md)).
>
> **다음 할 일**: sprint-4.md 기준 **이슈 분해·발행**(분담: log 담당자 = core+log / trip 담당자 = trip — 발행자가 본문 작성) 후 자기 트랙 진행 ([conventions §1-2](docs/conventions.md)). 진행 순서 = 디자인 반영 → 필수 완비 → 추가(되는대로) → 산출물. **프로세스: 상호 리뷰(§1-3), PR 발행 = 사람 확인 후 + reviewer 지정 필수.** 프론트 정본 = [frontend-structure.md](docs/frontend-structure.md)(와이어프레임 v3) + [목업](docs/design/trip-planner-flow.html), 디자인 확정 진행 중.

### 🚦 세션 진입 절차 — 이 순서로 시작한다 (맥락 없이 문서만으로 따라갈 수 있어야 함)

0. **최초 1회(클론 직후)** — `bash scripts/install-hooks.sh`로 git hook을 설치한다 (`main` 직접 push 차단). 이미 설치했으면 건너뛴다. 세션 작업 흐름은 [conventions §1-2](docs/conventions.md).
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
| 쓸 때 | [conventions §6-2 PR 본문](docs/conventions.md#6-2-본문-템플릿) · [§6-5 리뷰 코멘트](docs/conventions.md#6-5-리뷰-코멘트-형식) | PR·리뷰 코멘트 쓸 때 형식(헤더 문구 고정) |

---

## 2. 작업 인터페이스

```text
GitHub Issue → Branch → Commit → Pull Request → GitHub Actions → Merge
```

작업은 **Issue 단위**로 받고, Issue 본문(Goal / Scope / Acceptance Criteria / Test Criteria / Notes)이 작업 계약서입니다. 명시된 범위 밖으로 나가지 않습니다. 스프린트 운영·세션 절차·Issue·Branch·Commit·PR 규칙 정본은 [conventions §1·§3~§6](docs/conventions.md#1-워크플로우).

---

## 3. 역할 분담

트랙은 `trip` / `log` / `core` 셋입니다. 범위·공유 규칙 정본 = [conventions §2](docs/conventions.md#2-track-역할-축). **누가 어느 트랙인지는 공유 문서에 적지 않고**(관점 종속 방지) 각자 `AGENTS.local.md`에 선언하며, agent는 "🚦 세션 진입 절차" 1번에서 읽습니다. AI agent는 **자기 트랙 안에서만** 작업하고, 다른 트랙 파일은 건드리기 전 사람에게 확인합니다.

---

## 4. 사람과 AI의 역할

역할 구분(사람 = 방향·설계·완료 조건·검증 / AI agent = 구현·테스트·리팩터링·분석)과, "AI가 만든 코드는 **육안 검토만이 아니라 테스트·CI로 검증한다**"는 원칙의 정본은 [conventions §9-1·§9-2](docs/conventions.md#9-1-역할).

---

## 5. 절대 하지 말 것

절대 금지 목록 정본 = [conventions §10](docs/conventions.md#10-금지-사항). 특히: Issue 없이 `main` push · 작업 완료 후 PR 발행 생략 · 공유 영역(`core`) 단독 변경 · 기존 형식 확인 없이 임의 형식으로 Issue·PR·문서 생성 · 환경변수·비밀 키 커밋.

---

## 6. 툴체인 자유

각자 로컬 agent 운용 방식(Claude / Codex / 혼합)은 사적 영역입니다. 팀이 보는 것은 GitHub Issue · PR · CI · `docs/`뿐이고, **공통 운영 규칙 정본은 [conventions.md](docs/conventions.md)** 입니다 — 이 파일은 진입 안내일 뿐 규칙 본문은 두지 않습니다. 공통/개인 경계 = [conventions §9-3](docs/conventions.md#9-3-툴체인-자유--공통개인-경계).

- Claude 사용자는 `CLAUDE.md`가 이 파일을 import합니다 (`@AGENTS.md`).
- Codex 사용자는 이 파일을 직접 읽습니다.

---

## 7. 막혔을 때

1. `docs/conventions.md`와 `docs/requirements.md`를 다시 읽어보세요.
2. Issue 본문에 모호한 점이 있으면 댓글로 사람에게 질문합니다.
3. 공유 영역에 손대야 한다면 PR 전에 먼저 의논합니다.
4. 트러블슈팅 기록이 필요한 사안은 `docs/troubleshooting/`에 짧게 정리합니다.
