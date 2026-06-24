<script setup>
// 외곽선 보정 팝업 (S4-LOG-01 PR2). 디자인 시스템(빈티지 종이 톤) 정합 · 위계 분리.
//  - 모드(추가/보정) = 최상위 / 도구·동작 = 하위 / 상태칩·커서 = 현재 무엇을 찍는지 표시.
//  - 추가: 점(대상 중심 클릭)/박스(드래그). 보정: 대상 선택 → 모양 다듬기(포함/제외 점 → 미리보기 → 적용) 또는 삭제.
//  - 정제는 적용 전까지 저장 안 함(previewRefine=미리보기, applyRefine=적용).
// 색: 일반 외곽선=남색, 선택=테라코타, 미리보기=세이지 그린, 흡수=머스타드 / 포함=세이지, 제외·삭제=적색.
import { ref, computed, watch, shallowRef, onScopeDispose, nextTick } from 'vue'
import { usePhotoContent } from '@/composables/usePhotoContent'
import { useCardStore } from '@/stores/card'
import {
  fetchPhotoOutline,
  tapOutline,
  boxOutline,
  previewRefine,
  applyRefine,
  deleteOutlineItem,
} from '@/api/outlineApi'
import { itemAt, normalizeBox, clamp01 } from '@/card/outlineEdit'

// 캔버스에 그릴 색. 외곽선은 단색 빨강(흰 글로우 없음). 선택은 색 대신 굵기로 구분.
const C = {
  outline: '#e03131', // 외곽선 단색(빨강)
  selected: '#ffc107', // 선택한 대상(노랑 — 색이 아니라 선택 강조용)
  preview: '#2f9e44', // 미리보기 새 외곽선(초록 — 바뀔 모양 비교용)
  absorb: '#f08c00', // 흡수될 대상(주황 — 미리보기 때만)
  inc: '#2f9e44', // 포함점(초록)
  exc: '#e03131', // 제외점(빨강)
  accent: '#c2693f', // 추가 모드 탭/박스 드래그 피드백
}

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
const refining = ref(false) // 모양 다듬기 진행 중
const plusMinus = ref('plus') // 'plus'(포함) | 'minus'(제외)
const marks = ref([]) // 정제 점 [{ x, y, kind }] — 순서 보존(되돌리기용)
const preview = ref(null) // 미리보기 결과 { itemId, polygons, absorbItemIds }
const boxDraft = ref(null) // {x0,y0,x1,y1} 드래그 중
const lastTap = ref(null) // 마지막 탭 지점(추가 모드 피드백)
const correcting = ref(false)
const notice = ref('')
const noticeKind = ref('info') // 'info' | 'error'

const canvasEl = ref(null)
const img = shallowRef(null)
let disposed = false

const selectedIndex = computed(() => items.value.findIndex((it) => it.id === selectedId.value))
const pos = computed(() => marks.value.filter((m) => m.kind === 'plus').map((m) => [m.x, m.y]))
const neg = computed(() => marks.value.filter((m) => m.kind === 'minus').map((m) => [m.x, m.y]))
const canPreview = computed(() => marks.value.length > 0)
const absorbCount = computed(() => preview.value?.absorbItemIds?.length ?? 0)

// 보정 정제 중에는 커서를 현재 도구(포함=초록＋ / 제외=빨강−) 모양으로 — 무엇을 찍는지 마우스로 표시.
function dotCursor(fill, plus) {
  const cross = plus
    ? "<line x1='15' y1='9.5' x2='15' y2='20.5' stroke='white' stroke-width='2.6'/><line x1='9.5' y1='15' x2='20.5' y2='15' stroke='white' stroke-width='2.6'/>"
    : "<line x1='9.5' y1='15' x2='20.5' y2='15' stroke='white' stroke-width='2.6'/>"
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30'>` +
    `<circle cx='15' cy='15' r='10' fill='${fill}' stroke='white' stroke-width='2.4'/>${cross}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 15 15, crosshair`
}
const canvasCursor = computed(() => {
  if (mode.value === 'add') return 'crosshair'
  if (refining.value) return plusMinus.value === 'plus' ? dotCursor(C.inc, true) : dotCursor(C.exc, false)
  return 'pointer' // 보정-대상 선택 단계: 클릭으로 대상 고르기
})

function info(msg) {
  notice.value = msg
  noticeKind.value = 'info'
}
function fail(msg) {
  notice.value = msg
  noticeKind.value = 'error'
}

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
      fail('사진을 불러오지 못했어요.')
    }
  },
  { immediate: true },
)

