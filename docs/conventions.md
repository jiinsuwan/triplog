# Conventions — 협업 규칙 정본

> 이 문서가 Issue · Branch · Commit · PR · AI agent 운용의 **유일한 정본**입니다.
> `AGENTS.md` / `CLAUDE.md`는 이 문서를 가리키는 얇은 참조용 문서일 뿐입니다.
>
> 상위 합의의 근거: [decisions/0001-project-blueprint](decisions/0001-project-blueprint.md), [decisions/0003-collaboration-direction](decisions/0003-collaboration-direction.md)

---

## 1. 워크플로우

```text
Sprint → GitHub Issue → Branch → Commit → Pull Request → GitHub Actions → Merge
```

- "Milestone"이라는 용어는 쓰지 않습니다. 모두 **Sprint**로 통일합니다 (GitHub Milestone 기능을 쓰더라도 팀 내부 명칭은 Sprint).
- 하나의 Issue = 하나의 PR을 기본으로 합니다.
- 범위가 커지면 새 Issue로 분리합니다.

### 1-1. 스프린트 운영 사이클

스프린트는 **`docs/sprints/sprint-{N}.md`** 한 장으로 실행합니다. `roadmap.md`(전체 계획)를 이번 스프린트 실행용으로 구체화한 문서입니다.

- **시작 (주초, 사람 + AI agent 함께)**:
  1. 지난 스프린트 회고 — 완료/미완(이월) 확인
  2. `roadmap.md`에서 이번 스프린트 범위 확정 (변동 반영)
  3. `sprint-{N}.md` 작성 — 트랙별 Issue 후보(제목 + Goal/AC 요약) + 종료 조건
  4. 그 문서 기준으로 **GitHub Issue 생성 → 각자 트랙 작업 시작**
- **종료**: `sprint-{N}.md` 하단에 회고(완료/이월/배운 점) 추가 → 다음 스프린트 입력으로. 회고 때 **①각 트랙이 내린 결정 요약을 서로 검토 ②`proposal` Issue(공통 규칙 변경 건의)를 채택/기각**도 함께 본다.
- **종료 시 진입점 갱신**: `AGENTS.md` 상단 "현재 단계" 박스를 **지금 상태·다음 할 일**로 업데이트한다. 새 세션/다음 작업자가 옛 안내를 따르지 않도록 — 이 박스가 항상 "지금 어디서, 무엇부터"를 가리켜야 한다.
- `sprint-{N}.md`는 **1~2장으로 제한**. 설계·핸드오프 문서로 비대해지지 않습니다(§10). 형식은 `docs/sprints/_template.md` 참고.

**스프린트 문서 ↔ Issue 관계 (헷갈리지 않게)**

- `sprint-{N}.md`는 **계획·지도 문서**입니다. **그 자체는 Issue로 발행되지 않습니다.** 문서 안의 트랙별 항목 하나하나가 **각각 GitHub Issue 1개**가 됩니다(작업 단위 = Issue, §3). 즉 문서 1장 → Issue 여러 개.
- 발행 이후의 **실행은 전적으로 Issue 기준**입니다(Issue → Branch → Commit → PR → CI → Merge). 스프린트 문서는 그 사이 "무엇을·왜·종료조건"을 보는 **참조/현황판**이지 작업 단위가 아닙니다.
- **진행상황의 단일 출처(SSOT) = GitHub Issue/PR 상태**입니다. **문서 체크박스(`roadmap.md`·`sprint-{N}.md` 공통)는 계획 시 작성하고, 스프린트 종료(회고) 때 한 번 맞춥니다** — 작업마다 실시간 갱신하지 않습니다(두 곳을 동시에 관리하면 어긋남). "지금 무엇이 끝났나"는 **항상 Issue/PR로** 봅니다(문서 체크박스는 실시간 상태가 아님).
- **현재 스프린트 추적**: 현재 스프린트 = `docs/sprints/`의 **가장 큰 N**의 `sprint-{N}.md`. 그 문서 **상단 상태줄**(🟢 진행 중 / ✅ 완료)로 진행 여부를 판별합니다. `AGENTS.md` "현재 단계" 박스가 같은 곳을 가리킵니다. → 대화 맥락 없이 **문서만으로** 현재 위치를 알 수 있어야 합니다.

