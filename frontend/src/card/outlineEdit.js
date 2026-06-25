// 외곽선 보정 팝업 순수 헬퍼 (S4-LOG-01 PR2). 캔버스/DOM 무관 — 단위 테스트 대상.
// 좌표는 사진 정규화 0~1. polygons = [[[x,y], ...], ...](여러 닫힌 루프).

// 점(0~1)이 폴리곤 루프 안인지 — 광선 투사(ray casting).
export function pointInLoop(loop, x, y) {
  if (!Array.isArray(loop)) return false
  let inside = false
  const n = loop.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = loop[i]?.[0]
    const yi = loop[i]?.[1]
    const xj = loop[j]?.[0]
    const yj = loop[j]?.[1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export function pointInPolygons(polygons, x, y) {
  return Array.isArray(polygons) && polygons.some((loop) => pointInLoop(loop, x, y))
}

// 클릭이 안쪽인 item 중 가장 작은(위에 있는) 것 — 선택 hit-test. items = [{id, polygons}].
export function itemAt(items, x, y) {
  let best = null
  let bestArea = Infinity
  for (const it of items ?? []) {
    if (pointInPolygons(it.polygons, x, y)) {
      const a = bboxArea(it.polygons)
      if (a < bestArea) {
        best = it
        bestArea = a
      }
    }
  }
  return best
}

export function bbox(polygons) {
  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0
  let any = false
  for (const loop of polygons ?? []) {
    if (!Array.isArray(loop)) continue
    for (const p of loop) {
      const x = p?.[0] ?? 0
      const y = p?.[1] ?? 0
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      any = true
    }
  }
  return any ? { minX, minY, maxX, maxY } : null
}

function bboxArea(polygons) {
  const b = bbox(polygons)
  return b ? (b.maxX - b.minX) * (b.maxY - b.minY) : Infinity
}

// 폴리곤 bbox 중점(배지·문구 화살표 도착점 — BE addGeometry 와 같은 식). 렌더용 center.
export function bboxCenter(polygons) {
  const b = bbox(polygons)
  if (!b) return [0.5, 0.5]
  return [round4((b.minX + b.maxX) / 2), round4((b.minY + b.maxY) / 2)]
}

// 박스 두 모서리(0~1) → 정규화 [x1,y1,x2,y2] (x1<x2, y1<y2). 너무 작으면 null(폐기 = 실수 드래그).
export function normalizeBox(x0, y0, x1, y1, min = 0.01) {
  const xa = clamp01(Math.min(x0, x1))
  const xb = clamp01(Math.max(x0, x1))
  const ya = clamp01(Math.min(y0, y1))
  const yb = clamp01(Math.max(y0, y1))
  if (xb - xa < min || yb - ya < min) return null
  return [xa, ya, xb, yb]
}

export function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

function round4(v) {
  return Math.round(v * 10000) / 10000
}
