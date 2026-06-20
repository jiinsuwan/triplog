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
import { exportCardPng } from '@/card/render/exportCard'
import { makeCoverFit } from '@/card/render/coverFit'
import { useCardStore } from '@/stores/card'

const props = defineProps({ photoIds: { type: Array, default: () => [] } })
const emit = defineEmits(['back'])

const card = useCardStore()
const { load } = usePhotoContent()
const { generate: genCaption, generating: captionGenerating, failed: captionFailed } = useCardCaptions()

const TOOLS = [
  { key: 'ai', icon: '✨', label: 'AI' },
  { key: 'text', icon: 'T', label: '텍스트' },
  { key: 'bubble', icon: '💬', label: '말풍선' },
  { key: 'line', icon: '／', label: '선' },
  { key: 'deco', icon: '✦', label: '장식' },
]
const activeTool = ref('ai')
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
const selectedItemId = ref(null)
// 선택 상태(객체/텍스트)는 loadCurrent 가 사진 전환 때 초기화하므로 먼저 선언한다(TDZ 방지).
const selectedTextId = ref(null)

const canvasDims = computed(() => {
  const img = photoImg.value
  if (format.value === 'fixed' || !img) return FIXED
  return { W: img.naturalWidth, H: img.naturalHeight }
})

const items = computed(() => {
  const o = card.outlines[currentId.value]
  return o?.status === 'READY' && Array.isArray(o.items) ? o.items : []
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
  const seq = ++reqSeq
  photoImg.value = null
  selectedItemId.value = null
  selectedTextId.value = null
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
    canvas: canvasDims.value,
    photo: { w: img.naturalWidth, h: img.naturalHeight },
    style: { toneDown: toneDown.value },
  })
})

function drawOutlines(ctx, img) {
  const { W } = canvasDims.value
  const cf = makeCoverFit(img.naturalWidth, img.naturalHeight, W, canvasDims.value.H)
  const base = Math.max(1, W * 0.002)
  let no = 0
  for (const item of items.value) {
    no += 1 // 레이어 목록과 같은 번호(숨겨도 번호 유지)
    if (!isObjectOn(item.id)) continue
    const sel = item.id === selectedItemId.value
    const color = sel ? 'rgba(240,68,82,0.95)' : 'rgba(49,130,246,0.95)'

    ctx.save()
    ctx.lineWidth = base * outlineWidth.value
    ctx.strokeStyle = color
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = base
    ctx.setLineDash(outlineStyle.value === 'dashed' ? [W * 0.012, W * 0.009] : [])
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

    // 번호 배지(객체 중심) — 레이어와 매칭. 편집 보조라 export 에는 안 들어간다.
    if (Array.isArray(item.center)) {
      const [cx, cy] = cf.ptPx(item.center[0], item.center[1])
      const r = Math.max(11, W * 0.016)
      ctx.save()
      ctx.setLineDash([])
      ctx.fillStyle = color
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
}

function redraw() {
  const el = canvasEl.value
  const sc = scene.value
  const img = photoImg.value
  if (!el || !sc || !img || !fontReady.value) return
  el.width = canvasDims.value.W
  el.height = canvasDims.value.H
  const ctx = el.getContext('2d', { willReadFrequently: true })
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  renderCard(ctx, sc, { photo: img })
  drawOutlines(ctx, img)
  drawTexts(ctx, canvasDims.value)
}

watch(currentId, loadCurrent, { immediate: true })
watch(
  [scene, photoImg, fontReady, hiddenObject, outlineWidth, outlineStyle, selectedItemId],
  redraw,
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
// 사진별 추가 텍스트 { id, text, x, y(0~1 중심), hidden }. 캔버스에 직접 그리고 export 에 합성한다.
const textsByPhoto = reactive({})
let textSeq = 0
const texts = computed(() => textsByPhoto[currentId.value] ?? [])
const selectedText = computed(() => texts.value.find((t) => t.id === selectedTextId.value) ?? null)

function addText() {
  const list = textsByPhoto[currentId.value] || (textsByPhoto[currentId.value] = [])
  const t = { id: `t${++textSeq}`, text: '텍스트', x: 0.5, y: 0.5, hidden: false }
  list.push(t)
  selectItem(null)
  selectedTextId.value = t.id
}
function updateTextValue(text) {
  if (selectedText.value) selectedText.value.text = text
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
  if (id != null) selectedTextId.value = null
}
function selectText(id) {
  selectedTextId.value = id
  if (id != null) selectedItemId.value = null
}

// 캔버스에 추가 텍스트를 그린다(편집 화면). 손글씨 폰트.
function drawTexts(ctx, dims) {
  const { W, H } = dims
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const t of texts.value) {
    if (t.hidden) continue
    const size = Math.round(W * 0.05)
    ctx.font = `${size}px "Ownglyph ooa", sans-serif`
    ctx.lineWidth = Math.max(2, W * 0.004)
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    ctx.fillStyle = '#fff'
    const px = t.x * W
    const py = t.y * H
    ctx.strokeText(t.text, px, py)
    ctx.fillText(t.text, px, py)
  }
  ctx.restore()
}

// 캔버스 드래그로 텍스트 이동.
let dragText = null
function onCanvasPointerDown(e) {
  const el = canvasEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const nx = (e.clientX - rect.left) / rect.width
  const ny = (e.clientY - rect.top) / rect.height
  // 위에서부터 hit-test(나중 추가 = 위). 텍스트 박스 근사.
  const { W, H } = canvasDims.value
  const ctx = el.getContext('2d')
  ctx.font = `${Math.round(W * 0.05)}px "Ownglyph ooa", sans-serif`
  for (let i = texts.value.length - 1; i >= 0; i--) {
    const t = texts.value[i]
    if (t.hidden) continue
    const w = ctx.measureText(t.text).width / W
    const h = (W * 0.05 * 1.4) / H
    if (Math.abs(nx - t.x) <= w / 2 + 0.02 && Math.abs(ny - t.y) <= h / 2 + 0.01) {
      dragText = { id: t.id, dx: nx - t.x, dy: ny - t.y }
      selectText(t.id)
      window.addEventListener('pointermove', onCanvasPointerMove)
      window.addEventListener('pointerup', onCanvasPointerUp)
      e.preventDefault()
      return
    }
  }
}
function onCanvasPointerMove(e) {
  if (!dragText) return
  const el = canvasEl.value
  const rect = el.getBoundingClientRect()
  const t = texts.value.find((x) => x.id === dragText.id)
  if (!t) return
  t.x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width - dragText.dx))
  t.y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height - dragText.dy))
}
function onCanvasPointerUp() {
  dragText = null
  window.removeEventListener('pointermove', onCanvasPointerMove)
  window.removeEventListener('pointerup', onCanvasPointerUp)
}
onScopeDispose(() => {
  window.removeEventListener('pointermove', onCanvasPointerMove)
  window.removeEventListener('pointerup', onCanvasPointerUp)
})

