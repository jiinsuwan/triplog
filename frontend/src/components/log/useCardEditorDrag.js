import { ref, onScopeDispose } from 'vue'
import {
  clamp01,
  measureEditorText,
  boxHandleAt,
  lineEndpointAt,
  lineRotHandle,
  nearLine,
  stickerBox,
} from './cardEditorCanvas'

export function useCardEditorDrag({
  drag: providedDrag,
  viewerMode,
  canvasEl,
  canvasDims,
  contentRect,
  activeTool,
  fontFamily,
  fontScale,
  items,
  texts,
  lines,
  selectedText,
  selectedCaption,
  selectedLine,
  selectedSticker,
  stickers,
  selectSticker,
  selectedKind,
  selectedItemId,
  getCaptionRot,
  getClosingRot,
  setCaptionRot,
  setClosingRot,
  setCaptionPos,
  setClosingPos,
  addLine,
  selectLine,
  removeLine,
  addText,
  selectText,
  selectItem,
  clearSelection,
  scheduleRedraw,
  captionBox,
  closingBox,
  editorTextOpts,
}) {
  const drag = providedDrag ?? ref(null)

  function bindCanvasDrag(e) {
    window.addEventListener('pointermove', onCanvasPointerMove)
    window.addEventListener('pointerup', onCanvasPointerUp)
    e.preventDefault()
  }

  function onCanvasPointerDown(e) {
    if (viewerMode.value) return
    const el = canvasEl.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    const { W, H } = canvasDims.value
    const ctx = el.getContext('2d')

    const stx = selectedText.value
    if (stx && !stx.hidden) {
      const m = measureEditorText(ctx, stx, editorTextOpts(W, H))
      const cx = stx.x * W, cy = stx.y * H
      const rad = ((stx.rotation ?? 0) * Math.PI) / 180
      const dx = nx * W - cx, dy = ny * H - cy
      const lx = dx * Math.cos(-rad) - dy * Math.sin(-rad)
      const ly = dx * Math.sin(-rad) + dy * Math.cos(-rad)
      const hr = Math.max(11, W * 0.02)
      if (Math.hypot(lx, ly - (-m.hh - m.rotOff)) < hr) {
        drag.value = { kind: 'text-rotate', id: stx.id }
        bindCanvasDrag(e)
        return
      }
      if ([[-m.hw, -m.hh], [m.hw, -m.hh], [m.hw, m.hh], [-m.hw, m.hh]].some(([hx, hy]) => Math.hypot(lx - hx, ly - hy) < hr)) {
        drag.value = { kind: 'text-resize', id: stx.id, d0: Math.hypot(dx, dy) || 1, s0: fontScale.value }
        bindCanvasDrag(e)
        return
      }
    }

    if (selectedCaption.value) {
      const b = captionBox(selectedItemId.value)
      if (b) {
        const h = boxHandleAt(b, getCaptionRot(selectedItemId.value), nx, ny, { W, H })
        if (h === 'rotate') {
          drag.value = { kind: 'caption-rotate', id: selectedItemId.value, cx: b.cx, cy: b.cy }
          bindCanvasDrag(e)
          return
        }
        if (h === 'resize') {
          drag.value = { kind: 'caption-resize', cx: b.cx, cy: b.cy, d0: Math.hypot((nx - b.cx) * W, (ny - b.cy) * H) || 1, s0: fontScale.value }
          bindCanvasDrag(e)
          return
        }
      }
    }

    if (selectedKind.value === 'closing') {
      const b = closingBox()
      if (b) {
        const h = boxHandleAt(b, getClosingRot(), nx, ny, { W, H })
        if (h === 'rotate') {
          drag.value = { kind: 'closing-rotate', cx: b.cx, cy: b.cy }
          bindCanvasDrag(e)
          return
        }
        if (h === 'resize') {
          drag.value = { kind: 'closing-resize', cx: b.cx, cy: b.cy, d0: Math.hypot((nx - b.cx) * W, (ny - b.cy) * H) || 1, s0: fontScale.value }
          bindCanvasDrag(e)
          return
        }
      }
    }

    if (selectedLine.value && !selectedLine.value.hidden) {
      const sl = selectedLine.value
      const [rhx, rhy] = lineRotHandle(sl, { W, H })
      if (Math.hypot(nx * W - rhx, ny * H - rhy) < Math.max(11, W * 0.02)) {
        const dxp = (sl.x2 - sl.x1) * W, dyp = (sl.y2 - sl.y1) * H
        drag.value = { kind: 'line-rotate', id: sl.id, halfLen: Math.hypot(dxp, dyp) / 2 }
        bindCanvasDrag(e)
        return
      }
      const ep = lineEndpointAt(sl, nx, ny)
      if (ep) {
        drag.value = { kind: 'line-ep', id: sl.id, ep }
        bindCanvasDrag(e)
        return
      }
    }

    // 선택된 스티커의 변형 핸들(회전/크기) — 스티커별 scale·rotation.
    if (selectedSticker.value && !selectedSticker.value.hidden) {
      const ss = selectedSticker.value
      const b = stickerBox(ss, { W, H })
      const h = boxHandleAt(b, ss.rotation ?? 0, nx, ny, { W, H })
      if (h === 'rotate') {
        drag.value = { kind: 'sticker-rotate', id: ss.id, cx: b.cx, cy: b.cy }
        bindCanvasDrag(e)
        return
      }
      if (h === 'resize') {
        drag.value = { kind: 'sticker-resize', id: ss.id, cx: b.cx, cy: b.cy, d0: Math.hypot((nx - b.cx) * W, (ny - b.cy) * H) || 1, s0: ss.scale ?? 1 }
        bindCanvasDrag(e)
        return
      }
    }

    // 스티커 본체(맨 위부터) → 선택 + 이동. 텍스트보다 위에 그려지므로 먼저 잡는다.
    for (let i = stickers.value.length - 1; i >= 0; i--) {
      const s = stickers.value[i]
      if (s.hidden) continue
      const b = stickerBox(s, { W, H })
      if (Math.abs(nx - b.cx) <= b.hw + 0.01 && Math.abs(ny - b.cy) <= b.hh + 0.01) {
        drag.value = { kind: 'sticker', id: s.id, dx: nx - s.x, dy: ny - s.y }
        selectSticker(s.id)
        bindCanvasDrag(e)
        return
      }
    }

    for (let i = texts.value.length - 1; i >= 0; i--) {
      const t = texts.value[i]
      if (t.hidden) continue
      const fs = W * 0.05 * fontScale.value
      ctx.font = `${Math.round(fs)}px "${fontFamily.value}", sans-serif`
      const tlines = String(t.text ?? '').split('\n')
      const w = Math.max(...tlines.map((ln) => ctx.measureText(ln || ' ').width)) / W
      const h = (fs * 1.4 * Math.max(1, tlines.length)) / H
      if (Math.abs(nx - t.x) <= w / 2 + 0.02 && Math.abs(ny - t.y) <= h / 2 + 0.01) {
        drag.value = { kind: 'text', id: t.id, dx: nx - t.x, dy: ny - t.y }
        selectText(t.id)
        bindCanvasDrag(e)
        return
      }
    }

    for (let i = lines.value.length - 1; i >= 0; i--) {
      const l = lines.value[i]
      if (l.hidden) continue
      if (nearLine(l, nx, ny)) {
        drag.value = { kind: 'line-body', id: l.id, dx: nx - l.x1, dy: ny - l.y1, lx2: l.x2 - l.x1, ly2: l.y2 - l.y1 }
        selectLine(l.id)
        bindCanvasDrag(e)
        return
      }
    }

    // (선 그리기 폐기 — 선 도구는 외곽선 선 모양 편집용. 직선만 되던 자유 선 생성은 제거.)
    if (activeTool.value === 'text') {
      const t = addText(nx, ny)
      drag.value = { kind: 'text', id: t.id, dx: 0, dy: 0 }
      bindCanvasDrag(e)
      return
    }

    for (const item of items.value) {
      const b = captionBox(item.id)
      if (!b) continue
      if (Math.abs(nx - b.cx) <= b.hw + 0.012 && Math.abs(ny - b.cy) <= b.hh + 0.012) {
        selectItem(item.id, 'caption')
        drag.value = { kind: 'caption', id: item.id, dx: nx - b.cx, dy: ny - b.cy }
        bindCanvasDrag(e)
        return
      }
    }

    const cb = closingBox()
    if (cb && Math.abs(nx - cb.cx) <= cb.hw + 0.012 && Math.abs(ny - cb.cy) <= cb.hh + 0.012) {
      selectItem('closing', 'closing')
      drag.value = { kind: 'closing', dx: nx - cb.cx, dy: ny - cb.cy }
      bindCanvasDrag(e)
      return
    }

    clearSelection()
  }

  function onCanvasPointerMove(e) {
    const currentDrag = drag.value
    if (!currentDrag) return
    const el = canvasEl.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nx = clamp01((e.clientX - rect.left) / rect.width)
    const ny = clamp01((e.clientY - rect.top) / rect.height)
    if (currentDrag.kind === 'text') {
      const t = texts.value.find((x) => x.id === currentDrag.id)
      if (t) {
        t.x = clamp01(nx - currentDrag.dx)
        t.y = clamp01(ny - currentDrag.dy)
      }
    } else if (currentDrag.kind === 'caption') {
      const cr = contentRect.value
      const cd = canvasDims.value
      const minX = cr.dx / cd.W
      const maxX = (cr.dx + cr.cw) / cd.W
      const minY = cr.dy / cd.H
      const maxY = (cr.dy + cr.ch) / cd.H
      setCaptionPos(
        currentDrag.id,
        Math.min(maxX, Math.max(minX, nx - currentDrag.dx)),
        Math.min(maxY, Math.max(minY, ny - currentDrag.dy)),
      )
    } else if (currentDrag.kind === 'closing') {
      const cr = contentRect.value
      const cd = canvasDims.value
      const minX = cr.dx / cd.W
      const maxX = (cr.dx + cr.cw) / cd.W
      const minY = cr.dy / cd.H
      const maxY = (cr.dy + cr.ch) / cd.H
      setClosingPos(
        Math.min(maxX, Math.max(minX, nx - currentDrag.dx)),
        Math.min(maxY, Math.max(minY, ny - currentDrag.dy)),
      )
    } else if (currentDrag.kind === 'caption-rotate') {
      const { W, H } = canvasDims.value
      setCaptionRot(currentDrag.id, Math.round((Math.atan2((ny - currentDrag.cy) * H, (nx - currentDrag.cx) * W) * 180) / Math.PI + 90))
    } else if (currentDrag.kind === 'caption-resize') {
      const { W, H } = canvasDims.value
      const dpx = Math.hypot((nx - currentDrag.cx) * W, (ny - currentDrag.cy) * H)
      fontScale.value = Math.min(3, Math.max(0.4, currentDrag.s0 * (dpx / currentDrag.d0)))
    } else if (currentDrag.kind === 'closing-rotate') {
      const { W, H } = canvasDims.value
      setClosingRot(Math.round((Math.atan2((ny - currentDrag.cy) * H, (nx - currentDrag.cx) * W) * 180) / Math.PI + 90))
    } else if (currentDrag.kind === 'closing-resize') {
      const { W, H } = canvasDims.value
      const dpx = Math.hypot((nx - currentDrag.cx) * W, (ny - currentDrag.cy) * H)
      fontScale.value = Math.min(3, Math.max(0.4, currentDrag.s0 * (dpx / currentDrag.d0)))
    } else if (currentDrag.kind === 'text-rotate') {
      const t = texts.value.find((x) => x.id === currentDrag.id)
      if (t) {
        const { W, H } = canvasDims.value
        t.rotation = Math.round((Math.atan2((ny - t.y) * H, (nx - t.x) * W) * 180) / Math.PI + 90)
      }
    } else if (currentDrag.kind === 'text-resize') {
      const t = texts.value.find((x) => x.id === currentDrag.id)
      if (t) {
        const { W, H } = canvasDims.value
        const dpx = Math.hypot((nx - t.x) * W, (ny - t.y) * H)
        fontScale.value = Math.min(3, Math.max(0.4, currentDrag.s0 * (dpx / currentDrag.d0)))
      }
    } else if (currentDrag.kind === 'sticker') {
      const s = stickers.value.find((x) => x.id === currentDrag.id)
      if (s) {
        s.x = clamp01(nx - currentDrag.dx)
        s.y = clamp01(ny - currentDrag.dy)
      }
    } else if (currentDrag.kind === 'sticker-rotate') {
      const s = stickers.value.find((x) => x.id === currentDrag.id)
      if (s) {
        const { W, H } = canvasDims.value
        s.rotation = Math.round((Math.atan2((ny - currentDrag.cy) * H, (nx - currentDrag.cx) * W) * 180) / Math.PI + 90)
      }
    } else if (currentDrag.kind === 'sticker-resize') {
      const s = stickers.value.find((x) => x.id === currentDrag.id)
      if (s) {
        const { W, H } = canvasDims.value
        const dpx = Math.hypot((nx - currentDrag.cx) * W, (ny - currentDrag.cy) * H)
        s.scale = Math.min(4, Math.max(0.2, currentDrag.s0 * (dpx / currentDrag.d0)))
      }
    } else if (currentDrag.kind === 'line-ep') {
      const l = lines.value.find((x) => x.id === currentDrag.id)
      if (l) {
        if (currentDrag.ep === '1') { l.x1 = nx; l.y1 = ny } else { l.x2 = nx; l.y2 = ny }
      }
    } else if (currentDrag.kind === 'line-body') {
      const l = lines.value.find((x) => x.id === currentDrag.id)
      if (l) {
        const x1 = clamp01(nx - currentDrag.dx)
        const y1 = clamp01(ny - currentDrag.dy)
        l.x1 = x1; l.y1 = y1; l.x2 = x1 + currentDrag.lx2; l.y2 = y1 + currentDrag.ly2
      }
    } else if (currentDrag.kind === 'line-rotate') {
      const l = lines.value.find((x) => x.id === currentDrag.id)
      if (l) {
        const { W, H } = canvasDims.value
        const mx = (l.x1 + l.x2) / 2, my = (l.y1 + l.y2) / 2
        const ang = Math.atan2((ny - my) * H, (nx - mx) * W) - Math.PI / 2
        const hx = (currentDrag.halfLen * Math.cos(ang)) / W
        const hy = (currentDrag.halfLen * Math.sin(ang)) / H
        l.x1 = mx - hx; l.y1 = my - hy; l.x2 = mx + hx; l.y2 = my + hy
      }
    }
  }

  function onCanvasPointerUp() {
    const currentDrag = drag.value
    if (currentDrag?.kind === 'line-ep') {
      const l = lines.value.find((x) => x.id === currentDrag.id)
      if (l && Math.hypot(l.x2 - l.x1, l.y2 - l.y1) < 0.02) removeLine(l.id)
    }
    drag.value = null
    scheduleRedraw()
    window.removeEventListener('pointermove', onCanvasPointerMove)
    window.removeEventListener('pointerup', onCanvasPointerUp)
  }

  onScopeDispose(() => {
    window.removeEventListener('pointermove', onCanvasPointerMove)
    window.removeEventListener('pointerup', onCanvasPointerUp)
  })

  return { drag, onCanvasPointerDown }
}
