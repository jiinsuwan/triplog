import { onScopeDispose } from 'vue'
import { fetchPhotoContent as defaultFetch } from '@/api/photoApi'

// 인증 사진 표시 공용 모듈 (S2-LOG-06 #55).
//
// 백엔드는 사진 원본(GET /photos/{id}/content)을 소유자 전용·Cache-Control: no-store 로
// 내려준다 → <img src="/photos/3/content"> 처럼 직접 박을 수 없다(인증 헤더가 안 붙고,
// 캐시도 막혀 있다). 그래서 공용 instance 로 blob 을 받아 objectURL 을 만들어 쓴다.
//
// objectURL 은 명시적으로 revokeObjectURL 하지 않으면 문서 수명 내내 누수된다. 그래서
// 생성·캐시·해제를 스코프(컴포넌트) 단위로 한곳에서 관리한다 — useUploadQueue 와 같은 이유로
// 전역 store 가 아니라 컴포저블이다(화면 수명에 묶인 일시 자원).

export function usePhotoContent({ api } = {}) {
  // api 주입은 테스트 편의. 기본은 실제 photoApi.
  const fetchContent = api?.fetchPhotoContent ?? defaultFetch

  // photoId → objectURL. 같은 사진을 여러 썸네일이 쓰면 fetch·objectURL 을 1개로 공유한다.
  const cache = new Map()
  // photoId → in-flight Promise. 같은 id 동시 요청이 와도 네트워크 fetch 는 1회만 나간다.
  const inflight = new Map()
  // 진행 중 요청의 AbortController 모음 — dispose 시 일괄 중단.
  const controllers = new Set()
  let disposed = false

  // photoId 의 objectURL 을 반환한다. 캐시 히트면 fetch 없이 즉시, 진행 중이면 그 Promise 를 공유.
  function load(photoId) {
    if (cache.has(photoId)) return Promise.resolve(cache.get(photoId))
    if (inflight.has(photoId)) return inflight.get(photoId)

    const controller = new AbortController()
    controllers.add(controller)

    const promise = (async () => {
      try {
        const blob = await fetchContent(photoId, { signal: controller.signal })
        const url = URL.createObjectURL(blob)
        // 함정: fetch 가 도는 사이 스코프가 해제됐다면(언마운트), 방금 만든 objectURL 을
        // revoke 할 주체가 없다 — dispose 의 캐시 순회는 이미 끝났기 때문이다. 누수를 막으려
        // 즉시 해제하고 캐시에 넣지 않는다(지연 도착분 누수 경합 차단).
        if (disposed) {
          URL.revokeObjectURL(url)
          return url
        }
        cache.set(photoId, url)
        return url
      } finally {
        inflight.delete(photoId)
        controllers.delete(controller)
      }
    })()

    inflight.set(photoId, promise)
    return promise
  }

  // 스코프(컴포넌트) 해제 시 진행 중 요청 중단 + 만든 objectURL 전부 해제 — 메모리 누수 방지.
  onScopeDispose(() => {
    disposed = true
    controllers.forEach((c) => c.abort())
    controllers.clear()
    cache.forEach((url) => URL.revokeObjectURL(url))
    cache.clear()
  })

  return { load }
}
