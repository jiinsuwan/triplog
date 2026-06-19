import instance from './instance'

// 외곽선(윤곽선) 전처리 상태/결과 API (log 트랙, S3-LOG-06 3단계).
// 백엔드 계약 = PhotoController GET /photos/{id}/outline → ApiResponse<PhotoOutlineResponse>.
// 응답 payload = { photoId, status: 'PENDING'|'READY'|'FAILED', items }
//  - items 는 status==='READY' 일 때만 채워진다(그 외 null). 백엔드는 items 를 타입 없는
//    JSON 패스스루로 내려주므로(계약 검증자는 FE) 형식은 OUTLINE_API 계약을 따른다.
export async function fetchPhotoOutline(photoId, { signal } = {}) {
  const { data } = await instance.get(`/photos/${photoId}/outline`, { signal })
  return data.data
}
