// buildScene.js — 확정 계약(사이드카 items + 문구 LLM 응답) → 카드 렌더 scene(레이어 목록).
//
// 역할 경계:
//   - 이 파일은 "좌표 해소 + 레이어 조립"만 한다. 순수 함수다(캔버스 컨텍스트·measureText 미사용).
//     → 단위 테스트 대상. 텍스트 폭에 의존하는 배치(정렬·박스·화살표·가독 음영)는 renderCore 책임.
//   - LLM은 좌표를 만들지 않는다(0004 D4). objects[].itemId → items[].id, objects[].anchor →
//     items[].anchors 인덱스로 좌표를 해소한다(OUTLINE_API §2-2, §3).
//
// 레이어 모델(#72 AC: item = 레이어 1개, 켜기/끄기·z순서 독립):
//   - 코멘트 1개 = 레이어 1개. layer.visible 로 켜기/끄기, layers 배열 순서 = z 순서.
//   - 한 레이어 안의 외곽선·문구·화살표·장식은 고정 순서로 함께 그려진다(item 단위로 토글).
//   - 마무리 한 줄(closing)은 별도 비-item 레이어.

import { makeCoverFit } from './coverFit.js';

// overlay-place.mjs 의 톤 기본값(밝은 사진에서 흰 글씨 대비 확보용). style.tone 으로 덮어쓸 수 있다.
const DEFAULT_TONE = { brightness: 0.95, contrast: 1.05, saturate: 1.05, warmth: 0.05, vignette: 0.14 };

const TONE_DOWN_DEFAULT = 0.35; // 무드 톤다운 기본 35%
const TONE_DOWN_MAX = 0.5; // 0~50%

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// 사진정규화 bbox/area 로부터 객체 반지름(사진정규화)을 추정한다. 화살표 도착점 보정용.
// 객체 반지름(캔버스 픽셀) — 화살표 도착점 보정용.
//   bbox 모서리를 픽셀로 변환해 가로/세로 스케일(dw·dh)을 모두 반영한다(세로 사진에서 폭 기준만 쓰면 어긋남).
function itemRadiusPx(item, cf) {
  if (Array.isArray(item.bbox) && item.bbox.length === 4) {
    const [x1, y1, x2, y2] = item.bbox;
    const [px1, py1] = cf.ptPx(x1, y1);
    const [px2, py2] = cf.ptPx(x2, y2);
    return Math.max(Math.abs(px2 - px1), Math.abs(py2 - py1)) / 2;
  }
  if (typeof item.area === 'number' && item.area > 0) {
    return cf.radfPx(Math.sqrt(item.area / Math.PI)); // 면적 비율 → 등가 원 반지름(폭 기준 근사)
  }
  return cf.radfPx(0.04); // 최후 폴백(작게)
}

