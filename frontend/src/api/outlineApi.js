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

// 외곽선 보정 (S4-LOG-01 PR2). 백엔드 = PhotoController POST /photos/{id}/outline/{tap,box,refine},
// DELETE /photos/{id}/outline/items/{itemId}. 좌표는 사진 정규화 0~1.
// tap/box/refine 응답 = OutlineCorrectionResponse { itemId, polygons }. 객체를 못 잡으면 itemId=-1, polygons=[].

// 탭 = 한 점으로 객체 외곽선 추가. point = [x, y].
export async function tapOutline(photoId, point, { signal } = {}) {
  const { data } = await instance.post(`/photos/${photoId}/outline/tap`, { point }, { signal })
  return data.data
}

// 박스 = 영역으로 객체 외곽선 추가. box = [x1, y1, x2, y2] (x1<x2, y1<y2).
export async function boxOutline(photoId, box, { signal } = {}) {
  const { data } = await instance.post(`/photos/${photoId}/outline/box`, { box }, { signal })
  return data.data
}

// 정제 = itemId 객체를 +/− 점으로 다듬어 교체. pos=넣기, neg=빼기. pos 점이 다른 객체 안쪽이면 병합.
export async function refineOutline(photoId, { itemId, pos, neg }, { signal } = {}) {
  const { data } = await instance.post(`/photos/${photoId}/outline/refine`, { itemId, pos, neg }, { signal })
  return data.data
}

// 삭제 = 객체를 외곽선 통째로 영속 삭제(빼기). 응답 본문 없음.
export async function deleteOutlineItem(photoId, itemId, { signal } = {}) {
  await instance.delete(`/photos/${photoId}/outline/items/${itemId}`, { signal })
}
