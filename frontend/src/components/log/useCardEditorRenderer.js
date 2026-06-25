import { onScopeDispose } from 'vue'
import { renderCard } from '@/card/render/renderCore'
import { computeFitRect } from '@/card/render/exportCard'
import { makeCoverFit } from '@/card/render/coverFit'

export function useCardEditorRenderer({
  canvasEl,
  scene,
  photoImg,
  fontReady,
  canvasDims,
  contentRect,
  fitScale,
  zoom,
  drag,
  format,
  padFill,
  padColor,
  fontFamily,
  fontScale,
  items,
  selectedItemId,
  selectedKind,
  selectedCaption,
  selectedSticker,
  isObjectOn,
  outlineStyleOf,
  drawLines,
  drawTexts,
  drawStickers,
  drawCaptionBox,
  drawClosingBox,
  drawStickerBox,
}) {
  let blurCache = null
  let contentCanvas = null
  let baseFrameCanvas = null
  let baseFrameCache = null
  let outlineCache = null
  let rafId = null
  const refIds = new WeakMap()
  let nextRefId = 0

  function refKey(value) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return ''
    if (!refIds.has(value)) refIds.set(value, ++nextRefId)
    return refIds.get(value)
  }

  function blurBg(img, W, H) {
    const key = `${img.src}|${W}x${H}`
    if (blurCache?.key === key) return blurCache.canvas
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const cx = c.getContext('2d')
    const { dw, dh, ox, oy } = makeCoverFit(img.naturalWidth, img.naturalHeight, W, H)
    cx.filter = `blur(${Math.round(W * 0.03)}px)`
    cx.drawImage(img, ox, oy, dw, dh)
    cx.filter = 'none'
    cx.fillStyle = 'rgba(20,14,8,0.18)'
    cx.fillRect(0, 0, W, H)
    blurCache = { key, canvas: c }
    return c
  }

  function drawPadding(ctx, img, W, H) {
    if (padFill.value === 'solid') {
      ctx.fillStyle = padColor.value
      ctx.fillRect(0, 0, W, H)
      return
    }
    ctx.drawImage(blurBg(img, W, H), 0, 0)
  }

  function getContentCanvas(cw, ch) {
    if (!contentCanvas) contentCanvas = document.createElement('canvas')
    if (contentCanvas.width !== cw) contentCanvas.width = cw
    if (contentCanvas.height !== ch) contentCanvas.height = ch
    return contentCanvas
  }

  function getBaseFrameCanvas({ fw, fh, cw, ch, dx, dy, sc, img, skipLuminance }) {
    if (!baseFrameCanvas) baseFrameCanvas = document.createElement('canvas')
    if (baseFrameCanvas.width !== fw) baseFrameCanvas.width = fw
    if (baseFrameCanvas.height !== fh) baseFrameCanvas.height = fh
    const cacheHit =
      baseFrameCache &&
      baseFrameCache.scene === sc &&
      baseFrameCache.img === img &&
      baseFrameCache.fw === fw &&
      baseFrameCache.fh === fh &&
      baseFrameCache.cw === cw &&
      baseFrameCache.ch === ch &&
      baseFrameCache.dx === dx &&
      baseFrameCache.dy === dy &&
      baseFrameCache.padFill === padFill.value &&
      baseFrameCache.padColor === padColor.value &&
      baseFrameCache.fontFamily === fontFamily.value &&
      baseFrameCache.fontScale === fontScale.value &&
      (!baseFrameCache.skipLuminance || skipLuminance)
    if (cacheHit) return baseFrameCanvas

    const bctx = baseFrameCanvas.getContext('2d', { willReadFrequently: true })
    bctx.setTransform(1, 0, 0, 1, 0, 0)
    if (dx > 0 || dy > 0) {
      drawPadding(bctx, img, fw, fh)
      const content = getContentCanvas(cw, ch)
      renderCard(
        content.getContext('2d', { willReadFrequently: true }),
        sc,
        { photo: img },
        { skipLuminance, noteFont: fontFamily.value, closingFont: fontFamily.value, scale: fontScale.value },
      )
      bctx.drawImage(content, dx, dy)
    } else {
      renderCard(
        bctx,
        sc,
        { photo: img },
        { skipLuminance, noteFont: fontFamily.value, closingFont: fontFamily.value, scale: fontScale.value },
      )
    }
    baseFrameCache = {
      scene: sc,
      img,
      fw,
      fh,
      cw,
      ch,
      dx,
      dy,
      padFill: padFill.value,
      padColor: padColor.value,
      fontFamily: fontFamily.value,
      fontScale: fontScale.value,
      skipLuminance,
    }
    return baseFrameCanvas
  }

  function outlineSignature(frameW, frameH, forExport) {
    const selectedOutlineId = !forExport && selectedKind.value === 'outline' ? selectedItemId.value : null
    return [
      photoImg.value?.src,
      frameW,
      frameH,
      format.value,
      forExport ? 'export' : 'preview',
      selectedOutlineId ?? '',
      refKey(items.value),
      items.value
        .map((item) => {
          const st = outlineStyleOf(item.id)
          return `${item.id}:${refKey(item)}:${isObjectOn(item.id) ? 1 : 0}:${st.width}:${st.style}:${st.dashLen}:${st.dashGap}:${Array.isArray(item.polygons) ? item.polygons.length : 0}`
        })
        .join('|'),
    ].join('::')
  }

  function paintOneOutline(ctx, item, no, cf, W, { selected = false, forExport = false } = {}) {
    const color = selected ? 'rgba(240,68,82,0.95)' : 'rgba(255,255,255,0.96)'
    const st = outlineStyleOf(item.id)
    const base = Math.max(1, W * 0.002)

    ctx.save()
    ctx.lineWidth = base * st.width
    ctx.strokeStyle = color
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = base
    ctx.setLineDash(st.style === 'dashed' ? [W * 0.001 * st.dashLen, W * 0.001 * st.dashGap] : [])
    for (const loop of Array.isArray(item.polygons) ? item.polygons : []) {
      if (!Array.isArray(loop) || loop.length < 3) continue
      ctx.beginPath()
      loop.forEach(([x, y], i) => {
        const [px, py] = cf.ptPx(x, y)
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      })
      ctx.closePath()
      ctx.stroke()
    }
    ctx.restore()
    // (캔버스 외곽선 번호 배지 제거 — 레이어 패널 번호와 기준이 달라 혼동. 선택 표시는 빨강 외곽선으로.)
  }

  function renderOutlineCache(img, frameW, frameH, forExport) {
    const { cw, ch, dx, dy } =
      format.value === 'fixed'
        ? computeFitRect(img.naturalWidth, img.naturalHeight, frameW, frameH)
        : { cw: frameW, ch: frameH, dx: 0, dy: 0 }
    const W = cw
    const cf = makeCoverFit(img.naturalWidth, img.naturalHeight, cw, ch)
    const c = document.createElement('canvas')
    c.width = frameW
    c.height = frameH
    const ctx = c.getContext('2d')
    ctx.save()
    ctx.translate(dx, dy)
    const selectedOutlineId = !forExport && selectedKind.value === 'outline' ? selectedItemId.value : null
    let no = 0
    for (const item of items.value) {
      no += 1
      if (!isObjectOn(item.id)) continue
      paintOneOutline(ctx, item, no, cf, W, { selected: item.id === selectedOutlineId, forExport })
    }
    ctx.restore()
    return c
  }

  function paintOutlines(ctx, img, frameW, frameH, { forExport = false } = {}) {
    const key = outlineSignature(frameW, frameH, forExport)
    if (!outlineCache || outlineCache.key !== key) {
      outlineCache = { key, canvas: renderOutlineCache(img, frameW, frameH, forExport) }
    }
    ctx.drawImage(outlineCache.canvas, 0, 0)
  }

  function redraw() {
    const el = canvasEl.value
    const sc = scene.value
    const img = photoImg.value
    if (!el || !sc || !img || !fontReady.value) return
    const { W: fw, H: fh } = canvasDims.value
    const { cw, ch, dx, dy } = contentRect.value
    if (el.width !== fw || el.height !== fh) {
      el.width = fw
      el.height = fh
    }
    const dispScale = fitScale.value * zoom.value
    el.style.width = Math.round(fw * dispScale) + 'px'
    el.style.height = Math.round(fh * dispScale) + 'px'
    const ctx = el.getContext('2d', { willReadFrequently: true })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(getBaseFrameCanvas({ fw, fh, cw, ch, dx, dy, sc, img, skipLuminance: !!drag.value }), 0, 0)
    paintOutlines(ctx, img, fw, fh)
    drawLines(ctx, { W: fw, H: fh })
    drawTexts(ctx, { W: fw, H: fh })
    drawStickers(ctx, { W: fw, H: fh })
    if (selectedCaption.value) drawCaptionBox(ctx, fw, fh)
    if (selectedKind.value === 'closing') drawClosingBox(ctx, fw, fh)
    if (selectedSticker.value) drawStickerBox(ctx, fw, fh)
  }

  function scheduleRedraw() {
    if (rafId != null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      redraw()
    })
  }

  onScopeDispose(() => {
    if (rafId != null) cancelAnimationFrame(rafId)
  })

  return { paintOutlines, redraw, scheduleRedraw }
}
