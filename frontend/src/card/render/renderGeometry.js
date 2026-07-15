// renderGeometry.js — 카드 렌더의 순수 기하 헬퍼(캔버스 비의존, 단위 테스트 대상).
// renderCore(배치)·renderPrimitives(외곽선 스트로크)가 공유한다.

// 단위 벡터(영벡터는 그대로). 노트→객체 방향·정렬 계산용.
export function unit(v) {
  const m = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / m, v[1] / m];
}

// 폴리곤을 중심에서 바깥으로 일정 픽셀 밀어낸다(객체 살짝 바깥에 그려 가독성↑, 형태는 유지).
export function offsetFromCentroid(pts, off) {
  if (!off) return pts;
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length;
  cy /= pts.length;
  return pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
    return [x + (dx / d) * off, y + (dy / d) * off];
  });
}

// 점이 많은 폴리곤을 균일 간격으로 다운샘플(손그림 스트로크 + 성능).
export function downsampleClosed(pts, max) {
  if (pts.length <= max) return pts;
  const out = [], step = pts.length / max;
  for (let i = 0; i < max; i++) out.push(pts[Math.floor(i * step)]);
  return out;
}

// 닫힌 폴리곤을 이웃 평균으로 부드럽게(손그림 윤곽). iters 회 반복.
export function smoothClosed(pts, iters) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const n = p.length, q = [];
    for (let i = 0; i < n; i++) {
      const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
      q.push([(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4]);
    }
    p = q;
  }
  return p;
}
