// record 뷰 공유 로직·상수 — 다녀옴 미리보기(RecordPlacementBody, 타임라인형)와
// 카드 사진 고르기(RecordRouteMap/RecordStop, 카드형)는 시각·CSS는 다르지만
// "위경도 → 0~100 뷰박스 투영"과 장소 타입 아이콘은 동일하다. 순수 로직만 공유한다.

// 장소 타입 → 아이콘.
export const TYPE_ICON = { ATTRACTION: '🏛', RESTAURANT: '🍽', CAFE: '☕', LODGING: '🏨' }

// 유효 좌표만(빈 문자열·NaN 제외). Number('') === 0 함정으로 원점에 잘못 찍히는 것을 막는다.
function num(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// 일정 stop들을 0~100 뷰박스 좌표로 투영한다. x=경도(서→동), y=위도(북이 위, y축 반전).
// 유효 좌표가 있는 stop만, 점이 1개거나 좌표가 모두 같으면 중앙(50) 폴백. 반환 [{ id, no, x, y }].
export function projectStopsToViewBox(stops) {
  const pts = (stops ?? [])
    .map((stop) => ({ stop, lat: num(stop.place?.latitude), lng: num(stop.place?.longitude) }))
    .filter((p) => p.lat != null && p.lng != null)
  if (!pts.length) return []
  const lats = pts.map((p) => p.lat)
  const lngs = pts.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const minLng = Math.min(...lngs)
  const spanLat = Math.max(...lats) - minLat || 1
  const spanLng = Math.max(...lngs) - minLng || 1
  const P = 14
  const S = 100 - P * 2
  return pts.map(({ stop, lat, lng }, i) => ({
    id: stop.id ?? i,
    no: stop.sortOrder ?? i + 1,
    x: pts.length === 1 ? 50 : P + ((lng - minLng) / spanLng) * S,
    y: pts.length === 1 ? 50 : P + (1 - (lat - minLat) / spanLat) * S,
  }))
}
