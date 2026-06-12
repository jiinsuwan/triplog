// render-overlay.mjs — "사진 위 감성 다꾸 overlay" 전용 렌더 코어 (v3)
//
// 레퍼런스 정의(고정): 원본 사진을 풀블리드로 깔고, 그 위에 얇은 흰 손글씨로
//   ① 객체별 짧은 코멘트(6~10개)  ② 작은 곡선 점선 화살표  ③ 얇은 흰 스케치 외곽선(접시)
//   ④ 작은 흰 장식(♡ ✦ ☆ ☀)  ⑤ 하단 가벼운 마무리 한 줄  을 얹는다.
//   갈색 배경/큰 제목/해시태그 패널은 없다. 가독성은 "국소 소프트 음영"으로 해결한다.
//
// DOM/Node 중립 — 표준 CanvasRenderingContext2D만 사용. 브라우저·@napi-rs/canvas 공용.
// 좌표는 모두 캔버스 픽셀(= 사진 표시 크기). 사진 aspect = 캔버스 aspect 라 cover=단순 scale.

const WHITE = '#fdf8ee';            // 따뜻한 흰 (리서치: 강조 1색, 크림 톤)
const SHADOW = 'rgba(22,15,8,';     // 따뜻한 어두운 그림자 베이스

export function renderOverlay(ctx, spec, assets = {}) {
  const { W, H } = spec;
  drawPhotoTone(ctx, assets.photo, W, H, spec.tone || {}, assets.grain);
  for (const d of spec.darkens || []) drawLocalDarken(ctx, d);     // 외곽선보다 먼저 깔아 글씨 대비 확보
  for (const o of spec.outlines || []) drawSketchOutline(ctx, o);
  for (const a of spec.arrows || []) drawCurvedArrow(ctx, a);
  for (const n of spec.notes || []) drawNote(ctx, n);
  for (const d of spec.doodles || []) drawDoodle(ctx, d);
  if (spec.closing) drawClosing(ctx, spec.closing);
}

