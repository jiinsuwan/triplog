// renderCore.js — 카드 overlay 렌더 코어 (Canvas2D, 세로 1080×1920).
//
// 포팅 원본: poc/card/legacy-v3/render-overlay.mjs (드로잉 프리미티브) + overlay-place.mjs (배치 기하).
//   변경점:
//    - 노트 위치 = 사이드카 anchors 직접 사용(자체 빈공간 탐색 미포팅). 경계 클램프만 둔다.
//    - 가독 음영(darken) 강도 = 캔버스에 그려진 사진을 직접 샘플링한 국소 밝기로 산정
//      (freespace occupancy field 전체 포팅 대신).
//    - 무드 톤다운 = 전역 비파괴 합성(글씨 뒤 국소 음영과 별개).
//   scene(좌표·레이어)은 buildScene 이 만든 순수 데이터다. 이 파일은 measureText·픽셀 샘플링 등
//   캔버스에 의존하는 배치·드로잉만 담당한다(시각 수동 확인 영역, 단위 테스트 밖).
//
// 표준 CanvasRenderingContext2D 만 사용 — Konva·rough.js 미채택.

const WHITE = '#fdf8ee'; // 따뜻한 흰 (강조 1색, 크림 톤)
const SHADOW = 'rgba(22,15,8,'; // 따뜻한 어두운 그림자 베이스

const NOTE_SIZE_RATIO = 0.034; // overlay-place 와 동일(작고 섬세)
const MARGIN_RATIO = 0.035;
const CLOSING_SIZE_RATIO = 0.046;

// 단위 벡터(영벡터는 그대로). 노트→객체 방향·정렬 계산용.
function unit(v) {
  const m = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / m, v[1] / m];
}

/**
 * scene 을 ctx 에 그린다.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} scene  buildScene 결과 { canvas:{W,H}, tone, layers }
 * @param {{photo?:CanvasImageSource, grain?:CanvasImageSource}} assets
 * @param {{noteFont?:string, closingFont?:string}} [opts]  폰트는 교체 가능(기본 = 온글잎 ooa; 라이선스 = frontend/public/fonts/LICENSE.txt)
 */
export function renderCard(ctx, scene, assets = {}, opts = {}) {
  const { W, H } = scene.canvas;
  const noteFont = opts.noteFont || 'Ownglyph ooa';
  const closingFont = opts.closingFont || 'Ownglyph ooa';
  const noteSize = Math.round(W * NOTE_SIZE_RATIO);
  const margin = Math.round(W * MARGIN_RATIO);

  ctx.clearRect(0, 0, W, H); // 매 렌더 초기화(재호출 시 합성 잔여 방지 — 비파괴 보장)
  drawPhotoTone(ctx, assets.photo, W, H, scene.tone || {}, assets.grain);

  for (const layer of scene.layers) {
    if (layer.visible === false) continue;
    if (layer.kind === 'note') drawNoteLayer(ctx, layer, { W, H, noteSize, margin, font: noteFont });
    else if (layer.kind === 'closing') drawClosingLayer(ctx, layer, { W, H, font: closingFont });
  }
}

