// renderCore.js — 카드 overlay 렌더 코어 (Canvas2D). 캔버스 = 사진 비율(crop 0); 세로 9:16 맞춤은 #73 내보내기.
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

import { unit } from './renderGeometry.js';
import {
  sampleLuminance,
  drawLocalDarken,
  drawSketchOutline,
  drawNote,
  drawClosing,
  drawDoodle,
} from './renderPrimitives.js';

// WHITE 는 renderPrimitives 가 정의한다. 기존 소비자(exportCard 등) import 호환을 위해 재수출.
export { WHITE } from './renderPrimitives.js';

const NOTE_SIZE_RATIO = 0.027; // 카드 문구 기본 크기(작게 — 여러 문구가 카드를 덮지 않게)
const MARGIN_RATIO = 0.035;
const CLOSING_SIZE_RATIO = 0.046;

/**
 * scene 을 ctx 에 그린다.
 *
 * 전제: ctx 는 fresh 상태(기본 transform/alpha/filter/clip)다. 호출자가 변형 상태를 남겼다면
 *   clearRect·좌표가 어긋나므로 save/restore(필요 시 resetTransform)로 격리해야 한다(#74 제품 연결 시 helper).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} scene  buildScene 결과 { canvas:{W,H}, tone, layers }
 * @param {{photo?:CanvasImageSource, grain?:CanvasImageSource}} assets
 * @param {{noteFont?:string, closingFont?:string}} [opts]  폰트는 교체 가능(기본 = 온글잎 ooa; 라이선스 = frontend/public/fonts/LICENSE.txt)
 */
export function renderCard(ctx, scene, assets = {}, opts = {}) {
  const { W, H } = scene.canvas;
  const noteFont = opts.noteFont || 'Ownglyph ooa';
  const closingFont = opts.closingFont || 'Ownglyph ooa';
  const skipLuminance = !!opts.skipLuminance; // 드래그 중 getImageData 생략(성능)
  const scale = opts.scale || 1; // 사진별 전역 글씨 크기 배율
  const noteSize = Math.round(W * NOTE_SIZE_RATIO * scale);
  const margin = Math.round(W * MARGIN_RATIO);

  ctx.clearRect(0, 0, W, H); // 매 렌더 초기화(재호출 시 합성 잔여 방지 — 비파괴 보장)
  drawPhotoTone(ctx, assets.photo, W, H, scene.tone || {}, assets.grain);

  for (const layer of scene.layers) {
    if (layer.visible === false) continue;
    if (layer.kind === 'note') drawNoteLayer(ctx, layer, { W, H, noteSize, margin, font: noteFont, skipLuminance });
    else if (layer.kind === 'closing') drawClosingLayer(ctx, layer, { W, H, font: closingFont, scale });
  }
}

