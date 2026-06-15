import { describe, it, expect } from 'vitest';
import { renderCard } from './renderCore.js';
import { buildScene } from './buildScene.js';
import { sampleItems, sampleCaptions, samplePhoto } from './__fixtures__/sample.js';

// renderCore 의 픽셀 출력은 실제 캔버스가 필요해 jsdom 에선 검증하지 않는다(시각 확인 = card-preview.html).
// 대신 (1) 모듈 import, (2) 모든 코드 경로가 런타임 오류 없이 도는지를 mock 2D 컨텍스트로 지킨다
//   — measureText/luminance/outline/arrow 등에서 미정의 심볼·throw 를 잡는 안전망.

function makeMockCtx() {
  const gradient = { addColorStop() {} };
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {}; // 그 외 모든 메서드는 no-op
    },
    set() {
      return true; // font/fillStyle/filter 등 속성 set 허용
    },
  };
  const base = {
    measureText: (t) => ({ width: (t ? String(t).length : 0) * 10 }),
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    getImageData: () => ({ data: new Uint8ClampedArray(16) }),
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
