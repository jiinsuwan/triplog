import { describe, it, expect } from 'vitest';
import { makeCoverFit } from './coverFit.js';

const W = 1080;
const H = 1920; // 카드 캔버스 9:16 고정

describe('makeCoverFit — cover-fit 좌표 변환', () => {
  it('사진 aspect = 캔버스 aspect(9:16) 이면 크롭 없이 그대로 매핑', () => {
    const cf = makeCoverFit(540, 960, W, H); // 9:16
    expect(cf.ox).toBe(0);
    expect(cf.oy).toBe(0);
    expect(cf.ptPx(0, 0)).toEqual([0, 0]);
    expect(cf.ptPx(1, 1)).toEqual([W, H]);
    expect(cf.ptPx(0.5, 0.5)).toEqual([540, 960]);
  });

  it('정사각 사진은 좌우가 크롭되고 중심은 캔버스 중심에 온다', () => {
    const cf = makeCoverFit(1000, 1000, W, H);
    // scale = max(1080/1000, 1920/1000) = 1.92 → dw=1920, dh=1920, ox=-420, oy=0
    expect(cf.dw).toBeCloseTo(1920, 6);
    expect(cf.dh).toBeCloseTo(1920, 6);
    expect(cf.ox).toBeCloseTo(-420, 6);
    expect(cf.oy).toBeCloseTo(0, 6);
    expect(cf.ptPx(0.5, 0.5)).toEqual([540, 960]); // 사진 중심 → 캔버스 중심
  });

  it('가로로 넓은(4:3) 사진은 양옆이 크롭된다', () => {
    const cf = makeCoverFit(1200, 900, W, H);
    // scale = max(0.9, 2.1333) = 2.1333 → dw≈2560, dh=1920, ox≈-740
    expect(cf.dh).toBeCloseTo(1920, 6);
    expect(cf.ox).toBeCloseTo(-740, 0);
    const [cx, cy] = cf.ptPx(0.5, 0.5);
    expect(cx).toBeCloseTo(540, 6);
    expect(cy).toBeCloseTo(960, 6);
  });

  it('세로로 더 긴(1:2) 사진은 위아래가 크롭된다', () => {
    const cf = makeCoverFit(1000, 2000, W, H);
    // scale = max(1.08, 0.96) = 1.08 → dw=1080, dh=2160, ox=0, oy=-120
    expect(cf.dw).toBeCloseTo(1080, 6);
    expect(cf.oy).toBeCloseTo(-120, 6);
    expect(cf.ptPx(0.5, 0.5)).toEqual([540, 960]);
  });

  describe('visible — 크롭으로 화면 밖에 나간 좌표 판정', () => {
    it('정사각 사진에서 사진 좌상단(0,0)은 좌측 크롭되어 보이지 않는다', () => {
      const cf = makeCoverFit(1000, 1000, W, H);
      const [nx, ny] = cf.pt(0, 0); // 캔버스정규화
      expect(cf.visible(nx, ny)).toBe(false);
    });

    it('중심(0.5,0.5)은 항상 보인다', () => {
      const cf = makeCoverFit(1000, 1000, W, H);
      const [nx, ny] = cf.pt(0.5, 0.5);
      expect(cf.visible(nx, ny)).toBe(true);
    });

    it('여유 허용치(±0.03) 안쪽은 보이는 것으로 본다', () => {
      const cf = makeCoverFit(540, 960, W, H); // 크롭 없음
      expect(cf.visible(-0.02, 0.5)).toBe(true);
      expect(cf.visible(1.02, 0.5)).toBe(true);
      expect(cf.visible(-0.1, 0.5)).toBe(false);
    });
  });

  it('radf/radfPx — 폭 기준 반지름 변환', () => {
    const cf = makeCoverFit(1000, 1000, W, H); // dw=1920
    expect(cf.radfPx(0.1)).toBeCloseTo(0.1 * 1920, 6); // 192px
    expect(cf.radf(0.1)).toBeCloseTo((0.1 * 1920) / W, 6);
  });

  it('잘못된 크기는 예외', () => {
    expect(() => makeCoverFit(0, 100, W, H)).toThrow();
    expect(() => makeCoverFit(100, 100, 0, H)).toThrow();
  });
});