function resetState() {
  mode.value = 'add'
  addTool.value = 'tap'
  selectedId.value = null
  refining.value = false
  plusMinus.value = 'plus'
  marks.value = []
  preview.value = null
  boxDraft.value = null
  lastTap.value = null
  notice.value = ''
  noticeKind.value = 'info'
}

// --- 렌더 ---
function drawLoops(ctx, polygons, W, H) {
  for (const loop of Array.isArray(polygons) ? polygons : []) {
    if (!Array.isArray(loop) || loop.length < 3) continue
    ctx.beginPath()
    loop.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)))
    ctx.closePath()
    ctx.stroke()
  }
}
// 단색 스트로크 + 옅은 어두운 그림자(흰 글로우 없이 어두운 사진에서도 보이게).
function strokePoly(ctx, polygons, W, H, color, width, dash) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = Math.max(2, width)
  ctx.setLineDash(dash || [])
  ctx.lineWidth = width
  ctx.strokeStyle = color
  drawLoops(ctx, polygons, W, H)
  ctx.restore()
}
function redraw() {
  const el = canvasEl.value
  const im = img.value
  if (!el || !im) return
  const ctx = el.getContext('2d')
  const W = el.width
  const H = el.height
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(im, 0, 0, W, H)
  const base = Math.max(3, W * 0.006)
  const absorb = new Set(preview.value?.absorbItemIds ?? [])
  for (const it of items.value) {
    const sel = it.id === selectedId.value
    if (absorb.has(it.id)) {
      strokePoly(ctx, it.polygons, W, H, C.absorb, base, [base * 2, base * 1.4])
    } else {
      // 일반 = 빨강, 선택 = 노랑(굵게).
      strokePoly(ctx, it.polygons, W, H, sel ? C.selected : C.outline, sel ? base * 2.1 : base)
    }
  }
  if (preview.value) {
    strokePoly(ctx, preview.value.polygons, W, H, C.preview, base * 1.8, [base * 2.6, base * 1.7])
  }
  // 정제 점 마커
  const mr = Math.max(8, W * 0.014)
  for (const m of marks.value) {
    if (m.kind === 'plus') marker(ctx, m.x * W, m.y * H, C.inc, '+', mr)
    else marker(ctx, m.x * W, m.y * H, C.exc, '−', mr)
  }
  // 마지막 탭(추가 모드)
  if (lastTap.value) {
    const [x, y] = lastTap.value
    ctx.save()
    ctx.strokeStyle = C.accent
    ctx.lineWidth = Math.max(2, W * 0.004)
    ctx.beginPath()
    ctx.arc(x * W, y * H, mr, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  // 박스 드래프트
  if (boxDraft.value) {
    const { x0, y0, x1, y1 } = boxDraft.value
    ctx.save()
    ctx.setLineDash([base * 2, base * 1.4])
    ctx.strokeStyle = C.accent
    ctx.lineWidth = Math.max(2, W * 0.004)
    ctx.strokeRect(x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H)
    ctx.restore()
  }
}
function marker(ctx, px, py, color, sign, r = 9) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = r * 0.4
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(px, py, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = '#fff'
  ctx.font = `700 ${Math.round(r * 1.3)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(sign, px, py)
  ctx.restore()
}
watch([items, selectedId, marks, preview, boxDraft, lastTap, img], () => nextTick(redraw), {
  deep: true,
})

// 캔버스 내부 해상도 = 사진 비율(표시 크기는 CSS). 사진 로드 시 1회 설정.
watch(img, (im) => {
  const el = canvasEl.value
  if (el && im) {
    el.width = im.naturalWidth
    el.height = im.naturalHeight
  }
})

// --- 좌표 (사진 정규화 0~1) ---
// 캔버스는 object-fit:contain 으로 표시 영역 안에 레터박스될 수 있어, 표시 박스가 아니라
// 실제 그려진 이미지 영역(letterbox 보정)을 기준으로 환산해야 클릭 위치와 점이 일치한다.
function ptOf(e) {
  const el = canvasEl.value
  const r = el.getBoundingClientRect()
  const iw = el.width || r.width
  const ih = el.height || r.height
  const scale = Math.min(r.width / iw, r.height / ih)
  const dw = iw * scale
  const dh = ih * scale
  const offX = (r.width - dw) / 2
  const offY = (r.height - dh) / 2
  return [clamp01((e.clientX - r.left - offX) / dw), clamp01((e.clientY - r.top - offY) / dh)]
}

// --- 포인터 ---
let drag = null
function onPointerDown(e) {
  if (correcting.value || !img.value) return
  const [nx, ny] = ptOf(e)
  // 보정 정제: 좌클릭 = 현재 토글(포함/제외) 점 찍기(미리보기 중이면 편집으로 복귀).
  if (mode.value === 'edit' && refining.value) {
    if (e.button !== 0) return // 포함/제외는 토글로만 선택 — 다른 버튼은 무시
    if (preview.value) preview.value = null
    addPoint(nx, ny, plusMinus.value)
    return
  }
  if (e.button === 2) return
  if (mode.value === 'add') {
    if (addTool.value === 'box') {
      drag = { kind: 'box', x0: nx, y0: ny }
      boxDraft.value = { x0: nx, y0: ny, x1: nx, y1: ny }
      bindMove(e)
    } else {
      drag = { kind: 'tap', x0: nx, y0: ny }
      lastTap.value = [nx, ny]
      bindMove(e)
    }
    return
  }
  // 보정-대상 선택
  if (mode.value === 'edit' && !refining.value) {
    const hit = itemAt(items.value, nx, ny)
    selectedId.value = hit ? hit.id : null
  }
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

// --- 추가 ---
async function addByTap(nx, ny) {
  await runCorrection(() => tapOutline(props.photoId, [nx, ny]), appendFromResult)
}
async function addByBox(box) {
  await runCorrection(() => boxOutline(props.photoId, box), appendFromResult)
}
async function appendFromResult(res) {
  if (!res || res.itemId < 0) {
    fail(
      addTool.value === 'box'
        ? '여기선 대상을 못 찾았어요. 박스로 좀 더 촘촘하게 감싸 보세요.'
        : '여기선 대상을 못 찾았어요. 대상의 중심을 클릭해 보세요.',
    )
    return
  }
  // BE 가 저장한 전체 item(bbox/center/area/anchors)과 store 를 맞추기 위해 재동기화한다.
  // 부분 append(anchors 누락) 시 그 객체 문구가 빈 공간 앵커가 아니라 중심에 붙는 문제를 막는다.
  const data = await fetchPhotoOutline(props.photoId)
  card.applyOutlineSync(props.photoId, data)
  selectedId.value = res.itemId
  lastTap.value = null
  info('대상을 추가했어요. 잘못 잡혔으면 목록에서 ✕로 지울 수 있어요.')
}

// --- 선택·삭제(모드 무관) ---
function selectItem(id) {
  if (refining.value) return
  selectedId.value = selectedId.value === id ? null : id
}
async function deleteItem(id) {
  await runCorrection(
    () => deleteOutlineItem(props.photoId, id),
    () => {
      card.removeOutlineItem(props.photoId, id)
      if (selectedId.value === id) {
        selectedId.value = null
        if (refining.value) cancelRefine()
      }
      info('대상을 지웠어요.')
    },
  )
}

// --- 모양 다듬기(미리보기 → 적용) ---
function startRefine() {
  if (selectedId.value == null) return
  refining.value = true
  plusMinus.value = 'plus'
  marks.value = []
  preview.value = null
  notice.value = ''
}
function addPoint(nx, ny, kind) {
  marks.value = [...marks.value, { x: nx, y: ny, kind }]
}
function undoPoint() {
  if (!marks.value.length) return
  marks.value = marks.value.slice(0, -1)
}
function cancelRefine() {
  refining.value = false
  marks.value = []
  preview.value = null
  notice.value = ''
}
async function doPreview() {
  if (!canPreview.value || selectedId.value == null) return
  const id = selectedId.value
  await runCorrection(
    () => previewRefine(props.photoId, { itemId: id, pos: pos.value, neg: neg.value }),
    (res) => {
      // 취소했거나 다른 대상으로 바뀐 뒤 늦게 도착한 응답은 버린다(stale 미리보기 방지).
      if (!refining.value || selectedId.value !== id) return
      if (!res || res.itemId < 0) {
        fail('이 점들로는 대상을 못 잡았어요. 점을 더하거나 빼서 다시 해보세요.')
        return
      }
      preview.value = res
      if (res.absorbItemIds?.length) info(`적용하면 다른 대상 ${res.absorbItemIds.length}개가 여기에 합쳐져요.`)
      else notice.value = ''
    },
  )
}
async function applyPreview() {
  if (!preview.value || selectedId.value == null) return
  const p = preview.value
  await runCorrection(
    () => applyRefine(props.photoId, { itemId: p.itemId, polygons: p.polygons, absorbItemIds: p.absorbItemIds }),
    async () => {
      const data = await fetchPhotoOutline(props.photoId)
      card.applyOutlineSync(props.photoId, data)
      cancelRefine()
      info('외곽선을 바꿨어요.')
    },
  )
}

// 공통: in-flight 가드 + 에러 인라인 안내.
async function runCorrection(call, onOk) {
  if (correcting.value) return
  correcting.value = true
  notice.value = ''
  try {
    const res = await call()
    await onOk(res)
  } catch (e) {
    fail(correctionError(e))
  } finally {
    correcting.value = false
  }
}
function correctionError(e) {
  const status = e?.response?.status
  if (status === 503) return '인식 서버가 잠깐 응답하지 않아요. 잠시 후 다시 시도해 주세요.'
  if (status === 409) return '아직 자동 외곽선을 만드는 중이에요. 잠시 후 다시 시도해 주세요.'
  return '처리에 실패했어요. 잠시 후 다시 시도해 주세요.'
}

// --- 닫기·키 ---
function close() {
  emit('update:modelValue', false)
}
function onKeydown(e) {
  if (e.key === 'Backspace' && mode.value === 'edit' && refining.value) {
    e.preventDefault()
    if (preview.value) preview.value = null // 미리보기 → 편집으로
    else undoPoint()
    return
  }
  if (e.key !== 'Escape') return
  e.preventDefault()
  if (refining.value) cancelRefine()
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
  lastTap.value = null
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
          <button class="b ghost sm" @click="close">닫기</button>
        </header>

        <div class="cd-body">
          <!-- 왼쪽: 캔버스 -->
          <div class="cd-stage">
            <div class="cd-canvaswrap">
              <canvas
                ref="canvasEl"
                class="cd-canvas"
                :style="{ cursor: canvasCursor }"
                @pointerdown="onPointerDown"
                @contextmenu.prevent
              />
              <div v-if="refining" class="cd-chip">
                <b :class="plusMinus === 'plus' ? 'inc' : 'exc'">
                  {{ plusMinus === 'plus' ? '＋ 포함' : '− 제외' }}
                </b>
                <span>찍는 중</span>
              </div>
            </div>
          </div>

          <!-- 오른쪽: 패널 -->
          <aside class="cd-panel">
            <div class="cd-ctrls">
              <!-- 1단계: 모드 -->
              <div class="modeseg">
                <button :class="{ on: mode === 'add' }" @click="mode = 'add'">추가</button>
                <button :class="{ on: mode === 'edit' }" @click="mode = 'edit'">보정</button>
              </div>

              <!-- 추가 모드 -->
              <template v-if="mode === 'add'">
                <div class="toolrow">
                  <button class="tool" :class="{ on: addTool === 'tap' }" @click="addTool = 'tap'">
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <circle cx="12" cy="12" r="3.6" fill="currentColor" />
                      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.45" />
                    </svg>
                    <span>점</span>
                  </button>
                  <button class="tool" :class="{ on: addTool === 'box' }" @click="addTool = 'box'">
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <rect x="4.5" y="4.5" width="15" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="3.4 2.6" />
                    </svg>
                    <span>박스</span>
                  </button>
                </div>
              </template>

              <!-- 보정 모드 -->
              <template v-else>
                <!-- 대상 선택 단계 -->
                <template v-if="selectedId == null">
                  <div class="cd-note">화면이나 목록에서 대상을 선택하세요</div>
                </template>
                <!-- 선택됨, 정제 전 -->
                <template v-else-if="!refining">
                  <div class="cd-sub"><span class="cd-subt">선택한 대상 · 객체 {{ selectedIndex + 1 }}</span></div>
                  <button class="b pri full" @click="startRefine">모양 다듬기</button>
                  <button class="b dangerlink" :disabled="correcting" @click="deleteItem(selectedId)">대상 삭제</button>
                </template>
                <!-- 정제 1단계: 점 찍기 -->
                <template v-else-if="!preview">
                  <div class="cd-sub">
                    <span class="cd-subt">모양 다듬기</span>
                    <button class="cd-x" @click="cancelRefine">취소</button>
                  </div>
                  <div class="toggle">
                    <button class="inc" :class="{ on: plusMinus === 'plus' }" @click="plusMinus = 'plus'">＋ 포함</button>
                    <button class="exc" :class="{ on: plusMinus === 'minus' }" @click="plusMinus = 'minus'">− 제외</button>
                  </div>
                  <div class="actionrow">
                    <button class="iconbtn" title="되돌리기 (Backspace)" :disabled="!marks.length || correcting" @click="undoPoint">
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M4 9h11a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    </button>
                    <button class="b pri grow" :disabled="!canPreview || correcting" @click="doPreview">미리보기</button>
                  </div>
                </template>
                <!-- 정제 2단계: 미리보기 확인 -->
                <template v-else>
                  <div class="cd-sub">
                    <span class="cd-subt">미리보기</span>
                    <button class="cd-x" @click="cancelRefine">취소</button>
                  </div>
                  <button class="b pri full" :disabled="correcting" @click="applyPreview">적용</button>
                </template>
              </template>

              <p v-if="notice" class="cd-notice" :class="noticeKind">{{ notice }}</p>
              <p v-if="correcting" class="cd-busy">인식 중…</p>
            </div>

            <!-- 객체 목록 (자기 영역에서만 스크롤) -->
            <div class="cd-objsection">
              <div class="objhead">대상 {{ items.length }}개</div>
              <ul v-if="items.length" class="objlist">
                <li
                  v-for="(it, i) in items"
                  :key="it.id"
                  :class="{ on: it.id === selectedId, dim: refining && it.id !== selectedId }"
                  @click="selectItem(it.id)"
                >
                  <span class="dot" :class="it.src === 'user' ? 'u' : 'a'" />
                  <span class="nm">객체 {{ i + 1 }}</span>
                  <span class="tag">{{ it.src === 'user' ? '직접' : '자동' }}</span>
                  <button class="x" title="삭제" :disabled="correcting" @click.stop="deleteItem(it.id)">✕</button>
                </li>
              </ul>
              <p v-else class="objempty">아직 인식된 대상이 없어요. 추가 모드에서 잡아 보세요.</p>
            </div>
          </aside>
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
  background: rgba(40, 30, 20, 0.46);
  padding: 18px;
}
.cd-modal {
  display: flex;
  flex-direction: column;
  width: min(980px, 95vw);
  height: min(680px, 92vh);
  background: var(--paper, #fbf7ee);
  border-radius: 16px;
  box-shadow: var(--shadow-pop, 0 14px 40px -12px rgba(50, 30, 15, 0.5));
  overflow: hidden;
}
.cd-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--line, #e2d8c4);
  flex: 0 0 auto;
}
.cd-head strong {
  font-size: 15px;
  letter-spacing: -0.2px;
}
.cd-head .grow {
  flex: 1;
}
.cd-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.cd-stage {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--paper-dim, #f6efe2);
}
.cd-canvaswrap {
  position: relative;
  display: flex;
  max-width: 100%;
  max-height: 100%;
}
.cd-canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 10px;
  box-shadow: 0 8px 26px -12px rgba(40, 25, 10, 0.5);
  background: #fff;
  touch-action: none;
}
.cd-chip {
  position: absolute;
  top: 10px;
  left: 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(33, 26, 20, 0.82);
  color: #fff;
  border-radius: 20px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 600;
  pointer-events: none;
}
.cd-chip b.inc {
  color: #a7c79a;
}
.cd-chip b.exc {
  color: #ec9a93;
}

/* ── 패널: 고정 컨트롤 + 스크롤 목록 ── */
.cd-panel {
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--line, #e2d8c4);
  background: var(--paper, #fbf7ee);
  overflow: hidden;
}
.cd-ctrls {
  flex: 0 0 auto;
  min-height: 246px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--line2, #efe8d9);
}
.cd-objsection {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 10px 14px 14px;
}

/* 1단계 모드 = 큰 세그먼트, 활성 accent 채움 */
.modeseg {
  display: flex;
  border: 1px solid var(--line-strong, #d8ccb6);
  border-radius: 10px;
  overflow: hidden;
  background: var(--on-fill, #fbf8f1);
}
.modeseg button {
  flex: 1;
  border: 0;
  background: transparent;
  padding: 9px 0;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-sub, #8a8276);
  cursor: pointer;
}
.modeseg button.on {
  background: var(--accent, #c2693f);
  color: var(--on-fill, #fbf8f1);
}

/* 도구 타일(점/박스) = 한 급 낮춤(채움 X, 테라코타 라인+옅은 배경) */
.toolrow {
  display: flex;
  gap: 8px;
}
.tool {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--line, #e2d8c4);
  border-radius: 10px;
  background: var(--paper-card, #fffdf8);
  padding: 9px 0;
  color: var(--ink-sub, #8a8276);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.tool.on {
  border-color: var(--accent, #c2693f);
  color: var(--accent, #c2693f);
  background: #f6e9df;
}

/* 포함/제외 토글 = 각자 색(세이지/적색) 틴트 */
.toggle {
  display: flex;
  gap: 8px;
}
.toggle button {
  flex: 1;
  border: 1px solid var(--line, #e2d8c4);
  border-radius: 9px;
  background: var(--paper-card, #fffdf8);
  padding: 8px 0;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-sub, #8a8276);
  cursor: pointer;
}
.toggle button.inc.on {
  background: #e7eee1;
  border-color: #6f8a5f;
  color: #51714a;
}
.toggle button.exc.on {
  background: #f6e0dd;
  border-color: #c0392b;
  color: #a5392e;
}

.cd-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.cd-subt {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--ink, #2c2926);
}
.cd-x {
  border: 0;
  background: transparent;
  color: var(--ink-sub, #8a8276);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
}
.cd-x:hover {
  color: var(--ink, #2c2926);
}
.cd-note {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-sub, #8a8276);
}

.actionrow {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.iconbtn {
  flex: 0 0 auto;
  width: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line-strong, #d8ccb6);
  background: var(--paper-card, #fffdf8);
  border-radius: 9px;
  color: var(--ink-sub, #8a8276);
  cursor: pointer;
}
.iconbtn:disabled {
  color: var(--ink-faint, #b6ab97);
  cursor: default;
}

/* 버튼 — 디자인 시스템 톤 */
.b {
  border: 1px solid var(--line-strong, #d8ccb6);
  background: var(--paper-card, #fffdf8);
  color: var(--ink, #2c2926);
  border-radius: 9px;
  padding: 9px 14px;
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
}
.b.pri {
  background: var(--accent, #c2693f);
  border-color: var(--accent, #c2693f);
  color: var(--on-fill, #fbf8f1);
}
.b.pri:disabled {
  background: #dcb79f;
  border-color: #dcb79f;
  cursor: default;
}
.b.ghost {
  background: transparent;
  border-color: var(--line, #e2d8c4);
  color: var(--ink-sub, #8a8276);
}
.b.sm {
  padding: 6px 12px;
  font-size: 12.5px;
}
.b.full {
  width: 100%;
}
.b.grow {
  flex: 1;
}
.b.dangerlink {
  background: transparent;
  border: 1px solid transparent;
  color: var(--complete, #c0392b);
  font-size: 12.5px;
  font-weight: 600;
  padding: 4px;
  align-self: flex-start;
}
.b.dangerlink:hover {
  text-decoration: underline;
}
.b.dangerlink:disabled {
  color: var(--ink-faint, #b6ab97);
  cursor: default;
  text-decoration: none;
}

.cd-notice {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
}
.cd-notice.info {
  color: var(--stamp, #2f4a5c);
}
.cd-notice.error {
  color: var(--complete, #c0392b);
}
.cd-busy {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--accent, #c2693f);
}

/* 목록 */
.objhead {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-sub, #8a8276);
  letter-spacing: 0.2px;
  margin-bottom: 7px;
}
.objlist {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.objlist li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--line2, #efe8d9);
  border-radius: 8px;
  background: var(--paper-card, #fffdf8);
  cursor: pointer;
}
.objlist li.on {
  border-color: var(--accent, #c2693f);
  background: #f6e9df;
}
.objlist li.dim {
  opacity: 0.5;
}
.objlist .dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.objlist .dot.u {
  background: #6f8a5f;
}
.objlist .dot.a {
  background: #2f4a5c;
}
.objlist .nm {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink, #2c2926);
}
.objlist .tag {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-sub, #8a8276);
  background: var(--paper-dim, #f6efe2);
  border-radius: 5px;
  padding: 1px 6px;
}
.objlist .x {
  border: 0;
  background: transparent;
  color: var(--ink-faint, #b6ab97);
  font-size: 12.5px;
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 5px;
}
.objlist .x:hover {
  color: var(--complete, #c0392b);
  background: #f6e0dd;
}
.objlist .x:disabled {
  color: var(--line-strong, #d8ccb6);
  cursor: default;
}
.objempty {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--ink-faint, #b6ab97);
}
</style>
