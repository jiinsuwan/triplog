// placement.mjs — 코드/규칙 기반 카드 배치 엔진 (LLM이 아닌 알고리즘이 위치를 결정)
//
// 입력: content(문구·정보) + occupancy field + photo 박스 + preset
// 출력: render-core가 그대로 그리는 카드 spec(JSON)
//
// 규칙(재현 가능):
//  1) 큰 제목 → 사진 위/아래의 빈 여백 밴드(가장 큰 free space)에 배치
//  2) 작은 메모 → 대응 객체(anchor) 근처의 "가장 가까운 안전(저점유) 위치"에 배치, 짧은 점선 꼬리로 연결
//  3) 정보/해시태그 → 하단 여백 밴드 좌측, 폭 자동맞춤
//  4) 강조(객체지정) → 얇은 흰 점선 타원만(거친 원 금지)
//  5) 스티커/반짝이 → 빈 셀 보조용으로 최소(0~1)
//  6) 밀도 캡 — 휑하거나 산만하지 않게 요소 수 제한

import { boxOccupancy, mainAnchor } from './freespace.mjs';

// 스타일 프리셋 — 폰트/밀도/halo 축 (실험 비교용)
export const PRESETS = {
  // A. 얇은 펜 · 미니멀: 제목+정보만, 스티커 0, halo 약, stroke off
  A_penclean: {
    titleFont: 'East Sea Dokdo', memoFont: 'East Sea Dokdo', infoFont: 'Stylish',
    titleSize: 104, memoSize: 52, infoSize: 38, memoWDist: 0.3,
    memo: false, tail: false, sparkle: 0, emphasis: false,    // 최소 구성: 제목+정보만
    halo: { passes: 1, shadowAlpha: 0.5, alpha: 0.45, blur: 14 }, stroke: false,
    color: '#fcf6ea', sub: '#d8c3a0', tag: '#e9c98a',
  },
  // B. 펜 메모 · 꼬리: 메모가 음식을 가리키는 점선 꼬리, 반짝이 1
  B_penmemo: {
    titleFont: 'Nanum Pen Script', memoFont: 'Dokdo', infoFont: 'Stylish',
    titleSize: 112, memoSize: 56, infoSize: 38, memoWDist: 0.5,
    memo: true, tail: true, sparkle: 1, emphasis: false,
    halo: { passes: 1, shadowAlpha: 0.62, alpha: 0.55, blur: 16 }, stroke: false,
    color: '#fdf7ec', sub: '#e8c98f', tag: '#f0cf8f',
  },
  // C. 붓 제목 · 감성: 제목 붓글씨, 본문 얇은 펜
  C_brush: {
    titleFont: 'Nanum Brush Script', memoFont: 'East Sea Dokdo', infoFont: 'Stylish',
    titleSize: 118, memoSize: 54, infoSize: 38, memoWDist: 0.5,
    memo: true, tail: true, sparkle: 1, emphasis: false,
    halo: { passes: 1, shadowAlpha: 0.58, alpha: 0.5, blur: 16 }, stroke: false,
    color: '#fdf6ea', sub: '#e3c089', tag: '#edc886',
  },
  // D. 밀도 높은 대조군(일부러 더 채움) — "왜 sparse가 나은가" 비교용
  D_dense: {
    titleFont: 'Nanum Pen Script', memoFont: 'Dokdo', infoFont: 'Stylish',
    titleSize: 108, memoSize: 58, infoSize: 38, memoWDist: 0.5,
    memo: true, tail: true, sparkle: 3, emphasis: true,
    halo: { passes: 2, shadowAlpha: 0.7, alpha: 0.7, blur: 14 }, stroke: false,
    color: '#fdf7ec', sub: '#e8c98f', tag: '#f0cf8f',
  },
};

const MARGIN = 78;

// 사각 박스가 다른 박스들과 겹치는 최대 비율
function overlapRatio(b, others) {
  let worst = 0;
  for (const o of others) {
    const ix = Math.max(0, Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x));
    const iy = Math.max(0, Math.min(b.y + b.h, o.y + o.h) - Math.max(b.y, o.y));
    const inter = ix * iy, area = b.w * b.h;
    worst = Math.max(worst, area ? inter / area : 0);
  }
  return worst;
}

// 빈 자리 탐색 — occupancy·근접·회피를 가중합해 최소 점수 위치(좌상단) 반환
function findFreeSpot(field, photo, W, H, bw, bh, { near, avoid = [], wDist = 0.6, maxOcc = 0.34, yMin = MARGIN, yMax } = {}) {
  yMax = yMax != null ? yMax : H - MARGIN - bh;
  const step = 36, diag = Math.hypot(W, H);
  let best = null, bestScore = Infinity;
  for (let y = yMin; y <= yMax; y += step) {
    for (let x = MARGIN; x <= W - MARGIN - bw; x += step) {
      const occ = boxOccupancy(field, photo, x, y, bw, bh);
      if (occ > maxOcc) continue;
      const cx = x + bw / 2, cy = y + bh / 2;
      const distS = near ? Math.hypot(cx - near[0], cy - near[1]) / diag : 0;
      const ovl = overlapRatio({ x, y, w: bw, h: bh }, avoid);
      const score = occ * 1.0 + distS * wDist + ovl * 2.5;
      if (score < bestScore) { bestScore = score; best = { x, y }; }
    }
  }
  return best;
}

