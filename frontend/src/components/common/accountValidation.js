// AccountDialog 계정 폼 순수 헬퍼 — 닉네임 검증·API 에러 메시지 추출(DOM·API 무관).
// 컴포넌트 밖 순수 함수라 경계값(빈값·50자·무변경)을 단위 테스트로 직접 검증한다.

const NICKNAME_MAX = 50

// 닉네임 초안 검증. 반환 { ok, value?, error?, unchanged? }.
// unchanged = 현재 닉네임과 같아 저장 없이 편집을 종료해야 하는 경우.
export function validateNickname(draft, currentNickname) {
  const nickname = String(draft ?? '').trim()
  if (!nickname) return { ok: false, error: '닉네임을 입력하세요.' }
  if (nickname.length > NICKNAME_MAX) {
    return { ok: false, error: `닉네임은 ${NICKNAME_MAX}자 이하여야 합니다.` }
  }
  if (nickname === currentNickname) return { ok: false, unchanged: true, value: nickname }
  return { ok: true, value: nickname }
}

// axios 등 에러 응답에서 서버 메시지를 꺼내고, 없으면 fallback 문구를 쓴다.
export function extractApiMessage(e, fallback) {
  return e?.response?.data?.message ?? fallback
}
