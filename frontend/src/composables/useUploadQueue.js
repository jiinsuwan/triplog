import { reactive, computed, onScopeDispose } from 'vue'
import { uploadPhoto as defaultUpload, linkPhotoToTrip as defaultLink } from '@/api/photoApi'

// 사진 업로드 큐 (S2-LOG-05 #54). 화면 전용 일시 상태라 전역 store 가 아닌 컴포저블로 둔다.
//
// 행별 상태머신: pending → uploading → linking → linked
//   - failed   : 일시적 실패(네트워크·타임아웃·5xx) → 재시도 가능
//   - rejected : 재시도해도 소용없는 종료 — 클라 검증 탈락(형식·크기) 또는
//                서버가 거절한 비재시도 오류(400/413). 재시도 버튼을 띄우지 않는다.
// 재시도는 photoId 유무로 단계를 구분한다: 업로드는 됐는데 연결만 실패한 경우
// 재시도는 "연결(PATCH)만" 다시 한다 → 같은 사진을 다시 업로드해 중복 row 를 만들지 않는다.

// 클라 사전 검증은 UX 보조 필터다 — 최종 권위는 서버(PhotoService/ multipart 한도).
// 형식 화이트리스트는 백엔드 PhotoService.ALLOWED_TYPES 와 일치시킨다.
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
// 브라우저가 <img> 로 못 그리는 HEIC/HEIF 는 로컬 미리보기를 만들지 않는다(아이콘 폴백).
const PREVIEWABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// 백엔드 max-file-size(application.yml: 20MB)와 동일. Spring DataSize 기준 1MB=1024*1024.
export const MAX_FILE_BYTES = 20 * 1024 * 1024
// 동시 업로드 상한 — 업링크 대역 분할/타임아웃 폭주 방지.
const DEFAULT_CONCURRENCY = 3

export const QueueStatus = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  LINKING: 'linking',
  LINKED: 'linked',
  FAILED: 'failed',
  REJECTED: 'rejected',
}

// 파일 선택 다이얼로그 필터용 accept 속성값.
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(',')

export function useUploadQueue(tripId, { concurrency = DEFAULT_CONCURRENCY, api } = {}) {
  // api 주입은 테스트 편의. 기본은 실제 photoApi.
  const upload = api?.uploadPhoto ?? defaultUpload
  const link = api?.linkPhotoToTrip ?? defaultLink

  const items = reactive([])
  let seq = 0
  let active = 0

  const failedCount = computed(() => items.filter((it) => it.status === QueueStatus.FAILED).length)
  const linkedCount = computed(() => items.filter((it) => it.status === QueueStatus.LINKED).length)

  function addFiles(fileList) {
    for (const file of Array.from(fileList ?? [])) {
      items.push(createItem(file))
    }
    pump()
  }

  function createItem(file) {
    const rejection = validate(file)
    const previewUrl =
      !rejection && PREVIEWABLE_TYPES.includes(file.type) ? URL.createObjectURL(file) : null
    return {
      id: ++seq,
      file,
      name: file.name,
      previewUrl,
      status: rejection ? QueueStatus.REJECTED : QueueStatus.PENDING,
      progress: 0,
      photoId: null, // 업로드 성공 시 채워짐 → 재시도가 "연결만" 재개하는 기준.
      takenAt: null,
      hasGps: false,
      error: rejection ?? null,
      _abort: null,
    }
  }

  function validate(file) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return { message: '지원하지 않는 형식입니다 (JPEG·PNG·WebP·HEIC).', retryable: false }
    }
    if (file.size > MAX_FILE_BYTES) {
      return { message: '파일이 너무 큽니다 (최대 20MB).', retryable: false }
    }
    return null
  }

  // 동시 상한 안에서 pending 항목을 골라 처리. 선택 즉시 상태를 바꿔 같은 항목 중복 선택을 막는다.
  function pump() {
    while (active < concurrency) {
      const next = items.find((it) => it.status === QueueStatus.PENDING)
      if (!next) break
      next.status = next.photoId == null ? QueueStatus.UPLOADING : QueueStatus.LINKING
      active += 1
      process(next).finally(() => {
        active -= 1
        pump()
      })
    }
  }

  async function process(item) {
    try {
      // 1단계: 업로드 — 아직 photoId 없을 때만(재시도가 업로드를 되풀이해 중복 사진을 만들지 않게).
      if (item.photoId == null) {
        item.status = QueueStatus.UPLOADING
        item.error = null
        item._abort = new AbortController()
        const photo = await upload(item.file, {
          signal: item._abort.signal,
          onUploadProgress: (e) => {
            if (e?.total) item.progress = Math.round((e.loaded / e.total) * 100)
          },
        })
        item.photoId = photo.id
        item.takenAt = photo.takenAt ?? null
        item.hasGps = !!photo.hasGps
        item.progress = 100
      }
      // 2단계: 현재 여행에 자동 연결.
      item.status = QueueStatus.LINKING
      await link(item.photoId, tripId)
      item.status = QueueStatus.LINKED
    } catch (err) {
      const error = classifyError(err)
      item.error = error
      // 비재시도 오류(형식·크기 등 서버 거절)는 REJECTED 로 → 재시도 버튼을 띄우지 않는다.
      item.status = error.retryable ? QueueStatus.FAILED : QueueStatus.REJECTED
    } finally {
      item._abort = null
    }
  }

  // 실패 항목만 재시도. 진행 중·완료·검증탈락(REJECTED)은 무시(중복 트리거 방지).
  function retry(id) {
    const item = items.find((it) => it.id === id)
    if (!item || item.status !== QueueStatus.FAILED) return
    item.status = QueueStatus.PENDING
    item.error = null
    pump()
  }

  function remove(id) {
    const idx = items.findIndex((it) => it.id === id)
    if (idx === -1) return
    cleanup(items.splice(idx, 1)[0])
  }

  function cleanup(item) {
    item._abort?.abort() // 진행 중 업로드면 중단(언마운트·행 제거 시).
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  }

  // 스코프(컴포넌트) 해제 시 모든 objectURL 해제 + 진행 중 업로드 중단 — 메모리 누수 방지.
  onScopeDispose(() => items.forEach(cleanup))

  return { items, addFiles, retry, remove, failedCount, linkedCount }
}

function classifyError(err) {
  const status = err?.response?.status
  if (status === 400) return { message: '지원하지 않는 형식입니다.', retryable: false }
  if (status === 413) return { message: '파일이 너무 큽니다 (최대 20MB).', retryable: false }
  // 응답 없음(네트워크·타임아웃) 또는 5xx → 일시적, 재시도 가능.
  return { message: '업로드 실패 · 재시도하세요.', retryable: true }
}
