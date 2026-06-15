// coverFit.js — 사진 좌표(photo-normalized 0~1) → 카드 캔버스 좌표 변환.
//
// 배경: 사이드카 items의 좌표는 "원본 사진 평면" 기준 0~1 정규화다(OUTLINE_API 좌표 규약).
//   반면 카드 캔버스는 세로 1080×1920 고정이고, 사진은 cover-fit 풀블리드(넘치는 부분 크롭)로 깔린다.
//   따라서 사진 정규화 좌표를 cover-fit 변환을 거쳐 캔버스 좌표로 옮겨야 한다.
//   사진 aspect ≠ 캔버스 aspect 이면 단순 (x*W, y*H) 곱은 어긋난다(크롭 미반영).
//
// 포팅 원본: poc/card/legacy-v3/overlay-prep.mjs 의 toCanvasData (s/dw/dh/ox/oy/pt/radf).
//   순수 함수 — 캔버스 컨텍스트에 의존하지 않는다(단위 테스트 대상).

const DEFAULT_TOLERANCE = 0.03; // 캔버스 밖 판정 여유(overlay-prep 와 동일): -0.03 ~ 1.03 은 보이는 것으로 본다

/**
 * 사진(photoW×photoH)을 캔버스(W×H)에 cover-fit 으로 깔 때의 좌표 변환기를 만든다.
 * @returns {{
 *   s:number, dw:number, dh:number, ox:number, oy:number,
 *   pt:(px:number,py:number)=>[number,number],   // 사진정규화 → 캔버스정규화(0~1)
 *   ptPx:(px:number,py:number)=>[number,number], // 사진정규화 → 캔버스 픽셀
 *   radf:(pr:number)=>number,                     // 사진정규화 반지름 → 캔버스정규화 반지름(폭 기준)
 *   radfPx:(pr:number)=>number,                   // 사진정규화 반지름 → 캔버스 픽셀 반지름
 *   visible:(cx:number,cy:number,tol?:number)=>boolean // 캔버스정규화 좌표가 (크롭 후) 보이는가
 * }}
 */
export function makeCoverFit(photoW, photoH, W, H) {
  if (!(photoW > 0 && photoH > 0 && W > 0 && H > 0)) {
    throw new Error(`makeCoverFit: 잘못된 크기 photo=${photoW}x${photoH} canvas=${W}x${H}`);
  }
  const s = Math.max(W / photoW, H / photoH); // cover-fit: 더 큰 배율로 맞춰 꽉 채움
  const dw = photoW * s;
  const dh = photoH * s;
  const ox = (W - dw) / 2; // 중앙 정렬(넘치는 부분은 좌우/상하로 크롭)
  const oy = (H - dh) / 2;

  const pt = (px, py) => [(ox + px * dw) / W, (oy + py * dh) / H];
  const ptPx = (px, py) => [ox + px * dw, oy + py * dh];
  const radf = (pr) => (pr * dw) / W;
  const radfPx = (pr) => pr * dw;
  const visible = (cx, cy, tol = DEFAULT_TOLERANCE) =>
    cx >= -tol && cx <= 1 + tol && cy >= -tol && cy <= 1 + tol;

  return { s, dw, dh, ox, oy, pt, ptPx, radf, radfPx, visible };
}
