import { ref } from 'vue'
import { exportCardPng } from '@/card/render/exportCard'
import { paintEditorLine, paintEditorText, paintEditorSticker } from './cardEditorCanvas'
import { ensureStickerImages, getStickerImage } from './stickerImage'

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

  async function exportCurrent() {
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
      const blob = await exportCardPng(
        inputs,
        { photo: photoImg.value },
        {
          format: format.value,
          pad: padFill.value,
          bg: padColor.value,
          noteFont: fontFamily.value,
          closingFont: fontFamily.value,
          scale: fontScale.value,
        },
      )
      const composed = await composeOverlays(blob)
      if (currentId.value !== exportId) {
        exportNote.value = '사진이 바뀌어 저장을 취소했습니다. 다시 저장해 주세요.'
        return
      }
      triggerDownload(composed, `triplog-card-${exportId}.png`)
      exportNote.value = '저장 완료'
    } catch (e) {
      exportNote.value = `저장 실패: ${e.message}`
    } finally {
      exporting.value = false
    }
  }

  return { exporting, exportNote, exportCurrent }
}
