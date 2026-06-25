import { computed, reactive, ref } from 'vue'
import { tokenColor } from '@/utils/designTokens'

export const LAYER_CHIP = { text: '텍스트', line: '선', outline: '외곽선', caption: '텍스트', closing: '마무리', sticker: '스티커' }
export const LAYER_CHIP_CLASS = { text: 'text', line: 'line', outline: '', caption: 'text', closing: 'closing', sticker: 'line' }

export function useCardEditorLayers({
  currentId,
  items,
  captionByItem,
  closing,
  card,
  isObjectOn,
  toggleObject,
  isCaptionOn,
  toggleCaption,
  isClosingOn,
  toggleClosing,
}) {
  const selectedItemId = ref(null)
  const selectedKind = ref(null)
  const selectedTextId = ref(null)
  const selectedLineId = ref(null)

  const selectedOutline = computed(() =>
    selectedKind.value === 'outline' ? (items.value.find((it) => it.id === selectedItemId.value) ?? null) : null,
  )
  const selectedCaption = computed(() =>
    selectedKind.value === 'caption' ? (captionByItem.value[selectedItemId.value] ?? null) : null,
  )
  const selectedClosing = computed(() => (selectedKind.value === 'closing' ? closing.value : null))

  const textsByPhoto = reactive({})
  let textSeq = 0
  const texts = computed(() => textsByPhoto[currentId.value] ?? [])
  const selectedText = computed(() => texts.value.find((t) => t.id === selectedTextId.value) ?? null)

  const linesByPhoto = reactive({})
  let lineSeq = 0
  const lines = computed(() => linesByPhoto[currentId.value] ?? [])
  const selectedLine = computed(() => lines.value.find((l) => l.id === selectedLineId.value) ?? null)

  // 스티커(장식) — 사진별 { id, src, stickerId, x, y(0~1 중심), scale, rotation(도), hidden }. 텍스트처럼 에디터 오버레이.
  const stickersByPhoto = reactive({})
  let stickerSeq = 0
  const selectedStickerId = ref(null)
  const stickers = computed(() => stickersByPhoto[currentId.value] ?? [])
  const selectedSticker = computed(() => stickers.value.find((s) => s.id === selectedStickerId.value) ?? null)

  function clearSelection() {
    selectedItemId.value = null
    selectedKind.value = null
    selectedTextId.value = null
    selectedLineId.value = null
    selectedStickerId.value = null
  }

  function selectItem(id, kind = 'outline') {
    selectedItemId.value = id
    selectedKind.value = id == null ? null : kind
    if (id != null) {
      selectedTextId.value = null
      selectedLineId.value = null
      selectedStickerId.value = null
    }
  }

  function selectText(id) {
    selectedTextId.value = id
    if (id != null) {
      selectedItemId.value = null
      selectedKind.value = null
      selectedLineId.value = null
      selectedStickerId.value = null
    }
  }

  function selectLine(id) {
    selectedLineId.value = id
    if (id != null) {
      selectedItemId.value = null
      selectedKind.value = null
      selectedTextId.value = null
      selectedStickerId.value = null
    }
  }

  function selectSticker(id) {
    selectedStickerId.value = id
    if (id != null) {
      selectedItemId.value = null
      selectedKind.value = null
      selectedTextId.value = null
      selectedLineId.value = null
    }
  }
  function addSticker(def) {
    const list = stickersByPhoto[currentId.value] || (stickersByPhoto[currentId.value] = [])
    const s = { id: `k${++stickerSeq}`, src: def.src, stickerId: def.id, x: 0.5, y: 0.5, scale: 1, rotation: 0, hidden: false }
    list.push(s)
    selectSticker(s.id)
    return s
  }
  function removeSticker(id) {
    const list = stickersByPhoto[currentId.value]
    if (!list) return
    const i = list.findIndex((s) => s.id === id)
    if (i >= 0) list.splice(i, 1)
    if (selectedStickerId.value === id) selectedStickerId.value = null
  }
  function setStickerProp(prop, val) {
    if (selectedSticker.value) selectedSticker.value[prop] = val
  }

  function addText(x = 0.5, y = 0.5) {
    const list = textsByPhoto[currentId.value] || (textsByPhoto[currentId.value] = [])
    const t = { id: `t${++textSeq}`, text: '텍스트', x, y, rotation: 0, color: tokenColor('--on-fill'), hidden: false }
    list.push(t)
    selectItem(null)
    selectedTextId.value = t.id
    return t
  }

  function updateTextValue(text) {
    if (selectedText.value) selectedText.value.text = text
  }

  function setTextProp(prop, val) {
    if (selectedText.value) selectedText.value[prop] = val
  }

  function removeText(id) {
    const list = textsByPhoto[currentId.value]
    if (!list) return
    const i = list.findIndex((t) => t.id === id)
    if (i >= 0) list.splice(i, 1)
    if (selectedTextId.value === id) selectedTextId.value = null
  }

  function clearCurrentTexts() {
    textsByPhoto[currentId.value] = []
    selectedTextId.value = null
  }

  function addLine(x1, y1, x2, y2) {
    const list = linesByPhoto[currentId.value] || (linesByPhoto[currentId.value] = [])
    const l = { id: `l${++lineSeq}`, x1, y1, x2, y2, color: tokenColor('--on-fill'), width: 1, style: 'solid', arrow: 'none', hidden: false }
    list.push(l)
    return l
  }

  function removeLine(id) {
    const list = linesByPhoto[currentId.value]
    if (!list) return
    const i = list.findIndex((l) => l.id === id)
    if (i >= 0) list.splice(i, 1)
    if (selectedLineId.value === id) selectedLineId.value = null
  }

  function setLineProp(prop, val) {
    if (selectedLine.value) selectedLine.value[prop] = val
  }

  const layerRows = computed(() => {
    const rows = []
    for (const t of texts.value) rows.push({ kind: 'text', id: t.id, label: t.text || '(빈 텍스트)' })
    for (const l of lines.value) rows.push({ kind: 'line', id: l.id, label: l.arrow !== 'none' ? '화살표' : '선' })
    for (const s of stickers.value) rows.push({ kind: 'sticker', id: s.id, label: s.stickerId || '스티커' })
    for (const item of items.value) {
      rows.push({ kind: 'outline', id: item.id, label: item.label || '객체' })
      const cap = captionByItem.value[item.id]
      if (cap) rows.push({ kind: 'caption', id: item.id, label: (cap.note || []).join(' ') })
    }
    if (closing.value) rows.push({ kind: 'closing', id: 'closing', label: closing.value.text })
    return rows.map((r, i) => ({ ...r, no: i + 1 }))
  })

  function layerOn(row) {
    if (row.kind === 'text') return !texts.value.find((t) => t.id === row.id)?.hidden
    if (row.kind === 'line') return !lines.value.find((l) => l.id === row.id)?.hidden
    if (row.kind === 'sticker') return !stickers.value.find((s) => s.id === row.id)?.hidden
    if (row.kind === 'outline') return isObjectOn(row.id)
    if (row.kind === 'caption') return isCaptionOn(row.id)
    if (row.kind === 'closing') return isClosingOn.value
    return true
  }

  function toggleLayerRow(row) {
    if (row.kind === 'text') {
      const t = texts.value.find((x) => x.id === row.id)
      if (t) t.hidden = !t.hidden
    } else if (row.kind === 'line') {
      const l = lines.value.find((x) => x.id === row.id)
      if (l) l.hidden = !l.hidden
    } else if (row.kind === 'sticker') {
      const s = stickers.value.find((x) => x.id === row.id)
      if (s) s.hidden = !s.hidden
    } else if (row.kind === 'outline') toggleObject(row.id)
    else if (row.kind === 'caption') toggleCaption(row.id)
    else if (row.kind === 'closing') toggleClosing()
  }

  function selectLayerRow(row) {
    if (row.kind === 'text') selectText(row.id)
    else if (row.kind === 'line') selectLine(row.id)
    else if (row.kind === 'sticker') selectSticker(row.id)
    else if (row.kind === 'outline') selectItem(row.id, 'outline')
    else if (row.kind === 'caption') selectItem(row.id, 'caption')
    else if (row.kind === 'closing') selectItem('closing', 'closing')
  }

  function isLayerActive(row) {
    if (row.kind === 'text') return row.id === selectedTextId.value
    if (row.kind === 'line') return row.id === selectedLineId.value
    if (row.kind === 'sticker') return row.id === selectedStickerId.value
    if (row.kind === 'outline') return row.id === selectedItemId.value && selectedKind.value === 'outline'
    if (row.kind === 'caption') return row.id === selectedItemId.value && selectedKind.value === 'caption'
    if (row.kind === 'closing') return selectedKind.value === 'closing'
    return false
  }

  function removeLayerRow(row) {
    if (row.kind === 'text') removeText(row.id)
    else if (row.kind === 'caption') card.removeCaptionObject(currentId.value, row.id)
    else if (row.kind === 'line') removeLine(row.id)
    else if (row.kind === 'sticker') removeSticker(row.id)
  }

  return {
    selectedItemId,
    selectedKind,
    selectedTextId,
    selectedLineId,
    selectedOutline,
    selectedCaption,
    selectedClosing,
    textsByPhoto,
    texts,
    selectedText,
    linesByPhoto,
    lines,
    selectedLine,
    stickersByPhoto,
    stickers,
    selectedStickerId,
    selectedSticker,
    selectSticker,
    addSticker,
    removeSticker,
    setStickerProp,
    clearSelection,
    selectItem,
    selectText,
    selectLine,
    addText,
    updateTextValue,
    setTextProp,
    removeText,
    clearCurrentTexts,
    addLine,
    removeLine,
    setLineProp,
    layerRows,
    layerOn,
    toggleLayerRow,
    selectLayerRow,
    isLayerActive,
    removeLayerRow,
  }
}
