// renderPrimitives.js — 카드 렌더 드로잉 프리미티브(CanvasRenderingContext2D 의존).
//   픽셀 샘플링·스케치 외곽선·손글씨 텍스트·장식 doodle 등 저수준 붓질. measureText·픽셀 접근에
//   캔버스가 필요해 시각 수동 확인 영역이다(단위 테스트 밖). renderCore(배치)가 호출한다.
import { downsampleClosed, offsetFromCentroid, smoothClosed } from './renderGeometry.js';

export const WHITE = '#fdf8ee'; // 따뜻한 흰 (강조 1색, 크림 톤) — 단색 여백 기본색도 이 값을 재사용(exportCard)
const SHADOW = 'rgba(22,15,8,'; // 따뜻한 어두운 그림자 베이스

// ---------- 국소 평균 밝기(0..1) — 캔버스에 이미 그려진 사진을 직접 샘플 ----------
export function sampleLuminance(ctx, x, y, w, h, W, H) {
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

export function drawLocalDarken(ctx, d) {
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

// ---------- 얇은 흰 스케치 외곽선 (내부 전용 — drawSketchOutline 이 사용) ----------
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

// 실제 SAM 폴리곤을 따라 그린다(과거 radial '바깥 림' 변환 폐기 — 마스크 윤곽 보존).
export function drawSketchOutline(ctx, o) {
  if (!o.pts || o.pts.length < 3) return;
  let pts = downsampleClosed(o.pts, o.rn ?? 96);
  pts = offsetFromCentroid(pts, o.offset ?? 0); // 객체 살짝 바깥(가독)
  pts = smoothClosed(pts, o.smooth ?? 1);
  strokePath(ctx, pts, { alpha: o.alpha ?? 0.9, width: o.width ?? 2.4, close: true, dash: o.dash || null });
}

// ---------- 흰 손글씨 코멘트 ----------
export function drawNote(ctx, n) {
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
export function drawClosing(ctx, c) {
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
export function drawDoodle(ctx, d) {
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
