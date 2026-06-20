import { reactive } from 'vue'

// 기록 뷰 사진 드래그(포인터 이벤트 기반).
// HTML5 네이티브 드래그앤드랍은 실제 마우스에서 초기화가 불안정해, 에디터 텍스트 드래그와
// 같은 포인터 이벤트 방식으로 직접 구현한다. 모듈 단일 상태를 같은 화면의 칩(드래그 소스)·
// 장소/트레이(드롭 타깃)·고스트가 공유한다. 드롭 지점은 elementFromPoint 로 판정한다.
const drag = reactive({
  active: false,
  photoId: null,
  alt: '',
  x: 0, // 고스트 위치(뷰포트 px)
  y: 0,
  overStopId: null, // 현재 포인터 아래 장소 id (하이라이트용)
  overTray: false, // 현재 포인터가 미분류 트레이 위인지
})

let handlers = { place: null, unplace: null }

// 포인터 좌표 아래의 드롭 타깃(장소 또는 트레이)을 찾는다. 고스트는 pointer-events:none 이라
// elementFromPoint 를 막지 않는다.
function resolveTarget(x, y) {
  const el = document.elementFromPoint(x, y)
  if (!el) return { stopId: null, tray: false }
  const stop = el.closest('[data-stop-id]')
  if (stop) return { stopId: Number(stop.dataset.stopId), tray: false }
  return { stopId: null, tray: !!el.closest('[data-record-tray]') }
}

function onMove(e) {
  drag.x = e.clientX
  drag.y = e.clientY
  const t = resolveTarget(e.clientX, e.clientY)
  drag.overStopId = t.stopId
  drag.overTray = t.tray
}

function reset() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  drag.active = false
  drag.photoId = null
  drag.alt = ''
  drag.overStopId = null
  drag.overTray = false
}

function onUp(e) {
  const photoId = drag.photoId
  const t = resolveTarget(e.clientX, e.clientY)
  reset()
  if (photoId == null) return
  if (t.stopId != null) handlers.place?.(photoId, t.stopId)
  else if (t.tray) handlers.unplace?.(photoId)
}

// 칩에서 호출 — 드래그 시작(좌클릭만, 네이티브 선택/이미지드래그 억제).
export function startPhotoDrag(photoId, alt, event) {
  if (event.button != null && event.button !== 0) return
  drag.active = true
  drag.photoId = photoId
  drag.alt = alt || ''
  drag.x = event.clientX
  drag.y = event.clientY
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  event.preventDefault()
}

// 뷰 언마운트 등에서 진행 중 드래그를 강제 종료(리스너 정리).
export function cancelPhotoDrag() {
  reset()
}

// place/unplace 핸들러 등록(드롭 처리)은 뷰가 한다. 인자 없이 부르면 상태만 읽는다(칩·장소·트레이).
export function useRecordDrag(h) {
  if (h) handlers = { place: h.place ?? null, unplace: h.unplace ?? null }
  return { drag }
}