### 1-2. 세션 운영 (agent 1회 작업 단위)

스프린트가 Issue로 분해된 뒤, 각 작업 세션은 다음 순서로 진행합니다.

1. **이슈 1개 선택** — 자기 트랙의 열린 Issue 중 하나. **한 세션은 기본적으로 한 Issue만** 다룹니다.
2. **시작 합의** — agent가 "이번 세션에 이 Issue를 한다"를 사람과 확인합니다. 설계 갈림길이 있으면 이때 대화로 정합니다.
3. **자율 구현** — Issue 범위 안에서 구현 + 테스트. 다음 경우 멈추고 사람에게 묻습니다.
   - 합의한 범위를 벗어나는 변경이 필요할 때
   - 공유 영역(core)을 추가로 건드려야 할 때
   - 다른 트랙 · 다른 Issue를 건드려야 할 때
4. **PR 후 전환** — 로컬 테스트 통과 → PR 생성. 리뷰는 비동기이므로 **이 브랜치에는 더 쌓지 않습니다.** 리뷰를 기다리는 동안 CI · 리뷰 코멘트에 대응하거나, **독립적인 다른 Issue를 새 브랜치에서 시작**합니다. 한 브랜치에 여러 Issue를 합치지 않습니다.
5. **머지** — 아래 **self-merge 게이트**를 통과하면 트랙 내부 변경은 self-merge, core(공유 영역, §6-3)는 상대 리뷰 후 머지.

의존성이 있는 Issue는 앞 Issue **위에 쌓지 말고**, 가능하면 mock 등으로 독립 진행한 뒤 앞 Issue 머지 후 결합합니다. 결합이 불가능한 경우에만 앞 Issue 머지를 기다립니다. 어느 경우든 두 Issue를 한 브랜치에 합치지 않습니다.

