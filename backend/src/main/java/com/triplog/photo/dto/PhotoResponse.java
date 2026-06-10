package com.triplog.photo.dto;

import com.triplog.photo.domain.Photo;

import java.time.LocalDateTime;

/**
 * 업로드 결과 사진 메타 응답. storedFilename 은 후속 정적 서빙(#38)에서 URL 로 파생할 참조다.
 *
 * EXIF(takenAt/위경도)는 추출·저장(#36)하되 의도적으로 이 응답엔 노출하지 않는다 —
 * 사진 화면(FE)이 S2 범위 밖이라 응답 계약을 아직 넓히지 않는다. FE 도입 시 필드를 추가한다.
 */
public record PhotoResponse(
        Long id,
        Long userId,
        String originalFilename,
        String storedFilename,
        String contentType,
        long sizeBytes,
        LocalDateTime createdAt) {

    public static PhotoResponse from(Photo photo) {
        return new PhotoResponse(
                photo.getId(),
                photo.getUserId(),
                photo.getOriginalFilename(),
                photo.getStoredFilename(),
                photo.getContentType(),
                photo.getSizeBytes(),
                photo.getCreatedAt());
    }
}