// ---------- 사진 + 톤 ----------
function drawPhotoTone(ctx, img, W, H, t, grain) {
  ctx.save();
  if (img) {
    const f = [];
    f.push(`brightness(${t.brightness ?? 1.02})`);
    f.push(`contrast(${t.contrast ?? 1.04})`);
    f.push(`saturate(${t.saturate ?? 1.05})`);
    if (t.warmth) f.push(`sepia(${t.warmth})`);
    ctx.filter = f.join(' ');
    // cover-fit (aspect 일치 시 꽉 참)
    const s = Math.max(W / img.width, H / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.filter = 'none';
  } else { ctx.fillStyle = '#3a332a'; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
  // 아주 옅은 비네트 — 시선을 가운데로 (과하지 않게)
  if (t.vignette) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${t.vignette})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (grain && t.grain) {
    ctx.save(); ctx.globalAlpha = t.grain; ctx.globalCompositeOperation = 'overlay';
    for (let y = 0; y < H; y += grain.height) for (let x = 0; x < W; x += grain.width) ctx.drawImage(grain, x, y);
    ctx.restore();
  }
}

// ---------- 국소 소프트 음영 (글씨 뒤 살짝 어둡힘 — 박스 아님) ----------
function drawLocalDarken(ctx, d) {
  const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(d.w, d.h);                 // 단위원 → 타원 d.w×d.h
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.66);
  g.addColorStop(0, `rgba(0,0,0,${d.strength})`);
  g.addColorStop(0.6, `rgba(0,0,0,${d.strength * 0.5})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(-0.75, -0.75, 1.5, 1.5);
  ctx.restore();
}

// ---------- 얇은 흰 스케치 외곽선 (레퍼런스: 얇은 흰 선 + 소프트 그림자) ----------
function strokePath(ctx, pts, { alpha = 0.9, width = 2.2, close = true, dash = null } = {}) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
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
  // 얇은 흰 선 한 줄 + 부드러운 그림자(가는 분리감만, 검은 외곽 아님)
  ctx.shadowColor = 'rgba(15,10,5,0.5)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 0.4; ctx.shadowOffsetY = 1;
  ctx.strokeStyle = `rgba(255,252,245,${alpha})`; ctx.lineWidth = width; ctx.stroke();
  ctx.restore();
}

// radial 리샘플 — 중심에서 각도별 "가장 바깥" 경계점을 N개 뽑아 완만히 잇는다.
//   효과: 외곽선이 음식 굴곡을 따라 접시 안으로 들어가지 않고 항상 바깥 림에 남는다(사용자 제안).
//   expand>1 이면 림보다 살짝 바깥에 그려 가독성↑.
function radialResample(pts, n = 32, expand = 1.0, offset = 0) {
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  const rad = new Array(n).fill(null);
  for (const [x, y] of pts) {
    const a = Math.atan2(y - cy, x - cx);
    let bi = Math.floor((a + Math.PI) / (2 * Math.PI) * n) % n; if (bi < 0) bi += n;
    const r = Math.hypot(x - cx, y - cy);
    if (rad[bi] == null || r > rad[bi]) rad[bi] = r;  // 각도별 "가장 바깥" 점
  }
  // 빈 각도는 가장 가까운 채워진 빈에서 보간
  for (let i = 0; i < n; i++) {
    if (rad[i] != null) continue;
    let d = 1, lo = null, hi = null;
    while (d < n && lo == null && hi == null) { lo = rad[(i - d + n) % n]; hi = rad[(i + d) % n]; d++; }
    rad[i] = (lo != null && hi != null) ? (lo + hi) / 2 : (lo ?? hi ?? 0);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + (i + 0.5) / n * 2 * Math.PI;
    const r = rad[i] * expand + offset;   // 접시 밖으로 일정 간격 밀어냄(맨 테이블에 깔끔히)
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

// 닫힌 폴리곤 이동평균 스무딩 — SAM 외곽의 들쭉날쭉함 완화
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

function drawSketchOutline(ctx, o) {
  if (o.kind === 'poly' && o.pts) {
    // radial 리샘플(각도별 최외곽 + 접시 밖 고정 오프셋) → 약한 스무딩 → 깔끔한 손그림 윤곽
    let pts = radialResample(o.pts, o.rn ?? 40, o.expand ?? 1.0, o.offset ?? 0);
    pts = smoothClosed(pts, o.smooth ?? 2);
    strokePath(ctx, pts, { alpha: o.alpha ?? 0.9, width: o.width ?? 2.4, close: true, dash: o.dash || null });
    return;
  }
  // ellipse — 손그림 느낌 미세 wobble + 살짝 열린 호
  const { cx, cy, rx, ry, rot = 0 } = o;
  const wob = o.wobble ?? 0.04, seed = o.seed ?? 1;
  const pts = [];
  const start = 0.18, end = Math.PI * 2 - 0.06;     // 살짝 열어 스케치 느낌
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const a = start + (end - start) * (i / N);
    const wb = 1 + wob * Math.sin(a * 3 + seed) + wob * 0.5 * Math.sin(a * 7 + seed * 2);
    const ex = Math.cos(a) * rx * wb, ey = Math.sin(a) * ry * wb;
    pts.push([cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)]);
  }
  strokePath(ctx, pts, { alpha: o.alpha ?? 0.88, width: o.width ?? 2, close: false });
}

// ---------- 얇은 곡선 점선 화살표 (얇은 흰 선 + 소프트 그림자) ----------
function drawCurvedArrow(ctx, a) {
  const [x1, y1] = a.from, [x2, y2] = a.to;
  const w = a.width || 2;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const curve = a.curve != null ? a.curve : len * 0.22;
  const cx = mx - dy / len * curve, cy = my + dx / len * curve;
  const tang = Math.atan2(y2 - cy, x2 - cx), hl = a.head || 12;
  ctx.save();
  ctx.strokeStyle = `rgba(255,252,245,${a.alpha ?? 0.9})`; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(15,10,5,0.5)'; ctx.shadowBlur = 3.5; ctx.shadowOffsetY = 1;
  ctx.setLineDash(a.dash || [2, 7]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2); ctx.lineTo(x2 - hl * Math.cos(tang - 0.42), y2 - hl * Math.sin(tang - 0.42));
  ctx.moveTo(x2, y2); ctx.lineTo(x2 - hl * Math.cos(tang + 0.42), y2 - hl * Math.sin(tang + 0.42));
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
  if (n.rotation) { ctx.translate(n.x, n.y); ctx.rotate(n.rotation * Math.PI / 180); ctx.translate(-n.x, -n.y); }
  lines.forEach((ln, i) => {
    const wln = ctx.measureText(ln).width;
    const px = n.align === 'right' ? n.x - wln : (n.align === 'center' ? n.x - wln / 2 : n.x);
    const py = n.y + i * lh;
    // (1) 부드러운 어두운 그림자 — 가는 분리감만(검은 외곽 아님). 레퍼런스 톤.
    ctx.save();
    ctx.shadowColor = `${SHADOW}${n.shadow ?? 0.55})`; ctx.shadowBlur = Math.max(5, size * 0.24);
    ctx.shadowOffsetX = 0.3; ctx.shadowOffsetY = 1;
    ctx.fillStyle = n.color || WHITE;
    ctx.fillText(ln, px, py);
    ctx.restore();
    // (3) 본 글씨
    ctx.fillStyle = n.color || WHITE;
    ctx.fillText(ln, px, py);
  });
  ctx.restore();
}

// ---------- 하단 마무리 한 줄 (가벼운 캡션) ----------
function drawClosing(ctx, c) {
  const size = c.size || 56, font = c.font || 'Nanum Pen Script';
  const lh = size * 1.24, lines = c.lines || String(c.text).split('\n');
  ctx.save();
  ctx.font = `${size}px "${font}"`;
  ctx.textBaseline = 'alphabetic';
  lines.forEach((ln, i) => {
    const w = ctx.measureText(ln).width, px = c.cx - w / 2, py = c.y + i * lh;
    ctx.save();
    ctx.shadowColor = `${SHADOW}0.55)`; ctx.shadowBlur = size * 0.24; ctx.shadowOffsetY = 1.2; ctx.shadowOffsetX = 0.3;
    ctx.fillStyle = c.color || WHITE; ctx.fillText(ln, px, py);
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
  ctx.lineWidth = d.w || 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = `${SHADOW}0.5)`; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
  switch (d.type) {
    case 'sparkle': {                 // 4갈래 반짝이 (가는 채움)
      const i = s * 0.26;
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.quadraticCurveTo(i, -i, s, 0);
      ctx.quadraticCurveTo(i, i, 0, s); ctx.quadraticCurveTo(-i, i, -s, 0);
      ctx.quadraticCurveTo(-i, -i, 0, -s); ctx.closePath(); ctx.fill();
      break;
    }
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.32);
      ctx.bezierCurveTo(-s * 1.1, -s * 0.5, -s * 0.35, -s * 1.05, 0, -s * 0.35);
      ctx.bezierCurveTo(s * 0.35, -s * 1.05, s * 1.1, -s * 0.5, 0, s * 0.32);
      ctx.closePath(); ctx.stroke();
      break;
    }
    case 'star': {                    // 5각 별 외곽선
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + k * 2 * Math.PI / 5;
        const a2 = a + Math.PI / 5;
        ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        ctx.lineTo(Math.cos(a2) * s * 0.45, Math.sin(a2) * s * 0.45);
      }
      ctx.closePath(); ctx.stroke();
      break;
    }
    case 'sun': {
      ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2); ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s * 0.72, Math.sin(a) * s * 0.72);
        ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); ctx.stroke();
      }
      break;
    }
    case 'smile': {                   // 작은 미소 ◡
      ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(-s * 0.28, -s * 0.12, 1.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.28, -s * 0.12, 1.4, 0, 7); ctx.fill();
      break;
    }
    case 'curl': {                    // 작은 장식 곡선
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(-s * 0.3, -s * 0.7, s * 0.2, -s * 0.1);
      ctx.quadraticCurveTo(s * 0.5, s * 0.2, s, -s * 0.2); ctx.stroke();
      break;
    }
    case 'dots': {
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(k * s * 0.5, 0, 1.8, 0, 7); ctx.fill(); }
      break;
    }
  }
  ctx.restore();
}