**브랜치는 base=main (stacked 금지).** 각 PR은 main 기준 독립 브랜치로 만든다. 앞 PR 위에 쌓지 않는 이유: ①우리 CI는 `pull_request: branches:[main]`이라 **base=main인 PR에만 실행** → stacked PR(base≠main)은 자동 검사가 안 돈다. ②오래된 base에 쌓이면 이미 main에 머지된 수정을 **되돌리는 회귀**가 난다. (#30·#31이 stacked라 #27 CI를 수동으로 깨워야 했고, #30은 detail 라우트 보호를 되돌릴 뻔했다 — decisions/0005.)

### 1-3. self-merge 게이트 (AI 자기편향 보완)

트랙 내부 변경을 리뷰 없이 머지하려면 **아래를 모두** 충족한다. (AI는 자기 작업물에 덜 냉정하므로, 빠른 진행을 살리되 객관성을 절차로 보완한다.)

1. **범위** — 변경이 자기 트랙 파일 안에만 있고 공유 영역(§6-3)을 바꾸지 않는다. (자기 트랙 *라우트 추가*는 허용 — 단 가드 로직·layout 구조 변경은 리뷰 필수.)
2. **CI green** — base=main이라 실제로 실행된 상태.
3. **냉정한 리뷰 1회** — 코드를 짠 세션이 아닌 **새 세션의 적대적 리뷰**, 가능하면 **다른 AI**(예: Codex). 결과를 PR 코멘트로 남긴다.
4. **사람의 빠른 최종 확인 + 책임.**

객관적으로 검사 가능한 규칙(예: 보호 라우트 `requiresAuth` 누락)은 **자동 테스트로 강제**한다 — 리뷰 운에 맡기지 않는다. 공유 영역(core)은 이 게이트가 아니라 상대 리뷰(§6-3)를 따른다.

---

## 2. Track (역할 축)

| Track | 범위 | 공유 |
|---|---|---|
| `trip` | 여행 생성, 관광지 탐색, 지도, 일정, 장소 저장 | 한 명 담당 |
| `log` | 사진 업로드, 사진 기록, AI 카드 생성, export | 한 명 담당 |
| `core` | 인증, 공통 구조, DB schema, API convention, CI, 공통 UI | 공동 (PR 리뷰 필수) |

- **누가 어느 트랙인지는 공유 문서에 적지 않습니다** (관점 종속 방지). 각자 자신의 `AGENTS.local.md`(로컬, 공유 안 함)에 트랙을 선언하고, agent는 세션 진입 시 그것을 읽습니다 (AGENTS.md "🚦 세션 진입 절차").
- FE/BE로 가르지 않습니다. 각자 자기 트랙의 화면·API·DB·테스트를 end-to-end로 책임집니다.
- **`core` 변경은 PR 리뷰 필수**입니다. 공유 영역을 혼자 임의로 바꾸지 않습니다.

---

## 3. Issue

### 3-1. 제목 규칙

```text
[S{Sprint번호}-{TRACK}-{번호}] 작업명
```

예시:

```text
[S1-CORE-01] Spring Security + JWT 인증 구현
[S1-TRIP-01] 여행 CRUD API 구현
[S2-LOG-01] 사진 업로드 API 구현
[S3-LOG-01] AI 카드 JSON 스키마 정의
```

### 3-2. 본문 템플릿

`.github/ISSUE_TEMPLATE/feature_issue.md` 사용. 필수 섹션:

- **Goal** — 이 Issue에서 완성할 목표
- **Scope** — 포함/제외 범위
- **Acceptance Criteria** — 체크리스트
- **Test Criteria** — 테스트 통과 조건
- **Notes** — 관련 API/화면/공유 영역 영향

### 3-3. 운영 규칙

- Issue는 **단순 메모가 아니라 AI agent에게 전달할 작업 계약서**입니다.
- AI agent에게 작업을 넘길 때 Issue 본문을 그대로 컨텍스트로 사용합니다.
- 공유 영역 변경이 있으면 Issue와 PR에 반드시 명시합니다.

---

## 4. Branch

### 4-1. 타입

| type | 용도 |
|---|---|
| `feat` | 기능 개발 |
| `fix` | 버그 수정 |
| `chore` | 설정, 빌드, CI, 환경 |
| `docs` | 문서 |

### 4-2. 네이밍

```text
{type}/s{sprint}-{track}{number}-{short-name}
```

예시:

```text
feat/s1-core01-auth
feat/s1-trip01-trip-crud
feat/s2-log01-photo-upload
feat/s3-log01-card-json
fix/s3-log01-card-json
chore/ci
docs/roadmap
```

---

## 5. Commit

### 5-1. 규칙

```text
{type}({track}): {message}
```

- 한 커밋에 여러 기능을 섞지 않습니다. **기능/논리 단위로** 나누고, 각 커밋은 가능하면 빌드되는 상태로 둡니다.

### 5-2. type / track

- type: `feat` / `fix` / `test` / `docs` / `chore` / `refactor`
- track: `trip` / `log` / `core`

### 5-3. 예시

```text
feat(trip): add trip crud api
feat(log): add photo upload api
feat(log): parse ai card layout json
feat(core): configure spring security jwt
test(log): add card json validation tests
fix(log): handle invalid ai response
docs(core): add sprint workflow
chore(core): add github actions ci
```

---

## 6. Pull Request

### 6-1. 제목

Issue 제목과 동일하게.

```text
[S1-TRIP-01] 여행 CRUD API 구현
```

### 6-2. 본문 템플릿

`.github/pull_request_template.md` 사용. 필수 섹션:

- **Related Issue** — `closes #N`
- **Summary** — 변경 요약
- **Test** — 로컬 테스트/CI/화면·API 확인 체크리스트
- **Review Point** — 검토자가 봐야 할 부분

### 6-3. 리뷰 필수 영역

다음 변경은 **반드시 상대 리뷰**를 받습니다.

- DB schema
- Spring Security / 인증
- 공통 API 응답 형식
- 공통 UI 컴포넌트
- router **가드 로직 · layout 구조** (자기 트랙 *라우트 추가*는 self-merge 가능 — 아래 라우트 보호 컨벤션 준수)
- build 설정
- GitHub Actions
- 환경변수 구조

자기 트랙 내부 변경은 self-merge 가능하지만(§1-3 게이트), 상대에게 알림은 남깁니다.

### 6-4. 라우트 보호 컨벤션 (트랙 공통)

로그인이 필요한 라우트는 `meta: { requiresAuth: true }`를 **명시**한다. **기본 = 보호, 공개 라우트만 명시 목록**(`/`·`/login`·`/signup`)으로 둔다. 새 라우트가 깜빡 빠지지 않도록 **자동 테스트로 강제**한다(`frontend/src/router/index.spec.js` — 공개 목록 외 전 라우트에 `requiresAuth` 존재 검사). 가드 로직·layout 구조 변경은 §6-3 리뷰 필수. (근거: detail·places 라우트에서 누락 재발 — decisions/0005.)

---

## 7. Labels

운영 부담을 줄이기 위해 다음만 사용합니다.

```text
track:core
track:trip
track:log
status:blocked
proposal
priority:p0
priority:p1
priority:p2
```

- `proposal`: 공통 규칙(conventions 등) 변경 **건의**. 혼자 못 바꾸므로 Issue로 올리고, 스프린트 회고 때 함께 검토 → 채택 시 conventions PR.

여유가 생기면 `type:feature`, `type:bug`, `type:docs`, `type:chore`, `status:review-needed`를 추가합니다.

---

## 8. Test / CI

### 8-1. 테스트 우선 적용 대상

| 대상 | 테스트 필요도 |
|---|---|
| AI 응답 JSON 파싱 | 매우 높음 |
| 카드 레이아웃 검증 | 매우 높음 |
| 인증 / Security | 높음 |
| MyBatis Mapper / Repository | 높음 |
| 관광지 API adapter | 높음 |
| 단순 Vue 화면 | 선택 |
| CSS / 레이아웃 | 수동 확인 중심 |

### 8-2. CI 최소 구성

GitHub Actions에서 다음을 실행합니다.

```text
frontend build
backend test
backend build
```

여유 생기면 `frontend lint`, `frontend unit test`, `backend integration test`를 추가합니다.

---

## 9. AI Agent 운용 원칙

### 9-1. 역할

- **사람**: 제품 방향, 우선순위, 시스템 설계, Sprint/Issue 분해, 완료 조건 정의, 공유 영역 변경 승인, PR/CI 검증, UX 최종 판단
- **AI agent**: Issue 단위 구현, 테스트 코드 작성, 리팩터링, 문서 초안, 실패 원인 분석, 수정안 제안

### 9-2. 핵심 원칙

- AI agent에게 작업을 맡길 때는 **Issue 단위**로 맡깁니다.
- Issue에는 목표·범위·제외 범위·완료 조건·테스트 기준이 반드시 있어야 합니다.
- AI가 만든 코드는 **육안 검토만으로 통제하지 않습니다**. 가능한 경우 테스트와 CI로 검증합니다.
- 테스트 가능한 로직은 테스트를 먼저 작성하거나 구현과 함께 작성합니다.
- PR은 agent 결과물을 검토하고 프로젝트 기록으로 남기는 단위입니다.

### 9-3. 툴체인 자유 · 공통/개인 경계

- 각자 로컬 agent 운용 방식(Claude / Codex / 혼합)은 **사적 영역**입니다.
- 팀이 보는 공통 인터페이스는 **GitHub Issue · PR · CI · `docs/`** 뿐입니다.
- **공통 규칙은 `AGENTS.md` + `docs/`에만** 둡니다 (git 공유). 여기엔 개인 규칙을 쓰지 않습니다 — 그래야 서로 섞이지 않습니다.
- **개인 agent 규칙은 각자 git-ignored 파일에** 둡니다. Claude 사용자는 로컬 `CLAUDE.md`(`@AGENTS.md` import + 개인 규칙), 그 외 개인 오버라이드는 `AGENTS.local.md`. 둘 다 `.gitignore`로 제외됩니다.

---

## 10. 금지 사항

- 과도한 workflow 문서 생성
- 무거운 spec/handoff/archive 문서 체계 도입
- DB/API 상세 설계를 기능 확정 전에 과하게 선행
- MSA 구조 제안
- AI 일정 자동 생성 기능을 P0로 복귀시키는 것
- GitLab을 개발 정본으로 설정 (SSAFY GitLab은 제출용 산출물 업로드 전용)
