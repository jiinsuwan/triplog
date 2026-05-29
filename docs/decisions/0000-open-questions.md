# Decision 0000 — Open Questions

- **상태**: **Resolved (2026-05-29 세션 완료)** — 잔여는 Q6뿐
- **갱신일**: 2026-05-29

> ✅ **2026-05-29 세션 결과**: §F 어젠다 완료. `requirements.md`·`architecture.md`·`roadmap.md` **v1 승격**, `conventions.md`에 스프린트 운영 사이클(§1-1) 추가.
> - **결정 근거**는 각 문서 본문·변경이력에 기록 (별도 ADR 생성 안 함 — 사용자 결정).
> - **잔여 미결**: **Q6**(텍스트/Vision LLM 모델) — 카드 PoC 후 `0004-card-poc-result.md`에서 확정. **N5**(스티커 시트) — PoC 때.
> - **개발 시작 전 사람 작업**: 로컬 → `github.com/jiinsuwan/triplog` git 연결 + `docs/` push / branch protection(GitHub UI).
> - **다음**: Sprint 0 — `docs/sprints/sprint-0.md` 작성 → 셋업 Issue + 카드 PoC 착수.
>
> 아래 §A~§G는 세션 진행용 기록 (대부분 Resolved, 상세는 각 문서 v1 참조).

---

## A. 팀·인프라 — Resolved (2026-05-29)

- **저장소**: `github.com/jiinsuwan/triplog` 이미 생성됨, 양측 push 가능 (T1·T2·T3 해소)
- **Visibility**: Private — 포트폴리오 공개는 정리 후 (T5)
- **Branch protection**: `main` 보호 + PR 1명 이상 리뷰 (T4) — GitHub UI에서 세팅 (사용자 작업)
- **N4 SSAFY GitLab**: 별도 제출 규칙 없음 — 필요 시 추후 결정
- **남은 작업**: 로컬 `triplog/` 폴더를 위 저장소에 연결해 오늘 만든 `docs/` 푸시 (아래 F-6 참고)

## B. 기능 우선순위 (requirements.md §6)

| # | 항목 | 차단 수준 | 잠정안 |
|---|---|---|---|
| Q1 | F04 일정 에디터 드래그앤드롭 | Sprint 2 진행 시 | P1 강등 (단순 입력으로 P0) |
| Q2 | F15 영상 기능 우선순위 | Sprint 4 진행 시 | P1 유지 + 미니 PoC 결과로 재결정 |
| Q7 | 카드 우선 크기 (피드만 P0 vs 스토리 포함) | Sprint 4 진행 시 | 피드 1080×1080만 P0 |
| Q8 | **P0 누락 후보 점검** (프로필 수정 / 로그아웃 / 사진 삭제 / 여행 삭제 등 기본 운영 기능을 P0에 명시할지) | Sprint 1 진행 시 | 잠정: F01·F02에 포함된 것으로 간주. 명시 분리 X |

## C. 데이터·외부 시스템 (architecture.md §10, requirements.md §6)

| # | 항목 | 차단 수준 | 잠정안 |
|---|---|---|---|
| Q3 / A2 | 관광지 데이터 소스 (TourAPI vs 표준데이터 JSON) | Sprint 1~2 진행 시 | 표준데이터 JSON 1종, TourAPI는 P2 |
| Q5 / A2 | 사진 저장소 (로컬 / S3 / 학교 서버) | Sprint 3 진행 시 | 로컬 + S3 fallback |
| **N5** | **PoC 스티커 시트 출처·라이선스** (AI 생성 / 직접 / 무료 자산) | Sprint 0 PoC Step 3 시 | 무료 자산 + 본인 직접 제작 (AI 이미지 생성은 비용 통제 원칙상 회피) |

## D. 기술 선택 (architecture.md §10)

| # | 항목 | 차단 수준 | 잠정안 |
|---|---|---|---|
| Q4 / A1 | ORM (MyBatis vs JPA) | Sprint 0 backend 세팅 시 | **MyBatis** (블루프린트 기본) |
| Q6 / A4 | 텍스트 LLM 모델 | Sprint 0 카드 PoC 중 | SSAFY GMS key 우선, PoC 결과 후 확정 |
| A3 | Refresh Token 도입 여부 | Sprint 1 인증 시 | Access Token만으로 시작 (P1에서 재검토) |
| A5 | 공통 응답 형식 (`code` string vs int) | Sprint 1 시작 시 | string code (`AUTH_001` 형태) |
| D1 | **Java 버전 / 빌드 도구** | Sprint 0 backend 세팅 시 | Java 17 + Gradle (SSAFY 표준 따르면 그대로) |
| **N1** | **DB 마이그레이션 도구** (Flyway / Liquibase / 수동 SQL) | Sprint 1 첫 테이블 생성 시 | Flyway (Spring Boot 친화) |
| **N2** | **DB 명명 규칙** (테이블·컬럼·PK·FK) | Sprint 1 첫 테이블 생성 시 | 테이블·컬럼 snake_case / PK `id` / FK `{table}_id` |
| **N3** | **API 명세 도구** (Swagger / SpringDoc 사용 여부) | Sprint 1 첫 API 작성 시 | SpringDoc OpenAPI (자동 생성) |

