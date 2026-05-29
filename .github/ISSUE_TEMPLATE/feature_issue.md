---
name: Feature / Task
about: Sprint 단위 작업 티켓 (AI agent에게 전달할 작업 계약서)
title: "[S?-TRACK-??] "
labels: []
assignees: []
---

## Goal

이 Issue에서 완성할 목표를 한두 문장으로 적습니다.

## Scope

**포함할 작업**
-

**포함하지 않을 작업 (Non-goals)**
-

## Acceptance Criteria

- [ ]
- [ ]

## Test Criteria

- [ ] 테스트 코드 추가 또는 기존 테스트 통과
- [ ] 예외 케이스 확인
- [ ] GitHub Actions 통과

## Dependencies & Impact

- **Blocked by**: 먼저 머지돼야 하는 Issue (예: `#3`) / 없으면 `없음`
- **Shared area?**: core 공유 영역(인증·공통응답·DB·CI·공통UI 등) 변경 여부 — `YES`면 상대 트랙 리뷰 필수 / `NO`
- **예상 영향 영역**: 건드릴 패키지·파일 (예: backend `auth/`, `common/`)

## Definition of Done

- [ ] AC / Test 충족 + CI green
- [ ] (공유 영역이면) 상대 트랙 리뷰 승인
- [ ] (API면) Swagger 노출

## Notes

- 관련 API / 화면 / 참조 문서:

---

<!--
작성 가이드 (자세한 규칙: docs/conventions.md)

- 제목 형식: [S{Sprint번호}-{TRACK}-{번호}] 작업명  (TRACK = CORE | TRIP | LOG)
  예) [S1-TRIP-01] 여행 CRUD API
- 라벨: track:core/trip/log + priority:p0/p1/p2
- 1 Issue = 1 PR. 범위가 크면 쪼갠다.
- AI agent에게 넘길 때 이 본문을 그대로 컨텍스트로 사용합니다.
-->
