import { describe, it, expect } from 'vitest';
import { buildScene } from './buildScene.js';
import { sampleItems, sampleCaptions, samplePhoto } from './__fixtures__/sample.js';

const canvas = { W: 1080, H: 1920 };

// 9:16 사진이면 cover-fit 이 항등이라 캔버스 픽셀 = [x*1080, y*1920].
function build(overrides = {}) {
  return buildScene({
    items: sampleItems,
    captions: sampleCaptions,
    canvas,
    photo: samplePhoto,
    ...overrides,
  });
}

describe('buildScene — 레이어 모델 (AC: item = 레이어 1개, 켜기/끄기·z순서)', () => {
  it('코멘트 1개당 레이어 1개 + 마무리 레이어 1개', () => {
    const scene = build();
    expect(scene.layers).toHaveLength(sampleCaptions.objects.length + 1);
    const notes = scene.layers.filter((l) => l.kind === 'note');
    const closings = scene.layers.filter((l) => l.kind === 'closing');
    expect(notes).toHaveLength(3);
    expect(closings).toHaveLength(1);
  });

  it('각 레이어는 itemId 와 visible 을 가진다(켜기/끄기 단위)', () => {
    const scene = build();
    expect(scene.layers.map((l) => l.itemId)).toEqual([0, 3, 5, 'closing']);
    expect(scene.layers.every((l) => l.visible === true)).toBe(true);
  });

  it('레이어 순서 = 응답 objects 순서(z 순서의 토대)', () => {
    const scene = build();
    const noteIds = scene.layers.filter((l) => l.kind === 'note').map((l) => l.itemId);
    expect(noteIds).toEqual([0, 3, 5]);
  });
});

describe('buildScene — 좌표 해소(itemId/anchor → 픽셀)', () => {
  it('note 배치점 = 선택된 anchor 의 캔버스 픽셀', () => {
    const scene = build();
    const l0 = scene.layers.find((l) => l.itemId === 0);
    // item 0 anchors[0] = [0.3, 0.22] → [324, 422.4]
    expect(l0.anchor[0]).toBeCloseTo(0.3 * 1080, 6);
    expect(l0.anchor[1]).toBeCloseTo(0.22 * 1920, 6);
  });

  it('center = 객체 중심의 캔버스 픽셀(화살표 도착점)', () => {
    const scene = build();
    const l0 = scene.layers.find((l) => l.itemId === 0);
    expect(l0.center[0]).toBeCloseTo(0.675 * 1080, 6);
    expect(l0.center[1]).toBeCloseTo(0.55 * 1920, 6);
  });

  it('anchor 인덱스로 후보를 고른다', () => {
    const scene = buildScene({
      items: sampleItems,
      captions: { objects: [{ itemId: 0, anchor: 1, note: ['x'] }] },
      canvas,
      photo: samplePhoto,
    });
    // item 0 anchors[1] = [0.82, 0.62]
    expect(scene.layers[0].anchor[0]).toBeCloseTo(0.82 * 1080, 6);
    expect(scene.layers[0].anchor[1]).toBeCloseTo(0.62 * 1920, 6);
  });

  it('외곽선 폴리곤은 닫힌 루프별로 픽셀 좌표가 된다', () => {
    const scene = build();
    const l0 = scene.layers.find((l) => l.itemId === 0);
    expect(l0.outlines).toHaveLength(1);
    expect(l0.outlines[0].pts[0]).toEqual([0.6 * 1080, 0.4 * 1920]);
    expect(l0.outlines[0].pts).toHaveLength(4);
  });

  it('폴리곤이 없는 item(grid)은 외곽선 없음', () => {
    const scene = build();
    const l5 = scene.layers.find((l) => l.itemId === 5);
    expect(l5.outlines).toHaveLength(0);
  });
});

describe('buildScene — 방어적 처리(검증기가 경고로 통과시키는 케이스)', () => {
  it('anchor 누락 → 0번 채택', () => {
    const scene = buildScene({
      items: sampleItems,
      captions: { objects: [{ itemId: 0, note: ['x'] }] },
      canvas,
      photo: samplePhoto,
    });
    expect(scene.layers[0].anchor[0]).toBeCloseTo(0.3 * 1080, 6);
  });

  it('anchor 범위 밖 → 0번으로 보정', () => {
    const scene = buildScene({
      items: sampleItems,
      captions: { objects: [{ itemId: 0, anchor: 99, note: ['x'] }] },
      canvas,
      photo: samplePhoto,
    });
    expect(scene.layers[0].anchor[0]).toBeCloseTo(0.3 * 1080, 6);
  });

  it('알 수 없는 itemId → 해당 레이어 건너뜀', () => {
    const scene = buildScene({
      items: sampleItems,
      captions: { objects: [{ itemId: 999, anchor: 0, note: ['x'] }] },
      canvas,
      photo: samplePhoto,
    });
    expect(scene.layers.filter((l) => l.kind === 'note')).toHaveLength(0);
  });

  it('빈 문구 → 레이어 건너뜀', () => {
    const scene = buildScene({
      items: sampleItems,
      captions: { objects: [{ itemId: 0, anchor: 0, note: ['', '   '] }] },
      canvas,
      photo: samplePhoto,
    });
    expect(scene.layers.filter((l) => l.kind === 'note')).toHaveLength(0);
  });

  it('note 요소 내부 줄바꿈(\\n)은 줄로 펼쳐진다', () => {
    const scene = buildScene({
      items: sampleItems,
      captions: { objects: [{ itemId: 0, anchor: 0, note: ['첫줄\n둘째줄'] }] },
      canvas,
      photo: samplePhoto,
    });
    expect(scene.layers[0].lines).toEqual(['첫줄', '둘째줄']);
  });

  it('objects 누락/빈 배열 → note 레이어 없음(마무리만)', () => {
    const empty = buildScene({ items: sampleItems, captions: { closing: { text: '끝' } }, canvas, photo: samplePhoto });
    expect(empty.layers.filter((l) => l.kind === 'note')).toHaveLength(0);
    expect(empty.layers.filter((l) => l.kind === 'closing')).toHaveLength(1);
  });

  it('closing 누락 → 마무리 레이어 없음', () => {
    const scene = buildScene({
      items: sampleItems,
      captions: { objects: [{ itemId: 0, anchor: 0, note: ['x'] }] },
      canvas,
      photo: samplePhoto,
    });
    expect(scene.layers.filter((l) => l.kind === 'closing')).toHaveLength(0);
  });
});

