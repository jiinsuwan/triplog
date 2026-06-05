// render-core.mjs — 카드 렌더 공용 코어 (브라우저 편집기 ↔ Node 배치 렌더러 공유)
//
// 핵심 원칙: 이 파일은 DOM/Node API에 의존하지 않는다.
//   - 입력: 표준 CanvasRenderingContext2D(ctx), 카드 spec(JSON), 미리 로드한 assets
//   - assets = { photo: Image, stickers: { [id]: Image }, rough: RoughCanvas|null }
//   - 따라서 node(@napi-rs/canvas)에서도, 브라우저(<canvas>)에서도 같은 코드로 그린다.
//
// 좌표계: 카드 spec의 모든 좌표는 canvas.width × canvas.height(기본 1080×1920) 기준 픽셀.

export const STICKER_COLORS = {
  heart: '#ff7a98',
  sparkle: '#ffe07a',
  star: '#ffe07a',
  arrow_curl: '#ffcf6b',
  underline_wave: '#ffcf6b',
};

export function renderCard(ctx, spec, assets = {}) {
  const cv = spec.canvas || { width: 1080, height: 1920, background: '#1a1410' };
  const W = cv.width, H = cv.height;
  const { photo } = spec;
  const captions = spec.captions || [];
  const arrows = spec.arrows || [];
  const circles = spec.object_circles || [];
  const stickers = spec.stickers || [];
  const hashtags = spec.hashtags || [];
  const info = spec.info_box;
  const rough = assets.rough || null;

  // 1. 배경
  ctx.fillStyle = cv.background || '#1a1410';
  ctx.fillRect(0, 0, W, H);

  // 2. 사진 (cover fit). polaroid: frame이 hex면 흰 프레임 박스 먼저
  if (photo) {
    if (photo.frame && typeof photo.frame === 'string' && photo.frame.startsWith('#')) {
      const pad = 26, chin = 90; // 폴라로이드 아래 여백
      ctx.fillStyle = photo.frame;
      roundRectPath(ctx, photo.x - pad, photo.y - pad, photo.w + pad * 2, photo.h + pad * 2 + chin, 10);
      ctx.fill();
    }
    if (assets.photo) {
      const radius = photo.frame === 'rounded' ? 28 : 0;
      // 사진 전체 보정 — 밝기/대비/채도/따뜻함 (인스타 감성 필터)
      if (spec.photoTone) ctx.filter = buildPhotoFilter(spec.photoTone);
      drawCover(ctx, assets.photo, photo.x, photo.y, photo.w, photo.h, radius);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = '#444';
      ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
    }
  }

  // 2.2 필름 그레인 (옵션) — 사진 위 약한 노이즈
  if (spec.photoTone && spec.photoTone.grain && photo) {
    drawGrain(ctx, assets.grain, photo.x, photo.y, photo.w, photo.h, spec.photoTone.grain);
  }

  // 2.4 주제 누끼 강조 — 배경 전체를 어둡게 깔고, 누끼(배경제거)한 주제만
  //      그림자와 함께 원위치에 다시 그려 "선명하게 떠 보이게". (조잡한 원 강조 대체)
  if (spec.subjectFocus && assets.cutout && photo) {
    const sf = spec.subjectFocus;
    // (a) 배경을 흐리게 다시 깔기 — 주제만 또렷하게 (리서치 §4)
    if (sf.blur && assets.photo) {
      ctx.save();
      ctx.filter = `blur(${sf.blur}px)`;
      drawCover(ctx, assets.photo, photo.x, photo.y, photo.w, photo.h);
      ctx.filter = 'none';
      ctx.restore();
    }
    // (b) 배경 어둡게
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${sf.dim != null ? sf.dim : 0.5})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // (c) 흰 외곽선(스티커화) — 누끼를 흰 글로우로 여러 겹 (리서치 §4 흰 테두리)
    if (sf.outline) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.95)';
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowBlur = sf.outline;
      for (let k = 0; k < 3; k++) drawCover(ctx, assets.cutout, photo.x, photo.y, photo.w, photo.h);
      ctx.restore();
    }
    // (d) 검은 드롭섀도로 띄우기 + 주제 본체
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = sf.glow != null ? sf.glow : 30;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 12;
    drawCover(ctx, assets.cutout, photo.x, photo.y, photo.w, photo.h);
    ctx.restore();
  }

  // 2.45 음식 제외 마스크 — 배경 전체를 어둡게 깔고, 음식(누끼)만 원본 그대로 "구멍처럼" 남긴다.
  //       → 글씨를 어두운 여백에 올리면 음식을 가리지 않고 가독성도 좋다. (사용자 핵심 아이디어)
  if (spec.subjectMask && assets.cutout && photo) {
    const sm = spec.subjectMask;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${sm.dim != null ? sm.dim : 0.58})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    drawCover(ctx, assets.cutout, photo.x, photo.y, photo.w, photo.h); // 음식만 원본 밝기로 복원
  }

  // 2.5 어두운 오버레이 — 사진 위 손글씨 가독성 (다꾸/감성 카드의 핵심)
  if (spec.overlay) drawOverlay(ctx, W, H, spec.overlay);

  // 3. 객체 강조 동그라미 — dashed면 얇은 흰 점선(프롬프트 "흰색 점선" 강조), 아니면 손그림 원
  for (const c of circles) {
    if (c.dashed) {
      ctx.save();
      ctx.strokeStyle = c.color; ctx.lineWidth = c.width || 3; ctx.lineCap = 'round';
      ctx.setLineDash(c.dash || [4, 14]);
      ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (rough) {
      rough.circle(c.cx, c.cy, c.r * 2, { stroke: c.color, strokeWidth: 4, roughness: 2.2, seed: 7 });
    } else {
      ctx.strokeStyle = c.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // 4. 손그림 화살표
  for (const a of arrows) drawArrow(ctx, rough, a);

  // 4.5 반짝이 ✦ (글씨 주변에 흩뿌림)
  for (const sp of spec.sparkles || []) drawSparkle(ctx, sp);

  // 4.7 음식 외곽 점선 — CV contour 폴리곤(정규화)을 사진 cover 변환해 손그림 점선으로
  for (const o of spec.outlines || []) drawOutline(ctx, o, assets.photo, photo, rough);

  // 5. 캡션 + 물결 밑줄
  for (const cap of captions) drawCaption(ctx, cap);

  // 6. 스티커
  for (const s of stickers) {
    const img = assets.stickers && assets.stickers[s.id];
    if (!img) continue;
    const sc = s.scale != null ? s.scale : 1;
    const size = 130 * sc;
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.rotation) ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  // 7. 손글씨 말풍선 (다꾸/낙서 톤 — 사진 속 대상을 가리키며 코멘트)
  for (const b of spec.speech_bubbles || []) drawBubble(ctx, b);

  // 8. 해시태그 + 정보박스
  if (info) drawInfo(ctx, info, hashtags);
}

// 손글씨 말풍선: 반투명 배경 + 손글씨 텍스트 + 대상을 향한 점선 꼬리
function drawBubble(ctx, b) {
  const size = b.size || 42;
  const font = b.font || 'Nanum Pen Script';
  const pad = 20;
  ctx.font = `${size}px "${font}"`;
  ctx.textBaseline = 'alphabetic';
  const lines = String(b.text).split('\n');
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const lh = size * 1.18;
  const bw = tw + pad * 2, bh = lines.length * lh + pad * 1.4;
  const x = b.x, y = b.y;
  const stroke = b.color || '#fffaf0';
  // 박스 없음 — 사진 위 흰 펜 낙서 톤. 대상을 향한 가는 점선 꼬리만.
  if (b.tail) {
    const cx = x + tw / 2, cy = y + bh / 2;
    ctx.save();
    ctx.strokeStyle = stroke; ctx.lineWidth = 2.5; ctx.setLineDash([2, 9]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo((cx + b.tail[0]) / 2, (cy + b.tail[1]) / 2 - 46, b.tail[0], b.tail[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = stroke; ctx.beginPath(); ctx.arc(b.tail[0], b.tail[1], 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // 텍스트 (그림자로 가독성)
  ctx.save();
  ctx.fillStyle = b.textColor || stroke;
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 1.5; ctx.shadowOffsetY = 2;
  lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad + size * 0.82 + i * lh));
  ctx.restore();
}

// ---- helpers ----

// 사진 보정 필터 문자열 — brightness/contrast/saturate/warmth(sepia)
function buildPhotoFilter(t) {
  const p = [];
  if (t.brightness != null) p.push(`brightness(${t.brightness})`);
  if (t.contrast != null) p.push(`contrast(${t.contrast})`);
  if (t.saturate != null) p.push(`saturate(${t.saturate})`);
  if (t.warmth) p.push(`sepia(${t.warmth})`);  // 따뜻한 아날로그 톤
  return p.length ? p.join(' ') : 'none';
}

// 필름 그레인 — 노이즈 텍스처(assets.grain)를 overlay 합성으로 타일 반복. amount 0~1
function drawGrain(ctx, grainImg, x, y, w, h, amount) {
  if (!grainImg) return;
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = 'overlay';
  for (let ty = y; ty < y + h; ty += grainImg.height)
    for (let tx = x; tx < x + w; tx += grainImg.width)
      ctx.drawImage(grainImg, tx, ty);
  ctx.restore();
}

// 사진 위 어두운 오버레이: 전체 약하게 + 상/하단 그라데이션 + 비네트
function drawOverlay(ctx, W, H, ov) {
  ctx.save();
  // 따뜻한 톤 한 겹 (리서치 §2 색온도 +warm) — soft-light 합성
  if (ov.warmth) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = `rgba(255,168,76,${ov.warmth})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (ov.darken) { ctx.fillStyle = `rgba(0,0,0,${ov.darken})`; ctx.fillRect(0, 0, W, H); }
  if (ov.top) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    g.addColorStop(0, `rgba(0,0,0,${ov.top})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.5);
  }
  if (ov.bottom) {
    const g = ctx.createLinearGradient(0, H, 0, H * 0.45);
    g.addColorStop(0, `rgba(0,0,0,${ov.bottom})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.45, W, H * 0.55);
  }
  if (ov.vignette) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.64);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${ov.vignette})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// 닫힌 폴리곤 이동평균 스무딩 — 음식 외곽의 들쭉날쭉함을 펴준다 (강도=반복횟수)
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

// 음식 외곽 점선 — 정규화 폴리곤을 사진 cover 변환 후 부드러운 점선(Catmull-Rom 보간)으로
function drawOutline(ctx, o, img, photo, rough) {
  if (!img || !photo || !o.poly_norm || o.poly_norm.length < 3) return;
  const s = Math.max(photo.w / img.width, photo.h / img.height);
  const dw = img.width * s, dh = img.height * s;
  const ox = photo.x + (photo.w - dw) / 2, oy = photo.y + (photo.h - dh) / 2;
  let pts = o.poly_norm.map(([nx, ny]) => [ox + nx * dw, oy + ny * dh]);
  if (o.smooth) pts = smoothClosed(pts, o.smooth);  // 울퉁불퉁 완화 (이동평균 반복)
  // o.rough일 때만 손그림 거친 점선. 기본은 깔끔한 흰 점선(레퍼런스 톤)
  if (rough && o.rough) {
    rough.linearPath([...pts, pts[0]], {
      stroke: o.color || '#fff8e7',
      strokeWidth: o.width || 3,
      roughness: o.roughness != null ? o.roughness : 2.4,
      bowing: 1.2,
      strokeLineDash: o.dash || [2, 13],
      seed: o.seed || 11,
    });
    return;
  }
  ctx.save();
  ctx.strokeStyle = o.color || '#ffffff';
  ctx.lineWidth = o.width || 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash(o.dash || [2, 5]);  // 촘촘하고 또렷한 흰 점선 (레퍼런스 — 객체 정확히)
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 5;  // 그림자로 밝은 곳에서도 선명
  ctx.beginPath();
  // 닫힌 곡선 Catmull-Rom → 각진 폴리곤을 부드럽게
  const n = pts.length;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let t = 0; t < 1; t += 0.2) {
      const t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// 반짝이 ✦ — 4갈래 별. {x,y,r,color,alpha}
function drawSparkle(ctx, sp) {
  const x = sp.x, y = sp.y, r = sp.r || 12, i = r * 0.22;
  ctx.save();
  ctx.fillStyle = sp.color || '#fffaf0';
  ctx.globalAlpha = sp.alpha != null ? sp.alpha : 0.92;
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + i, y - i, x + r, y);
  ctx.quadraticCurveTo(x + i, y + i, x, y + r); ctx.quadraticCurveTo(x - i, y + i, x - r, y);
  ctx.quadraticCurveTo(x - i, y - i, x, y - r);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawCover(ctx, img, x, y, w, h, radius = 0) {
  ctx.save();
  ctx.beginPath();
  if (radius) roundRectPath(ctx, x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.clip();
  const iw = img.width, ih = img.height;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s, dh = ih * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawArrow(ctx, rough, a) {
  const [x1, y1] = a.from, [x2, y2] = a.to;
  const col = a.color || '#ffd700';
  const w = a.width || 5;
  let tang;  // 화살촉 접선 각도
  if (a.curve != null) {
    // 곡선 점선 화살표 (레퍼런스 톤) — from→to 사이에 수직 offset 제어점
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const cx = mx - dy / len * a.curve, cy = my + dx / len * a.curve;
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    if (a.dashed !== false) ctx.setLineDash(a.dash || [3, 7]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
    ctx.restore();
    tang = Math.atan2(y2 - cy, x2 - cx);
  } else if (a.dashed) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(a.dash || [3, 11]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
    tang = Math.atan2(y2 - y1, x2 - x1);
  } else if (rough) {
    rough.line(x1, y1, x2, y2, { stroke: col, strokeWidth: w, roughness: 1.8, seed: 42 });
    tang = Math.atan2(y2 - y1, x2 - x1);
  } else {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    tang = Math.atan2(y2 - y1, x2 - x1);
  }
  // 화살촉 (얇게, 접선 방향)
  const hl = (a.head != null ? a.head : 16) + w;
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2); ctx.lineTo(x2 - hl * Math.cos(tang - 0.42), y2 - hl * Math.sin(tang - 0.42));
  ctx.moveTo(x2, y2); ctx.lineTo(x2 - hl * Math.cos(tang + 0.42), y2 - hl * Math.sin(tang + 0.42));
  ctx.stroke();
  ctx.restore();
}

function drawCaption(ctx, cap) {
  const size = cap.size || 48;
  const font = cap.font || 'Nanum Pen Script';
  const lines = String(cap.text).split('\n');
  const lh = size * 1.22;
  ctx.save();
  // 손글씨 삐뚤 느낌 — 캡션 단위 약간 회전
  if (cap.rotation) { ctx.translate(cap.x, cap.y); ctx.rotate(cap.rotation * Math.PI / 180); ctx.translate(-cap.x, -cap.y); }
  ctx.font = `${size}px "${font}"`;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const useStroke = cap.stroke !== false;  // 밝은 사진 위 흰 글씨 가독성 — 어두운 외곽선
  // halo 설정 (v2: 가벼운 톤). cap.halo = {alpha, blur, passes, shadowAlpha}
  const halo = cap.halo || {};
  const haloShadow = halo.shadowAlpha != null ? halo.shadowAlpha : 0.78;
  const haloBlur = halo.blur != null ? halo.blur : Math.max(8, size * 0.3);
  const haloFill = halo.alpha != null ? halo.alpha : 0.95;
  const haloPasses = halo.passes != null ? halo.passes : 2;
  // 한 조각(줄/세그먼트) 그리기: 외곽선(stroke) → 채움(fill) + 약한 그림자
  const piece = (text, px, py, fill) => {
    // (1) 어두운 후광(halo) — 밝은 음식 위에서도 글씨 또렷. 글씨 주변만 부드럽게 어둡힘.
    if (haloPasses > 0) {
      ctx.save();
      ctx.shadowColor = `rgba(0,0,0,${haloShadow})`; ctx.shadowBlur = haloBlur;
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = `rgba(0,0,0,${haloFill})`;
      for (let h = 0; h < haloPasses; h++) ctx.fillText(text, px, py);
      ctx.restore();
    }
    // (2) 외곽선
    if (useStroke) {
      ctx.lineWidth = size * 0.08;
      ctx.strokeStyle = cap.strokeColor || 'rgba(0,0,0,0.55)';
      ctx.strokeText(text, px, py);
    }
    // (3) 본 글씨
    ctx.fillStyle = fill;
    ctx.fillText(text, px, py);
  };
  if (cap.segments) {
    let cx = cap.x;
    for (const seg of cap.segments) {
      piece(seg.t, cx, cap.y, seg.color || cap.color || '#fffaf0');
      cx += ctx.measureText(seg.t).width;
    }
  } else {
    lines.forEach((ln, i) => piece(ln, cap.x, cap.y + i * lh, cap.color || '#fffaf0'));
  }
  for (const an of cap.annotations || []) {
    if (an.type === 'wavy_underline') {
      const w0 = ctx.measureText(lines[0]).width;
      drawWave(ctx, cap.x, cap.y + size * 0.18, w0, an.color || cap.color, Math.max(3, size * 0.06));
    }
  }
  ctx.restore();
}

function drawWave(ctx, x, y, w, color, lw) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  const amp = lw * 1.7, step = 16;
  ctx.moveTo(x, y);
  let i = 0;
  for (; i < w; i += step) {
    const up = (Math.floor(i / step) % 2) === 0;
    ctx.quadraticCurveTo(x + i + step / 2, y + (up ? -amp : amp), x + i + step, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawInfo(ctx, ib, hashtags) {
  const x = ib.x, y = ib.y;
  const font = ib.font || 'Stylish';
  const base = ib.size || 40;
  const maxW = ib.maxWidth || (1080 - x * 2);  // 화면 밖 잘림 방지 (폴라로이드 버그 수정)
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1.5;
  // 폭에 맞춰 폰트 자동 축소 (최소 26px)
  const fit = (text, size) => {
    let s = size;
    ctx.font = `${s}px "${font}"`;
    while (ctx.measureText(text).width > maxW && s > 26) { s -= 2; ctx.font = `${s}px "${font}"`; }
    return s;
  };
  if (hashtags && hashtags.length) {
    const t = hashtags.join('  ');
    fit(t, base);
    ctx.fillStyle = ib.tagColor || '#ffd27f';
    ctx.fillText(t, x, y - 16);
  }
  const line = `${ib.place || ''}   ·   ${ib.date || ''}${ib.people ? '   ·   ' + ib.people + '명' : ''}`;
  fit(line, base);
  ctx.fillStyle = ib.color || '#cfc4b8';
  ctx.fillText(line, x, y + 48);
  ctx.restore();
}
