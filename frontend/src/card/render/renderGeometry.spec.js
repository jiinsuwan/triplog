import { describe, it, expect } from 'vitest';
import { unit, offsetFromCentroid, downsampleClosed, smoothClosed } from './renderGeometry.js';

// renderCore 에서 분리한 순수 기하 헬퍼(캔버스 비의존)의 단위 테스트.
// 외곽선(SAM 폴리곤) 리샘플·오프셋·스무딩과 방향 벡터 계산의 회귀를 잡는다.

describe('unit — 단위 벡터', () => {
  it('벡터를 길이 1로 정규화한다', () => {
    const [x, y] = unit([3, 4]);
    expect(Math.hypot(x, y)).toBeCloseTo(1);
    expect(x).toBeCloseTo(0.6);
    expect(y).toBeCloseTo(0.8);
  });

  it('영벡터는 0으로 나누지 않고 [0,0] 을 유지한다', () => {
    expect(unit([0, 0])).toEqual([0, 0]);
  });
});

describe('offsetFromCentroid — 중심에서 바깥으로 밀어내기', () => {
  it('off=0 이면 원본 배열을 그대로 돌려준다', () => {
    const pts = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(offsetFromCentroid(pts, 0)).toBe(pts);
  });

  it('각 점을 중심에서 바깥 방향으로 off 만큼 민다', () => {
    const pts = [[0, 0], [2, 0], [2, 2], [0, 2]]; // centroid (1,1)
    const out = offsetFromCentroid(pts, Math.SQRT2);
    // (0,0) 은 중심에서 (-1,-1)/√2 방향, √2 만큼 밀면 (-1,-1)
    expect(out[0][0]).toBeCloseTo(-1);
    expect(out[0][1]).toBeCloseTo(-1);
  });
});

describe('downsampleClosed — 균일 간격 다운샘플', () => {
  it('점 수가 max 이하면 원본을 그대로 돌려준다', () => {
    const pts = [[0, 0], [1, 1]];
    expect(downsampleClosed(pts, 5)).toBe(pts);
  });

  it('max 초과면 정확히 max 개로 줄이고 첫 점을 유지한다', () => {
    const pts = Array.from({ length: 100 }, (_, i) => [i, i]);
    const out = downsampleClosed(pts, 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual([0, 0]);
  });
});

describe('smoothClosed — 이웃 평균 스무딩', () => {
  it('iters=0 이면 원본을 그대로 돌려준다', () => {
    const pts = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(smoothClosed(pts, 0)).toBe(pts);
  });

  it('정사각형을 1회 스무딩하면 점 수는 유지되고 각 점이 (prev+2·cur+next)/4 로 이동한다', () => {
    const pts = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const out = smoothClosed(pts, 1);
    expect(out).toHaveLength(4);
    // 첫 점 = ((0,10) + 2·(0,0) + (10,0)) / 4 = (2.5, 2.5)
    expect(out[0][0]).toBeCloseTo(2.5);
    expect(out[0][1]).toBeCloseTo(2.5);
  });
});
