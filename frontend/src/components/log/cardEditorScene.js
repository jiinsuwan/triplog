// 카드 에디터 → buildScene 입력 준비용 순수 변환. Vue 상태와 무관 — 단위 테스트 대상.
// 문구·마무리 객체에 사용자 override(위치·기울기)를 입혀 미리보기·export 공용 입력으로 만든다.

// obj 에 위치·기울기 override 를 입힌다.
//   p   = 캔버스 정규화 위치 { x, y }(0~1) 또는 null(없으면 자동 배치 유지).
//   rot = 기울기(°). 0/거짓이면 회전 미적용.
//   cr  = 콘텐츠 크롭 { dx, dy, cw, ch }, cd = 콘텐츠 캔버스 { W, H }.
// position 은 캔버스 정규화 → 콘텐츠 정규화(0~1)로 환산한다. 둘 다 없으면 원본 그대로 반환.
export function applyOverrides(obj, p, rot, cr, cd) {
  let out = obj
  if (p) out = { ...out, position: { x: (p.x * cd.W - cr.dx) / cr.cw, y: (p.y * cd.H - cr.dy) / cr.ch } }
  if (rot) out = { ...out, rotation: rot }
  return out
}
