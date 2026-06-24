<script setup>
// 외곽선 보정 팝업 (S4-LOG-01 PR2). 원본 사진을 1:1 로 보여주고 그 위에서
//  - 추가 모드: 탭(점)/박스(드래그)로 미검출 객체 외곽선 생성
//  - 보정 모드: 객체를 골라 [모양 고치기(정제 +/−)] 또는 [삭제]
// 클릭은 사진 정규화 0~1 직결(레터박스 없음). 좌표/판정은 outlineEdit 순수 헬퍼.
// 바깥클릭은 닫지 않고(Esc·닫기 버튼만), Esc 는 정제 중이면 정제 취소 먼저.
import { ref, computed, watch, shallowRef, onScopeDispose, nextTick } from 'vue'
import { usePhotoContent } from '@/composables/usePhotoContent'
import { useCardStore } from '@/stores/card'
import { fetchPhotoOutline, tapOutline, boxOutline, refineOutline, deleteOutlineItem } from '@/api/outlineApi'
import { itemAt, bboxCenter, normalizeBox, clamp01 } from '@/card/outlineEdit'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  photoId: { type: [Number, String], default: null },
})
const emit = defineEmits(['update:modelValue'])

const card = useCardStore()
const { load } = usePhotoContent()

const items = computed(() => {
  const o = card.outlines[props.photoId]
  return o?.status === 'READY' && Array.isArray(o.items) ? o.items : []
})

const mode = ref('add') // 'add'(추가) | 'edit'(보정)
const addTool = ref('tap') // 'tap' | 'box'
const selectedId = ref(null)
const refining = ref(false) // 선택 객체 정제 중
const plusMinus = ref('plus') // 'plus'(넣기) | 'minus'(빼기)
const pos = ref([]) // 정제 + 점 [[x,y]]
const neg = ref([]) // 정제 − 점
const boxDraft = ref(null) // {x0,y0,x1,y1} 드래그 중
const correcting = ref(false)
const notice = ref('')

const canvasEl = ref(null)
const img = shallowRef(null)
let disposed = false

const selected = computed(() => items.value.find((it) => it.id === selectedId.value) ?? null)
const canApply = computed(() => pos.value.length + neg.value.length > 0)

// --- 사진 로드 ---
function decode(url) {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = url
  })
}
watch(
  () => [props.modelValue, props.photoId],
  async ([open, id]) => {
    if (!open || id == null) return
    resetState()
    try {
      img.value = await decode(await load(id))
      if (!disposed) nextTick(redraw)
    } catch {
      notice.value = '사진을 불러오지 못했어요.'
    }
  },
  { immediate: true },
)

function resetState() {
  mode.value = 'add'
  addTool.value = 'tap'
  selectedId.value = null
  refining.value = false
  pos.value = []
  neg.value = []
  boxDraft.value = null
  notice.value = ''
}

// --- 렌더 ---
function redraw() {
  const el = canvasEl.value
  const im = img.value
  if (!el || !im) return
  const ctx = el.getContext('2d')
  const W = el.width
  const H = el.height
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(im, 0, 0, W, H)
  // 외곽선
  for (const it of items.value) {
    const sel = it.id === selectedId.value
    ctx.lineWidth = sel ? 3 : 2
    ctx.strokeStyle = sel ? 'rgba(240,68,82,0.95)' : 'rgba(255,255,255,0.96)'
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 3
    for (const loop of Array.isArray(it.polygons) ? it.polygons : []) {
      if (!Array.isArray(loop) || loop.length < 3) continue
      ctx.beginPath()
      loop.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)))
      ctx.closePath()
      ctx.stroke()
    }
  }
  ctx.shadowBlur = 0
  // 정제 점 마커
  for (const [x, y] of pos.value) marker(ctx, x * W, y * H, '#16a866', '+')
  for (const [x, y] of neg.value) marker(ctx, x * W, y * H, '#f04452', '−')
  // 박스 드래프트
  if (boxDraft.value) {
    const { x0, y0, x1, y1 } = boxDraft.value
    ctx.setLineDash([6, 4])
    ctx.strokeStyle = '#3182f6'
    ctx.lineWidth = 2
    ctx.strokeRect(x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H)
    ctx.setLineDash([])
  }
}
function marker(ctx, px, py, color, sign) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(px, py, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = '700 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(sign, px, py)
  ctx.restore()
}
watch([items, selectedId, pos, neg, boxDraft, img], () => nextTick(redraw), { deep: true })

// 캔버스 내부 해상도 = 사진 비율(표시 크기는 CSS). 사진 로드 시 1회 설정.
watch(img, (im) => {
  const el = canvasEl.value
  if (el && im) {
    el.width = im.naturalWidth
    el.height = im.naturalHeight
  }
})

