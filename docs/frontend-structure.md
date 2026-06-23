# Frontend 화면 구조 가이드 (제안 / draft)

> **상태**: 🟢 **정본** (S1 회고 베이스 → S2 회고 확장 → **S4에서 시각 디자인 정본을 [docs/design/](design/) 패키지로 교체**) — 이 문서는 **IA·컴포넌트 매핑**의 기준이고, **시각 디자인(색·폰트·컴포넌트·화면 레이아웃)의 정본 = [docs/design/](design/)** (§5, 인덱스 = [design-progress.md](design/design-progress.md)). 화면 세부가 본 문서 IA와 다르면 **docs/design/이 최신·우선**(예: 여행 개요 = 팝업, 탐색+일정 통합).
> **출처**: 프론트 구조 mock(proposal) → **S4 시각 디자인 정본 = [docs/design/](design/)** (메타포 = 티켓·도장·폴라로이드). 옛 시안(trip-planner-flow / log-flow-proposal)과 v3 흡수 계획(§6)은 폐기·대체.
> **선행 정본**: [requirements](requirements.md) · [decisions/0004](decisions/0004-card-poc-result.md) · [architecture](architecture.md) · [router](../frontend/src/router/index.js).

---

## 1. 목적

여행 목록/생성/탐색/일정(Plan)부터 사진/카드(Capture→Share)까지 화면을 **성격별로 올바른 자리에 배치**하기 위한 기준. 핵심 원칙: **탭 바에는 "여행의 큰 단계"만 두고, 도구/보조/계정 기능은 각자 다른 자리에 둔다.**

## 2. 확정 사실 (근거 있는 항목 — 그대로 따른다)

| # | 확정 내용 | 근거 |
|---|---|---|
| C1 | **라우팅 = vue-router**. 화면 전환은 URL 라우트로(`/trips/:id/...`). 보호 라우트는 `meta.requiresAuth` 명시. | [router/index.js](../frontend/src/router/index.js) |
| C2 | **일정(F04) = 날짜별 "순서 있는 리스트" + 드래그 순서조정(P0)**. 동선은 단순 위치 핀. 경로 최적화/TSP는 제외. | [requirements §2-1 F04 / §2-4](requirements.md) |
| C3 | **데이터 출처 구분**: 관광지 = 표준데이터 JSON(DB 적재, 관광공사 큐레이션) / 식당·카페·숙소 = 카카오맵 검색. TourAPI는 P2. | [requirements §4 Q3](requirements.md) |
| C4 | **여행(F02)에 '상태' 속성** 존재(제목·기간·지역·테마·**상태**). 목록/생성/수정/삭제 포함. | [requirements §2-1 F02](requirements.md) |
| C5 | **카드 생성 구조 = 사진 위 overlay(Canvas2D, 편집 가능)**. ⬇ 상세 | [decisions/0004](decisions/0004-card-poc-result.md), [card-poc-v3](poc/card-poc-v3-report.md) |
| C6 | 카드 포맷 = **세로 1080×1920 메인(P0)** / 정사각 1080×1080 = F09(P1). | [requirements §6 Q7](requirements.md) |

### C5 상세 — 카드 화면이 따라야 할 흐름 (옛 방향 폐기)
- **흐름**: 사진 ≤10장 선택 → 객체별 **짧은 문구 LLM**(`{objects:[{label,note}],closing}`) → 사진 위 overlay 자동 배치 → 편집(드래그/문구/외곽선) → **PNG export**.
- **Vision = 업로드 시 SAM2 1회 전처리**(접시 외곽·앵커). **카드당 비전 API 호출 없음.**
- **위치·화살표·외곽선·장식·가독성 = 전부 코드(Canvas2D)**. Konva 미채택, rough.js 미사용.
- 자동 배치 실패(밀집·저대비 사진) 시 **수동 배치 모드 폴백**(편집기 드래그).
- ⚠️ **폐기**: "Vision LLM → 카드 전체 JSON 생성 → Canvas 합성" (옛 가설). UI 문구/구조에 이 방향을 남기지 말 것.
- ✅ **해소**: `requirements.md` F07·§3 AI기능표의 옛 문구는 Sprint 1 회고 PR #32에서 0004 구조로 정정 완료.

## 3. IA (S2 회고에서 승인 — 기록 워크스페이스 확장)

