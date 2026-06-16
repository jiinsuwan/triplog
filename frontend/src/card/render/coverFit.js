// coverFit.js — 사진 좌표(photo-normalized 0~1) → 카드 캔버스 좌표 변환.
//
// 배경: 사이드카 items의 좌표는 "원본 사진 평면" 기준 0~1 정규화다(OUTLINE_API 좌표 규약).
//   캔버스 크기는 호출자가 정한다 — 제품 렌더는 캔버스를 사진 비율로 둬 cover-fit 이 항등(crop 0)이다.
//   캔버스 ≠ 사진 비율이면 cover-fit 으로 넘치는 부분이 크롭되지만, 현재 제품 경로엔 그런 호출이 없다
//   (렌더=사진비율, 세로 9:16 맞춤은 #73 내보내기에서 위아래 패딩으로 처리).
//   사진 aspect ≠ 캔버스 aspect 이면 단순 (x*W, y*H) 곱은 어긋나므로 이 변환이 필요하다.
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
