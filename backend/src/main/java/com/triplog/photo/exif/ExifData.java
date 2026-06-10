package com.triplog.photo.exif;

import java.time.LocalDateTime;

/**
 * 사진에서 추출한 EXIF 값(S2-LOG-02 #36). 모든 필드는 nullable 이다 —
 * EXIF 가 없거나 깨진 사진도 정상 처리해야 하므로(없으면 null).
 *
 * 위도·경도는 항상 세트다: GPS 가 없으면 둘 다 null, 있으면 둘 다 채워진다.
 * 반면 takenAt 은 GPS 와 독립적이라 "시각만 있고 좌표는 없는" 조합이 정상이다.
 */
public record ExifData(LocalDateTime takenAt, Double latitude, Double longitude) {

    private static final ExifData EMPTY = new ExifData(null, null, null);

    /** EXIF 를 읽지 못한 경우(미존재·손상·미지원 포맷)의 빈 결과. */
    public static ExifData empty() {
        return EMPTY;
    }
}
