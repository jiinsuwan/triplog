<script setup>
// 카드 자동 초안 미리보기 (S3-LOG-06 5단계, 읽기 전용).
// 외곽선(items) + 문구(captions.response) + 사진을 buildScene → renderCard 로 캔버스에 그린다.
// 렌더 레이어는 이미 검증됨 — 여기선 "올바른 인자로 호출"하는 배선만 한다(보정은 6단계~).
//
// 위생: 명령형 캔버스 = watch→redraw(flush:'post') · willReadFrequently(renderCard 의 휘도 리드백) ·
// 매 렌더 ctx.setTransform 리셋 · 폰트(document.fonts.ready) 로드 후 첫 렌더(measureText 폴백 방지) ·
// 사진은 usePhotoContent(blob→objectURL, same-origin)로 tainted canvas 회피.
import { ref, shallowRef, computed, watch, onMounted, onScopeDispose } from 'vue'
import PhotoThumb from '@/components/log/PhotoThumb.vue'
import { usePhotoContent } from '@/composables/usePhotoContent'
import { buildScene } from '@/card/render/buildScene'
import { renderCard } from '@/card/render/renderCore'
import { useCardStore } from '@/stores/card'

const props = defineProps({
  photoIds: { type: Array, default: () => [] },
})

const card = useCardStore()
const { load } = usePhotoContent()

// 카드 캔버스 = 세로 9:16(내보내기와 동일 프레임). 화면에선 contain 축소.
const CANVAS = { W: 1080, H: 1920 }

const current = ref(0)
const currentId = computed(() => props.photoIds[current.value] ?? null)
const canvasEl = ref(null)
const photoImg = shallowRef(null)
const fontReady = ref(false)
const toneDown = ref(0.35)

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
    canvas: CANVAS,
    photo: { w: img.naturalWidth, h: img.naturalHeight },
    style: { toneDown: toneDown.value },
  })
})

function redraw() {
  const el = canvasEl.value
  const sc = scene.value
  const img = photoImg.value
  if (!el || !sc || !img || !fontReady.value) return
  el.width = CANVAS.W
  el.height = CANVAS.H
  const ctx = el.getContext('2d', { willReadFrequently: true })
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  renderCard(ctx, sc, { photo: img })
}

watch(currentId, loadCurrent, { immediate: true })
watch([scene, photoImg, fontReady], redraw, { flush: 'post' })
</script>

<template>
  <div class="preview">
    <p class="hint">자동 초안 미리보기 — 보정은 다음 단계에서.</p>
    <div class="stage">
      <canvas ref="canvasEl" class="card-canvas" aria-label="카드 미리보기" />
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
.stage {
  display: flex;
  justify-content: center;
}
.card-canvas {
  height: min(68vh, 620px);
  width: auto;
  aspect-ratio: 9 / 16;
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