---

## E. 결정 순서·의존성

```text
[1] 다음 세션 — §F 어젠다대로 섹션별 같이 보며 합의
    ├─ G-1 requirements.md  → 기능 P0/P1/P2 분류 (B)
    ├─ G-2 architecture.md  → 기술 선택 (D + N1·N2·N3)
    ├─ G-3 데이터·저장소     → C (Q3·Q5·N5)
    ├─ G-4 roadmap.md       → Sprint 0 Issue 후보 + 분담
    └─ G-5 인프라           → A: T1·T2·T3·N4
         │
         ▼  v0 → v1 승격, 결정별 ADR 신설
         │
[2] 다음 세션 직후 (또는 현장에서)
    triplog/ git init → 새 Org/Repo 푸시 → 팀원 collaborator 초대
         │
         ▼
[3] Sprint 0 시작
    ├─ [S0-CORE-*] 인프라 (Vue/Spring Boot init, CI 활성화)
    └─ [S0-LOG-01] 카드 PoC ── 이 단계에서 Q6, Q5 최종 결정
```

**병목**: Q4(ORM) 미정 시 backend 세팅 막힘. T1~T3 미정 시 git init/푸시 막힘. N1·N2·N3 미정 시 Sprint 1 첫 작업 마찰.

---

## F. 다음 세션 어젠다 (섹션별 같이 보며 즉석 진행)

각 단계에서 **Claude가 진행을 어떻게 도울지**를 함께 적었습니다. 사용자/팀원은 의견만 던지면 Claude가 그 자리에서 파일 수정까지 끝냅니다.

### F-0. 시작
- **Claude 진행**:
  1. 본 문서 §A~§D 표를 같이 띄워 오늘 다룰 범위 인지
  2. 이 세션의 흐름과 산출물(`requirements.md` / `architecture.md` / `roadmap.md` v1 + 결정별 ADR) 안내

### F-1. `requirements.md` 같이 보기
- **Claude 진행**: 섹션 순서대로 화면에 띄우고 합의하면서 즉시 Edit.
  1. **§1 제품 정의** (한 줄 정의 + Plan/Capture/Share 여정 + 차별점) — 의문/수정 받기
  2. **§2-1 P0 목록** (8개) — 항목별 OK / 수정 / 제거 / 추가 받기. 특히 **Q1 (F04 드래그앤드롭)**, **Q7 (F07 카드 크기)** 결정. **Q8 (P0 누락 후보 점검)**도 여기서 — 로그아웃·프로필·삭제 동작이 F01/F02에 포함되는지 명시 확인
  3. **§2-2 P1**, **§2-3 P2**, **§2-4 제외** — **Q2 (F15 영상)** 결정 포함
  4. **§3 AI 기능 범위** — 의문 받기 (Q6은 PoC 후 결정이라 여기서 안 정함)
  5. **§4 외부 API** — Q3는 §F-3에서 결정. 다른 API는 의문만
  6. **§5 화면 구성** — 의문/추가 받기
- **산출**: `requirements.md` v1 (Q3 보류, 나머지 결정 반영)

### F-2. `architecture.md` 같이 보기
- **Claude 진행**: 섹션 순서대로 띄우고 즉시 Edit.
  1. **§1 시스템 구성** + **§2 백엔드 패키지** + **§3 프론트엔드 구조** — 의문 받기
  2. **§4 공통 API 응답 형식** → **A5 결정**
  3. **§5 DB 엔티티 방향** — 의문 받기. **N1 (DB 마이그레이션 도구), N2 (DB 명명 규칙) 결정**
  4. **§6 AI 호출 인프라** — 의문 받기 (Q6은 PoC 후)
  5. **§7 인증** → **A3 결정** (Refresh Token 여부)
  6. **§8 환경변수** — 의문 받기. Q5는 §F-3에서
  7. **§10 결정 필요** → **Q4 (ORM), D1 (Java 버전 / Gradle), N3 (API 명세 도구) 결정**
