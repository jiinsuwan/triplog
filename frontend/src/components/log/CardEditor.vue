<script setup>
// 카드 에디터 (S3-LOG-06, 목업 ⑤) — 풀스크린 배치.
//   상단 바 · 좌(아이콘 레일 + 도구 패널: 외곽선 개별 토글·두께·문구) · 중(큰 캔버스) · 우(선택 객체·레이어) · 하단(필름스트립).
//   풀스크린이라 나중에 실제 화면으로 그대로 이식 가능. 렌더는 검증된 모듈(buildScene/renderCard/exportCardPng) 재사용.
//   외곽선 = 인식된 피사체별 개별 토글(이 화면에서 그림). 문구 없이 외곽선만 가능.
//   아직: 객체 드래그 핸들·z순서·요소 추가(텍스트/말풍선/장식)·서체·재분할 refine = 다음.
import { ref, shallowRef, computed, watch, onMounted, onScopeDispose } from 'vue'
import Button from 'primevue/button'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
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

// 좌 아이콘 레일 도구. 지금은 AI(외곽선)만 동작, 나머지는 준비 중.
const TOOLS = [
  { key: 'ai', icon: '✨', label: 'AI' },
  { key: 'text', icon: 'T', label: '텍스트' },
  { key: 'bubble', icon: '💬', label: '말풍선' },
  { key: 'line', icon: '／', label: '선' },
  { key: 'deco', icon: '✦', label: '장식' },
]
const activeTool = ref('ai')

const FIXED = { W: 1080, H: 1920 }
const current = ref(0)
const currentId = computed(() => props.photoIds[current.value] ?? null)
const canvasEl = ref(null)
const photoImg = shallowRef(null)
const fontReady = ref(false)
const toneDown = ref(0.35)
const format = ref('native')
const outlineWidth = ref(1)
const selectedItemId = ref(null)

const canvasDims = computed(() => {
  const img = photoImg.value
  if (format.value === 'fixed' || !img) return FIXED
  return { W: img.naturalWidth, H: img.naturalHeight }
})

const items = computed(() => {
  const o = card.outlines[currentId.value]
  return o?.status === 'READY' && Array.isArray(o.items) ? o.items : []
})
const captionObjects = computed(() => card.captions[currentId.value]?.response?.objects ?? [])

const hiddenOutline = ref(new Set())
const hiddenCaption = ref(new Set())
const keyOf = (itemId) => `${currentId.value}:${itemId}`
const isOutlineOn = (itemId) => !hiddenOutline.value.has(keyOf(itemId))
const isCaptionOn = (itemId) => !hiddenCaption.value.has(keyOf(itemId))
function toggleSet(refSet, itemId) {
  const k = keyOf(itemId)
  const s = new Set(refSet.value)
  s.has(k) ? s.delete(k) : s.add(k)
  refSet.value = s
}

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
  const visibleObjects = captionObjects.value.filter((o) => isCaptionOn(o.itemId))
  const captions = {
    objects: visibleObjects,
    closing: card.captions[currentId.value]?.response?.closing ?? null,
  }
  return buildScene({
    items: items.value,
    captions,
    canvas: canvasDims.value,
    photo: { w: img.naturalWidth, h: img.naturalHeight },
    style: { toneDown: toneDown.value },
  })
})

function drawOutlines(ctx, img) {
  const { W } = canvasDims.value
  const cf = makeCoverFit(img.naturalWidth, img.naturalHeight, W, canvasDims.value.H)
  ctx.save()
  ctx.lineWidth = Math.max(2, W * 0.0035) * outlineWidth.value
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = Math.max(1, W * 0.002)
  for (const item of items.value) {
    if (!isOutlineOn(item.id)) continue
    ctx.strokeStyle =
      item.id === selectedItemId.value ? 'rgba(240,68,82,0.95)' : 'rgba(49,130,246,0.95)'
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
  }
  ctx.restore()
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
}