// 텍스트 선택/내용/위치 변경 시 다시 그린다(여기서 — texts 선언 뒤라 TDZ 없음).
watch([selectedTextId, texts], redraw, { deep: true, flush: 'post' })

// 완성 = 문구가 만들어진 카드.
const isDone = (id) => !!card.captions[id]
const doneCount = computed(() => props.photoIds.filter((id) => isDone(id)).length)

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
  try {
    const visibleObjects = (card.captions[currentId.value]?.response?.objects ?? []).filter((o) =>
      isObjectOn(o.itemId),
    )
    const inputs = {
      items: items.value,
      captions: { objects: visibleObjects, closing: closing.value },
      photo: { w: photoImg.value.naturalWidth, h: photoImg.value.naturalHeight },
      style: { toneDown: toneDown.value },
    }
    const blob = await exportCardPng(inputs, { photo: photoImg.value }, { format: format.value })
    triggerDownload(await composeTexts(blob), `triplog-card-${currentId.value}.png`)
    exportNote.value = '저장 완료'
  } catch (e) {
    exportNote.value = `저장 실패: ${e.message}`
  } finally {
    exporting.value = false
  }
}

// export 결과(PNG blob) 위에 추가 텍스트를 합성한다(렌더 모듈은 추가 텍스트를 모르므로 후처리).
// 좌표는 native(원본 비율) 기준 정확. fixed(9:16)는 여백 때문에 근사.
async function composeTexts(blob) {
  const visible = texts.value.filter((t) => !t.hidden && t.text.trim())
  if (!visible.length) return blob
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
    const W = bmp.width
    const H = bmp.height
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const t of visible) {
      const size = Math.round(W * 0.05)
      ctx.font = `${size}px "Ownglyph ooa", sans-serif`
      ctx.lineWidth = Math.max(2, W * 0.004)
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'
      ctx.fillStyle = '#fff'
      ctx.strokeText(t.text, t.x * W, t.y * H)
      ctx.fillText(t.text, t.x * W, t.y * H)
    }
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

      <!-- 중: 캔버스 -->
      <section class="ed-stage">
        <div class="stage-canvas">
          <canvas ref="canvasEl" class="card-canvas" :class="{ grab: texts.length }" aria-label="카드 편집 캔버스" @pointerdown="onCanvasPointerDown" />
        </div>
      </section>

      <!-- 우: 상세 설정 + 레이어 -->
      <aside class="ed-right">
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
            <p class="muted small">캔버스에서 끌어 위치 이동.</p>
            <Button label="텍스트 삭제" size="small" severity="danger" text @click="removeText(selectedText.id)" />
          </template>

          <!-- (B) 활성 도구 컨트롤 — 선택과 무관하게 전역 동작(외곽선 두께/스타일 등은 전역이라
               객체를 선택해도 사라지지 않아야 한다). 선택 편집(A)과 도구 컨트롤(B)은 별개 블록. -->
          <div v-if="activeTool === 'ai'" class="tool-block">
            <label class="row">외곽선 두께 <input type="range" min="0.3" max="4" step="0.1" v-model.number="outlineWidth" /></label>
            <label class="row">선 스타일
              <select v-model="outlineStyle">
                <option value="solid">실선</option>
                <option value="dashed">점선</option>
              </select>
            </label>
            <Button label="✨ 문구 생성" size="small" severity="secondary" class="full"
              :disabled="captionGenerating || card.outlines[currentId]?.status !== 'READY' || !!card.captions[currentId]"
              @click="generateCaption" />
            <p v-if="captionGenerating" class="muted small">문구 생성 중…</p>
            <p v-else-if="captionFailed[currentId]" class="warn small">문구 생성 실패</p>
            <p class="muted small">피사체 외곽선 {{ items.length }}개 인식. 레이어에서 켜고 끄기.</p>
          </div>
          <div v-else-if="activeTool === 'text'" class="tool-block">
            <Button label="＋ 텍스트 추가" size="small" class="full" @click="addText" />
            <p class="muted small">추가 후 캔버스에서 끌어 배치하고, 레이어/위에서 내용을 편집합니다.</p>
          </div>
          <p v-else-if="!selectedCaption && !selectedText" class="muted small">"{{ activeToolLabel }}" 추가는 곧 제공됩니다. (텍스트부터 작업 중)</p>
        </div>

        <div class="section layers">
          <h3>레이어 <span class="muted">· {{ layers.length + texts.length + (closing ? 1 : 0) }}</span></h3>
          <p v-if="!layers.length && !texts.length" class="muted small">레이어가 없습니다.</p>
          <ul class="layer-list">
            <li v-for="t in texts" :key="t.id">
              <button class="eye" :class="{ off: t.hidden }" :title="t.hidden ? '표시' : '숨기기'" @click="toggleText(t)">●</button>
              <button class="layer" :class="{ active: t.id === selectedTextId }" @click="selectText(t.id)">
                <span class="chip text">텍스트</span>
                <span class="layer-name">{{ t.text || '(빈 텍스트)' }}</span>
              </button>
            </li>
            <li v-for="layer in layers" :key="layer.id">
              <button class="eye" :class="{ off: !isObjectOn(layer.id) }" :title="isObjectOn(layer.id) ? '숨기기' : '표시'" @click="toggleObject(layer.id)">●</button>
              <button class="layer" :class="{ active: layer.id === selectedItemId }" @click="selectItem(layer.id)">
                <span class="lno">{{ layer.no }}</span>
                <span class="chip" :class="layer.kind">{{ layer.hasCaption ? '문구' : '외곽선' }}</span>
                <span class="layer-name">{{ layer.label }}</span>
              </button>
            </li>
            <li v-if="closing">
              <span class="eye" />
              <div class="layer static"><span class="chip closing">마무리</span><span class="layer-name">{{ closing.text }}</span></div>
            </li>
          </ul>
        </div>
      </aside>
    </div>

    <!-- 하단: 카드 필름스트립 + 정보 -->
    <footer class="ed-bottom">
      <ul class="filmstrip">
        <li v-for="(id, i) in photoIds" :key="id">
          <button class="film" :class="{ on: i === current }" @click="current = i">
            <img v-if="thumbUrls[id]" :src="thumbUrls[id]" alt="" />
            <span v-if="isDone(id)" class="film-done" title="문구 완성">✓</span>
          </button>
        </li>
      </ul>
      <span class="film-info">완성 {{ doneCount }} · 남은 {{ photoIds.length - doneCount }}</span>
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
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background:
    radial-gradient(circle, #d6dbe1 1px, transparent 1px) 0 0 / 18px 18px,
    #eef1f4;
}
.stage-canvas {
  max-height: 100%;
  display: flex;
  align-items: center;
}
.card-canvas {
  max-height: calc(100vh - 220px);
  max-width: 100%;
  height: auto;
  width: auto;
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  background: #fff;
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
/* 상세 설정 = 고정 높이 구역 — 도구/선택이 바뀌어도 아래 레이어 패널 위치가 흔들리지 않게
   (유동 배치 금지). 내용이 넘치면 이 구역 안에서만 스크롤. */
.section.detail {
  flex: 0 0 248px;
  overflow-y: auto;
}
.section.layers {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-bottom: 0;
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
.eye {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border: 0;
  background: none;
  color: #3182f6;
  cursor: pointer;
  font-size: 0.7rem;
}
.eye.off {
  color: #c9d2db;
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
.card-canvas.grab {
  cursor: grab;
}
.card-canvas.grab:active {
  cursor: grabbing;
}
.layer-name {
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ed-bottom {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  background: #fff;
  border-top: 1px solid #e5e8eb;
}
.filmstrip {
  list-style: none;
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0;
  overflow-x: auto;
  flex: 1;
}
.film {
  position: relative;
  width: 40px;
  height: 71px;
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
.film-done {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #16c47e;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 800;
}
.film-info {
  flex: 0 0 auto;
  font-size: 0.82rem;
  color: #8b95a1;
}
</style>
