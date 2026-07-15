import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKakaoMapLifecycle } from './useKakaoMapLifecycle'

describe('useKakaoMapLifecycle', () => {
  afterEach(() => vi.useRealTimers())

  it('removes map listeners, overlays, route lines, popup, and timer on cleanup', () => {
    vi.useFakeTimers()
    const event = { addListener: vi.fn(), removeListener: vi.fn() }
    const kakao = { maps: { event } }
    const map = {}
    const idle = vi.fn()
    const click = vi.fn()
    const overlay = { setMap: vi.fn() }
    const routeLine = { setMap: vi.fn() }
    const popup = { setMap: vi.fn() }
    const showPopup = vi.fn()
    const lifecycle = useKakaoMapLifecycle()

    lifecycle.attachListeners(kakao, map, { idle, click })
    lifecycle.addOverlay(overlay)
    lifecycle.addRoutePolyline(routeLine)
    lifecycle.setPopupOverlay(popup)
    lifecycle.schedulePopup(showPopup, 450)
    lifecycle.cleanup(kakao, map)
    vi.runAllTimers()

    expect(event.addListener.mock.calls).toEqual([
      [map, 'idle', idle],
      [map, 'click', click],
    ])
    expect(event.removeListener.mock.calls).toEqual([
      [map, 'idle', idle],
      [map, 'click', click],
    ])
    expect(overlay.setMap).toHaveBeenCalledWith(null)
    expect(routeLine.setMap).toHaveBeenCalledWith(null)
    expect(popup.setMap).toHaveBeenCalledWith(null)
    expect(showPopup).not.toHaveBeenCalled()
    expect(lifecycle.hasPopupOverlay()).toBe(false)
  })

  it('replaces the active popup and executes an immediate popup without a timer', () => {
    const previous = { setMap: vi.fn() }
    const next = { setMap: vi.fn() }
    const showPopup = vi.fn()
    const lifecycle = useKakaoMapLifecycle()

    lifecycle.setPopupOverlay(previous)
    lifecycle.setPopupOverlay(next)
    lifecycle.schedulePopup(showPopup)

    expect(previous.setMap).toHaveBeenCalledWith(null)
    expect(next.setMap).not.toHaveBeenCalled()
    expect(showPopup).toHaveBeenCalledOnce()
  })
})
