<script setup>
import { ref, watch } from 'vue'
import { usePhotoContent } from '@/composables/usePhotoContent'

// 인증 사진 썸네일 (S2-LOG-06 #55). photoId 의 원본을 usePhotoContent 로 받아 표시한다.
// objectURL 의 생성·해제는 컴포저블(스코프)이 책임진다 — 이 컴포넌트는 표시·상태만 다룬다.
const props = defineProps({
  photoId: { type: [Number, String], required: true },
  alt: { type: String, default: '' },
})

const { load } = usePhotoContent()

// loading: blob 받는 중 또는 <img> 디코딩 전(스켈레톤)
// loaded : <img> 디코딩 성공
// error  : fetch 실패 또는 <img> 디코딩 실패(HEIC 등 브라우저 미표시) → 아이콘 폴백
const state = ref('loading')
const objectUrl = ref(null)

// 같은 컴포넌트에서 photoId 가 바뀌면 더 최신 요청만 반영한다(지연 응답이 화면을 덮어쓰지 않게).
let requestSeq = 0

async function loadPhoto(photoId) {
  const seq = ++requestSeq
  state.value = 'loading'
  objectUrl.value = null
  try {
    const url = await load(photoId, props.alt)
    if (seq !== requestSeq) return // 그새 photoId 가 또 바뀜 → 폐기
    objectUrl.value = url
    // state 는 여기서 'loaded' 로 두지 않는다 — <img> 가 실제로 디코딩에 성공해야(@load) 표시.
  } catch {
    if (seq !== requestSeq) return
    state.value = 'error'
  }
}

watch(() => [props.photoId, props.alt], ([photoId]) => loadPhoto(photoId), { immediate: true })
</script>

<template>
  <!-- 컨테이너가 접근성 이름을 가진다(로딩·에러 상태엔 <img> 가 없으므로). -->
  <div class="photo-thumb" role="img" :aria-label="alt || '사진'">
    <img
      v-if="objectUrl"
      v-show="state === 'loaded'"
      :src="objectUrl"
      alt=""
      class="image"
      draggable="false"
      @load="state = 'loaded'"
      @error="state = 'error'"
    />
    <div v-if="state === 'loading'" class="skeleton" aria-hidden="true" />
    <i v-else-if="state === 'error'" class="pi pi-image fallback" aria-hidden="true" />
  </div>
</template>

<style scoped>
.photo-thumb {
  position: relative;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: var(--paper-dim);
  display: grid;
  place-items: center;
  color: var(--ink-faint);
}

.image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.skeleton {
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, var(--paper-dim) 30%, var(--line2) 50%, var(--paper-dim) 70%);
  background-size: 200% 100%;
  animation: shimmer 1.2s ease-in-out infinite;
}

@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

.fallback {
  font-size: 22px;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}
</style>