// ---------- 사진 + 톤 + 무드 톤다운 ----------
function drawPhotoTone(ctx, img, W, H, t, grain) {
  ctx.save();
  if (img) {
    const f = [];
    f.push(`brightness(${t.brightness ?? 1.02})`);
    f.push(`contrast(${t.contrast ?? 1.04})`);
    f.push(`saturate(${t.saturate ?? 1.05})`);
    if (t.warmth) f.push(`sepia(${t.warmth})`);
    ctx.filter = f.join(' ');
    const s = Math.max(W / img.width, H / img.height); // cover-fit
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = '#3a332a';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();

  if (t.vignette) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${t.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (grain && t.grain) {
    ctx.save();
    ctx.globalAlpha = t.grain;
    ctx.globalCompositeOperation = 'overlay';
    for (let y = 0; y < H; y += grain.height) for (let x = 0; x < W; x += grain.width) ctx.drawImage(grain, x, y);
    ctx.restore();
  }
  // 무드 톤다운(0~0.5) — 사진 위 전역 비파괴 합성. 글씨 뒤 국소 음영과 별개.
  if (t.toneDown) {
    ctx.save();
    ctx.fillStyle = `rgba(18,13,8,${t.toneDown})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

// ---------- 한 레이어(코멘트 1개): 음영 → 외곽선 → 화살표 → 문구 → (장식) ----------
function drawNoteLayer(ctx, layer, { W, H, noteSize, margin, font }) {
  const lines = layer.lines;
  if (!lines || lines.length === 0) return; // 외부 호출 방어(빈 줄이면 measureText/Math.max 붕괴 방지)
  const lh = noteSize * 1.3;
  ctx.font = `${noteSize}px "${font}"`;
  const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const boxH = lines.length * lh;

  // 배치점(anchor)을 박스 중심으로 두고, 캔버스 안으로 클램프. 하단은 마무리 한 줄 자리 확보.
  const yMax = H - margin - Math.round(W * CLOSING_SIZE_RATIO) * 2.4;
  const [ax, ay] = layer.anchor;
  let x0 = ax - boxW / 2;
  let y0 = ay - boxH / 2;
  x0 = Math.min(W - margin - boxW, Math.max(margin, x0));
  y0 = Math.min(yMax - boxH, Math.max(margin, y0));

  const [ox, oy] = layer.center; // 객체 중심(화살표 도착)
  const bcx = x0 + boxW / 2, bcy = y0 + boxH / 2;
  const d = unit([bcx - ox, bcy - oy]);
  const align = d[0] < -0.3 ? 'right' : d[0] > 0.3 ? 'left' : 'center';
  const nx = align === 'right' ? x0 + boxW : align === 'center' ? x0 + boxW / 2 : x0;
  const ny = y0 + noteSize;

  // 국소 음영 — 노트 박스 아래 사진 밝기 보고 강도 조절(밝을수록 강).
  const lum = sampleLuminance(ctx, x0 - noteSize * 0.5, y0 - noteSize * 0.4, boxW + noteSize, boxH + noteSize * 0.7, W, H);
  const strength = Math.min(0.34, Math.max(0.1, (lum - 0.32) * 0.6 + 0.12));
  drawLocalDarken(ctx, { x: x0 - noteSize * 0.5, y: y0 - noteSize * 0.4, w: boxW + noteSize, h: boxH + noteSize * 0.7, strength });

  // 외곽선(닫힌 루프별). radial 리샘플 + 접시 밖 오프셋 → 매끈한 손그림 윤곽.
  for (const o of layer.outlines || []) {
    // offset = 객체 살짝 바깥(가독). PoC(W*0.02, radial 림 방식)보다 작게 잡음 — 실제 폴리곤을 그대로
    //   따라가므로 림 방식만큼 밀어낼 필요가 없다. 최종 굵기·여백은 #74 에서 조정 가능.
    drawSketchOutline(ctx, { pts: o.pts, alpha: 0.9, width: 2.2, smooth: 1, offset: W * 0.012, dash: o.dash ? [10, 9] : null });
  }

  // 화살표 — 노트 박스의 객체쪽 변 → 객체 가장자리.
  const toObj = unit([ox - bcx, oy - bcy]);
  const halfSpanA = 0.5 * (Math.abs(toObj[0]) * boxW + Math.abs(toObj[1]) * boxH);
  const from = [bcx + toObj[0] * (halfSpanA + 6), bcy + toObj[1] * (halfSpanA + 6)];
  const r = layer.r || 0;
  const to = [ox - toObj[0] * r * 0.92, oy - toObj[1] * r * 0.92];
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 24) {
    drawCurvedArrow(ctx, { from, to, width: 2, dash: [2, 7], head: 12, alpha: 0.9 });
  }

  drawNote(ctx, { lines, x: nx, y: ny, size: noteSize, align, font });

  // 장식 — 레이어에 deco 가 지정된 경우만(기본 미지정; 에디터/사용자 영역).
  if (layer.deco) {
    const lastW = ctx.measureText(lines[lines.length - 1]).width;
    const dx = align === 'right' ? x0 + boxW + noteSize * 0.5 : x0 + lastW + noteSize * 0.5;
    drawDoodle(ctx, { type: layer.deco, x: Math.min(W - margin, dx), y: y0 + boxH - noteSize * 0.3, s: noteSize * 0.34, alpha: 0.9 });
  }
}

// ---------- 마무리 한 줄 — 하단 중앙(가독 음영 포함) ----------
function drawClosingLayer(ctx, layer, { W, H, font }) {
  const cs = Math.round(W * CLOSING_SIZE_RATIO);
  ctx.font = `${cs}px "${font}"`;
  const cw = ctx.measureText(layer.text).width;
  drawLocalDarken(ctx, { x: W / 2 - cw / 2 - cs * 0.7, y: H - cs * 2.3, w: cw + cs * 1.4, h: cs * 1.7, strength: 0.22 });
  drawClosing(ctx, { text: layer.text, cx: W / 2, y: H - cs * 1.5, size: cs, font });
}

// ---------- 국소 평균 밝기(0..1) — 캔버스에 이미 그려진 사진을 직접 샘플 ----------
function sampleLuminance(ctx, x, y, w, h, W, H) {
  const rx = Math.max(0, Math.floor(x));
  const ry = Math.max(0, Math.floor(y));
  const rw = Math.min(W - rx, Math.ceil(w));
  const rh = Math.min(H - ry, Math.ceil(h));
  if (rw <= 0 || rh <= 0) return 0.3; // 화면 밖 → 기본값
  let data;
  try {
    data = ctx.getImageData(rx, ry, rw, rh).data;
  } catch {
    return 0.3; // tainted canvas(교차출처 사진) 등 → 기본값
  }
  let sum = 0, n = 0;
  const step = Math.max(4, Math.floor((rw * rh) / 400)) * 4; // 최대 ~400 샘플
  for (let i = 0; i < data.length; i += step) {
    sum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    n++;
  }
  return n ? sum / n : 0.3;
}

function drawLocalDarken(ctx, d) {
  const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(d.w, d.h);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.66);
  g.addColorStop(0, `rgba(0,0,0,${d.strength})`);
  g.addColorStop(0.6, `rgba(0,0,0,${d.strength * 0.5})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-0.75, -0.75, 1.5, 1.5);
  ctx.restore();
}

// ---------- 얇은 흰 스케치 외곽선 ----------
function strokePath(ctx, pts, { alpha = 0.9, width = 2.2, close = true, dash = null } = {}) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  const n = pts.length, lim = close ? n : n - 1;
  for (let i = 0; i < lim; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let t = 0; t < 1; t += 0.25) {
      const t2 = t * t, t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      ctx.lineTo(x, y);
    }
  }
  if (close) ctx.closePath();
  ctx.shadowColor = 'rgba(15,10,5,0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0.4;
  ctx.shadowOffsetY = 1;
  ctx.strokeStyle = `rgba(255,252,245,${alpha})`;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}

