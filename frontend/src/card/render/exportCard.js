// exportCard.js — 카드 PNG export. #73 (S3-LOG-05).
//
// 기본 = 원본 사진 비율 그대로(세로→세로, 가로→가로). LOG-04 렌더 캔버스가 사진 비율(crop 0)이므로
//   그대로 내보낸다 — 패딩·크롭 없음.
// 선택 = 9:16 같은 고정 포맷. 여러 카드를 엮어 영상/스토리로 만들 때처럼 캔버스 통일이 필요한 경우용.
//   고정 포맷에서 남는 여백은 블러/단색으로 채우며, 채움 방식·색은 호출자(=사용자)가 정한다(꾸밈은 사용자 몫).
//
// 품질: 콘텐츠를 출력 해상도로 buildScene 재빌드한 뒤 렌더한다 — renderCore 는 W 기준 해상도 독립이라
//   출력 크기로 다시 빌드하면 오버레이가 네이티브로 선명하다(기존 scene 확대-합성의 업샘플 softness 회피).
//
// 래스터화(filter blur·toBlob)는 실제 Canvas 픽셀에 의존하므로 단위 테스트 밖(수동 확인)이다.
//   computeFitRect(고정 포맷 레터박스 기하)만 순수 함수로 분리해 단위 테스트한다.

import { buildScene } from './buildScene.js';
import { renderCard } from './renderCore.js';

// 9:16 고정 포맷의 기본 픽셀 크기(고정 포맷을 고를 때만 쓰임 — 기본 export 는 원본 비율).
export const FIXED_W = 1080;
export const FIXED_H = 1920;

const DEFAULT_PAD_BG = '#fdf8ee'; // 단색 여백 폴백 색(호출자가 안 주면) — renderCore 의 WHITE(크림)와 동일 값
const CARD_FONT = 'Ownglyph ooa'; // 렌더 기본 폰트(로딩 트리거용)

/**
 * 사진 비율을 고정 포맷 틀에 contain(레터박스)으로 맞춘 콘텐츠 사각형을 계산한다.
 *   가로>틀 → 위아래 여백, 세로>틀 → 좌우 여백. 순수 함수(단위 테스트 대상).
 *   캔버스 크기는 정수여야 하므로 반올림하며, 1px 미만 비율 오차는 buildScene 내부 cover-fit 이 흡수한다.
 * @returns {{cw:number, ch:number, dx:number, dy:number}} 콘텐츠 픽셀 크기 + 좌상단 오프셋
 */
export function computeFitRect(photoW, photoH, frameW = FIXED_W, frameH = FIXED_H) {
  if (!(photoW > 0 && photoH > 0 && frameW > 0 && frameH > 0)) {
    throw new Error(`computeFitRect: 잘못된 크기 photo=${photoW}x${photoH} frame=${frameW}x${frameH}`);
  }
  const s = Math.min(frameW / photoW, frameH / photoH); // contain: 더 작은 배율로 틀 안에 다 넣음
  const cw = Math.round(photoW * s);
  const ch = Math.round(photoH * s);
  const dx = Math.round((frameW - cw) / 2);
  const dy = Math.round((frameH - ch) / 2);
  return { cw, ch, dx, dy };
}

// toBlob 을 Promise 로 감싼다. 교차출처 사진(tainted canvas)은 동기 throw, 미지원/실패는 null 콜백 —
//   둘 다 명확한 에러로 reject 한다.
function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('PNG 변환 실패(toBlob null) — 교차출처 사진(tainted canvas)일 수 있습니다'));
      }, 'image/png');
    } catch (e) {
      reject(new Error(`PNG 변환 실패 — 교차출처 사진(tainted canvas)일 수 있습니다: ${e.message}`));
    }
  });
}

// 콘텐츠 카드를 (W×H) 캔버스에 그린다 — 출력 해상도로 재빌드 후 렌더(오버레이 네이티브 선명).
function renderContent(buildInputs, assets, opts, W, H) {
  const { items, captions, photo, style } = buildInputs;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const scene = buildScene({ items, captions, canvas: { W, H }, photo, style });
  if (opts.syncVisibilityFrom) applyVisibility(scene, opts.syncVisibilityFrom);
  renderCard(canvas.getContext('2d'), scene, assets, {
    noteFont: opts.noteFont || CARD_FONT,
    closingFont: opts.closingFont || CARD_FONT,
  });
  return canvas;
}