// --- 좌표 (사진 정규화 0~1) ---
function ptOf(e) {
  const el = canvasEl.value
  const r = el.getBoundingClientRect()
  return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)]
}

// --- 포인터 ---
let drag = null
function onPointerDown(e) {
  if (correcting.value || !img.value) return
  const [nx, ny] = ptOf(e)
  if (mode.value === 'add') {
    if (addTool.value === 'box') {
      drag = { kind: 'box', x0: nx, y0: ny }
      boxDraft.value = { x0: nx, y0: ny, x1: nx, y1: ny }
      bindMove(e)
    } else {
      drag = { kind: 'tap', x0: nx, y0: ny } // 클릭 판정은 up 에서
      bindMove(e)
    }
    return
  }
  // 보정 모드
  if (refining.value) {
    ;(plusMinus.value === 'plus' ? pos : neg).value = [
      ...(plusMinus.value === 'plus' ? pos : neg).value,
      [nx, ny],
    ]
    return
  }
  const hit = itemAt(items.value, nx, ny)
  selectedId.value = hit ? hit.id : null // 빈 곳 클릭 = 선택 해제
}
function bindMove(e) {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  e.preventDefault()
}
function onPointerMove(e) {
  if (!drag) return
  const [nx, ny] = ptOf(e)
  if (drag.kind === 'box') boxDraft.value = { x0: drag.x0, y0: drag.y0, x1: nx, y1: ny }
}
function onPointerUp(e) {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  if (!drag) return
  const [nx, ny] = ptOf(e)
  const d = drag
  drag = null
  boxDraft.value = null
  if (d.kind === 'tap') {
    if (Math.hypot(nx - d.x0, ny - d.y0) < 0.01) addByTap(d.x0, d.y0)
  } else if (d.kind === 'box') {
    const box = normalizeBox(d.x0, d.y0, nx, ny)
    if (box) addByBox(box)
  }
}

// --- 보정 동작 ---
async function addByTap(nx, ny) {
  await runCorrection(() => tapOutline(props.photoId, [nx, ny]), appendFromResult)
}
async function addByBox(box) {
  await runCorrection(() => boxOutline(props.photoId, box), appendFromResult)
}
function appendFromResult(res) {
  if (!res || res.itemId < 0) {
    notice.value = '이 위치에선 객체를 찾지 못했어요. 더 안쪽을 찍거나 박스로 감싸 보세요.'
    return
  }
  card.appendOutlineItem(props.photoId, {
    id: res.itemId,
    polygons: res.polygons,
    center: bboxCenter(res.polygons),
    src: 'user',
  })
  notice.value = ''
}

function startRefine() {
  if (selectedId.value == null) return
  refining.value = true
  plusMinus.value = 'plus'
  pos.value = []
  neg.value = []
  notice.value = '넣을 곳은 +, 뺄 곳은 − 로 찍고 적용하세요.'
}
function cancelRefine() {
  refining.value = false
  pos.value = []
  neg.value = []
  notice.value = ''
}
async function applyRefine() {
  if (!canApply.value || selectedId.value == null) return
  const id = selectedId.value
  await runCorrection(
    () => refineOutline(props.photoId, { itemId: id, pos: pos.value, neg: neg.value }),
    async (res) => {
      if (!res || res.itemId < 0) {
        notice.value = '객체를 찾지 못했어요. 점을 다시 찍어 보세요.'
        return
      }
      // 교체·병합 흡수가 반영된 서버 외곽선으로 동기화.
      const data = await fetchPhotoOutline(props.photoId)
      card.applyOutlineSync(props.photoId, data)
      cancelRefine()
    },
  )
}
async function removeSelected() {
  if (selectedId.value == null) return
  const id = selectedId.value
  await runCorrection(
    () => deleteOutlineItem(props.photoId, id),
    () => {
      card.removeOutlineItem(props.photoId, id)
      selectedId.value = null
    },
  )
}

// 공통: in-flight 가드 + 에러 인라인 안내(503/409/no-op).
async function runCorrection(call, onOk) {
  if (correcting.value) return
  correcting.value = true
  notice.value = ''
  try {
    const res = await call()
    await onOk(res)
  } catch (e) {
    notice.value = correctionError(e)
  } finally {
    correcting.value = false
  }
}
function correctionError(e) {
  const status = e?.response?.status
  if (status === 503) return '지금은 외곽선 보정을 쓸 수 없어요. 잠시 후 다시 시도해 주세요.'
  if (status === 409) return '자동 외곽선 처리 중이에요. 잠시 후 다시 시도해 주세요.'
  return '보정에 실패했어요. 다시 시도해 주세요.'
}

