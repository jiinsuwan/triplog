package com.triplog.photo.dto;

import com.triplog.photo.domain.Photo;

import java.time.LocalDateTime;

/**
 * 업로드 결과 사진 메타 응답. url 은 본인 사진 원본을 받는 서빙 엔드포인트다(#38, 소유자만).
 *
 * tripId(여행 연결, #37)는 연결 API 의 직접 결과라 노출한다. 반면 EXIF(takenAt/위경도, #36)는
 * 화면(갤러리)용이라 FE 도입 시까지 미노출 — 응답 계약을 아직 넓히지 않는다.
 */
public record PhotoResponse(
        Long id,
        Long userId,
        String originalFilename,
        String storedFilename,
        String contentType,
        long sizeBytes,
        LocalDateTime createdAt,
        Long tripId,
        String url) {

    public static PhotoResponse from(Photo photo) {
        return new PhotoResponse(
                photo.getId(),
                photo.getUserId(),
                photo.getOriginalFilename(),
                photo.getStoredFilename(),
                photo.getContentType(),
                photo.getSizeBytes(),
                photo.getCreatedAt(),
                photo.getTripId(),
                "/photos/" + photo.getId() + "/content");
    }
}
