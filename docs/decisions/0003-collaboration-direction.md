# Decision 0003 — 협업 방향 (툴 중립, GitHub 정본)

- **상태**: Accepted (블루프린트로 일부 override됨, 아래 §변경 사항 참조)
- **결정일**: 2026-05-14 (초안), 2026-05-22 (블루프린트 반영 최종)
- **출처**: `archive/명세_원본/triplog_협업방향_초안.md`
- **관련 문서**: [0001-project-blueprint](0001-project-blueprint.md), [conventions](../conventions.md)

---

## 핵심 원칙

- 팀 2인, AI agent 기반 개발
- 두 명의 toolchain이 다를 수 있다 (나: Claude+Codex / 파트너: Codex 중심)
- **팀 공유 레이어는 툴 중립. 각자 에이전트 운용은 사적 영역.**
- 팀이 보는 것은 산출물(Issue · PR · `docs/`)뿐. 누가 어떻게 오케스트레이션하는지는 묻지 않는다.

## 역할 분담 (확정)

| 축 | 담당 | 범위 |
|---|---|---|
| **trip** (여행 계획) | 파트너 | Trip CRUD, 관광지 탐색, 지도, 일정, 장소 저장 |
| **log** (기록·공유) | 본인 | 사진 업로드, 사진 기록, AI 카드 생성, export |
| **core** (공유 영역) | 둘 다 | 인증, 공통 구조, DB schema, API convention, CI, 공통 UI |

원칙: FE/BE로 가르지 않는다. 각자 자기 축의 화면·API·DB 접근·테스트를 end-to-end로 담당한다. `core` 변경은 PR 리뷰 필수.

## 결정 항목 (D1~D6)

| # | 항목 | 결정 |
|---|---|---|
| D1 | 누가 어느 축 | 본인 = log / 파트너 = trip |
| D2 | `CLAUDE.md`/`.claude/` 레포 커밋 | **AGENTS.md를 정본으로 사용. CLAUDE.md는 `@AGENTS.md` import stub** (아래 §변경 사항 참조) |
| D3 | 레포 호스팅 | **GitHub** (PR 워크플로우) — 초안의 GitLab/MR 결정을 블루프린트가 override |
| D4 | 정본 instruction 파일 | `docs/conventions.md` 단일 정본 + 얇은 `AGENTS.md` |
| D5 | spec/handoff 구조 도입 범위 | 도입하지 않음 — Issue 본문이 spec, PR이 handoff. 블루프린트의 "PlanP식 복잡 구조 도입 금지"와 일관 |
| D6 | 알림 채널 (Discord 등) | 미사용. 싱크는 대면 + Git |

## 블루프린트가 override한 사항

협업방향 초안 v1(5-14)에서 결정한 항목 중 블루프린트 v2(5-22)가 덮어쓴 부분:

| 영역 | 초안 | 블루프린트 | 사유 |
|---|---|---|---|
| 레포 호스팅 | SSAFY GitLab + MR | **GitHub + PR** | 개발 정본은 GitHub, SSAFY GitLab은 제출용 산출물 업로드 전용 |
| 축 이름 | "여행 계획 축" / "기록·공유 축" | **`trip` / `log` / `core`** | 짧고 일관된 영어 키. 브랜치·커밋 컨벤션과 결합 |
| spec/handoff | planp 경량 도입 (template + accepted 폴더) | **도입하지 않음** | "PlanP식 복잡 체계 도입 금지" 명시. Issue 본문이 spec 역할 |
| 동기화 단위 | Feature / Spec 2단 사이클 | **Sprint / Issue 단일 단위** | Milestone 용어도 Sprint로 통일 |
| 에이전트 자산 커밋 | `.claude/` 통째 커밋 | **AGENTS.md 정본 + 얇은 CLAUDE.md stub** | 두 toolchain 공통 인터페이스로 일원화 |

## 워크플로우 (블루프린트 §9~§13 기준)

```text
Sprint → GitHub Issue → Branch → Commit → Pull Request → GitHub Actions → Merge
```

상세 규칙은 [conventions.md](../conventions.md) 참조.

## 동기화 리듬

- **데일리 짧은 싱크** (5~10분) — 어제/오늘/공유 영역 건드릴 일/블로커
- **Sprint 경계 싱크** — 시작 시 범위 합의, 종료 시 결과 공유
- 별도 채널(Discord 등) 미사용. 싱크는 대면 + Git
