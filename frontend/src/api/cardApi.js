import instance from './instance'

// 카드 문구 생성 API (log 트랙, S3-LOG-06 4단계).
// 백엔드 계약 = POST /photos/{photoId}/card-caption → ApiResponse<CardCaptionResult>.
// payload = { response: { objects:[{itemId, anchor, note}], closing:{text} }, warnings:[...] }
//  - 한 사진(=한 카드)의 외곽선(READY)에서 서버가 문구 입력을 파생해 LLM 으로 생성한다(클라가 items
//    안 보냄). buildScene 입력은 result.response 만 쓴다(warnings 는 차단 말고 안내용).
//  - ⚠️ GMS(gpt-4o-mini) 호출당 크레딧이 차감된다 → 호출측은 세션 캐시·in-flight 가드·자동 재시도
//    금지로 보호한다(useCardCaptions).
export async function fetchCardCaption(photoId, { signal } = {}) {
  const { data } = await instance.post(`/photos/${photoId}/card-caption`, null, { signal })
  return data.data
}