describe('buildScene — 캔버스 비율과 anchor 가시성', () => {
  it('렌더 캔버스 = 사진 비율이면 가장자리 anchor 도 모두 살아남는다(crop 없음)', () => {
    // 제품 렌더 규약: 캔버스를 사진 비율로 둬 cover-fit 이 항등 → 화면 밖 제외 0.
    //   (이전에 캔버스를 1080×1920 고정으로 두면 좌우 크롭으로 문구가 사라지던 회귀 가드)
    const items = [
      { id: 0, center: [0.5, 0.5], bbox: [0.0, 0.0, 0.2, 0.2], anchors: [[0.02, 0.5, 0.9]] },
      { id: 1, center: [0.5, 0.5], bbox: [0.8, 0.8, 1.0, 1.0], anchors: [[0.98, 0.5, 0.9]] },
    ];
    const scene = buildScene({
      items,
      captions: { objects: [{ itemId: 0, anchor: 0, note: ['a'] }, { itemId: 1, anchor: 0, note: ['b'] }] },
      canvas: { W: 960, H: 1280 },
      photo: { w: 960, h: 1280 },
    });
    expect(scene.layers.filter((l) => l.kind === 'note')).toHaveLength(2);
  });

  it('캔버스 ≠ 사진 비율이면 크롭 영역 anchor 는 제외된다(coverFit 함수 방어 — 제품 경로 아님)', () => {
    // coverFit 은 cover-fit 함수라 캔버스≠사진비율이면 크롭이 생긴다. 제품 렌더는 항상 캔버스=사진비율(crop 0)
    //   이고 9:16 맞춤은 #73 내보내기 위아래 패딩이라, 이 경로로 들어가지 않는다(함수 방어 확인용).
    const items = [{ id: 0, center: [0.5, 0.5], bbox: [0.4, 0.4, 0.6, 0.6], anchors: [[0.0, 0.5, 0.9]] }];
    const scene = buildScene({
      items,
      captions: { objects: [{ itemId: 0, anchor: 0, note: ['x'] }] },
      canvas,
      photo: { w: 1000, h: 1000 },
    });
    expect(scene.layers.filter((l) => l.kind === 'note')).toHaveLength(0);
  });
});

describe('buildScene — 톤·옵션', () => {
  it('톤다운 기본 35%', () => {
    expect(build().tone.toneDown).toBeCloseTo(0.35, 6);
  });

  it('톤다운 0~50% 로 클램프', () => {
    expect(build({ style: { toneDown: 0.9 } }).tone.toneDown).toBe(0.5);
    expect(build({ style: { toneDown: -1 } }).tone.toneDown).toBe(0);
  });

  it('style.outline=false 면 외곽선 생성 안 함', () => {
    const scene = build({ style: { outline: false } });
    expect(scene.layers.filter((l) => l.kind === 'note').every((l) => l.outlines.length === 0)).toBe(true);
  });

  it('photo 크기 없으면 예외(cover-fit 불가)', () => {
    expect(() => buildScene({ items: sampleItems, captions: sampleCaptions, canvas })).toThrow();
  });
});

// 미리보기=export 일관성의 핵심: 사용자가 준 회전·위치 override 가 레이어 끝까지 전파돼야 한다(S4-LOG-02).
describe('buildScene — 회전·위치 override 전파 (회귀 가드)', () => {
  it('note 레이어가 obj.rotation 을 전파한다', () => {
    const scene = build({ captions: { objects: [{ itemId: 0, anchor: 0, note: ['기울인 문구'], rotation: 17 }] } });
    expect(scene.layers.find((l) => l.kind === 'note').rotation).toBe(17);
  });

  it('rotation 미지정 note 는 0', () => {
    expect(build().layers.find((l) => l.kind === 'note').rotation).toBe(0);
  });

  it('closing 레이어가 position·rotation 을 전파한다', () => {
    const scene = build({ captions: { closing: { text: '끝', position: { x: 0.3, y: 0.4 }, rotation: -12 } } });
    const closing = scene.layers.find((l) => l.kind === 'closing');
    expect(closing.position).toEqual({ x: 0.3, y: 0.4 });
    expect(closing.rotation).toBe(-12);
  });

  it('position·rotation 미지정 closing 은 position=null, rotation=0', () => {
    const closing = build().layers.find((l) => l.kind === 'closing');
    expect(closing.position).toBeNull();
    expect(closing.rotation).toBe(0);
  });
});
