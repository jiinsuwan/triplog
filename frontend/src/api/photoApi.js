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
export function uploadPhoto(file, { onUploadProgress, signal } = {}) {
  const formData = new FormData()
  // 키는 반드시 'files' — 컨트롤러 @RequestParam("files") 와 일치해야 한다.
  // Content-Type 은 지정하지 않는다: axios 가 FormData 의 boundary 를 자동으로 채운다.
  formData.append('files', file)
  return instance
    .post('/photos', formData, { timeout: UPLOAD_TIMEOUT_MS, onUploadProgress, signal })
    .then((res) => res.data.data[0])
}

// PATCH /photos/{id}/trip { tripId } → 연결 후 갱신된 PhotoResponse
export function linkPhotoToTrip(photoId, tripId) {
  return instance.patch(`/photos/${photoId}/trip`, { tripId }).then((res) => res.data.data)
}

// DELETE /photos/{id}/trip → 연결 해제 후 갱신된 PhotoResponse(사진 자체는 삭제 안 함)
export function unlinkPhotoFromTrip(photoId) {
  return instance.delete(`/photos/${photoId}/trip`).then((res) => res.data.data)
}

// GET /photos?tripId= → 해당 여행에 연결된 사진 목록(#55 갤러리에서 재사용)
export function fetchTripPhotos(tripId) {
  return instance.get('/photos', { params: { tripId } }).then((res) => res.data.data)
}
