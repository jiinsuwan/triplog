import { describe, it, expect } from 'vitest';
import { renderCard } from './renderCore.js';
import { buildScene } from './buildScene.js';
import { sampleItems, sampleCaptions, samplePhoto } from './__fixtures__/sample.js';

// renderCore 의 픽셀 출력은 실제 캔버스가 필요해 jsdom 에선 검증하지 않는다(시각 확인 = card-preview.html).
// 대신 (1) 모듈 import, (2) 모든 코드 경로가 런타임 오류 없이 도는지, (3) 사진·문구·외곽선·톤다운이
//   실제로 그려지는지(드로잉 메서드 호출 기록)를 mock 2D 컨텍스트로 지킨다 — 픽셀 비교는 아니지만
//   "그리지 않는" 회귀(예: 사진/문구 누락)는 잡는다. ctx.__calls 로 호출 횟수를 읽는다.

function makeMockCtx() {
  const calls = {};
  const rec = (name) => { calls[name] = (calls[name] || 0) + 1; };
  const gradient = { addColorStop() {} };
  const base = {
    measureText: (t) => { rec('measureText'); return { width: (t ? String(t).length : 0) * 10 }; },
    createRadialGradient: () => { rec('createRadialGradient'); return gradient; },
    createLinearGradient: () => { rec('createLinearGradient'); return gradient; },
    getImageData: () => { rec('getImageData'); return { data: new Uint8ClampedArray(16) }; },
    drawImage: (...args) => { rec('drawImage'); calls.drawImageArgs = args; }, // 좌표 인자 캡처(NaN 가드)
  };
  const handler = {
    get(target, prop) {
      if (prop === '__calls') return calls;
      if (prop in target) return target[prop];
      return () => rec(prop); // 그 외 메서드는 호출만 기록(no-op)
    },
    set() {
      return true; // font/fillStyle/filter 등 속성 set 허용
    },
  };
  return new Proxy(base, handler);
}

describe('renderCore — import 스모크', () => {
  it('renderCard 를 함수로 export 한다', () => {
    expect(typeof renderCard).toBe('function');
  });
});

describe('renderCore — mock 컨텍스트 no-throw (런타임 안전망)', () => {
  it('레퍼런스 scene 을 오류 없이 렌더한다', () => {
    const scene = buildScene({ items: sampleItems, captions: sampleCaptions, canvas: { W: 1080, H: 1920 }, photo: samplePhoto });
    expect(() => renderCard(makeMockCtx(), scene, { photo: {} })).not.toThrow();
  });

  it('사진 없이도, 빈 레이어 scene 도 오류 없이 처리한다', () => {
    const empty = { canvas: { W: 1080, H: 1920 }, tone: { toneDown: 0.35 }, layers: [] };
    expect(() => renderCard(makeMockCtx(), empty, {})).not.toThrow();
  });
});

describe('renderCore — 핵심 드로잉 호출 기록', () => {
  it('레퍼런스 scene 에서 사진·문구·외곽선·톤다운을 실제로 그린다', () => {
    const ctx = makeMockCtx();
    const scene = buildScene({ items: sampleItems, captions: sampleCaptions, canvas: { W: 1080, H: 1920 }, photo: samplePhoto });
    renderCard(ctx, scene, { photo: { width: 960, height: 1280 } }); // 크기 있는 image stub(좌표 NaN 방지)
    const c = ctx.__calls;
    expect(c.drawImage || 0).toBeGreaterThanOrEqual(1); // 사진
    expect(c.drawImageArgs.slice(1).every(Number.isFinite)).toBe(true); // 사진 좌표(x,y,w,h) 유한 — NaN 가드
    expect(c.fillText || 0).toBeGreaterThanOrEqual(1); // 문구(노트/마무리)
    expect(c.stroke || 0).toBeGreaterThanOrEqual(1); // 외곽선/화살표
    expect(c.fillRect || 0).toBeGreaterThanOrEqual(1); // 톤다운/가독 음영
  });

  it('사진 자산이 없으면 drawImage 대신 배경을 채운다', () => {
    const ctx = makeMockCtx();
    const scene = buildScene({ items: sampleItems, captions: sampleCaptions, canvas: { W: 1080, H: 1920 }, photo: samplePhoto });
    renderCard(ctx, scene, {}); // assets.photo 없음
    const c = ctx.__calls;
    expect(c.drawImage || 0).toBe(0);
    expect(c.fillRect || 0).toBeGreaterThanOrEqual(1); // 배경 + 음영
  });
});
