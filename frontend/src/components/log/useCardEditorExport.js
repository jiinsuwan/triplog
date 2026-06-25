import { ref } from 'vue'
import { exportCardPng } from '@/card/render/exportCard'
import { paintEditorLine, paintEditorText, paintEditorSticker } from './cardEditorCanvas'
import { ensureStickerImages, getStickerImage } from './stickerImage'

const CARD_UPLOAD_MAX_BYTES = 20 * 1024 * 1024
const CARD_UPLOAD_NATIVE_WIDTHS = [1440, 1080, 720]

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function useCardEditorExport({
  currentId,
  contentRect,
  canvasDims,
  card,
  items,
  photoImg,
  format,
  padFill,
  padColor,
  fontFamily,
  fontScale,
  toneDown,
  texts,
  lines,
  stickers,
  isCaptionOn,
  isObjectOn,
  applyCaptionOverrides,
  closingForScene,
  paintOutlines,
  editorTextOpts,
}) {
  const exporting = ref(false)
  const exportNote = ref('')

  async function composeOverlays(blob) {
    const img = photoImg.value
    const vText = texts.value.filter((t) => !t.hidden && t.text.trim())
    const vLine = lines.value.filter((l) => !l.hidden)
    const vSticker = stickers.value.filter((s) => !s.hidden)
    const hasOutline = items.value.some(
      (it) => isObjectOn(it.id) && Array.isArray(it.polygons) && it.polygons.length,
    )
    if (!vText.length && !vLine.length && !vSticker.length && !hasOutline) return blob
    try {
      try {
        await document.fonts.load(`64px "${fontFamily.value}"`)
      } catch {
        /* 폰트 로드 실패 — 폴백 폰트로 진행 */
      }
      if (vSticker.length) await ensureStickerImages(vSticker.map((s) => s.src)) // 스티커 흰색 이미지 로드 보장
      const bmp = await createImageBitmap(blob)
      const cv = document.createElement('canvas')
      cv.width = bmp.width
      cv.height = bmp.height
      const ctx = cv.getContext('2d')
      ctx.drawImage(bmp, 0, 0)
      if (img && hasOutline) paintOutlines(ctx, img, bmp.width, bmp.height, { forExport: true })
      for (const l of vLine) paintEditorLine(ctx, l, { W: bmp.width, H: bmp.height })
      for (const t of vText) paintEditorText(ctx, t, editorTextOpts(bmp.width, bmp.height))
      for (const s of vSticker) paintEditorSticker(ctx, s, getStickerImage(s.src), { W: bmp.width, H: bmp.height })
      const composed = await new Promise((res) => cv.toBlob(res, 'image/png'))
      return composed || blob
    } catch {
      return blob
    }
  }

  function nativeUploadWidths(photoW) {
    const widths = CARD_UPLOAD_NATIVE_WIDTHS.filter((width) => width < photoW)
    return widths.length ? widths : [undefined]
  }

  async function composeCurrentBlob({ forUpload = false } = {}) {
    if (exporting.value || !photoImg.value) return
    exporting.value = true
    exportNote.value = ''
    const exportId = currentId.value
    try {
      const cr = contentRect.value
      const cd = canvasDims.value
      const visibleObjects = (card.captions[currentId.value]?.response?.objects ?? [])
        .filter((o) => isCaptionOn(o.itemId))
        .map((o) => applyCaptionOverrides(o, cr, cd))
      const inputs = {
        items: items.value,
        captions: { objects: visibleObjects, closing: closingForScene(cr, cd) },
        photo: { w: photoImg.value.naturalWidth, h: photoImg.value.naturalHeight },
        style: { toneDown: toneDown.value, outline: false },
      }
      const baseOptions = {
          format: format.value,
          pad: padFill.value,
          bg: padColor.value,
          noteFont: fontFamily.value,
          closingFont: fontFamily.value,
          scale: fontScale.value,
      }
      const widthCandidates = forUpload && format.value !== 'fixed'
        ? nativeUploadWidths(photoImg.value.naturalWidth)
        : [undefined]
      let lastComposed = null

      for (const width of widthCandidates) {
        const blob = await exportCardPng(
          inputs,
          { photo: photoImg.value },
          width ? { ...baseOptions, width } : baseOptions,
        )
        // export 도중 사진이 바뀌면 overlay(live refs)가 다른 사진 것이 되므로, 합성 전에 먼저 가드(리뷰 P2).
        if (currentId.value !== exportId) {
          exportNote.value = '사진이 바뀌어 저장을 취소했습니다. 다시 저장해 주세요.'
          return
        }
        const composed = await composeOverlays(blob)
        lastComposed = composed
        if (currentId.value !== exportId) {
          exportNote.value = '사진이 바뀌어 저장을 취소했습니다. 다시 저장해 주세요.'
          return
        }
        if (!forUpload || composed.size <= CARD_UPLOAD_MAX_BYTES) {
          return { blob: composed, photoId: exportId }
        }
      }

      // export 도중 사진이 바뀌면 overlay(live refs)가 다른 사진 것이 되므로, 합성 전에 먼저 가드(리뷰 P2).
      if (currentId.value !== exportId) {
        exportNote.value = '사진이 바뀌어 저장을 취소했습니다. 다시 저장해 주세요.'
        return
      }
      if (lastComposed && lastComposed.size <= CARD_UPLOAD_MAX_BYTES) {
        return { blob: lastComposed, photoId: exportId }
      }
      throw new Error('카드 PNG가 20MB를 초과했습니다. PNG 저장으로 보관하거나 사진을 줄여 다시 시도해 주세요.')
    } catch (e) {
      exportNote.value = `저장 실패: ${e.message}`
    } finally {
      exporting.value = false
    }
  }

  async function exportCurrent() {
    const result = await composeCurrentBlob()
    if (!result) return
    try {
      const { blob: composed, photoId: exportId } = result
      triggerDownload(composed, `triplog-card-${exportId}.png`)
      exportNote.value = 'PNG 저장 완료'
    } catch (e) {
      exportNote.value = `저장 실패: ${e.message}`
    }
  }

  return { exporting, exportNote, exportCurrent, composeCurrentBlob }
}
