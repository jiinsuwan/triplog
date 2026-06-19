// exportCard.spec.js — computeFitRect(9:16 contain 맞춤) 단위 테스트.
//
// 래스터화(exportCardPng 의 filter blur·toBlob)는 실제 Canvas 픽셀에 의존하므로 jsdom 단위 테스트
//   밖이다 — 폰트·외곽선 깨짐/패딩 모양/1080×1920 PNG 는 card-preview.html 에서 수동 확인한다.

import { describe, it, expect } from 'vitest';
import { computeFitRect, FIXED_W, FIXED_H } from './exportCard.js';

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
