<script setup>
// 카드 자동 초안 미리보기 (S3-LOG-06 5단계, 읽기 전용).
// 외곽선(items) + 문구(captions.response) + 사진을 buildScene → renderCard 로 캔버스에 그린다.
// 렌더 레이어는 이미 검증됨 — 여기선 "올바른 인자로 호출"하는 배선만 한다(보정은 6단계~).
//
// 위생: 명령형 캔버스 = watch→redraw(flush:'post') · willReadFrequently(renderCard 의 휘도 리드백) ·
// 매 렌더 ctx.setTransform 리셋 · 폰트(document.fonts.ready) 로드 후 첫 렌더(measureText 폴백 방지) ·
// 사진은 usePhotoContent(blob→objectURL, same-origin)로 tainted canvas 회피.
import { ref, shallowRef, computed, watch, onMounted, onScopeDispose } from 'vue'
import Button from 'primevue/button'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import { usePhotoContent } from '@/composables/usePhotoContent'
import { buildScene } from '@/card/render/buildScene'
import { renderCard } from '@/card/render/renderCore'
import { exportCardPng } from '@/card/render/exportCard'
import { useCardStore } from '@/stores/card'

const props = defineProps({
  photoIds: { type: Array, default: () => [] },
})

const card = useCardStore()
const { load } = usePhotoContent()

const current = ref(0)
const currentId = computed(() => props.photoIds[current.value] ?? null)
const canvasEl = ref(null)
const photoImg = shallowRef(null)
const fontReady = ref(false)
const toneDown = ref(0.35)

