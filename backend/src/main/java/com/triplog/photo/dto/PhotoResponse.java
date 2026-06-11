package com.triplog.photo.dto;

import com.triplog.photo.domain.Photo;

import java.time.LocalDateTime;

/**
 * 업로드 결과 사진 메타 응답. url 은 본인 사진 원본을 받는 서빙 엔드포인트다(#38, 소유자만).
 *
 * tripId(여행 연결, #37)는 연결 API 의 직접 결과라 노출한다.
 *
 * EXIF(#36)는 사진 화면(업로드 큐·갤러리)에서 상태로 쓰이므로 FE 도입(S2-LOG-05 #54)에 맞춰 노출한다:
 *  - takenAt    : 촬영시각 그대로(없으면 null).
 *  - hasGps     : GPS 좌표 "유무"만 노출한다. 좌표 실값(위경도)은 응답에 싣지 않는다 — 업로드 화면엔
 *                 유무 배지만 필요하고, 좌표는 민감정보라 데이터 최소화. 지도뷰(#55)에서 좌표가
 *                 필요해지면 그때 소유자 전용 경로로 별도 노출한다.
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
        LocalDateTime takenAt,
        boolean hasGps,
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
                photo.getTakenAt(),
                // 위경도는 항상 세트(둘 다 있거나 둘 다 null) — 한쪽만 봐도 유무 판정에 충분(Photo 주석).
                photo.getLatitude() != null,
                "/photos/" + photo.getId() + "/content");
    }
}
