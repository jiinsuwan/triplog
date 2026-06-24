// 카드 에디터 사진별 편집 설정 — 기본값 + 저장본 해석.
// 톤·외곽선 스타일·출력 형식·여백 색 등을 전역으로 두면 사진1 설정이 사진2에 샌다.
// 사진 전환 때 현재 설정을 저장하고, 새 사진의 저장본(없으면 기본값)을 복원하는 계약을 여기 둔다.
export const PHOTO_SETTING_DEFAULTS = {
  toneDown: 0.35,
  format: 'native',
  outlineWidth: 1,
  outlineStyle: 'solid',
  dashLen: 12,
  dashGap: 9,
  padFill: 'blur',
  padColor: '#fdf8ee',
}

// 저장본(부분/없음 가능)을 전체 설정으로 해석한다 — 없는 키는 기본값으로 채운다.
// (이후 폰트 등 키가 추가돼도 옛 저장본이 기본값으로 안전하게 폴백한다.)
export function resolvePhotoSettings(saved) {
  const out = {}
  for (const key of Object.keys(PHOTO_SETTING_DEFAULTS)) {
    out[key] =
      saved && Object.prototype.hasOwnProperty.call(saved, key) ? saved[key] : PHOTO_SETTING_DEFAULTS[key]
  }
  return out
}