// --- 닫기·Esc ---
function close() {
  emit('update:modelValue', false)
}
function onKeydown(e) {
  if (e.key !== 'Escape') return
  e.preventDefault()
  if (refining.value) cancelRefine() // 정제 중이면 정제 취소 먼저
  else close()
}
watch(
  () => props.modelValue,
  (open) => {
    if (typeof document === 'undefined') return
    if (open) {
      document.addEventListener('keydown', onKeydown)
      document.body.style.overflow = 'hidden'
    } else {
      document.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
    }
  },
  { immediate: true },
)
onScopeDispose(() => {
  disposed = true
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  document.body.style.overflow = ''
})

// 모드 전환 시 진행 상태 정리.
watch(mode, () => {
  selectedId.value = null
  cancelRefine()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="cd-scrim" role="presentation">
      <section class="cd-modal" role="dialog" aria-modal="true" aria-label="외곽선 보정">
        <header class="cd-head">
          <strong>외곽선 보정</strong>
          <span class="grow" />
          <button class="cd-close" @click="close">닫기</button>
        </header>

        <!-- 모드 + 도구 -->
        <div class="cd-tools">
          <div class="seg">
            <button :class="{ on: mode === 'add' }" @click="mode = 'add'">＋ 추가</button>
            <button :class="{ on: mode === 'edit' }" @click="mode = 'edit'">✎ 보정</button>
          </div>
          <template v-if="mode === 'add'">
            <div class="seg">
              <button :class="{ on: addTool === 'tap' }" @click="addTool = 'tap'">콕 찍기</button>
              <button :class="{ on: addTool === 'box' }" @click="addTool = 'box'">영역 박스</button>
            </div>
            <span class="hint">{{ addTool === 'tap' ? '객체를 클릭하면 외곽선을 만들어요.' : '객체를 드래그로 감싸요.' }}</span>
          </template>
          <template v-else>
            <span v-if="selectedId == null" class="hint">객체를 클릭해 고르세요.</span>
            <template v-else-if="!refining">
              <button class="act" @click="startRefine">모양 고치기</button>
              <button class="act danger" @click="removeSelected">삭제</button>
            </template>
            <template v-else>
              <div class="seg">
                <button :class="{ on: plusMinus === 'plus' }" @click="plusMinus = 'plus'">＋ 넣기</button>
                <button :class="{ on: plusMinus === 'minus' }" @click="plusMinus = 'minus'">− 빼기</button>
              </div>
              <button class="act" :disabled="!canApply || correcting" @click="applyRefine">적용</button>
              <button class="act" @click="cancelRefine">취소</button>
            </template>
          </template>
          <span v-if="correcting" class="hint busy">처리 중…</span>
        </div>

        <p v-if="notice" class="cd-notice">{{ notice }}</p>

        <div class="cd-stage">
          <canvas
            ref="canvasEl"
            class="cd-canvas"
            :class="{ crosshair: mode === 'add' || refining }"
            @pointerdown="onPointerDown"
          />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.cd-scrim {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 19, 24, 0.6);
  padding: 18px;
}
.cd-modal {
  display: flex;
  flex-direction: column;
  max-width: min(880px, 94vw);
  max-height: 92vh;
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
}
.cd-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e8eb;
}
.cd-head .grow {
  flex: 1;
}
.cd-close {
  border: 1px solid #e5e8eb;
  background: #fff;
  border-radius: 8px;
  padding: 5px 12px;
  cursor: pointer;
  font-weight: 600;
  color: #4b5563;
}
.cd-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 16px;
}
.seg {
  display: inline-flex;
  border: 1px solid #e5e8eb;
  border-radius: 9px;
  overflow: hidden;
}
.seg button {
  border: 0;
  background: #fff;
  padding: 6px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #4b5563;
  cursor: pointer;
}
.seg button.on {
  background: #3182f6;
  color: #fff;
}
.act {
  border: 1px solid #d6dbe1;
  background: #fff;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #4b5563;
  cursor: pointer;
}
.act.danger {
  color: #f04452;
  border-color: #f7c7cc;
}
.act:disabled {
  color: #c9d2db;
  cursor: default;
}
.hint {
  font-size: 0.82rem;
  color: #8b95a1;
}
.hint.busy {
  color: #3182f6;
  font-weight: 600;
}
.cd-notice {
  margin: 0;
  padding: 6px 16px 0;
  font-size: 0.82rem;
  color: #f04452;
}
.cd-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: auto;
  background: #eef1f4;
}
.cd-canvas {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.16);
  background: #fff;
  touch-action: none;
}
.cd-canvas.crosshair {
  cursor: crosshair;
}
</style>