// 폴리곤을 중심에서 바깥으로 일정 픽셀 밀어낸다(객체 살짝 바깥에 그려 가독성↑, 형태는 유지).
function offsetFromCentroid(pts, off) {
  if (!off) return pts;
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length;
  cy /= pts.length;
  return pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
    return [x + (dx / d) * off, y + (dy / d) * off];
  });
}

// 점이 많은 폴리곤을 균일 간격으로 다운샘플(손그림 스트로크 + 성능).
function downsampleClosed(pts, max) {
  if (pts.length <= max) return pts;
  const out = [], step = pts.length / max;
  for (let i = 0; i < max; i++) out.push(pts[Math.floor(i * step)]);
  return out;
}

function smoothClosed(pts, iters) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const n = p.length, q = [];
    for (let i = 0; i < n; i++) {
      const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
      q.push([(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4]);
    }
    p = q;
  }
  return p;
}

// 실제 SAM 폴리곤을 따라 그린다(과거 radial '바깥 림' 변환 폐기 — 마스크 윤곽 보존).
function drawSketchOutline(ctx, o) {
  if (!o.pts || o.pts.length < 3) return;
  let pts = downsampleClosed(o.pts, o.rn ?? 96);
  pts = offsetFromCentroid(pts, o.offset ?? 0); // 객체 살짝 바깥(가독)
  pts = smoothClosed(pts, o.smooth ?? 1);
  strokePath(ctx, pts, { alpha: o.alpha ?? 0.9, width: o.width ?? 2.4, close: true, dash: o.dash || null });
}

