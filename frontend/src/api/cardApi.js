import instance from './instance'

// 카드 문구 생성 API (log 트랙, S3-LOG-06 4단계).
// 백엔드 계약 = POST /photos/{photoId}/card-caption → ApiResponse<CardCaptionResult>.
// payload = { response: { objects:[{itemId, anchor, note}], closing:{text} }, warnings:[...] }
//  - 한 사진(=한 카드)의 외곽선(READY)에서 서버가 문구 입력을 파생해 LLM 으로 생성한다(클라가 items
//    안 보냄). buildScene 입력은 result.response 만 쓴다(warnings 는 차단 말고 안내용).
//  - ⚠️ GMS(gpt-4o-mini) 호출당 크레딧이 차감된다 → 호출측은 세션 캐시·in-flight 가드·자동 재시도
//    금지로 보호한다(useCardCaptions).
//  - LLM 응답은 공용 instance 의 짧은 timeout(10s)을 넘길 수 있다. FE 가 먼저 끊으면 BE 의 GMS 호출은
//    계속 진행(크레딧 차감)되는데 사용자는 실패로 보고 재시도 → 중복 과금. 그래서 이 요청만 timeout 을
//    풀어(0=BE 가 끝낼 때까지 대기) BE 의 판정을 그대로 받는다(BE 가 자체 timeout 으로 경계).
export async function fetchCardCaption(photoId, { signal } = {}) {
  const { data } = await instance.post(`/photos/${photoId}/card-caption`, null, { signal, timeout: 0 })
  return data.data
}

export async function saveTripCard(tripId, photoId, blob, { signal } = {}) {
  const formData = new FormData()
  formData.append('photoId', String(photoId))
  formData.append('file', blob, `triplog-card-${photoId}.png`)

  const { data } = await instance.post(`/trips/${tripId}/cards`, formData, {
    signal,
    timeout: 0,
  })
  return data.data
}

export async function fetchTripCards(tripId, { signal } = {}) {
  const { data } = await instance.get(`/trips/${tripId}/cards`, { signal })
  return data.data ?? []
}

export async function fetchMemories({ signal } = {}) {
  const { data } = await instance.get('/memories', { signal })
  return data.data ?? []
}

export async function fetchCardImage(cardId, { signal } = {}) {
  const { data } = await instance.get(`/cards/${cardId}/image`, {
    signal,
    responseType: 'blob',
  })
  return data
}

export async function deleteTripCard(cardId) {
  const { data } = await instance.delete(`/cards/${cardId}`)
  return data.data
}
