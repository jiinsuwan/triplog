// overlay-place.mjs — "사진 위 다꾸 overlay" 배치 엔진 (코드/규칙 기반)
//   입력: 측정용 ctx, 캔버스 W/H, occupancy field, 사진별 데이터(객체 앵커+문구), (옵션) 접시 폴리곤
//   출력: render-overlay.renderOverlay 가 그리는 spec
//
//   규칙:
//    - 노트는 객체 주변 "빈 공간"에 둔다(occupancy 최소 + 다른 노트/객체 회피 + 가장자리 선호).
//    - 노트→객체는 짧은 곡선 점선 화살표로 연결.
//    - 밝은 배경 위 노트 뒤에는 국소 소프트 음영(밝을수록 강).
//    - 접시는 얇은 흰 스케치 외곽선(폴리곤 있으면 폴리곤, 없으면 타원).
//    - 장식은 작게, 총량 캡.

import { boxOccupancy, boxLuminance } from './freespace.mjs';

const DIRV = {
  ul: [-1, -1], u: [0, -1], ur: [1, -1], l: [-1, 0], r: [1, 0], dl: [-1, 1], d: [0, 1], dr: [1, 1],
};
const ALLDIRS = ['ur', 'ul', 'r', 'l', 'dr', 'dl', 'u', 'd'];

function unit(v) { const m = Math.hypot(v[0], v[1]) || 1; return [v[0] / m, v[1] / m]; }
function overlap(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy;
}