- **산출**: `architecture.md` v1 (Q5 보류, 나머지 결정 반영)

### F-3. 데이터·저장소 — §C 보완
- **이 단계를 따로 두는 이유**: F-1 §4와 F-2 §1·§8 양쪽에 영향. 합쳐서 한 번에 정해야 일관성 유지.
- **Claude 진행**:
  1. **Q3 (관광지 데이터 소스)**: TourAPI vs 표준데이터 JSON 옵션 제시 → 결정
  2. **Q5 (사진 저장소)**: 로컬 / S3 / 학교 서버 옵션 제시 → 결정
  3. **N5 (PoC 스티커 시트 출처)**: 무료 자산 / 직접 제작 / AI 생성 → 결정. 카드 PoC에 직접 영향
- **산출**: `requirements.md` §4, `architecture.md` §1·§8, `roadmap.md` Sprint 2~3 갱신 + `decisions/0006-tour-data-source.md`, `0007-photo-storage.md` 신설 계획. N5는 `card-poc.md` §3-3 보강

### F-4. `roadmap.md` 같이 보기 + Sprint 0 세부
- **Claude 진행**:
  1. Sprint 0 ~ Sprint 4 흐름 한 번 훑기
  2. **Sprint 0 Issue 후보** (S0-CORE-01 ~ S0-LOG-03) 항목별로 띄우기
  3. 누가 어떤 Issue 맡을지 분담 받아 표 작성
  4. 분량 부족/과하면 Issue 분할·병합 제안
  5. F-1에서 정해진 P0 변동 사항이 Sprint 1 Issue 후보에 영향 있으면 같이 반영
- **산출**: `roadmap.md` v1 + Sprint 0 Issue 제목 리스트 확정 (다음 세션 끝나면 GitHub에 그대로 등록 가능)

### F-5. 인프라 — §A
- **Claude 진행**: T1·T2·T3·T4·T5·**N4** 항목 띄우기. 결정되면 즉시 §A 표에서 제거
- **사용자/팀원이 할 것** (브라우저, Claude 직접 못 함):
  1. GitHub Organization 생성 (T1)
  2. Repository 생성 (T2)
  3. 팀원 collaborator 초대 (T3)
  4. Branch protection 설정 (T4), Visibility 설정 (T5)
- **N4 처리**: SSAFY GitLab에 무엇을·언제·어떻게 업로드할지 결정. `artifact/` 폴더 활용 방식 확정
- **산출**: T1~T5, N4 모두 Resolved

### F-6. 마무리
- **Claude 진행**:
  1. 본 문서 §A~§D에서 Resolved 항목 제거
  2. 결정별 ADR 파일 생성 (예: `0005-orm.md`, `0006-tour-data-source.md`, `0007-photo-storage.md`, `0008-db-migration.md`, `0009-ssafy-gitlab-sync.md`)
  3. v0 → v1 승격된 문서들의 "변경 이력"에 v1 항목 추가, 헤더 상태 변경
  4. `git init` 명령 + 초기 푸시 명령을 한 블록으로 제안 (사용자 손으로 실행)
- **사용자/팀원이 할 것**: Sprint 0 시작 일정 합의, 다음 싱크 시점 정하기

---

## G. 결정 → 반영 파일 매핑

> ※ **2026-05-29**: 별도 ADR(0005~0009) 생성하지 않기로 결정. 모든 결정 근거는 각 문서(requirements/architecture/roadmap) 본문·변경이력에 기록됨. 아래 표의 "별도 ADR 신설" 열은 **무효**.