watch(currentId, loadCurrent, { immediate: true })
watch([scene, photoImg, fontReady, hiddenOutline, outlineWidth, selectedItemId], redraw, {
  flush: 'post',
})

const selectedCaption = computed(
  () => captionObjects.value.find((o) => o.itemId === selectedItemId.value) ?? null,
)
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
    const visibleObjects = captionObjects.value.filter((o) => isCaptionOn(o.itemId))
    const inputs = {
      items: items.value,
      captions: {
        objects: visibleObjects,
        closing: card.captions[currentId.value]?.response?.closing ?? null,
      },
      photo: { w: photoImg.value.naturalWidth, h: photoImg.value.naturalHeight },
      style: { toneDown: toneDown.value },
    }
    const blob = await exportCardPng(inputs, { photo: photoImg.value }, { format: format.value })
    triggerDownload(blob, `triplog-card-${currentId.value}.png`)
    exportNote.value = '저장 완료'
  } catch (e) {
    exportNote.value = `저장 실패: ${e.message}`
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="ed">
    <!-- 상단 바 -->
    <header class="ed-top">
      <button class="back" @click="emit('back')">‹ 고르기</button>
      <span class="title">카드 {{ current + 1 }} / {{ photoIds.length }}</span>
      <span class="grow" />
      <span v-if="exportNote" class="ok">{{ exportNote }}</span>
      <Button label="PNG 저장" icon="pi pi-download" size="small" severity="secondary" :disabled="exporting || !photoImg" @click="exportCurrent" />
      <Button label="완료" size="small" @click="emit('back')" />
    </header>

    <div class="ed-mid">
      <!-- 좌: 아이콘 레일 -->
      <nav class="ed-rail">
        <button
          v-for="tool in TOOLS"
          :key="tool.key"
          class="rail-btn"
          :class="{ on: activeTool === tool.key, soon: tool.key !== 'ai' }"
          :title="tool.key === 'ai' ? tool.label : tool.label + ' (준비 중)'"
          @click="tool.key === 'ai' && (activeTool = 'ai')"
        >
          <span class="rail-ic">{{ tool.icon }}</span>
          <span class="rail-lb">{{ tool.label }}</span>
        </button>
      </nav>

      <!-- 좌 패널: 선택 도구(AI = 외곽선) -->
      <aside class="ed-leftpanel">
        <h3>피사체 외곽선 <span class="muted">· {{ items.length }}개</span></h3>
        <p v-if="!items.length" class="muted small">외곽선을 못 찾았습니다.</p>
        <ul v-else class="obj-list">
          <li v-for="(item, i) in items" :key="item.id">
            <button class="obj" :class="{ active: item.id === selectedItemId }" @click="selectedItemId = item.id">
              {{ item.label || `객체 ${i + 1}` }}
            </button>
            <input type="checkbox" :checked="isOutlineOn(item.id)" title="외곽선 표시" @change="toggleSet(hiddenOutline, item.id)" />
          </li>
        </ul>
        <label class="row">두께 <input type="range" min="1" max="4" step="0.5" v-model.number="outlineWidth" /></label>
        <Button
          label="✨ 문구 생성"
          size="small"
          severity="secondary"
          class="full"
          :disabled="captionGenerating || card.outlines[currentId]?.status !== 'READY' || !!card.captions[currentId]"
          @click="generateCaption"
        />
        <p v-if="captionGenerating" class="muted small">문구 생성 중…</p>
        <p v-else-if="captionFailed[currentId]" class="warn small">문구 생성 실패</p>
      </aside>

      <!-- 중: 큰 캔버스 -->
      <section class="ed-stage">
        <div class="stage-tools">
          <label class="row">톤 <input type="range" min="0" max="50" :value="Math.round(toneDown * 100)" @input="toneDown = Number($event.target.value) / 100" /></label>
          <label class="row">포맷
            <select v-model="format">
              <option value="native">원본 비율</option>
              <option value="fixed">9:16</option>
            </select>
          </label>
        </div>
        <div class="stage-canvas">
          <canvas ref="canvasEl" class="card-canvas" aria-label="카드 편집 캔버스" />
        </div>
      </section>

      <!-- 우: 선택 객체 / 레이어 -->
      <aside class="ed-right">
        <template v-if="selectedCaption">
          <h3>선택한 문구</h3>
          <textarea class="cap-edit" :value="selectedCaption.note.join('\n')" rows="3" @input="updateCaptionText($event.target.value)" />
          <p class="muted small">줄바꿈으로 여러 줄. (서체·색·크기 = 다음 단계)</p>
        </template>
        <h3 v-else>레이어</h3>

        <h4 v-if="captionObjects.length" class="lh">문구 · {{ captionObjects.length }}</h4>
        <ul v-if="captionObjects.length" class="layer-list">
          <li v-for="obj in captionObjects" :key="obj.itemId">
            <button class="layer" :class="{ active: obj.itemId === selectedItemId }" @click="selectedItemId = obj.itemId">
              {{ (obj.note || []).join(' ') || '(빈 문구)' }}
            </button>
            <input type="checkbox" :checked="isCaptionOn(obj.itemId)" title="문구 표시" @change="toggleSet(hiddenCaption, obj.itemId)" />
          </li>
        </ul>
        <p v-else class="muted small">문구가 없습니다. 좌측 "문구 생성".</p>
      </aside>
    </div>

    <!-- 하단: 필름스트립 -->
    <footer class="ed-bottom">
      <ul class="filmstrip">
        <li v-for="(id, i) in photoIds" :key="id">
          <button class="film" :class="{ on: i === current }" @click="current = i"><PhotoThumb :photo-id="id" /></button>
        </li>
      </ul>
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
  gap: 10px;
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
.rail-btn.soon {
  opacity: 0.4;
  cursor: not-allowed;
}
.rail-ic {
  font-size: 1.1rem;
  font-weight: 800;
}
.rail-lb {
  font-size: 0.65rem;
}
.ed-leftpanel,
.ed-right {
  flex: 0 0 230px;
  overflow-y: auto;
  padding: 14px;
  background: #fff;
}
.ed-leftpanel {
  border-right: 1px solid #e5e8eb;
}
.ed-right {
  border-left: 1px solid #e5e8eb;
}
.ed-leftpanel h3,
.ed-right h3 {
  margin: 0 0 10px;
  font-size: 0.95rem;
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
.obj-list,
.layer-list {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
}
.obj-list li,
.layer-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.obj,
.layer {
  flex: 1;
  min-width: 0;
  text-align: left;
  border: 0;
  background: #f7f8fa;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 0.82rem;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.obj.active,
.layer.active {
  background: #eaf1ff;
  color: #3182f6;
  font-weight: 600;
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
}
.ed-stage {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  background:
    radial-gradient(circle, #d6dbe1 1px, transparent 1px) 0 0 / 18px 18px,
    #eef1f4;
}
.stage-tools {
  display: flex;
  gap: 14px;
  align-self: stretch;
  justify-content: center;
  padding-bottom: 10px;
}
.stage-tools .row {
  margin: 0;
}
.stage-canvas {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card-canvas {
  max-height: 100%;
  max-width: 100%;
  height: auto;
  width: auto;
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  background: #fff;
}
.cap-edit {
  width: 100%;
  border: 1px solid #d6dbe1;
  border-radius: 8px;
  padding: 8px;
  font: inherit;
  resize: vertical;
}
.lh {
  margin: 12px 0 6px;
  font-size: 0.85rem;
  color: #4b5563;
}
.ed-bottom {
  flex: 0 0 auto;
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
}
.film {
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  background: none;
  border-radius: 8px;
  cursor: pointer;
}
.film.on {
  outline: 3px solid #3182f6;
  outline-offset: -3px;
  border-radius: 8px;
}
</style>