// 출력 포맷: 원본 비율(기본 — #73 범위: 원본비율 기본·9:16 옵션) / 9:16 고정(영상 엮기용).
// 미리보기 캔버스도 이 포맷을 따른다 → 보이는 대로 저장된다(미리보기=내보내기 일치).
const format = ref('native')
const FIXED = { W: 1080, H: 1920 }
const canvasDims = computed(() => {
  const img = photoImg.value
  if (format.value === 'fixed' || !img) return FIXED
  return { W: img.naturalWidth, H: img.naturalHeight }
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
    /* 폰트 로드 실패해도 렌더는 진행(폴백 폰트) */
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

// 현재 사진 디코드(최신 요청만 반영 — 빠른 필름스트립 전환 시 지연 응답이 덮어쓰지 않게).
let reqSeq = 0
async function loadCurrent() {
  const id = currentId.value
  if (!id) return
  const seq = ++reqSeq
  photoImg.value = null
  try {
    const img = await decode(await load(id))
    if (!disposed && seq === reqSeq) photoImg.value = img
  } catch {
    /* 디코드 실패 → 렌더 생략 */
  }
}

// scene = 계약 그대로 투입(외곽선 GET 응답은 이미 계약 형식이라 매핑 없이 buildScene 에).
// FAILED·미완료 사진은 items=[](외곽선 없이 사진만), 문구 없으면 빈 objects.
const scene = computed(() => {
  const img = photoImg.value
  if (!img) return null
  const outline = card.outlines[currentId.value]
  const items = outline?.status === 'READY' && Array.isArray(outline.items) ? outline.items : []
  const captions = card.captions[currentId.value]?.response ?? { objects: [], closing: null }
  return buildScene({
    items,
    captions,
    canvas: canvasDims.value,
    photo: { w: img.naturalWidth, h: img.naturalHeight },
    style: { toneDown: toneDown.value },
  })
})

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
}

watch(currentId, loadCurrent, { immediate: true })
watch([scene, photoImg, fontReady], redraw, { flush: 'post' })

// --- PNG 내보내기 (#73 exportCardPng 호출만, 신규 렌더 테스트 금지) ---
// 디코드 완료 후에만 활성. 연타 가드. (format/canvasDims 는 위 미리보기와 공유.)
const exporting = ref(false)
const exportNote = ref('')

function buildInputsFor(img, id) {
  const outline = card.outlines[id]
  const items = outline?.status === 'READY' && Array.isArray(outline.items) ? outline.items : []
  const captions = card.captions[id]?.response ?? { objects: [], closing: null }
  return {
    items,
    captions,
    photo: { w: img.naturalWidth, h: img.naturalHeight },
    style: { toneDown: toneDown.value },
  }
}

// 다운로드: 앵커를 DOM 에 부착해 click 후, object URL 은 지연 해제(다운로드 시작 전 revoke 방지).
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

async function exportOne(id, img) {
  const blob = await exportCardPng(buildInputsFor(img, id), { photo: img }, { format: format.value })
  triggerDownload(blob, `triplog-card-${id}.png`)
}

async function downloadCurrent() {
  if (exporting.value || !photoImg.value) return
  exporting.value = true
  exportNote.value = ''
  try {
    await exportOne(currentId.value, photoImg.value)
    exportNote.value = '저장 완료'
  } catch (e) {
    exportNote.value = `저장 실패: ${e.message}`
  } finally {
    exporting.value = false
  }
}

async function downloadAll() {
  if (exporting.value) return
  exporting.value = true
  exportNote.value = ''
  let ok = 0
  try {
    for (const id of props.photoIds) {
      try {
        const img = await decode(await load(id))
        await exportOne(id, img)
        ok += 1
      } catch {
        /* 이 카드 건너뜀 */
      }
    }
    exportNote.value = `${ok}/${props.photoIds.length}장 저장 완료`
  } finally {
    exporting.value = false
  }
}

// fixed(9:16) 미리보기 = 실제 export 결과를 그대로 보여준다(WYSIWYG). 미리보기 canvas 의
// cover-crop 과 export 의 contain+여백채움이 달라 9:16 아닌 사진에서 어긋나므로, fixed 일 때는
// exportCardPng 결과 이미지를 렌더한다. 디바운스 + objectURL 정리.
const fixedUrl = ref(null)
let fixedTimer = null
let fixedUrlValue = null
function scheduleFixedPreview() {
  clearTimeout(fixedTimer)
  fixedTimer = setTimeout(async () => {
    const img = photoImg.value
    if (disposed || format.value !== 'fixed' || !img || !fontReady.value) return
    try {
      const blob = await exportCardPng(
        buildInputsFor(img, currentId.value),
        { photo: img },
        { format: 'fixed' },
      )
      if (disposed) return
      const url = URL.createObjectURL(blob)
      if (fixedUrlValue) URL.revokeObjectURL(fixedUrlValue)
      fixedUrlValue = url
      fixedUrl.value = url
    } catch {
      /* 미리보기 생성 실패는 무시 — 저장 시 에러로 표면 */
    }
  }, 250)
}
watch([format, currentId, photoImg, fontReady, toneDown], () => {
  if (format.value === 'fixed') scheduleFixedPreview()
})
onScopeDispose(() => {
  clearTimeout(fixedTimer)
  if (fixedUrlValue) URL.revokeObjectURL(fixedUrlValue)
})
</script>

<template>
  <div class="preview">
    <p class="hint">자동 초안 미리보기 · 문구 위치/외곽선 보정은 다음 단계에서.</p>

    <div class="controls">
      <label class="tone">
        톤 낮춤
        <input
          type="range"
          min="0"
          max="50"
          :value="Math.round(toneDown * 100)"
          :disabled="exporting"
          @input="toneDown = Number($event.target.value) / 100"
        />
      </label>
      <label class="fmt">
        포맷
        <select v-model="format" :disabled="exporting">
          <option value="native">원본 비율</option>
          <option value="fixed">9:16</option>
        </select>
      </label>
      <Button
        label="이 카드 저장"
        icon="pi pi-download"
        size="small"
        :disabled="exporting || !photoImg"
        @click="downloadCurrent"
      />
      <Button
        v-if="photoIds.length > 1"
        :label="`전체 저장 (${photoIds.length})`"
        icon="pi pi-download"
        size="small"
        severity="secondary"
        :disabled="exporting"
        @click="downloadAll"
      />
      <span v-if="exportNote" class="export-note" role="status">{{ exportNote }}</span>
    </div>

    <div class="stage">
      <!-- 원본 비율: 캔버스 직접 렌더 / 9:16: 실제 export 결과를 표시(저장과 일치) -->
      <canvas v-show="format !== 'fixed'" ref="canvasEl" class="card-canvas" aria-label="카드 미리보기" />
      <img
        v-if="format === 'fixed' && fixedUrl"
        :src="fixedUrl"
        class="card-canvas"
        alt="카드 미리보기 (9:16)"
      />
    </div>

    <ul v-if="photoIds.length > 1" class="filmstrip">
      <li v-for="(id, i) in photoIds" :key="id">
        <button
          type="button"
          class="film"
          :class="{ on: i === current }"
          :aria-pressed="i === current"
          @click="current = i"
        >
          <PhotoThumb :photo-id="id" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.hint {
  color: #8b95a1;
  margin: 0 0 12px;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}
.controls label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: #4b5563;
}
.export-note {
  color: #16c47e;
  font-size: 0.85rem;
  font-weight: 600;
}
.stage {
  display: flex;
  justify-content: center;
}
.card-canvas {
  /* 표시 비율 = 캔버스 픽셀 비율(포맷에 따라 원본/9:16). 보이는 대로 저장된다. */
  max-height: min(68vh, 620px);
  max-width: 100%;
  height: auto;
  width: auto;
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
  background: #f2f4f6;
}
.filmstrip {
  list-style: none;
  display: flex;
  gap: 8px;
  padding: 14px 0 0;
  margin: 0;
  overflow-x: auto;
}
.film {
  width: 56px;
  height: 56px;
  padding: 0;
  border: 0;
  background: none;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
}
.film::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 8px;
  box-shadow: inset 0 0 0 0 #3182f6;
  transition: box-shadow 0.12s ease;
}
.film.on::after {
  box-shadow: inset 0 0 0 3px #3182f6;
}
</style>
