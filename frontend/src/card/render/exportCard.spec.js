// exportCard.spec.js — computeFitRect(기하) + exportCardPng(오케스트레이션) 단위 테스트.
//
// computeFitRect 는 순수 함수, exportCardPng 의 입력 검증·출력 캔버스 크기는 Canvas mock 으로 검증한다.
// 실제 래스터화(filter blur·toBlob 픽셀 결과)는 Canvas 픽셀 의존이라 단위 테스트 밖 —
//   폰트·외곽선 깨짐/패딩 모양/세로·가로 결과는 card-preview.html 에서 수동 확인한다.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeFitRect, exportCardPng, FIXED_W, FIXED_H } from './exportCard.js';

describe('computeFitRect — 9:16(1080×1920) contain 레터박스 맞춤', () => {
  it('정확히 9:16 사진은 패딩 없이 틀을 꽉 채운다', () => {
    expect(computeFitRect(540, 960)).toEqual({ cw: 1080, ch: 1920, dx: 0, dy: 0 });
  });

  it('3:4 세로 사진은 폭에 맞고 위아래 패딩이 생긴다', () => {
    // s = min(1080/960, 1920/1280) = 1.125 → 1080×1440, dy=(1920-1440)/2
    expect(computeFitRect(960, 1280)).toEqual({ cw: 1080, ch: 1440, dx: 0, dy: 240 });
  });

  it('4:3 가로 사진은 폭에 맞고 위아래 패딩이 더 크다', () => {
    // s = min(1080/1200, 1920/900) = 0.9 → 1080×810, dy=(1920-810)/2
    expect(computeFitRect(1200, 900)).toEqual({ cw: 1080, ch: 810, dx: 0, dy: 555 });
  });

  it('9:16보다 세로로 긴 사진은 높이에 맞고 좌우 패딩이 생긴다', () => {
    // s = min(1080/1080, 1920/2400) = 0.8 → 864×1920, dx=(1080-864)/2
    expect(computeFitRect(1080, 2400)).toEqual({ cw: 864, ch: 1920, dx: 108, dy: 0 });
  });

  it('정사각 사진은 폭에 맞고 위아래 패딩(dy=420)', () => {
    expect(computeFitRect(1000, 1000)).toEqual({ cw: 1080, ch: 1080, dx: 0, dy: 420 });
  });

  it('항상 틀(1080×1920) 안에 들어가고, 중앙 정렬(±1px), 비율을 보존한다', () => {
    const cases = [
      [4032, 3024], [3024, 4032], [1920, 1080], [800, 800], [1170, 2532], [640, 480],
    ];
    for (const [w, h] of cases) {
      const r = computeFitRect(w, h);
      expect(r.cw).toBeLessThanOrEqual(FIXED_W);
      expect(r.ch).toBeLessThanOrEqual(FIXED_H);
      expect(r.dx).toBeGreaterThanOrEqual(0);
      expect(r.dy).toBeGreaterThanOrEqual(0);
      // 중앙 정렬: 양쪽 패딩 합 + 콘텐츠 = 틀 (반올림 ±1px)
      expect(Math.abs(2 * r.dx + r.cw - FIXED_W)).toBeLessThanOrEqual(1);
      expect(Math.abs(2 * r.dy + r.ch - FIXED_H)).toBeLessThanOrEqual(1);
      // 비율 보존(반올림 오차 허용)
      expect(r.cw / r.ch).toBeCloseTo(w / h, 1);
    }
  });

  it('export 틀 크기를 바꿀 수 있다(1080 정사각 틀)', () => {
    // s = min(1080/1000, 1080/500) = 1.08 → 1080×540, dy=(1080-540)/2
    expect(computeFitRect(1000, 500, 1080, 1080)).toEqual({ cw: 1080, ch: 540, dx: 0, dy: 270 });
  });

  it('잘못된 크기는 throw 한다', () => {
    expect(() => computeFitRect(0, 100)).toThrow();
    expect(() => computeFitRect(100, -1)).toThrow();
    expect(() => computeFitRect(100, 100, 0, 1920)).toThrow();
  });
});

// ── exportCardPng 오케스트레이션 (Canvas mock) ─────────────────────────────
// jsdom 에는 실제 Canvas 2D 가 없으므로 createElement('canvas') 를 stub 으로 바꿔
//   입력 검증과 출력 캔버스 크기만 검증한다(픽셀 결과는 수동 확인).
function stubCtx() {
  const noop = () => {};
  return new Proxy(
    {},
    {
      get(_t, p) {
        if (p === 'measureText') return () => ({ width: 10 });
        if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop: noop });
        return noop;
      },
      set: () => true, // ctx.fillStyle = ... / ctx.filter = ... 등 허용
    },
  );
}

function installCanvasMock() {
  const created = [];
  const real = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'canvas') {
      const c = {
        width: 0,
        height: 0,
        getContext: () => stubCtx(),
        toBlob: (cb) => cb(new Blob(['x'], { type: 'image/png' })),
      };
      created.push(c);
      return c;
    }
    return real(tag);
  });
  return created;
}

describe('exportCardPng — 입력 검증 + 출력 캔버스 크기', () => {
  afterEach(() => vi.restoreAllMocks());

  const inputs = (w, h) => ({ items: [], captions: {}, photo: { w, h } });
  const img = (w, h) => ({ width: w, height: h, naturalWidth: w, naturalHeight: h });

  it('photo {w,h} 메타데이터가 없으면 reject', async () => {
    await expect(exportCardPng({ items: [], captions: {} }, { photo: img(100, 100) })).rejects.toThrow();
  });

  it('디코딩된 사진(assets.photo)이 없으면 reject — 사진 없는 성공 PNG 방지', async () => {
    await expect(exportCardPng(inputs(800, 600), {})).rejects.toThrow(/사진/);
  });

  it('사진이 아직 로드되지 않았으면(width 0) reject', async () => {
    await expect(exportCardPng(inputs(800, 600), { photo: img(0, 0) })).rejects.toThrow(/사진/);
  });

  it('native: 출력 캔버스가 사진 크기·비율이다 (가로면 가로)', async () => {
    const created = installCanvasMock();
    const blob = await exportCardPng(inputs(1280, 720), { photo: img(1280, 720) }, { format: 'native' });
    expect(blob).toBeInstanceOf(Blob);
    expect(created).toHaveLength(1); // content 캔버스 1개
    expect(created[0]).toMatchObject({ width: 1280, height: 720 });
  });

  it('native: 세로 사진은 세로 캔버스', async () => {
    const created = installCanvasMock();
    await exportCardPng(inputs(960, 1280), { photo: img(960, 1280) }, { format: 'native' });
    expect(created[0]).toMatchObject({ width: 960, height: 1280 });
  });

  it('fixed: 출력 틀 캔버스가 1080×1920', async () => {
    const created = installCanvasMock();
    await exportCardPng(inputs(1280, 720), { photo: img(1280, 720) }, { format: 'fixed' });
    const out = created[created.length - 1]; // content(cw×ch) 다음에 out(틀)
    expect(out).toMatchObject({ width: FIXED_W, height: FIXED_H });
  });

  it('fixed: 틀 크기를 opts.width/height 로 바꿀 수 있다', async () => {
    const created = installCanvasMock();
    await exportCardPng(inputs(1000, 1000), { photo: img(1000, 1000) }, { format: 'fixed', width: 1080, height: 1080 });
    const out = created[created.length - 1];
    expect(out).toMatchObject({ width: 1080, height: 1080 });
  });
});
