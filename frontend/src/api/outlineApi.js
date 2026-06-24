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

// 외곽선 보정 (S4-LOG-01 PR2). 백엔드 = PhotoController POST /photos/{id}/outline/{tap,box,refine,refine/apply},
// DELETE /photos/{id}/outline/items/{itemId}. 좌표는 사진 정규화 0~1.
// tap/box 응답 = OutlineCorrectionResponse { itemId, polygons }. 객체를 못 잡으면 itemId=-1, polygons=[].

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

// 정제 미리보기 = itemId 객체를 +/− 점으로 다듬은 결과만 받는다(저장 안 함). pos=넣기, neg=빼기.
// 응답 = OutlineRefinePreview { itemId, polygons, absorbItemIds }. 못 잡으면 itemId=-1, polygons=[].
// absorbItemIds = 적용 시 이 객체에 합쳐(삭제)질 다른 객체 id 들.
export async function previewRefine(photoId, { itemId, pos, neg }, { signal } = {}) {
  const { data } = await instance.post(`/photos/${photoId}/outline/refine`, { itemId, pos, neg }, { signal })
  return data.data
}

// 정제 적용 = 미리보기로 받은 polygons·absorbItemIds 를 그대로 보내 저장한다(inference 없음).
// 응답 = OutlineCorrectionResponse { itemId, polygons }.
export async function applyRefine(photoId, { itemId, polygons, absorbItemIds }, { signal } = {}) {
  const { data } = await instance.post(
    `/photos/${photoId}/outline/refine/apply`,
    { itemId, polygons, absorbItemIds },
    { signal },
  )
  return data.data
}

// 삭제 = 객체를 외곽선 통째로 영속 삭제(빼기). 응답 본문 없음.
export async function deleteOutlineItem(photoId, itemId, { signal } = {}) {
  await instance.delete(`/photos/${photoId}/outline/items/${itemId}`, { signal })
}
