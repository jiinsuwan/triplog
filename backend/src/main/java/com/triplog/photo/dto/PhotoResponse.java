package com.triplog.photo.dto;

import com.triplog.photo.domain.Photo;

import java.time.LocalDateTime;

/**
 * 업로드 결과 사진 메타 응답. storedFilename 은 후속 정적 서빙(#38)에서 URL 로 파생할 참조다.
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
