<script setup>
// 카드 에디터 (S3-LOG-06, 목업 ⑤) — 이미지 편집툴(클립스튜디오)식 풀스크린.
//   상단: 출력 형식(라디오) + 저장/완료   /   좌: 도구 아이콘(선택)   /   중: 캔버스(카드)
//   우: 상세 설정 + 레이어(외곽선+문구 = 한 객체 = 한 레이어)   /   하단: 카드 필름스트립 + 완성/남은.
//   외곽선 = 객체 레이어의 일부(문구 없이 외곽선만 가능). 렌더는 검증 모듈 재사용.
//   아직: 객체 드래그/z순서·요소 추가(텍스트/말풍선/장식)·서체·색·재분할 refine.
import { ref, reactive, shallowRef, computed, watch, onMounted, onScopeDispose } from 'vue'
import Button from 'primevue/button'
import { usePhotoContent } from '@/composables/usePhotoContent'
import { useCardCaptions } from '@/composables/useCardCaptions'
import { buildScene } from '@/card/render/buildScene'
import { renderCard } from '@/card/render/renderCore'
import { exportCardPng, computeFitRect } from '@/card/render/exportCard'
import { makeCoverFit } from '@/card/render/coverFit'
import { fetchPhotoOutline } from '@/api/outlineApi'
import { useCardStore } from '@/stores/card'

const props = defineProps({ photoIds: { type: Array, default: () => [] } })
const emit = defineEmits(['back'])

const card = useCardStore()
const { load } = usePhotoContent()
const { generate: genCaption, generating: captionGenerating, failed: captionFailed } = useCardCaptions()

const TOOLS = [
  { key: 'ai', icon: '✨', label: 'AI' },
  { key: 'text', icon: 'T', label: '텍스트' },
  { key: 'line', icon: '／', label: '선' },
  { key: 'deco', icon: '✦', label: '장식' },
]
const activeTool = ref('select') // 'select'(선택 모드) | 도구 키(생성 모드)
// 선택/생성 모드 = 캔버스 위 플로팅 토글. 생성 모드는 마지막에 쓰던 도구로 복귀.
const isSelectMode = computed(() => activeTool.value === 'select')
let lastCreateTool = 'text'
watch(activeTool, (v) => {
  if (v !== 'select') lastCreateTool = v
})
function setMode(m) {
  activeTool.value = m === 'select' ? 'select' : lastCreateTool
}
const activeToolLabel = computed(() => TOOLS.find((t) => t.key === activeTool.value)?.label ?? '')

const FIXED = { W: 1080, H: 1920 }
const current = ref(0)
const currentId = computed(() => props.photoIds[current.value] ?? null)
const canvasEl = ref(null)
const photoImg = shallowRef(null)
const fontReady = ref(false)
const toneDown = ref(0.35)
const format = ref('native')
const outlineWidth = ref(1)
const outlineStyle = ref('solid') // 'solid' | 'dashed'
const dashLen = ref(12) // 점선 길이·간격(× W*0.001)
const dashGap = ref(9)
function bumpWidth(d) {
  const v = Math.round((outlineWidth.value + d) * 10) / 10
  outlineWidth.value = Math.min(8, Math.max(0.3, v))
}
const selectedItemId = ref(null)
// 선택 상태(객체/텍스트/선)는 loadCurrent 가 사진 전환 때 초기화하므로 먼저 선언한다(TDZ 방지).
const selectedTextId = ref(null)
const selectedLineId = ref(null)
// 레이어 다중 선택(체크박스) — 전체/일부 선택 후 일괄 숨기기/보이기. 사진 전환 때 초기화(loadCurrent).
const bulkSelected = ref(new Set())
function toggleBulk(key) {
  const s = new Set(bulkSelected.value)
  s.has(key) ? s.delete(key) : s.add(key)
  bulkSelected.value = s
}

// 9:16 고정 포맷의 여백 채움(사진을 자르지 않고 contain 후 남는 공간을 채운다).
const padFill = ref('blur') // 'blur' | 'solid'
const padColor = ref('#fdf8ee')

// 캔버스(프레임) 크기 = 출력 크기. native=사진비율, fixed=1080×1920.
const canvasDims = computed(() => {
  const img = photoImg.value
  if (format.value === 'fixed' || !img) return FIXED
  return { W: img.naturalWidth, H: img.naturalHeight }
})
// 프레임 안에서 사진(카드 콘텐츠)이 놓이는 사각형. fixed 는 contain 레터박스(자르지 않음),
// native 는 프레임 전체. export(computeFitRect)와 동일 기하 → 미리보기=저장 결과.
const contentRect = computed(() => {
  const img = photoImg.value
  const { W, H } = canvasDims.value
  if (!img) return { cw: W, ch: H, dx: 0, dy: 0 }
  if (format.value === 'fixed') return computeFitRect(img.naturalWidth, img.naturalHeight, W, H)
  return { cw: img.naturalWidth, ch: img.naturalHeight, dx: 0, dy: 0 }
})

// 줌 상태(1 = stage 에 맞춘 100%). watch/redraw 보다 먼저 선언해 TDZ 방지.
const zoom = ref(1)
const stageEl = ref(null)
const stageSize = ref({ w: 0, h: 0 })
// 캔버스 내부 해상도(canvasDims)를 stage 에 맞추는 배율. 맞춤 = zoom 1 = 100%.
const fitScale = computed(() => {
  const { W, H } = canvasDims.value
  const sw = stageSize.value.w - 32 // .ed-stage padding(16*2) 제외
  const sh = stageSize.value.h - 32
  if (!(W > 0) || !(H > 0) || sw <= 0 || sh <= 0) return 1
  return Math.min(sw / W, sh / H)
})

const items = computed(() => {
  const o = card.outlines[currentId.value]
  return o?.status === 'READY' && Array.isArray(o.items) ? o.items : []
})

// 사진에 자동 외곽선이 없다(실패했거나 인식 0개) → 텍스트·선으로 꾸미는 사진.
function hasNoOutline(id) {
  const o = card.outlines[id]
  return o?.status === 'FAILED' || (o?.status === 'READY' && !(Array.isArray(o.items) && o.items.length))
}
// 캔버스 위 도구 무관 폴백 안내. 처리 중(PENDING)·미확정은 제외(재폴링/안내가 담당).
const fallbackHint = computed(() => {
  const status = card.outlines[currentId.value]?.status
  if (status == null || status === 'PENDING') return null
  return hasNoOutline(currentId.value) ? '객체 인식이 잘 되지 않아 외곽선을 찾지 못했어요' : null
})
const captionByItem = computed(() => {
  const map = {}
  for (const o of card.captions[currentId.value]?.response?.objects ?? []) map[o.itemId] = o
  return map
})
const closing = computed(() => card.captions[currentId.value]?.response?.closing ?? null)

// 레이어 = 객체(외곽선 + 그 객체의 문구). 표시/숨김은 객체 단위(외곽선·문구 통째).
const hiddenObject = ref(new Set())
const keyOf = (id) => `${currentId.value}:${id}`
const isObjectOn = (id) => !hiddenObject.value.has(keyOf(id))
function toggleObject(id) {
  const k = keyOf(id)
  const s = new Set(hiddenObject.value)
  s.has(k) ? s.delete(k) : s.add(k)
  hiddenObject.value = s
}
function setObjectVisible(id, vis) {
  const k = keyOf(id)
  const s = new Set(hiddenObject.value)
  vis ? s.delete(k) : s.add(k)
  hiddenObject.value = s
}
// 레이어 목록: 객체(외곽선+문구) + 마무리.
const layers = computed(() => {
  const list = items.value.map((item, i) => {
    const cap = captionByItem.value[item.id]
    return {
      id: item.id,
      no: i + 1,
      kind: cap ? 'object-caption' : 'object',
      label: cap ? (cap.note || []).join(' ') : item.label || `객체 ${i + 1}`,
      hasCaption: !!cap,
    }
  })
  return list
})

let disposed = false
onScopeDispose(() => {
  disposed = true
})

// 진입 시 처리 미완(PENDING)으로 넘어온 사진을 1회만 재조회한다(배치 화면 폴링이
// deadline 으로 끊겼을 수 있다 — 그새 워커가 끝냈으면 반영). 무한 폴링 아님 = 진입 1회.
onMounted(async () => {
  for (const id of props.photoIds) {
    if (disposed) break // 진입 직후 이탈 시 남은 재조회 중단(불필요 호출 방지)
    const s = card.outlines[id]?.status
    if (s != null && s !== 'PENDING') continue
    try {
      const res = await fetchPhotoOutline(id)
      if (!disposed && (res.status === 'READY' || res.status === 'FAILED')) {
        card.setOutline(id, { status: res.status, items: res.items })
      }
    } catch {
      /* 외곽선 없이 수동 진행 */
    }
  }
})