// 고정 포맷 여백: 사진만 cover-fit 으로 깔고 블러한다(오버레이 제외 → 여백에 글씨가 번지지 않음).
//   살짝 어둡게 덮어 위에 얹는 선명 카드가 도드라지게 한다.
function drawBlurredPhotoBg(ctx, img, W, H) {
  const s = Math.max(W / img.width, H / img.height); // cover: 틀보다 크게 깔아 가장자리 블러 헤일로 방지
  const dw = img.width * s, dh = img.height * s;
  ctx.save();
  ctx.filter = `blur(${Math.round(W * 0.03)}px)`;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.restore(); // filter 리셋(이후 선명 콘텐츠가 흐려지지 않도록)
  ctx.save();
  ctx.fillStyle = 'rgba(20,14,8,0.18)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// 재빌드 scene 에 미리보기 가시성(visible)을 복사한다. 같은 입력 → 같은 레이어 순서이므로 인덱스로 매칭.
function applyVisibility(scene, ref) {
  if (!ref || !Array.isArray(ref.layers)) return;
  scene.layers.forEach((layer, i) => {
    const r = ref.layers[i];
    if (r && typeof r.visible === 'boolean') layer.visible = r.visible;
  });
}

// 사용 폰트 로딩 보장 — ready 만으로는 약하므로 명시 트리거 후 대기. 실패해도 폴백 폰트로 진행.
async function ensureFonts(opts) {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`64px "${opts.noteFont || CARD_FONT}"`),
      document.fonts.load(`64px "${opts.closingFont || CARD_FONT}"`),
    ]);
    await document.fonts.ready;
  } catch {
    /* 폰트 로딩 실패 — 폴백 폰트로 진행 */
  }
}

/**
 * 카드를 PNG Blob 으로 내보낸다.
 *
 * @param {{items:Array, captions:object, photo:{w:number,h:number}, style?:object}} buildInputs
 *        buildScene 입력(canvas 제외 — 출력 해상도로 내부에서 채운다)
 * @param {{photo?:CanvasImageSource, grain?:CanvasImageSource}} [assets]
 * @param {object} [opts]
 *        - format: 'native'(기본, 원본 비율) | 'fixed'(고정 포맷, 영상/스토리 엮기용)
 *        - width/height: 출력 픽셀 크기. native 는 width 만 쓰고 높이는 비율로 계산(기본 = 사진 크기).
 *          fixed 는 둘 다(기본 = 1080×1920).
 *        - pad: 'blur'|'solid' (fixed 여백 채움 — 사용자 선택), bg: 단색 색상(사용자 선택)
 *        - syncVisibilityFrom: 미리보기 scene(레이어 토글 반영)
 *        - noteFont/closingFont: 폰트 교체
 * @returns {Promise<Blob>} PNG Blob
 */
export async function exportCardPng(buildInputs, assets = {}, opts = {}) {
  const { photo } = buildInputs;
  if (!photo || !(photo.w > 0) || !(photo.h > 0)) {
    throw new Error('exportCardPng: photo {w,h}(원본 사진 크기)가 필요합니다');
  }
  await ensureFonts(opts);

  // 기본 = 원본 사진 비율 그대로(여백·크롭 없음).
  if (opts.format !== 'fixed') {
    const W = Math.round(opts.width || photo.w);
    const H = Math.round((W * photo.h) / photo.w); // 사진 비율 유지(세로면 세로, 가로면 가로)
    return canvasToPngBlob(renderContent(buildInputs, assets, opts, W, H));
  }

  // 선택 = 고정 포맷(예: 9:16). 사진을 contain 으로 넣고 남는 여백을 사용자 선택대로 채운다.
  const frameW = Math.round(opts.width || FIXED_W);
  const frameH = Math.round(opts.height || FIXED_H);
  const pad = opts.pad === 'solid' ? 'solid' : 'blur';
  const bg = opts.bg || DEFAULT_PAD_BG;

  const { cw, ch, dx, dy } = computeFitRect(photo.w, photo.h, frameW, frameH);
  const content = renderContent(buildInputs, assets, opts, cw, ch);

  const out = document.createElement('canvas');
  out.width = frameW;
  out.height = frameH;
  const octx = out.getContext('2d');
  if (pad === 'blur' && assets.photo && assets.photo.width > 0 && assets.photo.height > 0) {
    drawBlurredPhotoBg(octx, assets.photo, frameW, frameH);
  } else {
    octx.fillStyle = bg; // 단색(또는 블러용 사진이 없을 때 폴백)
    octx.fillRect(0, 0, frameW, frameH);
  }
  octx.drawImage(content, dx, dy); // 선명 콘텐츠를 여백 위에 얹음
  return canvasToPngBlob(out);
}