export function layoutOverlay({ ctx, W, H, field, data, polys = {} }) {
  const photo = { x: 0, y: 0, w: W, h: H };
  const noteSize = Math.round(W * 0.034);   // GPT 톤처럼 작고 섬세하게 (붐비는 사진에서 자리 확보도 ↑)
  const noteFont = 'East Sea Dokdo';
  const margin = Math.round(W * 0.035);
  const spec = { W, H,
    tone: { brightness: 0.95, contrast: 1.05, saturate: 1.05, warmth: data.warmth ?? 0.05, vignette: 0.14, ...(data.tone || {}) },
    outlines: [], darkens: [], arrows: [], notes: [], doodles: [], closing: null };

  const placedBoxes = [];                          // 노트 박스 누적(회피)
  const objCircles = data.objects.map(o => ({ x: o.cx * W - o.r * W, y: o.cy * H - o.r * W, w: o.r * 2 * W, h: o.r * 2 * W }));

  ctx.font = `${noteSize}px "${noteFont}"`;
  const lh = noteSize * 1.3;

  const yMaxClear = H - margin - Math.round(W * 0.052) * 2.4;   // 하단 마무리 한 줄 자리 확보

  let oi = -1;
  for (const o of data.objects) {
    oi++;
    const ax = o.cx * W, ay = o.cy * H, ar = o.r * W;
    const lines = o.note;
    const boxW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const boxH = lines.length * lh;
    const gap = noteSize * 1.5;                       // 객체와 거리 ↑ → 화살표가 또렷이 보이도록

    // 수동 위치(편집기 드래그)가 있으면 그대로 사용 — 자동 탐색 생략
    let best = null, bestScore = Infinity;
    if (o.npos) {
      best = { x: o.npos.x, y: o.npos.y, w: boxW, h: boxH };
      best.d = unit([(best.x + boxW / 2) - ax, (best.y + boxH / 2) - ay]);
    }
    // 후보 방향 × 거리(가까이/멀리) — 더 깨끗한 빈 공간을 찾도록
    const dirs = best ? [] : [o.dir, ...ALLDIRS.filter(d => d !== o.dir)].filter(Boolean);
    for (const dk of dirs) {
      const d = unit(DIRV[dk]);
      const halfSpan = 0.5 * (Math.abs(d[0]) * boxW + Math.abs(d[1]) * boxH);
      for (const mul of [1.0, 1.7]) {
        const dist = ar + gap * mul + halfSpan;
        const bcx = ax + d[0] * dist, bcy = ay + d[1] * dist;
        const x0 = bcx - boxW / 2, y0 = bcy - boxH / 2;
        if (x0 < margin || y0 < margin || x0 + boxW > W - margin || y0 + boxH > yMaxClear) continue;
        const box = { x: x0, y: y0, w: boxW, h: boxH };
        const occ = boxOccupancy(field, photo, x0, y0, boxW, boxH);
        let ovl = 0;
        for (const p of placedBoxes) ovl += overlap(box, p);
        for (const c of objCircles) ovl += overlap(box, c) * 0.6;
        const ovlRatio = ovl / (boxW * boxH);
        const bx = bcx / W, by = bcy / H;
        const edge = Math.min(bx, 1 - bx, by, 1 - by);     // 0=가장자리, 0.5=중앙 → 가장자리 선호
        // 분산 — 이미 놓인 노트와 가까우면 페널티(뭉침 방지). 박스가 겹치면 강한 추가 페널티.
        let spread = 0;
        for (const p of placedBoxes) {
          const dd = Math.hypot(bcx - (p.x + p.w / 2), bcy - (p.y + p.h / 2));
          if (dd < W * 0.34) spread += (W * 0.34 - dd) / (W * 0.34);
        }
        const score = occ * 1.2 + ovlRatio * 4.5 + edge * 0.4 + spread * 1.5 + (dk === o.dir ? 0 : 0.5) + (mul > 1 ? 0.04 : 0);
        if (score < bestScore) { bestScore = score; best = { ...box, d, dk }; }
      }
    }
    if (!best) {  // 폴백: 힌트 방향으로 강제(경계 클램프)
      const d = unit(DIRV[o.dir || 'ur']);
      const dist = ar + gap + 0.5 * (Math.abs(d[0]) * boxW + Math.abs(d[1]) * boxH);
      let x0 = ax + d[0] * dist - boxW / 2, y0 = ay + d[1] * dist - boxH / 2;
      x0 = Math.min(W - margin - boxW, Math.max(margin, x0));
      y0 = Math.min(yMaxClear - boxH, Math.max(margin, y0));
      best = { x: x0, y: y0, w: boxW, h: boxH, d, dk: o.dir };
    }
    placedBoxes.push({ x: best.x, y: best.y, w: best.w, h: best.h });

    const leftish = best.d[0] < -0.3;
    const align = leftish ? 'right' : (best.d[0] > 0.3 ? 'left' : 'center');
    const nx = align === 'right' ? best.x + boxW : (align === 'center' ? best.x + boxW / 2 : best.x);
    const ny = best.y + noteSize;

    // 국소 음영 — 노트 아래 밝기 보고 강도 조절
    const lum = boxLuminance(field, photo, best.x, best.y, boxW, boxH);
    const strength = Math.min(0.34, Math.max(0.1, (lum - 0.32) * 0.6 + 0.12));
    spec.darkens.push({ x: best.x - noteSize * 0.5, y: best.y - noteSize * 0.4, w: boxW + noteSize, h: boxH + noteSize * 0.7, strength });

    spec.notes.push({ lines, x: nx, y: ny, size: noteSize, align, font: noteFont, oi, box: { x: best.x, y: best.y, w: boxW, h: boxH } });

    // 화살표 — 노트의 객체쪽 변 → 객체 가장자리
    const bcx = best.x + boxW / 2, bcy = best.y + boxH / 2;
    const toObj = unit([ax - bcx, ay - bcy]);
    const halfSpanA = 0.5 * (Math.abs(toObj[0]) * boxW + Math.abs(toObj[1]) * boxH);
    const from = [bcx + toObj[0] * (halfSpanA + 6), bcy + toObj[1] * (halfSpanA + 6)];
    const to = [ax - toObj[0] * ar * 0.92, ay - toObj[1] * ar * 0.92];
    if (!o.noArrow && Math.hypot(to[0] - from[0], to[1] - from[1]) > 24) {
      spec.arrows.push({ from, to, width: 2, dash: [2, 7], head: 12, alpha: 0.9 });
    }

    // 외곽선 — 정확한 마스크(SAM 폴리곤)가 있을 때만. 없으면 그리지 않는다.
    //   (일반 타원은 물체와 어긋나 "떠 보임" → 틀린 외곽선보다 없는 게 낫다)
    if (o.outline !== false) {
      const poly = o.poly || polys[`${Math.round(o.cx * 1000)}_${Math.round(o.cy * 1000)}`];
      // radial(각도별 최외곽) + 접시 밖 오프셋 → 매끈한 타원형 선. 실선/점선 번갈아(손그림 다꾸).
      if (poly) spec.outlines.push({ kind: 'poly', pts: poly.map(([nx2, ny2]) => [nx2 * W, ny2 * H]),
        alpha: 0.9, width: 2.2, smooth: 2, offset: W * 0.02, dash: (oi % 2 === 1) ? [10, 9] : null });
      // 검출 bbox 비율에 맞춘 타원 — 둥근/타원 접시·그릇·잔에 적합 (객체인식 bbox + 외곽선 결합)
      else if (o.outline === 'ellipse' || o.outline === 'circle') {
        const ef = o.outline === 'ellipse' ? (o.eflat ?? 0.6) : 1;
        spec.outlines.push({ kind: 'ellipse', cx: ax, cy: ay, rx: ar, ry: ar * ef, rot: o.erot || 0, alpha: 0.86, width: 2, wobble: 0.035, seed: (ax + ay) % 6 });
      }
    }

    // 장식 — 노트 끝 근처
    if (o.deco) {
      const lastW = ctx.measureText(lines[lines.length - 1]).width;
      const dx = align === 'right' ? best.x + boxW + noteSize * 0.5 : best.x + lastW + noteSize * 0.5;
      spec.doodles.push({ type: o.deco, x: Math.min(W - margin, dx), y: best.y + boxH - noteSize * 0.3, s: noteSize * 0.34, alpha: 0.9 });
    }
  }

  // 마무리 한 줄 — 하단 중앙, 가볍게
  if (data.closing) {
    const cs = Math.round(W * 0.046);
    spec.closing = { text: data.closing.text, cx: W / 2, y: H - cs * 1.5, size: cs, font: 'Nanum Pen Script' };
    ctx.font = `${cs}px "Nanum Pen Script"`;
    const cw = ctx.measureText(data.closing.text).width;
    // 마무리 줄도 국소 음영으로 가독성 확보 (하단이 밝은 사진 대비)
    spec.darkens.push({ x: W / 2 - cw / 2 - cs * 0.7, y: H - cs * 2.3, w: cw + cs * 1.4, h: cs * 1.7, strength: 0.22 });
    if (data.closing.deco) {
      spec.doodles.push({ type: data.closing.deco, x: W / 2 + cw / 2 + cs * 0.4, y: H - cs * 1.7, s: cs * 0.32, alpha: 0.92 });
      spec.doodles.push({ type: 'sparkle', x: W / 2 - cw / 2 - cs * 0.4, y: H - cs * 1.7, s: cs * 0.26, alpha: 0.85 });
    }
  }
  return spec;
}