onMounted(async () => {
  try {
    await document.fonts.load('40px "Ownglyph ooa"')
    await document.fonts.ready
  } catch {
    /* 폴백 폰트 */
  }
  if (!disposed) fontReady.value = true
})

function decode(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

let reqSeq = 0
async function loadCurrent() {
  const id = currentId.value
  if (!id) return
  zoom.value = 1 // 사진 전환 시 맞춤(100%)으로 리셋 — 사진별 배율 간섭 방지
  const seq = ++reqSeq
  photoImg.value = null
  selectedItemId.value = null
  selectedTextId.value = null
  selectedLineId.value = null
  bulkSelected.value = new Set()
  try {
    const img = await decode(await load(id))
    if (!disposed && seq === reqSeq) photoImg.value = img
  } catch {
    /* 무시 */
  }
}

const scene = computed(() => {
  const img = photoImg.value
  if (!img) return null
  const visibleObjects = (card.captions[currentId.value]?.response?.objects ?? []).filter((o) =>
    isObjectOn(o.itemId),
  )
  return buildScene({
    items: items.value,
    captions: { objects: visibleObjects, closing: closing.value },
    canvas: { W: contentRect.value.cw, H: contentRect.value.ch },
    photo: { w: img.naturalWidth, h: img.naturalHeight },
    // 외곽선은 에디터 paintOutlines 가 전담(두께·점선·흰색·visibility 조절) — renderCore sketch 외곽선 끔.
    style: { toneDown: toneDown.value, outline: false },
  })
})

// 외곽선 패스(카드 최종 외곽선). 미리보기·export 공용 — 같은 소스라 미리보기=저장 일치.
//   forExport=true 면 편집 보조(번호 배지·선택 빨강) 없이 흰 외곽선만. frameW/H = 그릴 캔버스 크기
//   (미리보기=canvasDims, export=PNG bmp). 외곽선은 레터박스 안쪽 사진 콘텐츠 사각형에 맞춘다.
function paintOutlines(ctx, img, frameW, frameH, { forExport = false } = {}) {
  const { cw, ch, dx, dy } =
    format.value === 'fixed'
      ? computeFitRect(img.naturalWidth, img.naturalHeight, frameW, frameH)
      : { cw: frameW, ch: frameH, dx: 0, dy: 0 }
  const W = cw
  const cf = makeCoverFit(img.naturalWidth, img.naturalHeight, cw, ch)
  const base = Math.max(1, W * 0.002)
  ctx.save()
  ctx.translate(dx, dy) // 콘텐츠 사각형 기준으로 그린다(레터박스 오프셋)
  let no = 0
  for (const item of items.value) {
    no += 1 // 레이어 목록과 같은 번호(숨겨도 번호 유지)
    if (!isObjectOn(item.id)) continue
    const sel = !forExport && item.id === selectedItemId.value
    // 외곽선은 카드 최종처럼 흰색. (편집 미리보기에서) 선택된 것만 빨강으로 구분.
    const color = sel ? 'rgba(240,68,82,0.95)' : 'rgba(255,255,255,0.96)'

    ctx.save()
    ctx.lineWidth = base * outlineWidth.value
    ctx.strokeStyle = color
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = base
    ctx.setLineDash(outlineStyle.value === 'dashed' ? [W * 0.001 * dashLen.value, W * 0.001 * dashGap.value] : [])
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

    // 번호 배지(객체 중심) — 레이어 매칭용 편집 보조. export 에는 안 들어간다.
    if (!forExport && Array.isArray(item.center)) {
      const [cx, cy] = cf.ptPx(item.center[0], item.center[1])
      const r = Math.max(11, W * 0.016)
      ctx.save()
      ctx.setLineDash([])
      ctx.fillStyle = sel ? '#f04452' : '#3182f6' // 번호 배지는 고정색(흰 외곽선이라 보이게)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = `700 ${Math.round(r * 1.2)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(no), cx, cy)
      ctx.restore()
    }
  }
  ctx.restore() // translate 해제
}

// 블러 여백 배경은 사진·프레임 크기에만 의존 → 캐시(매 redraw 마다 blur 필터 재계산 방지).
let blurCache = null
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
// 9:16 여백 채움(자르지 않고 contain 후 남는 공간) — 블러(캐시) 또는 단색.
function drawPadding(ctx, img, W, H) {
  if (padFill.value === 'solid') {
    ctx.fillStyle = padColor.value
    ctx.fillRect(0, 0, W, H)
    return
  }
  ctx.drawImage(blurBg(img, W, H), 0, 0)
}

// fixed 여백 합성용 콘텐츠 캔버스 — 매 프레임 createElement 대신 재사용(드래그 중 GC 압박 감소).
let contentCanvas = null
function getContentCanvas(cw, ch) {
  if (!contentCanvas) contentCanvas = document.createElement('canvas')
  if (contentCanvas.width !== cw) contentCanvas.width = cw
  if (contentCanvas.height !== ch) contentCanvas.height = ch
  return contentCanvas
}
function redraw() {
  const el = canvasEl.value
  const sc = scene.value
  const img = photoImg.value
  if (!el || !sc || !img || !fontReady.value) return
  const { W: fw, H: fh } = canvasDims.value // 프레임(출력) 크기
  const { cw, ch, dx, dy } = contentRect.value
  // 같은 값 재대입도 백버퍼를 재할당하므로 크기가 바뀔 때만. 잔상은 아래 renderCard clearRect /
  //   drawPadding 전체덮기가 지운다.
  if (el.width !== fw || el.height !== fh) {
    el.width = fw
    el.height = fh
  }
  // 표시 크기 = 맞춤배율 × zoom. 내부 해상도와 같은 시점에 설정해 사진 전환 시 stretch 방지.
  const dispScale = fitScale.value * zoom.value
  el.style.width = Math.round(fw * dispScale) + 'px'
  el.style.height = Math.round(fh * dispScale) + 'px'
  const ctx = el.getContext('2d', { willReadFrequently: true })
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (dx > 0 || dy > 0) {
    // fixed: 여백 채움 → 콘텐츠를 별도 캔버스에 그려 가운데 얹는다(export 와 동일).
    drawPadding(ctx, img, fw, fh)
    const content = getContentCanvas(cw, ch)
    renderCard(content.getContext('2d', { willReadFrequently: true }), sc, { photo: img })
    ctx.drawImage(content, dx, dy)
  } else {
    renderCard(ctx, sc, { photo: img }) // native: 프레임 전체가 콘텐츠
  }
  paintOutlines(ctx, img, fw, fh)
  drawLines(ctx, { W: fw, H: fh })
  drawTexts(ctx, { W: fw, H: fh })
}

// 리드로 코얼레스 — 슬라이더 드래그 등 빠른 변경은 프레임당 1회만 그린다(이벤트마다 X).
let rafId = null
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

watch(currentId, loadCurrent, { immediate: true })
watch(
  [scene, photoImg, fontReady, hiddenObject, outlineWidth, outlineStyle, dashLen, dashGap, selectedItemId, format, padFill, padColor, zoom, stageSize],
  scheduleRedraw,
  { flush: 'post' },
)

const selectedCaption = computed(() => captionByItem.value[selectedItemId.value] ?? null)
function updateCaptionText(text) {
  const existing = card.captions[currentId.value]
  if (!existing) return
  const objects = existing.response.objects.map((o) =>
    o.itemId === selectedItemId.value ? { ...o, note: text.split('\n') } : o,
  )
  card.setCaption(currentId.value, { ...existing, response: { ...existing.response, objects } })
}
function generateCaption() {
  if (card.outlines[currentId.value]?.status === 'READY') genCaption(currentId.value)
}

// --- 추가 텍스트 요소(왼쪽 텍스트 도구) — 직접 추가/편집/드래그/저장 ---
// 사진별 추가 텍스트 { id, text, x, y(0~1 중심), size(배율), rotation(도), color, hidden }.
const textsByPhoto = reactive({})
let textSeq = 0
const texts = computed(() => textsByPhoto[currentId.value] ?? [])
const selectedText = computed(() => texts.value.find((t) => t.id === selectedTextId.value) ?? null)

function addText(x = 0.5, y = 0.5) {
  const list = textsByPhoto[currentId.value] || (textsByPhoto[currentId.value] = [])
  const t = { id: `t${++textSeq}`, text: '텍스트', x, y, size: 1, rotation: 0, color: '#ffffff', hidden: false }
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
function toggleText(t) {
  t.hidden = !t.hidden
}
// 객체/텍스트 선택은 상호 배타.
function selectItem(id) {
  selectedItemId.value = id
  if (id != null) {
    selectedTextId.value = null
    selectedLineId.value = null
  }
}
function selectText(id) {
  selectedTextId.value = id
  if (id != null) {
    selectedItemId.value = null
    selectedLineId.value = null
  }
}

// --- 레이어 선택 + 표시/숨김(클립스튜디오식). 삭제는 없다(외곽선은 숨길 뿐). ---
// 전체/일부 선택(체크박스) 후 일괄 숨기기/보이기. 눈 아이콘은 행별 즉시 토글.
const layerKeys = computed(() => [
  ...texts.value.map((t) => `txt:${t.id}`),
  ...lines.value.map((l) => `line:${l.id}`),
  ...items.value.map((it) => `obj:${it.id}`),
])
const allSelected = computed(
  () => layerKeys.value.length > 0 && layerKeys.value.every((k) => bulkSelected.value.has(k)),
)
function setAllSelected(on) {
  bulkSelected.value = on ? new Set(layerKeys.value) : new Set()
}
function bulkSetVisible(vis) {
  for (const key of bulkSelected.value) {
    const i = key.indexOf(':')
    const type = key.slice(0, i)
    const idRaw = key.slice(i + 1)
    if (type === 'txt') {
      const t = texts.value.find((x) => x.id === idRaw)
      if (t) t.hidden = !vis
    } else if (type === 'line') {
      const l = lines.value.find((x) => x.id === idRaw)
      if (l) l.hidden = !vis
    } else if (type === 'obj') setObjectVisible(Number(idRaw), vis)
  }
}

const TEXT_LH = 1.4 // 줄 높이 배수(폰트 size 대비)
// 추가 텍스트를 그린다(편집·export 공용 로직). 손글씨 폰트 + 크기·회전·색 + 여러 줄(\n).
function paintText(ctx, t, W, H) {
  const size = Math.round(W * 0.05 * (t.size ?? 1))
  const lines = String(t.text ?? '').split('\n')
  const lh = size * TEXT_LH
  ctx.save()
  ctx.translate(t.x * W, t.y * H)
  ctx.rotate(((t.rotation ?? 0) * Math.PI) / 180)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${size}px "Ownglyph ooa", sans-serif`
  ctx.lineWidth = Math.max(2, W * 0.004)
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ctx.fillStyle = t.color ?? '#ffffff'
  const y0 = -((lines.length - 1) * lh) / 2 // 줄 블록을 중심에 세로 정렬
  lines.forEach((ln, i) => {
    const y = y0 + i * lh
    ctx.strokeText(ln, 0, y)
    ctx.fillText(ln, 0, y)
  })
  ctx.restore()
}
// 텍스트 박스 메트릭(중심 기준 반폭/반높이, px). 여러 줄 = 가장 긴 줄 폭 + 줄 수만큼 높이. 회전 핸들 거리 포함.
function textMetrics(ctx, t, W) {
  const size = W * 0.05 * (t.size ?? 1)
  ctx.font = `${Math.round(size)}px "Ownglyph ooa", sans-serif`
  const lines = String(t.text || ' ').split('\n')
  const lh = size * TEXT_LH
  const tw = Math.max(...lines.map((ln) => ctx.measureText(ln || ' ').width))
  const totalH = Math.max(lh, lines.length * lh)
  return { size, hw: tw / 2 + size * 0.3, hh: totalH / 2 + size * 0.08, rotOff: Math.max(20, W * 0.032) }
}
// 선택된 텍스트의 변형 박스(모서리=크기, 위 핸들=회전) — 캔버스에서 직접 조절.
function drawTextBox(ctx, t, W, H) {
  const m = textMetrics(ctx, t, W)
  const r = Math.max(6, W * 0.011)
  ctx.save()
  ctx.translate(t.x * W, t.y * H)
  ctx.rotate(((t.rotation ?? 0) * Math.PI) / 180)
  ctx.strokeStyle = '#3182f6'
  ctx.lineWidth = Math.max(1.5, W * 0.002)
  ctx.setLineDash([W * 0.006, W * 0.004])
  ctx.strokeRect(-m.hw, -m.hh, m.hw * 2, m.hh * 2)
  ctx.setLineDash([])
  const rotY = -m.hh - m.rotOff
  ctx.beginPath()
  ctx.moveTo(0, -m.hh)
  ctx.lineTo(0, rotY)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  for (const [hx, hy] of [[-m.hw, -m.hh], [m.hw, -m.hh], [m.hw, m.hh], [-m.hw, m.hh]]) {
    ctx.beginPath()
    ctx.arc(hx, hy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(0, rotY, r, 0, Math.PI * 2)
  ctx.fillStyle = '#3182f6'
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.stroke()
  ctx.restore()
}
function drawTexts(ctx, dims) {
  const { W, H } = dims
  for (const t of texts.value) {
    if (t.hidden) continue
    paintText(ctx, t, W, H)
  }
  const st = selectedText.value
  if (st && !st.hidden) drawTextBox(ctx, st, W, H)
}

// --- 선 요소(직선/화살표) — 선 도구로 캔버스에 끌어 그린다 ---
// 사진별 선 { id, x1,y1,x2,y2 (0~1), color, width(배율), style, arrow, hidden }.
const linesByPhoto = reactive({})
let lineSeq = 0
const lines = computed(() => linesByPhoto[currentId.value] ?? [])
const selectedLine = computed(() => lines.value.find((l) => l.id === selectedLineId.value) ?? null)
function addLine(x1, y1, x2, y2) {
  const list = linesByPhoto[currentId.value] || (linesByPhoto[currentId.value] = [])
  const l = { id: `l${++lineSeq}`, x1, y1, x2, y2, color: '#ffffff', width: 1, style: 'solid', arrow: 'none', hidden: false }
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
function toggleLine(l) {
  l.hidden = !l.hidden
}
function setLineProp(prop, val) {
  if (selectedLine.value) selectedLine.value[prop] = val
}
function selectLine(id) {
  selectedLineId.value = id
  if (id != null) {
    selectedItemId.value = null
    selectedTextId.value = null
  }
}
// 화살촉.
function arrowHead(ctx, tipX, tipY, fromX, fromY, size) {
  const a = Math.atan2(tipY - fromY, tipX - fromX)
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(tipX - size * Math.cos(a - 0.42), tipY - size * Math.sin(a - 0.42))
  ctx.lineTo(tipX - size * Math.cos(a + 0.42), tipY - size * Math.sin(a + 0.42))
  ctx.closePath()
  ctx.fill()
}
function paintLine(ctx, l, W, H) {
  const x1 = l.x1 * W, y1 = l.y1 * H, x2 = l.x2 * W, y2 = l.y2 * H
  const lw = Math.max(2, W * 0.006 * (l.width ?? 1))
  ctx.save()
  ctx.strokeStyle = l.color ?? '#ffffff'
  ctx.fillStyle = l.color ?? '#ffffff'
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = lw * 0.6
  ctx.setLineDash(l.style === 'dashed' ? [lw * 2.5, lw * 1.8] : [])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.setLineDash([])
  const head = lw * 3.4
  if (l.arrow === 'end' || l.arrow === 'both') arrowHead(ctx, x2, y2, x1, y1, head)
  if (l.arrow === 'both') arrowHead(ctx, x1, y1, x2, y2, head)
  ctx.restore()
}
function drawLines(ctx, dims) {
  const { W, H } = dims
  for (const l of lines.value) if (!l.hidden) paintLine(ctx, l, W, H)
  // 선택된 선의 끝점 핸들(편집 보조 — export 엔 안 들어감).
  const sl = selectedLine.value
  if (sl && !sl.hidden) {
    for (const [hx, hy] of [[sl.x1, sl.y1], [sl.x2, sl.y2]]) {
      ctx.save()
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#3182f6'
      ctx.lineWidth = Math.max(2, W * 0.003)
      ctx.beginPath()
      ctx.arc(hx * W, hy * H, Math.max(7, W * 0.012), 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
    // 회전 핸들(중점에서 수직으로) — 길이 유지하며 회전.
    const [rhx, rhy] = lineRotHandle(sl, W, H)
    const mx = ((sl.x1 + sl.x2) / 2) * W, my = ((sl.y1 + sl.y2) / 2) * H
    ctx.save()
    ctx.strokeStyle = '#3182f6'
    ctx.lineWidth = Math.max(1.5, W * 0.002)
    ctx.beginPath()
    ctx.moveTo(mx, my)
    ctx.lineTo(rhx, rhy)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(rhx, rhy, Math.max(6, W * 0.011), 0, Math.PI * 2)
    ctx.fillStyle = '#3182f6'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.stroke()
    ctx.restore()
  }
}
// 선 회전 핸들 위치(px) = 중점 + 수직 오프셋.
function lineRotHandle(l, W, H) {
  const mx = ((l.x1 + l.x2) / 2) * W, my = ((l.y1 + l.y2) / 2) * H
  const dxp = (l.x2 - l.x1) * W, dyp = (l.y2 - l.y1) * H
  const len = Math.hypot(dxp, dyp) || 1
  const off = Math.max(22, W * 0.035)
  return [mx + (-dyp / len) * off, my + (dxp / len) * off]
}
// 점(nx,ny 0~1)이 선분에 충분히 가까운지(본체 hit). 화면 비율 보정 없이 정규화 거리 근사.
function nearLine(l, nx, ny) {
  const dx = l.x2 - l.x1, dy = l.y2 - l.y1
  const len2 = dx * dx + dy * dy || 1e-6
  let tt = ((nx - l.x1) * dx + (ny - l.y1) * dy) / len2
  tt = Math.max(0, Math.min(1, tt))
  const px = l.x1 + tt * dx, py = l.y1 + tt * dy
  return Math.hypot(nx - px, ny - py) < 0.02
}
function lineEndpointAt(l, nx, ny) {
  if (Math.hypot(nx - l.x1, ny - l.y1) < 0.03) return '1'
  if (Math.hypot(nx - l.x2, ny - l.y2) < 0.03) return '2'
  return null
}

// 캔버스 드래그로 텍스트/선 이동·그리기. drag = { kind, ... }.
let drag = null
function bindCanvasDrag(e) {
  window.addEventListener('pointermove', onCanvasPointerMove)
  window.addEventListener('pointerup', onCanvasPointerUp)
  e.preventDefault()
}
function onCanvasPointerDown(e) {
  const el = canvasEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const nx = (e.clientX - rect.left) / rect.width
  const ny = (e.clientY - rect.top) / rect.height
  const { W, H } = canvasDims.value
  const ctx = el.getContext('2d')

  // 0) 선택된 텍스트의 변형 핸들(회전/크기) — 박스가 텍스트 위라 최우선.
  const stx = selectedText.value
  if (stx && !stx.hidden) {
    const m = textMetrics(ctx, stx, W)
    const cx = stx.x * W, cy = stx.y * H
    const rad = ((stx.rotation ?? 0) * Math.PI) / 180
    const dx = nx * W - cx, dy = ny * H - cy
    const lx = dx * Math.cos(-rad) - dy * Math.sin(-rad)
    const ly = dx * Math.sin(-rad) + dy * Math.cos(-rad)
    const hr = Math.max(11, W * 0.02)
    if (Math.hypot(lx, ly - (-m.hh - m.rotOff)) < hr) {
      drag = { kind: 'text-rotate', id: stx.id }
      bindCanvasDrag(e)
      return
    }
    if ([[-m.hw, -m.hh], [m.hw, -m.hh], [m.hw, m.hh], [-m.hw, m.hh]].some(([hx, hy]) => Math.hypot(lx - hx, ly - hy) < hr)) {
      drag = { kind: 'text-resize', id: stx.id, d0: Math.hypot(dx, dy) || 1, s0: stx.size ?? 1 }
      bindCanvasDrag(e)
      return
    }
  }

  // 1) 선택된 선: 회전 핸들(길이 유지 회전) → 끝점 핸들(방향·길이)
  if (selectedLine.value && !selectedLine.value.hidden) {
    const sl = selectedLine.value
    const [rhx, rhy] = lineRotHandle(sl, W, H)
    if (Math.hypot(nx * W - rhx, ny * H - rhy) < Math.max(11, W * 0.02)) {
      const dxp = (sl.x2 - sl.x1) * W, dyp = (sl.y2 - sl.y1) * H
      drag = { kind: 'line-rotate', id: sl.id, halfLen: Math.hypot(dxp, dyp) / 2 }
      bindCanvasDrag(e)
      return
    }
    const ep = lineEndpointAt(sl, nx, ny)
    if (ep) {
      drag = { kind: 'line-ep', id: sl.id, ep }
      bindCanvasDrag(e)
      return
    }
  }
  // 2) 텍스트(위에서부터) — 박스 근사(회전 무시 축정렬). 여러 줄 = 가장 긴 줄 폭·줄 수 높이.
  for (let i = texts.value.length - 1; i >= 0; i--) {
    const t = texts.value[i]
    if (t.hidden) continue
    const fs = W * 0.05 * (t.size ?? 1)
    ctx.font = `${Math.round(fs)}px "Ownglyph ooa", sans-serif`
    const tlines = String(t.text ?? '').split('\n')
    const w = Math.max(...tlines.map((ln) => ctx.measureText(ln || ' ').width)) / W
    const h = (fs * 1.4 * Math.max(1, tlines.length)) / H
    if (Math.abs(nx - t.x) <= w / 2 + 0.02 && Math.abs(ny - t.y) <= h / 2 + 0.01) {
      drag = { kind: 'text', id: t.id, dx: nx - t.x, dy: ny - t.y }
      selectText(t.id)
      bindCanvasDrag(e)
      return
    }
  }
  // 3) 선 본체(위에서부터) → 선택 + 본체 이동
  for (let i = lines.value.length - 1; i >= 0; i--) {
    const l = lines.value[i]
    if (l.hidden) continue
    if (nearLine(l, nx, ny)) {
      drag = { kind: 'line-body', id: l.id, dx: nx - l.x1, dy: ny - l.y1, lx2: l.x2 - l.x1, ly2: l.y2 - l.y1 }
      selectLine(l.id)
      bindCanvasDrag(e)
      return
    }
  }
  // 4) 선 도구 활성 + 빈 곳 → 새 선 그리기(끝점을 끌어 완성)
  if (activeTool.value === 'line') {
    const l = addLine(nx, ny, nx, ny)
    selectLine(l.id)
    drag = { kind: 'line-ep', id: l.id, ep: '2' }
    bindCanvasDrag(e)
    return
  }
  // 5) 텍스트 도구 활성 + 빈 곳 → 클릭 위치에 텍스트 추가(끌어서 자리 잡기)
  if (activeTool.value === 'text') {
    const t = addText(nx, ny)
    drag = { kind: 'text', id: t.id, dx: 0, dy: 0 }
    bindCanvasDrag(e)
    return
  }
  // 6) 빈 곳 클릭(선택 모드 등) → 선택 해제
  selectedItemId.value = null
  selectedTextId.value = null
  selectedLineId.value = null
}
function onCanvasPointerMove(e) {
  if (!drag) return
  const el = canvasEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
  if (drag.kind === 'text') {
    const t = texts.value.find((x) => x.id === drag.id)
    if (t) {
      t.x = Math.min(1, Math.max(0, nx - drag.dx))
      t.y = Math.min(1, Math.max(0, ny - drag.dy))
    }
  } else if (drag.kind === 'text-rotate') {
    const t = texts.value.find((x) => x.id === drag.id)
    if (t) {
      const { W, H } = canvasDims.value
      t.rotation = Math.round((Math.atan2((ny - t.y) * H, (nx - t.x) * W) * 180) / Math.PI + 90)
    }
  } else if (drag.kind === 'text-resize') {
    const t = texts.value.find((x) => x.id === drag.id)
    if (t) {
      const { W, H } = canvasDims.value
      const dpx = Math.hypot((nx - t.x) * W, (ny - t.y) * H)
      t.size = Math.min(6, Math.max(0.2, drag.s0 * (dpx / drag.d0)))
    }
  } else if (drag.kind === 'line-ep') {
    const l = lines.value.find((x) => x.id === drag.id)
    if (l) {
      if (drag.ep === '1') { l.x1 = nx; l.y1 = ny } else { l.x2 = nx; l.y2 = ny }
    }
  } else if (drag.kind === 'line-body') {
    const l = lines.value.find((x) => x.id === drag.id)
    if (l) {
      const x1 = Math.min(1, Math.max(0, nx - drag.dx))
      const y1 = Math.min(1, Math.max(0, ny - drag.dy))
      l.x1 = x1; l.y1 = y1; l.x2 = x1 + drag.lx2; l.y2 = y1 + drag.ly2
    }
  } else if (drag.kind === 'line-rotate') {
    const l = lines.value.find((x) => x.id === drag.id)
    if (l) {
      const { W, H } = canvasDims.value
      const mx = (l.x1 + l.x2) / 2, my = (l.y1 + l.y2) / 2
      // 핸들은 선과 수직 → 선 각도 = (중점→포인터) - 90°. 길이는 유지.
      const ang = Math.atan2((ny - my) * H, (nx - mx) * W) - Math.PI / 2
      const hx = (drag.halfLen * Math.cos(ang)) / W
      const hy = (drag.halfLen * Math.sin(ang)) / H
      l.x1 = mx - hx; l.y1 = my - hy; l.x2 = mx + hx; l.y2 = my + hy
    }
  }
}
function onCanvasPointerUp() {
  // 클릭만 한(거의 점) 새 선은 버린다.
  if (drag?.kind === 'line-ep') {
    const l = lines.value.find((x) => x.id === drag.id)
    if (l && Math.hypot(l.x2 - l.x1, l.y2 - l.y1) < 0.02) removeLine(l.id)
  }
  drag = null
  window.removeEventListener('pointermove', onCanvasPointerMove)
  window.removeEventListener('pointerup', onCanvasPointerUp)
}
onScopeDispose(() => {
  window.removeEventListener('pointermove', onCanvasPointerMove)
  window.removeEventListener('pointerup', onCanvasPointerUp)
})

// 텍스트/선 선택·내용·위치 변경 시 다시 그린다(여기서 — texts/lines 선언 뒤라 TDZ 없음).
watch([selectedTextId, texts], scheduleRedraw, { deep: true, flush: 'post' })
watch([selectedLineId, lines], scheduleRedraw, { deep: true, flush: 'post' })
// 도구를 바꾸면 선택을 해제한다 — 선/텍스트가 선택된 채로 다른 도구가 막히던 문제 해소.
watch(activeTool, () => {
  selectedItemId.value = null
  selectedTextId.value = null
  selectedLineId.value = null
})

// --- 우측 패널 상세/레이어 분할 크기 조절 (구분선 드래그) ---
// 상세 설정 영역 높이를 사용자가 끌어 조절한다. 두 영역(상세·레이어)은 각자 내부 스크롤.
const rightEl = ref(null)
const detailH = ref(248) // 상세 설정 영역 높이(px)
let resizeStart = null
function onResizeDown(e) {
  resizeStart = { y: e.clientY, h: detailH.value }
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeUp)
  e.preventDefault()
}
function onResizeMove(e) {
  if (!resizeStart) return
  const avail = rightEl.value?.clientHeight ?? 600
  const max = Math.max(220, avail - 150) // 레이어에 최소 공간 확보
  // 상세 설정 최소 220px — 그 이하로 줄여 레이어창이 잠식하지 못하게(컨트롤 잘림 방지).
  detailH.value = Math.min(max, Math.max(220, resizeStart.h + (e.clientY - resizeStart.y)))
}
function onResizeUp() {
  resizeStart = null
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeUp)
}
onScopeDispose(() => {
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeUp)
})

// 완성 = 사용자가 카드별로 직접 표시(자동 판단 아님). 필름스트립에서 사진마다 토글.
const doneSet = ref(new Set())
const isDone = (id) => doneSet.value.has(id)
function toggleDone(id) {
  const s = new Set(doneSet.value)
  s.has(id) ? s.delete(id) : s.add(id)
  doneSet.value = s
}
const doneCount = computed(() => props.photoIds.filter((id) => isDone(id)).length)

// 캔버스 줌(확대/축소/맞춤). 하단 필름스트립 썸네일 크기 배율.
let stageRo = null
onMounted(() => {
  if (!stageEl.value) return
  const measure = () => {
    if (stageEl.value) stageSize.value = { w: stageEl.value.clientWidth, h: stageEl.value.clientHeight }
  }
  stageRo = new ResizeObserver(measure)
  stageRo.observe(stageEl.value)
  measure()
})
onScopeDispose(() => stageRo?.disconnect())
function zoomBy(d) {
  zoom.value = Math.min(4, Math.max(0.25, Math.round((zoom.value + d) * 20) / 20))
}
function zoomFit() {
  zoom.value = 1
}

// 하단 필름스트립 높이 = 위쪽 핸들을 끌어 조절(레이어 창처럼). 썸네일은 높이에 맞춰 자동 확대.
const filmH = ref(104)
let filmResizeStart = null
function onFilmResizeDown(e) {
  filmResizeStart = { y: e.clientY, h: filmH.value }
  window.addEventListener('pointermove', onFilmResizeMove)
  window.addEventListener('pointerup', onFilmResizeUp)
  e.preventDefault()
}
function onFilmResizeMove(e) {
  if (!filmResizeStart) return
  // 위로 끌면 커지고 아래로 끌면 작아진다.
  filmH.value = Math.min(440, Math.max(78, filmResizeStart.h - (e.clientY - filmResizeStart.y)))
}
function onFilmResizeUp() {
  filmResizeStart = null
  window.removeEventListener('pointermove', onFilmResizeMove)
  window.removeEventListener('pointerup', onFilmResizeUp)
}
onScopeDispose(() => {
  window.removeEventListener('pointermove', onFilmResizeMove)
  window.removeEventListener('pointerup', onFilmResizeUp)
})

const exporting = ref(false)
const exportNote = ref('')
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
async function exportCurrent() {
  if (exporting.value || !photoImg.value) return
  exporting.value = true
  exportNote.value = ''
  // 이 사진 기준으로 저장한다. export 는 비동기(await)라 그 사이 필름스트립 전환이 가능하므로,
  // 합성 후 사진이 바뀌었으면(stale) 저장을 취소한다 — 잘못된 합성 PNG 다운로드 방지.
  const exportId = currentId.value
  try {
    const visibleObjects = (card.captions[currentId.value]?.response?.objects ?? []).filter((o) =>
      isObjectOn(o.itemId),
    )
    const inputs = {
      items: items.value,
      captions: { objects: visibleObjects, closing: closing.value },
      photo: { w: photoImg.value.naturalWidth, h: photoImg.value.naturalHeight },
      // 미리보기 scene 과 동일: 외곽선은 paintOutlines(composeOverlays)가 전담 → buildScene sketch 외곽선 끔.
      // (이게 빠지면 문구 생성된 객체는 buildScene sketch + paintOutlines 가 겹쳐 PNG 외곽선 중복)
      style: { toneDown: toneDown.value, outline: false },
    }
    const blob = await exportCardPng(inputs, { photo: photoImg.value }, { format: format.value, pad: padFill.value, bg: padColor.value })
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

// export 결과(PNG blob) 위에 외곽선·선·텍스트를 합성한다(렌더 모듈은 이 요소들을 모르므로 후처리).
// 외곽선은 미리보기와 동일한 paintOutlines 로 그려 미리보기=저장을 맞춘다(문구 유무 무관).
// 좌표는 프레임(출력 크기) 기준 정규화 — 미리보기와 export 프레임이 같아 native·fixed 모두 정확.
async function composeOverlays(blob) {
  const img = photoImg.value
  const vText = texts.value.filter((t) => !t.hidden && t.text.trim())
  const vLine = lines.value.filter((l) => !l.hidden)
  const hasOutline = items.value.some(
    (it) => isObjectOn(it.id) && Array.isArray(it.polygons) && it.polygons.length,
  )
  if (!vText.length && !vLine.length && !hasOutline) return blob
  try {
    // 폰트가 아직 안 굳었으면 폴백(sans-serif)으로 구워지므로, 합성 전에 손글씨 폰트를 보장한다.
    try {
      await document.fonts.load('64px "Ownglyph ooa"')
    } catch {
      /* 폰트 로드 실패 — 폴백 폰트로 진행 */
    }
    const bmp = await createImageBitmap(blob)
    const cv = document.createElement('canvas')
    cv.width = bmp.width
    cv.height = bmp.height
    const ctx = cv.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    if (img && hasOutline) paintOutlines(ctx, img, bmp.width, bmp.height, { forExport: true }) // 외곽선(맨 아래)
    for (const l of vLine) paintLine(ctx, l, bmp.width, bmp.height) // 선
    for (const t of vText) paintText(ctx, t, bmp.width, bmp.height) // 텍스트(위)
    return await new Promise((res) => cv.toBlob(res, 'image/png'))
  } catch {
    return blob
  }
}

// 필름스트립 썸네일(9:16 cover-fit) objectURL.
const thumbUrls = ref({})
async function loadThumb(id) {
  if (thumbUrls.value[id]) return
  try {
    const url = await load(id)
    if (!disposed) thumbUrls.value = { ...thumbUrls.value, [id]: url }
  } catch {
    /* 무시 */
  }
}
watch(
  () => props.photoIds.slice(),
  (ids) => ids.forEach(loadThumb),
  { immediate: true },
)
</script>

<template>
  <div class="ed">
    <!-- 상단: 출력 형식 + 저장/완료 -->
    <header class="ed-top">
      <button class="back" @click="emit('back')">‹ 고르기</button>
      <span class="title">카드 {{ current + 1 }} / {{ photoIds.length }}</span>
      <span class="grow" />
      <fieldset class="fmt">
        <legend>출력 형식</legend>
        <label><input type="radio" value="native" v-model="format" /> 원본 비율</label>
        <label><input type="radio" value="fixed" v-model="format" /> 9:16</label>
      </fieldset>
      <fieldset v-if="format === 'fixed'" class="fmt">
        <legend>9:16 여백</legend>
        <label><input type="radio" value="blur" v-model="padFill" /> 블러</label>
        <label><input type="radio" value="solid" v-model="padFill" /> 단색</label>
        <input v-if="padFill === 'solid'" type="color" v-model="padColor" class="pad-color" title="여백 색" />
      </fieldset>
      <fieldset class="fmt">
        <legend>전체 보정</legend>
        <label class="tone-lbl">톤 낮춤 <input type="range" min="0" max="50" :value="Math.round(toneDown * 100)" @input="toneDown = Number($event.target.value) / 100" /></label>
      </fieldset>
      <span v-if="exportNote" class="ok">{{ exportNote }}</span>
      <Button label="PNG 저장" icon="pi pi-download" size="small" severity="secondary" :disabled="exporting || !photoImg" @click="exportCurrent" />
      <Button label="완료" size="small" @click="emit('back')" />
    </header>

    <div class="ed-mid">
      <!-- 좌: 도구 선택 -->
      <nav class="ed-rail">
        <button
          v-for="tool in TOOLS"
          :key="tool.key"
          class="rail-btn"
          :class="{ on: activeTool === tool.key }"
          :title="tool.label"
          @click="activeTool = tool.key"
        >
          <span class="rail-ic">{{ tool.icon }}</span>
          <span class="rail-lb">{{ tool.label }}</span>
        </button>
      </nav>

      <!-- 중: 캔버스 (줌) -->
      <section class="ed-stage" ref="stageEl">
        <!-- 사진 위 플로팅 모드 토글 -->
        <div class="stage-modes">
          <button :class="{ on: isSelectMode }" @click="setMode('select')">↖ 선택</button>
          <button :class="{ on: !isSelectMode }" @click="setMode('create')">＋ 생성</button>
        </div>
        <p v-if="fallbackHint" class="fallback-hint">{{ fallbackHint }}</p>
        <canvas v-show="photoImg" ref="canvasEl" class="card-canvas" :class="{ grab: texts.length || lines.length, draw: activeTool === 'line' }" aria-label="카드 편집 캔버스" @pointerdown="onCanvasPointerDown" />
        <div class="zoom-bar">
          <button title="축소" @click="zoomBy(-0.25)">−</button>
          <span class="zoom-v">{{ Math.round(zoom * 100) }}%</span>
          <button title="확대" @click="zoomBy(0.25)">＋</button>
          <button class="fit" title="맞춤" @click="zoomFit">맞춤</button>
        </div>
      </section>

      <!-- 우: 상세 설정 + 레이어 (구분선을 끌어 두 영역 높이 조절) -->
      <aside class="ed-right" ref="rightEl">
        <div class="section detail">
          <h3>상세 설정</h3>

          <!-- (A) 선택한 객체/텍스트 정밀 편집 (오른쪽 패널의 "선택 대상" 영역) -->
          <template v-if="selectedCaption">
            <label class="lbl">문구 (선택 객체)</label>
            <textarea class="cap-edit" :value="selectedCaption.note.join('\n')" rows="3" @input="updateCaptionText($event.target.value)" />
            <p class="muted small">줄바꿈으로 여러 줄. 서체·색·크기 = 다음.</p>
          </template>
          <template v-else-if="selectedText">
            <label class="lbl">텍스트 (선택)</label>
            <textarea class="cap-edit" :value="selectedText.text" rows="2" @input="updateTextValue($event.target.value)" />
            <div class="row">
              <span>크기</span>
              <input class="num" type="number" min="8" max="200" step="1" :value="Math.round((selectedText.size ?? 1) * 40)" @input="setTextProp('size', Number($event.target.value) / 40)" /><span class="numv">pt</span>
              <span>기울기</span>
              <input class="num" type="number" min="-180" max="180" step="1" :value="selectedText.rotation ?? 0" @input="setTextProp('rotation', Number($event.target.value))" /><span class="numv">°</span>
            </div>
          </template>
          <template v-else-if="selectedLine">
            <label class="lbl">선 (선택)</label>
            <label class="ctl-lbl">굵기</label>
            <div class="stepper">
              <button class="step" title="얇게" @click="setLineProp('width', Math.max(0.3, Math.round(((selectedLine.width ?? 1) - 0.1) * 10) / 10))">−</button>
              <input type="range" min="0.3" max="5" step="0.1" :value="selectedLine.width ?? 1" @input="setLineProp('width', Number($event.target.value))" />
              <button class="step" title="굵게" @click="setLineProp('width', Math.min(5, Math.round(((selectedLine.width ?? 1) + 0.1) * 10) / 10))">＋</button>
              <input class="num" type="number" min="0.3" max="5" step="0.1" :value="selectedLine.width ?? 1" @input="setLineProp('width', Number($event.target.value))" />
            </div>
            <div class="row">
              <span>스타일</span>
              <label class="rd"><input type="radio" :checked="selectedLine.style === 'solid'" @change="setLineProp('style', 'solid')" /> 실선</label>
              <label class="rd"><input type="radio" :checked="selectedLine.style === 'dashed'" @change="setLineProp('style', 'dashed')" /> 점선</label>
            </div>
            <div class="row">
              <span>화살표</span>
              <label class="rd"><input type="radio" :checked="selectedLine.arrow === 'none'" @change="setLineProp('arrow', 'none')" /> 없음</label>
              <label class="rd"><input type="radio" :checked="selectedLine.arrow === 'end'" @change="setLineProp('arrow', 'end')" /> 끝</label>
              <label class="rd"><input type="radio" :checked="selectedLine.arrow === 'both'" @change="setLineProp('arrow', 'both')" /> 양쪽</label>
            </div>
          </template>

          <!-- (B) 활성 도구 컨트롤 — 선택과 무관하게 전역 동작(외곽선 두께/스타일 등은 전역이라
               객체를 선택해도 사라지지 않아야 한다). 선택 편집(A)과 도구 컨트롤(B)은 별개 블록. -->
          <div v-if="activeTool === 'ai'" class="tool-block">
            <label class="ctl-lbl">외곽선 두께</label>
            <div class="stepper">
              <button class="step" title="얇게" @click="bumpWidth(-0.1)">−</button>
              <input type="range" min="0.3" max="8" step="0.1" v-model.number="outlineWidth" />
              <button class="step" title="굵게" @click="bumpWidth(0.1)">＋</button>
              <input class="num" type="number" min="0.3" max="8" step="0.1" v-model.number="outlineWidth" />
            </div>
            <div class="row">
              <span>선 스타일</span>
              <label class="rd"><input type="radio" value="solid" v-model="outlineStyle" /> 실선</label>
              <label class="rd"><input type="radio" value="dashed" v-model="outlineStyle" /> 점선</label>
            </div>
            <template v-if="outlineStyle === 'dashed'">
              <label class="row">선 길이 <input type="range" min="2" max="30" step="1" v-model.number="dashLen" /><span class="numv">{{ dashLen }}</span></label>
              <label class="row">간격 <input type="range" min="1" max="30" step="1" v-model.number="dashGap" /><span class="numv">{{ dashGap }}</span></label>
            </template>
            <Button label="✨ 문구 생성" size="small" severity="secondary" class="full"
              :disabled="captionGenerating || card.outlines[currentId]?.status !== 'READY' || !items.length || !!card.captions[currentId]"
              @click="generateCaption" />
            <p v-if="captionGenerating" class="muted small">문구 생성 중…</p>
            <p v-else-if="captionFailed[currentId]" class="warn small">문구를 불러오지 못했어요. 다시 시도하거나 직접 꾸며도 좋아요.</p>
            <p v-else-if="hasNoOutline(currentId)" class="muted small">객체 인식이 잘 되지 않아 외곽선을 찾지 못했어요. 텍스트·선으로 꾸밀 수 있어요.</p>
            <p v-else-if="!items.length" class="muted small">사진을 준비하고 있어요…</p>
            <p v-else class="muted small">피사체 외곽선 {{ items.length }}개 인식. 레이어에서 켜고 끄기.</p>
          </div>
          <div v-else-if="activeTool === 'text'" class="tool-block">
            <p class="muted small">캔버스를 클릭해 텍스트를 추가하세요.</p>
          </div>
          <p v-else-if="activeTool === 'deco' && !selectedCaption && !selectedText && !selectedLine" class="muted small">"장식" 추가는 곧 제공됩니다.</p>
        </div>

        <div class="section layers">
          <div class="layers-head">
            <h3>레이어 <span class="muted">· {{ layers.length + texts.length + lines.length + (closing ? 1 : 0) }}</span></h3>
            <span class="grow" />
            <label class="all-vis" title="전체 선택">
              <input type="checkbox" :checked="allSelected" @change="setAllSelected($event.target.checked)" /> 전체 선택
            </label>
          </div>
          <div class="bulk-bar">
            <button :disabled="!bulkSelected.size" @click="bulkSetVisible(false)">숨기기</button>
            <button :disabled="!bulkSelected.size" @click="bulkSetVisible(true)">보이기</button>
            <span class="bulk-n">{{ bulkSelected.size ? bulkSelected.size + '개 선택' : '선택 후 숨기기/보이기' }}</span>
          </div>

          <p v-if="!layers.length && !texts.length && !lines.length" class="muted small">레이어가 없습니다.</p>
          <ul class="layer-list">
            <li v-for="t in texts" :key="t.id" :class="{ off: t.hidden }">
              <button class="eye" :title="t.hidden ? '보이기' : '숨기기'" @click="toggleText(t)">
                <i :class="t.hidden ? 'pi pi-eye-slash' : 'pi pi-eye'" />
              </button>
              <input class="sel-ck" type="checkbox" title="선택" :checked="bulkSelected.has('txt:' + t.id)" @change="toggleBulk('txt:' + t.id)" />
              <button class="layer" :class="{ active: t.id === selectedTextId }" @click="selectText(t.id)">
                <span class="layer-name">{{ t.text || '(빈 텍스트)' }}</span>
              </button>
              <span class="chip text tag">텍스트</span>
              <button class="del-one" title="삭제" @click="removeText(t.id)">✕</button>
            </li>
            <li v-for="l in lines" :key="l.id" :class="{ off: l.hidden }">
              <button class="eye" :title="l.hidden ? '보이기' : '숨기기'" @click="toggleLine(l)">
                <i :class="l.hidden ? 'pi pi-eye-slash' : 'pi pi-eye'" />
              </button>
              <input class="sel-ck" type="checkbox" title="선택" :checked="bulkSelected.has('line:' + l.id)" @change="toggleBulk('line:' + l.id)" />
              <button class="layer" :class="{ active: l.id === selectedLineId }" @click="selectLine(l.id)">
                <span class="layer-name">{{ l.arrow !== 'none' ? '화살표' : '선' }}</span>
              </button>
              <span class="chip line tag">선</span>
              <button class="del-one" title="삭제" @click="removeLine(l.id)">✕</button>
            </li>
            <li v-for="layer in layers" :key="layer.id" :class="{ off: !isObjectOn(layer.id) }">
              <button class="eye" :title="isObjectOn(layer.id) ? '숨기기' : '보이기'" @click="toggleObject(layer.id)">
                <i :class="isObjectOn(layer.id) ? 'pi pi-eye' : 'pi pi-eye-slash'" />
              </button>
              <input class="sel-ck" type="checkbox" title="선택" :checked="bulkSelected.has('obj:' + layer.id)" @change="toggleBulk('obj:' + layer.id)" />
              <button class="layer" :class="{ active: layer.id === selectedItemId }" @click="selectItem(layer.id)">
                <span class="lno">{{ layer.no }}</span>
                <span class="layer-name">{{ layer.label }}</span>
              </button>
              <span class="chip tag" :class="layer.kind">{{ layer.hasCaption ? '문구' : '외곽선' }}</span>
            </li>
            <li v-if="closing" class="closing-row">
              <span class="eye-sp" /><span class="ck-sp" />
              <div class="layer static"><span class="layer-name">{{ closing.text }}</span></div>
              <span class="chip closing tag">마무리</span>
            </li>
          </ul>
        </div>
      </aside>
    </div>

    <!-- 위쪽 핸들을 끌어 필름스트립 높이 조절(썸네일 자동 확대) -->
    <div class="film-resizer" title="끌어서 사진 크기 조절" @pointerdown="onFilmResizeDown"><span class="grip" /></div>

    <!-- 하단: 카드 필름스트립 (사진마다 완성 토글) -->
    <footer class="ed-bottom" :style="{ flex: `0 0 ${filmH}px`, '--filmH': filmH + 'px' }">
      <ul class="filmstrip">
        <li v-for="(id, i) in photoIds" :key="id">
          <button class="film" :class="{ on: i === current }" @click="current = i">
            <img v-if="thumbUrls[id]" :src="thumbUrls[id]" alt="" />
            <span v-if="hasNoOutline(id)" class="film-badge">직접 꾸미기</span>
          </button>
          <button class="film-status" :class="{ done: isDone(id) }" :title="isDone(id) ? '완성 해제' : '완성으로 표시'" @click="toggleDone(id)">
            {{ isDone(id) ? '✓ 완성' : '미완성' }}
          </button>
        </li>
      </ul>
      <span class="film-info">{{ doneCount }} / {{ photoIds.length }} 완성</span>
    </footer>
  </div>
</template>

<style scoped>
.ed {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f2f4f6;
}
.ed-top {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #e5e8eb;
}
.back {
  border: 0;
  background: none;
  font-size: 0.9rem;
  font-weight: 600;
  color: #4b5563;
  cursor: pointer;
}
.title {
  font-weight: 700;
}
.grow {
  flex: 1;
}
.fmt {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #e5e8eb;
  border-radius: 8px;
  padding: 2px 10px 4px;
}
.fmt legend {
  font-size: 0.7rem;
  color: #8b95a1;
  padding: 0 4px;
}
.fmt label {
  font-size: 0.82rem;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.ok {
  color: #16c47e;
  font-weight: 600;
  font-size: 0.85rem;
}
.pad-color {
  width: 24px;
  height: 22px;
  border: 1px solid #d6dbe1;
  border-radius: 5px;
  padding: 0;
  cursor: pointer;
}
.ed-mid {
  flex: 1;
  min-height: 0;
  display: flex;
}
.ed-rail {
  flex: 0 0 64px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 6px;
  background: #fff;
  border-right: 1px solid #e5e8eb;
}
.rail-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 2px;
  border: 0;
  background: none;
  border-radius: 10px;
  cursor: pointer;
  color: #4b5563;
}
.rail-btn.on {
  background: #f1ecfb;
  color: #6d40d6;
}
.rail-ic {
  font-size: 1.1rem;
  font-weight: 800;
}
.rail-lb {
  font-size: 0.65rem;
}
.ed-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  padding: 16px;
  overflow: auto; /* 줌 확대 시 스크롤. 가운데 정렬은 캔버스 margin:auto (justify/align center 는 overflow 좌상단을 잘라 스크롤 불가) */
  background:
    radial-gradient(circle, #d6dbe1 1px, transparent 1px) 0 0 / 18px 18px,
    #eef1f4;
}
.stage-canvas {
  position: relative;
  margin: auto; /* 작을 때 가운데, 클 때 스크롤 */
  display: flex;
  align-items: center;
}
.fallback-hint {
  position: absolute;
  top: 52px; /* 상단 선택/생성 토글 아래 */
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  margin: 0;
  padding: 6px 14px;
  border-radius: 99px;
  background: rgba(25, 31, 40, 0.72);
  color: #fff;
  font-size: 0.8rem;
  white-space: nowrap;
  pointer-events: none;
}
.card-canvas {
  display: block; /* 표시 크기는 redraw 가 el.style 로 stage 에 맞춰 px 제어 */
  margin: auto; /* flex 컨테이너 가운데 + 확대 시 좌상단까지 스크롤 접근 가능 */
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  background: #fff;
}
/* 사진 위 플로팅 모드 토글(선택/생성) */
.stage-modes {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  display: flex;
  gap: 2px;
  padding: 3px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #e5e8eb;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
}
.stage-modes button {
  border: 0;
  background: none;
  border-radius: 8px;
  padding: 5px 16px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #4b5563;
  cursor: pointer;
}
.stage-modes button.on {
  background: #3182f6;
  color: #fff;
}
/* 줌 컨트롤(스테이지 우하단) */
.zoom-bar {
  position: absolute;
  bottom: 12px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: #fff;
  border: 1px solid #e5e8eb;
  border-radius: 9px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.zoom-bar button {
  border: 0;
  background: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: #4b5563;
  padding: 2px 6px;
  border-radius: 6px;
}
.zoom-bar button:hover {
  background: #f2f4f6;
}
.zoom-bar .fit {
  font-size: 0.76rem;
}
.zoom-v {
  font-size: 0.76rem;
  color: #4b5563;
  min-width: 38px;
  text-align: center;
}
.ed-right {
  flex: 0 0 268px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-left: 1px solid #e5e8eb;
  overflow: hidden;
}
.section {
  padding: 14px;
  border-bottom: 1px solid #eef1f4;
}
/* 상세 설정 = 내용 높이(잘리지 않게). 너무 길면 절반쯤에서 내부 스크롤, 나머지는 레이어. */
.section.detail {
  flex: 0 0 auto;
  max-height: 56%;
  overflow-y: auto;
}
.section.layers {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-bottom: 0;
}
/* 상세/레이어 사이 드래그 구분선 — 끌어서 두 영역 높이 조절. */
.resizer {
  flex: 0 0 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
  background: #fff;
  border-top: 1px solid #eef1f4;
  border-bottom: 1px solid #eef1f4;
  touch-action: none;
}
.resizer .grip {
  width: 36px;
  height: 3px;
  border-radius: 99px;
  background: #d6dbe1;
}
.resizer:hover .grip {
  background: #8b95a1;
}
/* 도구 컨트롤 블록 — 선택 편집(A) 블록 아래에 올 때 구분선으로 역할을 분리한다. */
.tool-block {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eef1f4;
}
.ed-right h3 {
  margin: 0 0 10px;
  font-size: 0.92rem;
}
.muted {
  color: #8b95a1;
  font-weight: 400;
}
.small {
  font-size: 0.8rem;
}
.warn {
  color: #f04452;
}
.lbl {
  display: block;
  font-size: 0.82rem;
  color: #4b5563;
  margin-bottom: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  color: #4b5563;
  margin-bottom: 10px;
}
.full {
  width: 100%;
  margin-bottom: 6px;
}
.rd {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
}
.ctl-lbl {
  display: block;
  font-size: 0.82rem;
  color: #4b5563;
  margin-bottom: 6px;
}
/* 외곽선 두께 = 슬라이더 + −/+ + 숫자 직접 입력 */
.stepper {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.stepper input[type='range'] {
  flex: 1;
  min-width: 0;
}
.step {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border: 1px solid #d6dbe1;
  background: #fff;
  border-radius: 7px;
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
  color: #4b5563;
}
.step:hover {
  background: #f7f8fa;
}
.num {
  flex: 0 0 48px;
  width: 48px;
  border: 1px solid #d6dbe1;
  border-radius: 7px;
  padding: 3px 4px;
  font: inherit;
  font-size: 0.8rem;
  text-align: right;
}
.numv {
  flex: 0 0 auto;
  font-size: 0.78rem;
  color: #8b95a1;
  min-width: 16px;
  text-align: right;
}
.cap-edit {
  width: 100%;
  border: 1px solid #d6dbe1;
  border-radius: 8px;
  padding: 8px;
  font: inherit;
  resize: vertical;
}
.layer-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.layer-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.layers-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.layers-head h3 {
  margin: 0;
}
.layers-head .grow {
  flex: 1;
}
.all-vis {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  color: #4b5563;
  cursor: pointer;
}
/* 선택 후 일괄 숨기기/보이기 바 */
.bulk-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.bulk-bar button {
  border: 1px solid #e5e8eb;
  background: #fff;
  border-radius: 7px;
  padding: 3px 10px;
  font-size: 0.76rem;
  cursor: pointer;
  color: #4b5563;
}
.bulk-bar button:disabled {
  color: #c9d2db;
  cursor: default;
}
.bulk-n {
  margin-left: auto;
  font-size: 0.72rem;
  color: #8b95a1;
}
/* 행별 가시성 눈 아이콘(클릭 토글) */
.eye {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 0;
  background: none;
  color: #3182f6;
  cursor: pointer;
  font-size: 0.78rem;
}
.eye-sp {
  flex: 0 0 22px;
}
.sel-ck {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  cursor: pointer;
  margin: 0;
}
.ck-sp {
  flex: 0 0 15px;
}
/* 숨긴 레이어 = 흐리게 + 눈 아이콘 회색 */
.layer-list li.off .layer {
  opacity: 0.45;
}
.layer-list li.off .eye {
  color: #c9d2db;
}
/* 태그(외곽선/문구/텍스트/마무리)는 오른쪽으로 — 레이어 버튼(flex:1)이 밀어낸다. */
.chip.tag {
  margin-left: auto;
}
.del-one {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: 0;
  background: none;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 700;
  color: #f04452;
  opacity: 0.7;
}
.del-one:hover {
  opacity: 1;
}
.layer {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  border: 0;
  background: #f7f8fa;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
}
.layer.static {
  cursor: default;
}
.layer.active {
  background: #eaf1ff;
}
.lno {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #3182f6;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 800;
}
.chip {
  flex: 0 0 auto;
  font-size: 0.66rem;
  font-weight: 700;
  border-radius: 5px;
  padding: 1px 5px;
  background: #e3ecff;
  color: #3182f6;
}
.chip.object-caption,
.chip.closing {
  background: #eee7fb;
  color: #6d40d6;
}
.chip.text {
  background: #e7f7ee;
  color: #16a866;
}
.chip.line {
  background: #fdeede;
  color: #d97706;
}
.card-canvas.grab {
  cursor: grab;
}
.card-canvas.grab:active {
  cursor: grabbing;
}
.card-canvas.draw {
  cursor: crosshair;
}
.layer-name {
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ed-bottom {
  display: flex;
  align-items: stretch;
  gap: 14px;
  padding: 8px 16px;
  background: #fff;
  overflow: hidden;
  min-height: 0;
}
/* 필름스트립 높이 조절 핸들(상단) — 끌면 썸네일이 높이에 맞춰 커진다. */
.film-resizer {
  flex: 0 0 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
  background: #fff;
  border-top: 1px solid #e5e8eb;
  touch-action: none;
}
.film-resizer .grip {
  width: 44px;
  height: 3px;
  border-radius: 99px;
  background: #d6dbe1;
}
.film-resizer:hover .grip {
  background: #8b95a1;
}
.filmstrip {
  list-style: none;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin: 0;
  padding: 0;
  overflow-x: auto; /* 좌우 스크롤 */
  overflow-y: hidden;
  flex: 1;
  height: 100%;
}
.filmstrip li {
  flex: 0 0 auto;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
}
.film {
  position: relative;
  height: calc(100% - 22px); /* 22px = 완성 배지 + 여백 */
  aspect-ratio: 40 / 71;
  width: auto;
  padding: 0;
  border: 1px solid #e5e8eb;
  border-radius: 6px;
  overflow: hidden;
  background: #f2f4f6;
  cursor: pointer;
}
.film.on {
  outline: 3px solid #3182f6;
  outline-offset: -1px;
}
.film img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.film-badge {
  position: absolute;
  left: 3px;
  bottom: 3px;
  padding: 1px 6px;
  border-radius: 99px;
  background: rgba(49, 130, 246, 0.92);
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  pointer-events: none;
}
/* 사진별 완성 토글 배지(썸네일 아래) */
.film-status {
  border: 0;
  border-radius: 99px;
  padding: 1px 7px;
  font-size: 0.66rem;
  font-weight: 700;
  cursor: pointer;
  background: #eef1f4;
  color: #8b95a1;
  white-space: nowrap;
}
.film-status.done {
  background: #e7f7ee;
  color: #16a866;
}
.film-info {
  flex: 0 0 auto;
  font-size: 0.82rem;
  color: #8b95a1;
}
</style>
