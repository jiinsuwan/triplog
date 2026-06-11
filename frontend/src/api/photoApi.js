import instance from './instance'

// 사진 API 함수 (architecture §3, log 트랙). 백엔드 계약 = PhotoController(/photos/*).
// 응답은 공통 ApiResponse<T> 래퍼이므로 data.data(payload)만 꺼내 반환한다.

// 업로드는 대용량(최대 20MB)이라 공용 인스턴스의 짧은 timeout(10s)을 요청 단위로 끈다.
// 공유 영역인 instance.js 전역값은 건드리지 않는다 — 다른 호출에 영향을 주지 않기 위해 per-request 로만 오버라이드.
// 0 = 무제한. 멈춘 업로드 판단은 onUploadProgress(진행 정지)로 큐가 처리한다.
const UPLOAD_TIMEOUT_MS = 0

// POST /photos (multipart) — 파일 1개씩 보낸다. 백엔드는 다중(List)을 지원하지만,
// 큐의 "행별 진행률·개별 재시도"를 위해 의도적으로 파일당 1요청을 쓴다(원자적 배치는 포기).
// 응답은 List<PhotoResponse> 이므로 단일 업로드의 결과는 첫 항목이다.
//
// 알려진 한계: 업로드 중 액세스 토큰이 만료되면 공용 인터셉터(instance.js)가 동일 config(이미
// 소비된 FormData)로 401 재시도를 시도한다 → 본문 손상으로 회복이 깨질 수 있다(데이터 정합성
// 사고는 아니고, 실패 시 큐가 재시도로 회복). 대용량 업로드 401 회복 강화는 후속 과제.
export async function uploadPhoto(file, { onUploadProgress, signal } = {}) {
  const formData = new FormData()
  // 키는 반드시 'files' — 컨트롤러 @RequestParam("files") 와 일치해야 한다.
  // Content-Type 은 지정하지 않는다: axios 가 FormData 의 boundary 를 자동으로 채운다.
  formData.append('files', file)
  const { data } = await instance.post('/photos', formData, {
    timeout: UPLOAD_TIMEOUT_MS,
    onUploadProgress,
    signal,
  })
  return data.data[0]
}

// PATCH /photos/{id}/trip { tripId } → 연결 후 갱신된 PhotoResponse
export async function linkPhotoToTrip(photoId, tripId) {
  const { data } = await instance.patch(`/photos/${photoId}/trip`, { tripId })
  return data.data
}

// DELETE /photos/{id}/trip → 연결 해제 후 갱신된 PhotoResponse(사진 자체는 삭제 안 함)
export async function unlinkPhotoFromTrip(photoId) {
  const { data } = await instance.delete(`/photos/${photoId}/trip`)
  return data.data
}

// GET /photos?tripId= → 해당 여행에 연결된 사진 목록(#55 갤러리에서 재사용)
export async function fetchTripPhotos(tripId) {
  const { data } = await instance.get('/photos', { params: { tripId } })
  return data.data
}
