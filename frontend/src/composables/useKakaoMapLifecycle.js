export function useKakaoMapLifecycle() {
  let listeners = []
  let overlays = []
  let routePolylines = []
  let popupOverlay = null
  let popupTimer = null

  function attachListeners(kakao, map, handlers) {
    if (!kakao || !map || listeners.length) return
    listeners = Object.entries(handlers)
      .filter(([, handler]) => Boolean(handler))
      .map(([eventName, handler]) => {
        kakao.maps.event.addListener(map, eventName, handler)
        return { eventName, handler }
      })
  }

  function removeListeners(kakao, map) {
    if (kakao && map) {
      listeners.forEach(({ eventName, handler }) => {
        kakao.maps.event.removeListener(map, eventName, handler)
      })
    }
    listeners = []
  }

  function addOverlay(overlay) {
    overlays.push(overlay)
    return overlay
  }

  function addRoutePolyline(polyline) {
    routePolylines.push(polyline)
    return polyline
  }

  function clearDrawings() {
    routePolylines.forEach((polyline) => polyline.setMap(null))
    overlays.forEach((overlay) => overlay.setMap(null))
    routePolylines = []
    overlays = []
  }

  function setPopupOverlay(overlay) {
    clearPopupOverlay()
    popupOverlay = overlay
    return overlay
  }

  function clearPopupOverlay() {
    if (popupOverlay) popupOverlay.setMap(null)
    popupOverlay = null
  }

  function schedulePopup(show, delay = 0) {
    clearPopupTimer()
    if (!delay) {
      show()
      return
    }
    popupTimer = window.setTimeout(() => {
      popupTimer = null
      show()
    }, delay)
  }

  function clearPopupTimer() {
    if (popupTimer) window.clearTimeout(popupTimer)
    popupTimer = null
  }

  function hasPopupOverlay() {
    return Boolean(popupOverlay)
  }

  function cleanup(kakao, map) {
    removeListeners(kakao, map)
    clearPopupTimer()
    clearPopupOverlay()
    clearDrawings()
  }

  return {
    addOverlay,
    addRoutePolyline,
    attachListeners,
    cleanup,
    clearDrawings,
    clearPopupOverlay,
    clearPopupTimer,
    hasPopupOverlay,
    removeListeners,
    schedulePopup,
    setPopupOverlay,
  }
}
