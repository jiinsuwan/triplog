import { reactive, computed, ref, onScopeDispose } from 'vue'
import { fetchPhotoOutline as defaultFetch } from '@/api/outlineApi'

// 외곽선 처리 폴링 (S3-LOG-06 3단계).
// 선택한 사진들의 외곽선 상태를 폴링한다 — 미완료(PENDING)만, 백오프, 클라이언트 deadline.
// 백엔드엔 PROCESSING 상태가 없어 워커가 멈추면 영영 PENDING으로 보이므로 deadline 으로 무한 대기를 끊는다.
// 자원 위생: AbortController + onScopeDispose(타이머 clear · disposed 가드).

// --- 순수 헬퍼 (단위 테스트 대상) ---
export function isOutlineTerminal(status) {
  return status === 'READY' || status === 'FAILED'
}

export function pendingOutlineIds(outlines, photoIds) {
  return photoIds.filter((id) => !isOutlineTerminal(outlines[id]?.status))
}

export function summarizeOutlines(outlines, photoIds) {
  let ready = 0
  let failed = 0
  for (const id of photoIds) {
    const status = outlines[id]?.status
    if (status === 'READY') ready += 1
    else if (status === 'FAILED') failed += 1
  }
  const pending = photoIds.length - ready - failed
  return { ready, failed, pending, total: photoIds.length, done: pending === 0 }
}

// 백오프 간격: 시작 base, 매 틱 ×factor, cap 상한. (간격 "값"은 단언하지 않음 — 관찰 결과만 검증)
export function nextBackoff(prev, { base = 1500, factor = 1.5, cap = 5000 } = {}) {
  if (!prev) return base
  return Math.min(Math.round(prev * factor), cap)
}

// --- 컴포저블 ---
// schedule/unschedule/now 는 테스트에서 타이머를 제어하려고 주입 가능(기본 = 실제 타이머).
export function useOutlinePolling(photoIds, options = {}) {
  const {
    api,
    deadlineMs = 60000,
    now = () => Date.now(),
    schedule = (fn, ms) => setTimeout(fn, ms),
    unschedule = (timer) => clearTimeout(timer),
  } = options
  const fetchOutline = api?.fetchPhotoOutline ?? defaultFetch

  const outlines = reactive({}) // photoId -> { status, items }
  const timedOut = ref(false)
  const finished = ref(false)
  const summary = computed(() => summarizeOutlines(outlines, photoIds))

  let disposed = false
  let timer = null
  let interval = 0
  const startAt = now()
  const controllers = new Set()

  async function pollOnce() {
    const pending = pendingOutlineIds(outlines, photoIds)
    const results = await Promise.all(
      pending.map(async (id) => {
        const controller = new AbortController()
        controllers.add(controller)
        try {
          return { id, res: await fetchOutline(id, { signal: controller.signal }) }
        } catch {
          return null // 일시 실패 → 상태 유지, 다음 틱 재시도
        } finally {
          controllers.delete(controller)
        }
      }),
    )
    if (disposed) return
    for (const result of results) {
      if (result?.res) outlines[result.id] = { status: result.res.status, items: result.res.items }
    }
  }

  async function loop() {
    if (disposed) return
    await pollOnce()
    if (disposed) return
    if (pendingOutlineIds(outlines, photoIds).length === 0) {
      finished.value = true
      return
    }
    if (now() - startAt >= deadlineMs) {
      timedOut.value = true // 무한 대기 방지 — UI 는 "그냥 진행" 허용
      return
    }
    interval = nextBackoff(interval)
    timer = schedule(loop, interval)
  }

  loop()

  onScopeDispose(() => {
    disposed = true
    if (timer) unschedule(timer)
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
  })

  return { outlines, summary, timedOut, finished }
}
