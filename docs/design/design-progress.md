# TripLog 디자인 정의 진행 (Sprint 4)

> 전체 서비스(trip·log) 화면·컴포넌트 디자인을 **논의 → 확정 → 목업**으로 정의하는 작업의 추적 문서.
> 확정되면 trip/log 트랙이 이 정의를 받아 각자 백엔드·기능에 맞춰 구현한다.

## 확정 디자인 시스템

- **메타포**: 티켓(여행 계획) · 도장(다녀옴+추억 진행) · 폴라로이드(완성된 추억)
- **색**: 종이 베이지 `#ece4d6` / 표면 `#fbf7ee` / 잉크 `#2c2926` / 도장 남색 `#2f4a5c` / 주 액션 테라코타 `#c2693f` / COMPLETE 적색 `#c0392b` / 티켓 빈티지 팔레트(테라·머스타드·세이지·블루·버건디·카키·플럼)
- **타이포**: 본문 Pretendard / 감성·해시태그 Nanum Pen Script
- **시스템 정본**: `design-system.css`(토큰 + 컴포넌트) · `design-system.html`(컴포넌트 카탈로그) ← 모든 화면이 이걸 재사용
- **화면 목업**: `auth-mockup.html` · `profile-mockup.html` · `home-mockup.html` · `trips-mockup.html` · `memory-list-mockup.html`(추억 목록 + 상세 팝업) · `logs-mockup.html`(다녀옴 미리보기·카드 에디터) (컴포넌트 정본·카탈로그 = `design-system.html`)

## 화면 (14) — 상태

상태: ⬜ 미논의 / 🔵 논의 중 / ✅ 확정

| # | 영역 | 화면 | 라우트 | 상태 |
|---|---|---|---|---|
| 1 | 인증 | 로그인 | `/login` | ✅ `auth-mockup.html` |
| 2 | 인증 | 회원가입 | `/signup` | ✅ `auth-mockup.html` |
| 3 | 인증 | 비밀번호 찾기·재설정 | `/forgot-password`·`/reset-password` | ✅ `auth-mockup.html` |
| 4 | 계정 | 프로필/마이페이지 | `/profile` (팝업) | ✅ `profile-mockup.html` |
| 5 | 홈 | 홈 대시보드 | `/` | ✅ `home-mockup.html` |
| 6 | TRIPS | 여행 목록 | `/trips` | ✅ `trips-mockup.html` (티켓·도장 컴포넌트 정본 = `design-system.html`) |
| 7 | TRIPS | 여행 생성·수정 | `/trips/new` (모달) | ✅ `trips-mockup.html` |
| 8 | TRIPS | 여행 개요(상세) | 미리보기 팝업 (개요 흡수) | ✅ `trips-mockup.html` |
| 9 | TRIPS | 관광지 탐색 | `/trips/:id/places` (담기 모드) | ✅ `trips-mockup.html` |
| 10 | TRIPS | 일정 편집 | `/trips/:id/places` (일정 모드) | ✅ `trips-mockup.html` |
| 11 | LOGS | 추억 목록 | `/logs` (신설) | ✅ `memory-list-mockup.html` |
| 12 | LOGS | 추억 상세 | 폴라로이드 클릭 팝업 | ✅ `memory-list-mockup.html` ② |
| 13 | LOGS | 사진 업로드 | 다녀옴 미리보기 팝업에 통합 | ✅ `logs-mockup.html` ① |
| 14 | LOGS | 카드 에디터(추억 만들기) | `/cards/new` (작업 화면) | ✅ `logs-mockup.html` ② |

## 공통 컴포넌트 — 상태

> 정의처 = `design-system.css` (카탈로그 = `design-system.html`)

| 컴포넌트 | 상태 |
|---|---|
| 상단바/네비 | ✅ |
| 버튼 | ✅ |
| 배지·태그 | ✅ |
| 카드류 (티켓·도장·폴라로이드) | ✅ |
| 오버레이 (모달/팝업·토스트·빈 상태·로딩) | ✅ modal·scrim·toast·spinner·skeleton·empty-state |
| 폼 (input·label·버튼·form-link) | ✅ (select·datepicker·textarea 추후) |
| 커스텀 룩 (카카오 지도·빈티지 타임라인·카드 편집 캔버스) | 🔵 지도·타임라인 룩 = `trips-mockup.html` / 카드 캔버스 ⬜ |

## 폐기 대상 (옛 디자인)

- ✅ `frontend-structure.md §5` 디자인 언어(파랑 토스 톤) → 종이/티켓 톤 갱신 (이 PR)
- ✅ 옛 시안 `trip-planner-flow.html` · `log-flow-proposal.html` 삭제 (이 PR)
- ⬜ PrimeVue 파랑 preset(main.js Aura 기본) → 종이/티켓 톤 (코드 개편, 후속)

## 논의 순서

공통 컴포넌트(상단바부터) → 홈 → TRIPS(생성·개요·탐색·일정) → LOGS(사진·에디터) → 인증·프로필.

## 프론트 개편 계획 (디자인 → 코드 적용)

> 이 디자인 정본을 실제 프론트(Vue/PrimeVue)에 적용하는 작업. 개편 이슈 발행 시 본문 베이스.

- **분담**: trip 화면 = trip / log 화면 = log / **공통 토대(design-system 도입·PrimeVue preset·상단바 등) = core**.
- **공통 토대는 먼저 개편에 착수하는 사람이 만든다.** (LOGS 디자인이 우선이라 log는 늦게 착수 → trip이 먼저 깔 가능성.) 첫 착수자가 design-system.css 도입 + 공통 Vue 컴포넌트 추출 + preset 커스텀까지 한다.
- **컴포넌트 재사용 강제**: 공통 컴포넌트(티켓·도장·폴라로이드·모달·폼·토스트·빈상태)는 **Vue 컴포넌트로 추출**해 import만 한다. 화면별로 새로 만들지 않는다 (디자인 정의 단계에서 반복된 실수 — 구조로 막는다).
- **PrimeVue 공존**: 폼 위젯(DatePicker·Select·InputText 등)은 Aura preset 테마링 유지, 고유 컴포넌트(티켓·도장 등)만 직접 구현.
- **리스크**: 1) IA 변경(개요=팝업·탐색+일정 통합·새 여행 모달)은 라우터·workspaceGuard 변경 수반 — 단순 스타일 아님. 2) 목업 = 데스크톱·정적 → 반응형·데이터 바인딩·로딩/빈/에러·긴 텍스트·접근성은 구현에서 추가. 3) LOGS 목업 2개(사진 업로드·카드 에디터) 완료 후 LOGS 개편 착수. 4) 지역·테마 자유 입력 + 해시태그는 백엔드 확장 필요(미지원 시 지역·테마를 태그로 노출).
