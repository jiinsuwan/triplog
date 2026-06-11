let kakaoMapPromise = null
const KAKAO_MAP_TIMEOUT_MS = 8000

export function hasKakaoMapKey() {
  return Boolean(import.meta.env.VITE_KAKAO_MAP_KEY)
}

export function loadKakaoMaps() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Kakao Maps SDK can only be loaded in a browser.'))
  }

  if (window.kakao?.maps?.Map && window.kakao?.maps?.services) {
    return Promise.resolve(window.kakao)
  }

  const appKey = import.meta.env.VITE_KAKAO_MAP_KEY
  if (!appKey) {
    return Promise.reject(new Error('VITE_KAKAO_MAP_KEY is not configured.'))
  }

  if (kakaoMapPromise) {
    return kakaoMapPromise
  }

  kakaoMapPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-triplog-kakao-map]')
    let settled = false
    let timer = null

    const fail = (message) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      kakaoMapPromise = null
      reject(new Error(message))
    }

    const succeed = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(window.kakao)
    }

    const resolveWhenReady = () => {
      if (!window.kakao?.maps) {
        fail('카카오맵 SDK가 window.kakao.maps를 제공하지 않았습니다.')
        return
      }
      window.kakao.maps.load(() => {
        if (!window.kakao?.maps?.Map || !window.kakao?.maps?.services) {
          fail('카카오맵 SDK 초기화는 끝났지만 지도/검색 라이브러리를 사용할 수 없습니다.')
          return
        }
        succeed()
      })
    }

    timer = window.setTimeout(() => {
      fail('카카오맵 SDK 로드 시간이 초과되었습니다.')
    }, KAKAO_MAP_TIMEOUT_MS)

    if (existing) {
      existing.addEventListener('load', resolveWhenReady, { once: true })
      existing.addEventListener('error', () => fail('카카오맵 SDK 스크립트를 불러오지 못했습니다.'), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.dataset.triplogKakaoMap = 'true'
    script.async = true
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=${encodeURIComponent(
      appKey,
    )}&libraries=services`
    script.addEventListener('load', resolveWhenReady, { once: true })
    script.addEventListener('error', () => fail('카카오맵 SDK 스크립트를 불러오지 못했습니다.'), {
      once: true,
    })
    document.head.appendChild(script)
  })

  return kakaoMapPromise
}