// content: { title, memo, info:{place,date,people}, hashtags, emphasis?:{cx,cy,r} }
export function layoutCard(content, field, photo, W, H, presetKey) {
  const P = PRESETS[presetKey] || PRESETS.A_penclean;
  const placed = [];                 // 회피용 박스 누적
  const spec = {
    style: presetKey,
    canvas: { width: W, height: H, background: '#241d14' },
    photo: { ...photo, frame: 'rounded' },
    photoTone: { brightness: 1.02, contrast: 1.04, saturate: 1.04, warmth: 0.06 },
    overlay: { vignette: 0.18, bottom: 0.12, top: 0.1 },
    captions: [], speech_bubbles: [], object_circles: [], sparkles: [],
    hashtags: content.hashtags || [],
  };
  const topBand = { y: 0, h: photo.y };
  const botBand = { y: photo.y + photo.h, h: H - (photo.y + photo.h) };
  // 정보/해시태그 자리(하단)를 미리 예약 — 메모가 침범하지 않도록
  const infoY = botBand.h > 150 ? botBand.y + botBand.h * 0.42 : H - 150;
  const infoRect = { x: MARGIN, y: infoY - P.infoSize, w: W - MARGIN * 2, h: P.infoSize * 2.6 };

  // 1) 제목 — 큰 여백 밴드에 좌측 정렬
  const titleLines = String(content.title).split('\n');
  const tSize = P.titleSize;
  const titleH = titleLines.length * tSize * 1.16;
  let titleY;
  if (topBand.h >= titleH + 40) {
    titleY = topBand.y + (topBand.h - titleH) / 2 + tSize * 0.82;       // 상단 밴드 중앙
  } else {
    titleY = MARGIN + tSize * 0.82;                                      // 밴드 부족 → 사진 상단
  }
  spec.captions.push({
    id: 'title', text: content.title, x: MARGIN, y: titleY,
    font: P.titleFont, size: tSize, color: P.color, stroke: P.stroke, halo: P.halo,
  });
  placed.push({ x: MARGIN, y: titleY - tSize, w: W - MARGIN * 2, h: titleH });

  // 2) 강조(객체지정) — 얇은 흰 점선 타원
  let anchor = null;
  if (content.emphasis) {
    const e = content.emphasis;
    anchor = [e.cx, e.cy];
    if (P.emphasis || content.emphasisForce) {
      spec.object_circles.push({ cx: e.cx, cy: e.cy, r: e.r, color: '#fef6e7', dashed: true, width: 3, dash: [3, 13] });
    }
  } else {
    anchor = mainAnchor(field, photo);
  }

  // 3) 메모 — 빈 공간 우선(occ 엄격), anchor 근처면 가점. 음식 위 절대 회피. 멀면 점선 꼬리로 연결.
  if (P.memo && content.memo) {
    const mSize = P.memoSize;
    const mlines = String(content.memo).split('\n');
    const approxW = Math.min(W - MARGIN * 2, Math.max(...mlines.map(l => l.length)) * mSize * 0.62);
    const mh = mlines.length * mSize * 1.18;
    let spot = findFreeSpot(field, photo, W, H, approxW, mh, {
      near: anchor, avoid: [...placed, infoRect], wDist: P.memoWDist, maxOcc: 0.2,
      yMin: MARGIN + P.titleSize, yMax: infoY - mh - 24,
    });
    if (spot) {
      const bubble = {
        text: content.memo, x: spot.x, y: spot.y, size: mSize, font: P.memoFont,
        color: P.color, textColor: P.color,
      };
      // anchor가 멀면(=메모가 음식에서 떨어져 있으면) 점선 꼬리로 객체를 가리킨다
      if (P.tail && anchor) {
        const mcx = spot.x + approxW / 2, mcy = spot.y + mh / 2;
        const d = Math.hypot(mcx - anchor[0], mcy - anchor[1]);
        if (d > 240) bubble.tail = [anchor[0], anchor[1]];
      }
      spec.speech_bubbles.push(bubble);
      placed.push({ x: spot.x, y: spot.y - mSize * 0.2, w: approxW, h: mh });
    }
  }

  // 4) 반짝이 — 빈 코너에 최소 개수
  const corners = [[W - MARGIN - 30, MARGIN + 40], [MARGIN + 20, photo.y + photo.h * 0.5], [W - MARGIN - 50, photo.y + photo.h * 0.7]];
  let sp = 0;
  for (const [cx, cy] of corners) {
    if (sp >= P.sparkle) break;
    if (boxOccupancy(field, photo, cx - 18, cy - 18, 36, 36) < 0.22) {
      spec.sparkles.push({ x: cx, y: cy, r: 13 + (sp % 2) * 5, color: P.tag, alpha: 0.85 });
      sp++;
    }
  }

  // 5) 정보 + 해시태그 — 하단 밴드 좌측 (밴드 없으면 사진 하단). infoY는 상단에서 예약됨.
  spec.info_box = {
    place: content.info?.place, date: content.info?.date, people: content.info?.people,
    x: MARGIN, y: infoY, font: P.infoFont, size: P.infoSize,
    color: P.sub, tagColor: P.tag, maxWidth: W - MARGIN * 2,
  };
  return spec;
}
