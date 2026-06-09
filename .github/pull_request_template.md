## Related Issue
- closes #

## Summary (무엇을 · 왜)
-

## Agent 작업 (에이전틱 협업 로그)
- **Agent 입력**: 어떤 Issue / 프롬프트를 agent에게 줬는지
- **Agent가 바꾼 것**: 주요 변경 요약 (파일 · 동작)
- **사람이 검토한 것**: 직접 확인 · 수정한 부분

## 테스트 증거
- [ ] 로컬 테스트 통과 (명령 / 결과 첨부)
- [ ] GitHub Actions 통과
- [ ] 화면 / API 확인 (스크린샷 · 응답 등)

## 공유 영역 영향
- [ ] **공유 영역(core)** 변경 있음 → 상대 트랙 리뷰 필수
  (DB schema / 인증 / 공통 응답 / 공통 UI / router 가드·layout / build / CI / env)
- 영향 내용:

## self-merge 게이트 (트랙 내부 변경 시 — 공유 영역이면 생략하고 상대 리뷰)
- [ ] 자기 트랙 파일만 변경 (공유 영역 §6-3 미접촉)
- [ ] CI green (base=main — stacked 아님)
- [ ] **냉정한 리뷰 1회** — 새 세션/다른 AI 적대적 리뷰 (결과 요약·링크 ↓)
  -
- [ ] (라우트 추가 시) `requiresAuth` 명시 + 라우트 테스트 통과
- [ ] 사람 최종 확인 + 상대에게 알림

## 잔여 리스크 / 후속
-

---
<!--
작성 가이드 (자세한 규칙: docs/conventions.md)

- PR 제목 = Issue 제목 `[S?-TRACK-??] 작업명`. docs/chore 성격 PR은 conventional 형식(`docs: ...`, `chore: ...`)도 허용.
- 자기 트랙 내부 변경은 self-merge 가능하되 상대에게 알림은 남깁니다.
- 공유 영역 변경은 PR 리뷰 필수 — 위 "공유 영역 영향"에 반드시 명시하세요.
- 이 PR 본문 자체가 "AI agent와 어떻게 협업했는지"의 기록입니다. Agent 작업 칸을 비우지 마세요.
-->
