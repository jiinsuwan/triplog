// 스티커(두들 SVG) 흰색 래스터 캐시.
// SVG가 stroke="currentColor"라 <img>로 그리면 검정으로 나온다 → 문자열에서 currentColor를 흰색으로
// 치환하고, 선명도를 위해 큰 픽셀(256)로 박아 data URI 이미지로 만든다. src 기준으로 캐시한다.

const loading = new Map() // src -> Promise<HTMLImageElement>
const ready = new Map() // src -> HTMLImageElement(로드 완료)

function loadWhite(src) {
  if (loading.has(src)) return loading.get(src)
  const p = fetch(src)
    .then((r) => r.text())
    .then(
      (svg) =>
        new Promise((resolve, reject) => {
          const white = svg
            .replace(/currentColor/g, '#ffffff')
            .replace('<svg ', '<svg width="256" height="256" ')
          const img = new Image()
          img.onload = () => {
            ready.set(src, img)
            resolve(img)
          }
          img.onerror = reject
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(white)
        }),
    )
  loading.set(src, p)
  return p
}

// 렌더용 동기 게터: 로드됐으면 이미지, 아니면 null(+ 로드 시작, 완료 시 onReady로 재렌더 트리거).
export function getStickerImage(src, onReady) {
  if (ready.has(src)) return ready.get(src)
  loadWhite(src)
    .then(() => onReady && onReady())
    .catch(() => {})
  return null
}

// export용: 주어진 src 전부 로드 완료를 기다린다.
export function ensureStickerImages(srcs) {
  return Promise.all([...new Set(srcs)].map((src) => loadWhite(src).catch(() => null)))
}