// ---------- 사진 + 톤 + 무드 톤다운 ----------
function drawPhotoTone(ctx, img, W, H, t, grain) {
  ctx.save();
  // 유효 이미지(로딩 완료 + 크기>0)만 그린다. 빈/미로딩 객체는 cover-fit 좌표가 NaN 이 되어 브라우저
  //   Canvas 가 throw 하므로, 배경 fallback 으로 처리한다(테스트 mock 은 통과시켜도 실제 Canvas 는 예외).
  if (img && img.width > 0 && img.height > 0) {
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
function drawNoteLayer(ctx, layer, { W, H, noteSize, margin, font, skipLuminance }) {
  const lines = layer.lines;
  if (!lines || lines.length === 0) return; // 외부 호출 방어(빈 줄이면 measureText/Math.max 붕괴 방지)
  const lh = noteSize * 1.3;
  ctx.font = `${noteSize}px "${font}"`;
  const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const boxH = lines.length * lh;

  // 배치점(anchor)을 박스 중심으로 두고, 캔버스 안으로 클램프. 마무리도 이동 가능한 요소라 하단 예약은 두지 않는다.
  const yMax = H - margin;
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
  // 드래그 중(skipLuminance)에는 getImageData(비쌈)를 건너뛰고 고정 강도로 그린다(끝나면 풀 렌더).
  const strength = skipLuminance
    ? 0.2
    : Math.min(
        0.34,
        Math.max(
          0.1,
          (sampleLuminance(ctx, x0 - noteSize * 0.5, y0 - noteSize * 0.4, boxW + noteSize, boxH + noteSize * 0.7, W, H) - 0.32) * 0.6 + 0.12,
        ),
      );
  drawLocalDarken(ctx, { x: x0 - noteSize * 0.5, y: y0 - noteSize * 0.4, w: boxW + noteSize, h: boxH + noteSize * 0.7, strength });

  // 외곽선(닫힌 루프별). radial 리샘플 + 접시 밖 오프셋 → 매끈한 손그림 윤곽.
  for (const o of layer.outlines || []) {
    // offset = 객체 살짝 바깥(가독). PoC(W*0.02, radial 림 방식)보다 작게 잡음 — 실제 폴리곤을 그대로
    //   따라가므로 림 방식만큼 밀어낼 필요가 없다. 최종 굵기·여백은 #74 에서 조정 가능.
    drawSketchOutline(ctx, { pts: o.pts, alpha: 0.9, width: 2.2, smooth: 1, offset: W * 0.012, dash: o.dash ? [10, 9] : null });
  }

  // (객체↔문구 자동 화살표 제거 — 사용자 피드백. 문구는 드래그로 직접 배치한다.)

  // 문구(+장식)는 텍스트처럼 기울일 수 있다(박스 중심 기준 회전). 외곽선·음영은 객체를 따르므로 회전 제외.
  //   rot=0(기본)이면 변환을 전혀 걸지 않아 기존 렌더와 동일하다.
  const rot = ((layer.rotation || 0) * Math.PI) / 180;
  if (rot) { ctx.save(); ctx.translate(bcx, bcy); ctx.rotate(rot); ctx.translate(-bcx, -bcy); }

  drawNote(ctx, { lines, x: nx, y: ny, size: noteSize, align, font });

  // 장식 — 레이어에 deco 가 지정된 경우만(기본 미지정; 에디터/사용자 영역).
  if (layer.deco) {
    const lastW = ctx.measureText(lines[lines.length - 1]).width;
    const dx = align === 'right' ? x0 + boxW + noteSize * 0.5 : x0 + lastW + noteSize * 0.5;
    drawDoodle(ctx, { type: layer.deco, x: Math.min(W - margin, dx), y: y0 + boxH - noteSize * 0.3, s: noteSize * 0.34, alpha: 0.9 });
  }

  if (rot) ctx.restore();
}

// ---------- 마무리 한 줄 — 하단 중앙(가독 음영 포함) ----------
function drawClosingLayer(ctx, layer, { W, H, font, scale = 1 }) {
  const cs = Math.round(W * CLOSING_SIZE_RATIO * scale);
  ctx.font = `${cs}px "${font}"`;
  const cw = ctx.measureText(layer.text).width;
  // 위치 override(사용자 드래그, 콘텐츠 0~1) 우선, 없으면 하단 중앙 기본.
  const px = layer.position && Number.isFinite(layer.position.x) ? layer.position.x * W : W / 2;
  const py = layer.position && Number.isFinite(layer.position.y) ? layer.position.y * H : H - cs * 1.5;
  const rot = ((layer.rotation || 0) * Math.PI) / 180; // 마무리도 텍스트처럼 기울일 수 있다(앵커 기준 회전).
  ctx.save();
  if (rot) { ctx.translate(px, py); ctx.rotate(rot); ctx.translate(-px, -py); }
  drawLocalDarken(ctx, { x: px - cw / 2 - cs * 0.7, y: py - cs * 0.8, w: cw + cs * 1.4, h: cs * 1.7, strength: 0.22 });
  drawClosing(ctx, { text: layer.text, cx: px, y: py, size: cs, font });
  ctx.restore();
}