### 3-0. 최상위 IA = 계획/기록 2워크스페이스 + 상태 기반 진입 (S2 회고 채택)

- 정본 디자인 = [docs/design/](design/) 패키지(기록/카드 = design-progress 11·12·14). (옛 와이어프레임 log-flow-proposal·PR #58 — 폐기·대체)
- **계획 워크스페이스**(trip): 여행 생성 → 탐색 → 일정. / **기록 워크스페이스**(log): 완성된 일정 위에 사진을 배치하는 **여행 기록(로그) 뷰** — 지도 + 경로 타임라인 + 미분류 트레이 + 상시 드롭존, 일정 인라인 수정. **"계획한 여행에만 로그"** — 진입은 여행 `status` 기반.
- 기록 뷰 = F14 재정의([requirements v1.2](requirements.md)). 구현 = **S4**(trip 일정 F04 선행 — 일정 완료 시 앞당김 가능).
- `status` 허용값·검증·라우팅 골격은 **S3 core Issue**로 확정한다 (§3-3의 값은 가안).

### 3-1. 여행 내부 네비 = 큰 단계만
`개요 · 관광지 탐색 · 일정 │ 사진 · 카드 (+공유)` — `│`는 trip/log 트랙 구분.
- **공유(F18·F22)는 P2 → 기본 비활성**. 주 공유 행동은 카드 PNG 다운로드.

### 3-2. 탭이 아닌 자리에 두는 것
| 기능 | 자리 | 우선순위 |
|---|---|---|
| 여행 챗봇 | **우하단 플로팅 버튼 → 사이드 채팅** (현재 보는 장소/날짜 맥락 주입) | P1 |
| 보관함(pocket) | **탐색·일정 공통 우측 상시 레일** (담으면 즉시 보임) | P0 |
| AI 자동 일정 | **일정 화면의 ✨ 버튼** (별도 화면 아님) | P2 |
| 위시리스트(저장) | **탐색의 ★저장 필터 / 장소별 ★** | P1 |
| 카드 편집 | **카드 3단계(미리보기·편집) 안** | P1 |
| 여행 기록(로그) 뷰 — F14 재정의 | **기록 워크스페이스 본문** (§3-0, 구 "사진 뷰 토글"을 대체) | P1 (S4) |

### 3-3. 데이터 모델 (제안)
```
Trip { id, title, region, theme, startDate, dayCount, status, days[], pocket[], wish[] }
   status: 'planning' | 'upcoming' | 'past'        // C4의 '상태'
Day  { lodging: placeId | null, stops: Stop[] }     // 숙소는 그 날의 베이스(체크인/아웃) — 시퀀스에 안 섞음
Stop { placeId, type, time?: "HH:MM", memo?, transport }  // 시간·유형·메모·이동수단
   type: 관광지 | 식당 | 카페 | 숙소                  // 아이콘·색·데이터출처와 매핑
   transport: 자동차 | 도보 | 대중교통 | 기타          // 필수 (S2 회고) — 구간 소요시간 표시의 입력
```
- **시간**: 각 stop에 선택적 시각. 순서(드래그)는 그대로 — 시간은 라벨.
- **숙소**: `Day.lodging`으로 분리(연박·야간이동 표현). 관광지/식당/카페만 시퀀스.
- **이동수단 = 필수 필드** (S2 회고). 구간 소요시간: 자동차 = 카카오내비 API / 도보·대중교통 = 추정·수동(카카오 API 미제공). 실이동경로 = P1.
- **사진 ↔ stop = 선택적 연결** (S2 회고 방향 합의): 미배치 사진 = 트레이. EXIF 자동 배치·드래그 재배치 = S4 기록 뷰 Issue. 상세 스키마는 trip 일정 Issue에서 설계(core 리뷰).

### 3-4. 화면별 핵심 규칙
- **홈**: status로 "계획 중·예정 / 다녀온 여행" 분리. 빈 상태 안내. 카드에 상태 배지.
- **개요(상세)**: status로 **모드 분기** — `past`=기록(시간순 타임라인+사진+카드 CTA, 읽기), 그 외=계획(요약+"일정 이어서" CTA). 수정/삭제 버튼 상시.
- **탐색**: 검색어 없으면 **추천 리스트**, 입력 시 **검색 결과**로 라벨 전환(기본 검색어로 후보를 가리지 말 것). 장소 카드에 **데이터 출처 배지**. **장소 상세 패널** 제공. 카테고리에 **숙소** 포함.
- **일정**: stop에 시각·유형 아이콘·메모. **드래그 + 터치 대체 버튼(↑↓× / 이 날 추가)** 둘 다 제공. 숙소는 day 헤더.
- **사진**: 드롭존 + 업로드 큐(EXIF GPS/시간 상태, 실패 재시도) + 여행 연결 상태 + 뷰 토글.
- **카드**: §C5 흐름을 stepper로. 10장 제한·처리 상태·폴백·PNG 완료 표시.

### 3-5. 흐름(CTA) · 반응형 · 접근성
- **CTA 체인**: 일정 → "사진 업로드" / 사진 → "카드 만들기" / 카드 → "PNG 다운로드".
- **반응형**: 3열 레이아웃은 좁은 폭에서 단을 쌓고 가로 overflow 금지. 상단 바 wrap, 좁은 폭에서 URL바 숨김.
- **접근성**: 아이콘 버튼(★ 💬 ⚙ × ↑↓ ＋)에 `aria-label`, 터치 타깃 ≥34px.

## 4. 열린 결정 (합의 필요)
1. **위시리스트 귀속** — 여행별 vs 계정 전역(마이페이지). 현재 제안은 탐색 ★필터(여행별).
2. **테마 필드 용도** — 추천/카드 톤에 쓸지, 안 쓰면 F02에서 제거할지.
3. **탐색·일정 통합 여부** — 두 탭을 "계획" 한 탭의 토글로 합칠지.
4. ~~requirements F07 본문 정정~~ — 완료(PR #32).

## 5. 정본 디자인 (S4 채택 — docs/design/ 패키지)

- **정본 = [docs/design/](design/)** — 인덱스 [design-progress.md](design/design-progress.md), 컴포넌트 정본 [design-system.css](design/design-system.css)·카탈로그 [design-system.html](design/design-system.html), 화면 목업(목록·생성·미리보기·탐색·일정 = [trips-mockup.html](design/trips-mockup.html), 인증·프로필·홈·추억 등). **색·폰트·컴포넌트·화면 레이아웃의 기준.** (옛 시안 trip-planner-flow / log-flow-proposal 폐기)
- **디자인 언어**: Pretendard(본문) + Nanum Pen Script(감성·해시태그) / 배경 종이 베이지 `#ece4d6`·표면 `#fbf7ee` / 잉크 `#2c2926`·`#8a8276`·`#b6ab97` / 주 액션 테라코타 `#c2693f` / 도장 남색 `#2f4a5c` / COMPLETE 적색 `#c0392b` / 티켓 빈티지 팔레트(테라·머스타드·세이지·블루·버건디·카키·플럼). **메타포 = 티켓(계획)·도장(다녀옴+추억 진행)·폴라로이드(완성된 추억).**
- **PrimeVue 적용**: Aura preset을 `definePreset`로 위 토큰(primary=테라코타 + Pretendard + 종이 surface)에 맞춘다. 폼 위젯(DatePicker·Select·InputText 등)은 **PrimeVue 유지(테마링)**, 티켓·도장·폴라로이드 등 고유 컴포넌트는 design-system 기반 직접 구현.
- **공통 컴포넌트는 design-system에서만 정의하고 화면별로 새로 만들지 않는다.** 개편 시 **Vue 컴포넌트로 추출**(TicketCard·Stamp·Polaroid·BaseModal 등)해 재사용을 구조적으로 강제한다.

## 6. v3에서 흡수할 비주얼 (폐기 — §5 docs/design/로 대체)

> 아래는 옛 흡수 계획이다. **시각 정본은 §5(docs/design/)** 이며, 이 항목들은 그 목업에 반영·대체되었다. 기록만 남긴다.

proposal IA를 유지하되, v3(팀원)의 아래 비주얼을 가져온다:
- **홈**: 강한 히어로 카피 + 여행 카드 갤러리(story-grid) 무드.
- **카드/공유**: 사진 풀배경 + `DAY n · 지역` 스탬프 + 감성 한두 줄(share-card). 단 **카드 생성 흐름은 0004(overlay 편집·stepper) 유지** — v3의 정적 카드는 비주얼 참고만.
- **사진**: masonry 타일(시간 라벨) — 사진 라이브러리 뷰 무드.
- **탐색**: 검색바(lens) + 지역/카테고리 탭 + 지도 줌 컨트롤(+/−/⌂).
- **분할 화면**: 좌/우 패널 폭 드래그 리사이즈 — 선택 편의.
- **일정**: 지도 위 "노드 드래그로 선 연결" 제스처 — proposal 경로빌더와 절충.

## 7. 화면 → PrimeVue 컴포넌트 매핑

> 실제 룩은 구현하며 PrimeVue Aura로 확정. **"커스텀"은 PrimeVue에 없어 직접 구현**.

| 화면 / 요소 | PrimeVue (Aura) |
|---|---|
| 상단바·브레드크럼·아바타 | `Menubar`(또는 커스텀) · `Breadcrumb` · `Avatar` |
| 여행 탭(개요·탐색·일정·사진·카드) | `Tabs`(TabMenu) |
| 구성 토글 패널 | `Drawer`/`Popover` + `ToggleSwitch` |
| 홈 여행 그리드 + 상태 배지 | `DataView` + `Card` + `Tag` |
| 여행 생성/수정 폼 | `InputText`·`DatePicker`·`Select`·`SelectButton`·`Textarea` + `Button` + `Message` |
| 탐색 검색바 | `IconField` + `InputText` |
| 카테고리 / ★저장 필터 | `SelectButton` / `ToggleButton` |
| 장소 리스트 + 출처 배지 + ★ | `DataView` + `Tag` + `Button`(toggle) |
| **지도·핀·경로·노드연결** | **카카오맵 SDK + 커스텀** (PrimeVue 없음) |
| 장소 상세 패널 | `Drawer` |
| 보관함 레일 | 커스텀 `Card` + 리스트 |
| 일정 날짜 탭 / stop 리스트 | `Tabs` + **커스텀 DnD** + `Button`(↑↓×) + `Textarea` |
| 개요 타임라인 | `Timeline` + `Card` |
| 사진 드롭존·업로드 큐 | `FileUpload` + 커스텀 큐 + `Tag`(EXIF 상태) |
| 사진 뷰 토글(그리드/지도/타임라인) | `SelectButton` + `DataView`/`Galleria` |
| 카드 단계 | `Steps` |
| 카드 사진 고르기(≤10) | 커스텀 그리드 + `Checkbox` |
| **카드 overlay 캔버스(편집)** | **Canvas2D 커스텀** — 렌더 모듈 `frontend/src/card/render/`(coverFit·buildScene·renderCore, S3-LOG-04). 0004 기반 |
| 챗봇 FAB→사이드 | `Button`(FAB) + `Drawer` + 커스텀 말풍선 |
| 알림 | `Toast` |

→ **커스텀 필요(3곳)**: 지도(카카오), 카드 overlay 캔버스, 일정 드래그/경로. 나머지는 표준 컴포넌트로 커버.

## 8. 변경 이력
| 버전 | 날짜 | 변경 |
|---|---|---|
| draft v0 | 2026-06-08 | 프론트 구조 mock + 교차 리뷰 기반 초안. 미승인. |
| v1 | 2026-06-09 | 정본 채택(docs/design/trip-planner-flow.html) + v3 비주얼 흡수(§6) + PrimeVue 컴포넌트 매핑(§7). F07 정정 완료(PR #32) 반영. |
| v2 | 2026-06-12 | **S2 회고 반영**: 기록/카드 흐름 와이어프레임(log-flow-proposal.html, PR #58) 정본 채택 — 계획/기록 2워크스페이스 + 상태 기반 진입(§3-0) / Stop에 transport 필수 필드 / 사진↔stop 선택적 연결 방향 / F14 = 기록 뷰 재정의(S4) |
| v3 | 2026-06-23 | **S4 디자인 반영**: 시각 디자인 정본을 docs/design/ 패키지(design-system + 화면 목업)로 교체. 옛 시안 trip-planner-flow·log-flow-proposal 폐기. 디자인 언어 = 종이/빈티지 티켓 톤(테라코타·도장 남색), 메타포 = 티켓·도장·폴라로이드. 화면 세부는 docs/design/ 우선. |