// note 배열을 줄 단위로 평탄화한다. 한 요소 안의 \n 도 줄바꿈으로 펼친다(빈 줄 제거).
function flattenLines(note) {
  if (!Array.isArray(note)) return [];
  return note
    .flatMap((s) => String(s).split('\n'))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 확정 계약 데이터를 카드 렌더 scene 으로 변환한다.
 *
 * @param {object}   p
 * @param {Array}    p.items     사이드카 items (사진정규화 0~1: id/center/bbox/area/polygons/anchors)
 * @param {object}   p.captions  문구 LLM 응답 { objects:[{itemId,anchor,note}], closing:{text} }
 * @param {{W:number,H:number}} [p.canvas]  카드 캔버스(생략 시 사진 비율 = crop 0). 세로 9:16 맞춤은 #73 내보내기 책임
 * @param {{w:number,h:number}} p.photo   원본 사진 크기(cover-fit 계산용, 필수)
 * @param {object}  [p.style]   { toneDown?:0~0.5, outline?:boolean, tone?:object }
 * @returns {{canvas:{W,H}, tone:object, layers:Array}}
 */
export function buildScene({ items = [], captions = {}, canvas, photo, style = {} }) {
  if (!photo || !(photo.w > 0) || !(photo.h > 0)) {
    throw new Error('buildScene: photo {w,h}(원본 사진 크기)가 필요합니다 — cover-fit 변환에 필수');
  }
  // 캔버스 기본 = 사진 비율(cover-fit 항등 → crop 0). 세로 9:16 맞춤(위아래 패딩)은 #73 내보내기 책임.
  const { W, H } = canvas || { W: photo.w, H: photo.h };
  const cf = makeCoverFit(photo.w, photo.h, W, H);
  const itemById = new Map(items.map((it) => [it.id, it]));

  const tone = {
    ...DEFAULT_TONE,
    ...(style.tone || {}),
    toneDown: clamp(style.toneDown ?? TONE_DOWN_DEFAULT, 0, TONE_DOWN_MAX),
  };

  const layers = [];
  const objects = Array.isArray(captions.objects) ? captions.objects : []; // OBJECTS_EMPTY 경고는 통과될 수 있음

  let noteIndex = -1;
  for (const obj of objects) {
    const item = itemById.get(obj?.itemId);
    if (!item) continue; // ITEM_ID_UNKNOWN 은 상류(검증기)가 ERROR 로 막지만 방어적으로 건너뛴다

    const lines = flattenLines(obj.note);
    if (lines.length === 0) continue; // 빈 문구 → 레이어 의미 없음

    // anchor 인덱스: 누락 시 0(검증기 ANCHOR_DEFAULTED). 범위 밖은 상류 검증이 거부하지만,
    //   경고로 통과해 와도 방어적으로 0 폴백한다.
    const anchors = Array.isArray(item.anchors) ? item.anchors : [];
    let ai = Number.isInteger(obj.anchor) ? obj.anchor : 0;
    if (ai < 0 || ai >= anchors.length) ai = 0;

    // 객체 중심(화살표 도착). center 는 계약상 필수지만 결측 시 중앙으로 방어.
    const center = Array.isArray(item.center) ? item.center : [0.5, 0.5];
    const [cnx, cny] = cf.pt(center[0], center[1]);

    // 노트 배치점 = 사용자가 옮긴 위치(position, 캔버스 0~1) 우선, 없으면 선택된 anchor.
    let anx, any;
    if (obj.position && Number.isFinite(obj.position.x) && Number.isFinite(obj.position.y)) {
      anx = obj.position.x;
      any = obj.position.y;
    } else {
      const a = anchors[ai];
      [anx, any] = a ? cf.pt(a[0], a[1]) : [cnx, cny];
      if (!cf.visible(anx, any)) continue; // 크롭으로 화면 밖 → 노트 둘 자리 없음
    }

    const rPx = itemRadiusPx(item, cf);

    noteIndex++;

    // 외곽선 폴리곤(item 에 있을 때만, style.outline !== false). 여러 닫힌 루프를 각각 픽셀로.
    const polygons = style.outline !== false && Array.isArray(item.polygons) ? item.polygons : [];
    const outlines = polygons
      .filter((loop) => Array.isArray(loop) && loop.length >= 3)
      .map((loop, k) => ({
        pts: loop.map(([x, y]) => cf.ptPx(x, y)),
        dash: (noteIndex + k) % 2 === 1, // 실선/점선 번갈아(손그림 다꾸)
      }));

    layers.push({
      kind: 'note',
      itemId: item.id,
      visible: true,
      anchor: [anx * W, any * H], // 캔버스 픽셀
      center: [cnx * W, cny * H],
      r: rPx,
      lines,
      outlines,
    });
  }

  // 마무리 한 줄 — 별도 레이어(좌표·폰트는 renderCore 가 하단에 고정 배치)
  const closingText = captions.closing && typeof captions.closing.text === 'string' ? captions.closing.text.trim() : '';
  if (closingText) {
    layers.push({ kind: 'closing', itemId: 'closing', visible: true, text: closingText });
  }

  return { canvas: { W, H }, tone, layers };
}