| 결정 항목 | Edit 대상 파일·섹션 | 별도 ADR 신설 |
|---|---|---|
| Q1 일정 에디터 드래그앤드롭 | `requirements.md` §2 (F04 행 P0/P1) | 단순 우선순위 변경이면 X |
| Q2 영상 기능 | `requirements.md` §2-2/§2-3 (F15), `roadmap.md` Sprint 4 | 의견 갈리면 신설 |
| Q3 관광지 데이터 소스 | `requirements.md` §4, `roadmap.md` Sprint 2 (S2-TRIP-01) | **`0006-tour-data-source.md` 신설** |
| Q4 ORM | `architecture.md` §1, §2 (패키지 의존성 영향) | **`0005-orm.md` 신설** |
| Q5 사진 저장소 | `architecture.md` §1, §8, `roadmap.md` Sprint 3 (S3-CORE-01) | **`0007-photo-storage.md` 신설** |
| Q6 LLM 모델 | Sprint 0 PoC 종료 후 `0004-card-poc-result.md` | (이 세션 결정 X) |
| Q7 카드 우선 크기 | `requirements.md` §2 (F07/F09 행) | X |
| Q8 P0 누락 후보 | `requirements.md` §2-1 (F01·F02 행에 "로그아웃 / 프로필 수정 / 삭제 포함" 한 줄 추가) | X |
| A3 Refresh Token | `architecture.md` §7 | X |
| A5 응답 형식 | `architecture.md` §4 | X |
| D1 Java 버전 / 빌드 도구 | `architecture.md` §1, `.github/workflows/ci.yml` (Java 버전 확정) | X |
| **N1 DB 마이그레이션 도구** | `architecture.md` §5 (도구 한 줄 추가), `backend/build.gradle` (Sprint 0~1에서 의존성) | **`0008-db-migration.md` 신설** |
| **N2 DB 명명 규칙** | `architecture.md` §5 (명명 규칙 한 줄 추가) | X (architecture.md 안 한 줄로 충분) |
| **N3 API 명세 도구** | `architecture.md` §4 (도구 한 줄 추가) + `backend/build.gradle` (Sprint 0~1에서 springdoc 의존성) | X |
| **N4 SSAFY GitLab 업로드 정책** | 본 문서 §A 표에서 제거 + `conventions.md` 새 §11 "산출물 제출" 단락 추가 | **`0009-ssafy-gitlab-sync.md` 신설** |
| **N5 PoC 스티커 시트** | `docs/poc/card-poc.md` §3-3 보강 | X (PoC 결과 ADR `0004`에 흡수) |
| T1 Org명 | 본 문서 §A 표에서 제거. **다른 문서에 hardcode 금지** (URL은 README의 env 안내에만) | X |
| T2 Repo명 | 본 문서 §A 표에서 제거 | X |
| T3 팀원 GitHub 계정 | 본 문서 §A 표에서 제거. CONTRIBUTORS 같은 파일은 만들지 않음 | X |
| T4 Branch protection | 본 문서 §A 표에서 제거. 세팅은 GitHub UI에서 (코드 영향 X) | X |
| T5 Repo visibility | 본 문서 §A 표에서 제거 | X |

**v1 승격 시 공통 작업**:
- 각 문서 맨 위 "**상태**: v0 초안" → "**상태**: v1 Accepted" 변경
- 맨 아래 "변경 이력"에 v1 항목 추가
- 결정 항목이 본 문서에서 제거되면, 본 문서 §A~§D 잠정안 표 행 삭제

---

## H. 합의 완료 후 후속 작업 (다음 세션 종료 후)

- [ ] `triplog/` 에서 `git init`
- [ ] 새 GitHub Org / Repo 에 push (사용자 손, Claude는 명령만 제안)
- [ ] 팀원 collaborator 초대 (사용자 손)
- [ ] Branch protection 설정 (사용자 손)
- [ ] GitHub Actions CI 활성화 (`ci.yml`의 `if: false` 제거)
- [ ] Sprint 0 Issue 생성 (Issue 제목 + 본문 작성)
- [ ] Sprint 0 작업 시작 — 카드 PoC + 인프라 세팅 병행
- [ ] PoC 종료 후 `decisions/0004-card-poc-result.md` 작성

---

## 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| v0 | 2026-05-22 | 기획 v0 초안 작성 중 발견된 미결 항목 단일 색인화 |
| v1 | 2026-05-22 | 결정 의존성·사용자 사전 검토·팀원 사전 공유·세션 어젠다 추가 |
| v2 | 2026-05-22 | 사전 검토/공유 섹션 제거. 다음 세션 즉석 합의 전제로 5분 요약·어젠다·매핑 추가 |
| v3 | 2026-05-22 | 5가지 관점(진입/즉시반영/완결성/순서/일관성)으로 자체 검토 후 반영. Q8·D1 결정 항목 추가, 어젠다 섹션별 흐름으로 재구성 |
| **v4** | **2026-05-22** | **시뮬레이션에서 빠진 결정 항목 5개(N1~N5: DB 마이그레이션·DB 명명·API 명세 도구·SSAFY GitLab 업로드 정책·PoC 스티커 시트) 추가. 어젠다 §F-2·§F-3·§F-5에 결정 단계 보강, §G 매핑에 5행 추가 (N1·N4는 ADR 신설, N2·N3·N5는 단순 갱신)** |