// ---------- 얇은 곡선 점선 화살표 ----------
function drawCurvedArrow(ctx, a) {
  const [x1, y1] = a.from, [x2, y2] = a.to;
  const w = a.width || 2;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const curve = a.curve != null ? a.curve : len * 0.22;
  const cx = mx - (dy / len) * curve, cy = my + (dx / len) * curve;
  const tang = Math.atan2(y2 - cy, x2 - cx), hl = a.head || 12;
  ctx.save();
  ctx.strokeStyle = `rgba(255,252,245,${a.alpha ?? 0.9})`;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(15,10,5,0.5)';
  ctx.shadowBlur = 3.5;
  ctx.shadowOffsetY = 1;
  ctx.setLineDash(a.dash || [2, 7]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hl * Math.cos(tang - 0.42), y2 - hl * Math.sin(tang - 0.42));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hl * Math.cos(tang + 0.42), y2 - hl * Math.sin(tang + 0.42));
  ctx.stroke();
  ctx.restore();
}

// ---------- 흰 손글씨 코멘트 ----------
function drawNote(ctx, n) {
  const size = n.size || 42, font = n.font || 'East Sea Dokdo';
  const lh = size * (n.lh || 1.3);
  const lines = n.lines || String(n.text).split('\n');
  ctx.save();
  ctx.font = `${size}px "${font}"`;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  if (n.rotation) {
    ctx.translate(n.x, n.y);
    ctx.rotate((n.rotation * Math.PI) / 180);
    ctx.translate(-n.x, -n.y);
  }
  lines.forEach((ln, i) => {
    const wln = ctx.measureText(ln).width;
    const px = n.align === 'right' ? n.x - wln : n.align === 'center' ? n.x - wln / 2 : n.x;
    const py = n.y + i * lh;
    ctx.save();
    ctx.shadowColor = `${SHADOW}${n.shadow ?? 0.55})`;
    ctx.shadowBlur = Math.max(5, size * 0.24);
    ctx.shadowOffsetX = 0.3;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = n.color || WHITE;
    ctx.fillText(ln, px, py);
    ctx.restore();
    ctx.fillStyle = n.color || WHITE;
    ctx.fillText(ln, px, py);
  });
  ctx.restore();
}

// ---------- 하단 마무리 한 줄 ----------
function drawClosing(ctx, c) {
  const size = c.size || 56, font = c.font || 'Nanum Pen Script';
  const lh = size * 1.24, lines = c.lines || String(c.text).split('\n');
  ctx.save();
  ctx.font = `${size}px "${font}"`;
  ctx.textBaseline = 'alphabetic';
  lines.forEach((ln, i) => {
    const w = ctx.measureText(ln).width, px = c.cx - w / 2, py = c.y + i * lh;
    ctx.save();
    ctx.shadowColor = `${SHADOW}0.55)`;
    ctx.shadowBlur = size * 0.24;
    ctx.shadowOffsetY = 1.2;
    ctx.shadowOffsetX = 0.3;
    ctx.fillStyle = c.color || WHITE;
    ctx.fillText(ln, px, py);
    ctx.restore();
  });
  ctx.restore();
}

// ---------- 작은 흰 장식 doodle ----------
function drawDoodle(ctx, d) {
  const s = d.s || 18, x = d.x, y = d.y;
  ctx.save();
  ctx.translate(x, y);
  if (d.rot) ctx.rotate(d.rot);
  ctx.strokeStyle = `rgba(255,251,242,${d.alpha ?? 0.9})`;
  ctx.fillStyle = `rgba(255,251,242,${d.alpha ?? 0.9})`;
  ctx.lineWidth = d.w || 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = `${SHADOW}0.5)`;
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  switch (d.type) {
    case 'sparkle': {
      const i = s * 0.26;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(i, -i, s, 0);
      ctx.quadraticCurveTo(i, i, 0, s);
      ctx.quadraticCurveTo(-i, i, -s, 0);
      ctx.quadraticCurveTo(-i, -i, 0, -s);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.32);
      ctx.bezierCurveTo(-s * 1.1, -s * 0.5, -s * 0.35, -s * 1.05, 0, -s * 0.35);
      ctx.bezierCurveTo(s * 0.35, -s * 1.05, s * 1.1, -s * 0.5, 0, s * 0.32);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'star': {
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
        const a2 = a + Math.PI / 5;
        ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        ctx.lineTo(Math.cos(a2) * s * 0.45, Math.sin(a2) * s * 0.45);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'sun': {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s * 0.72, Math.sin(a) * s * 0.72);
        ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
