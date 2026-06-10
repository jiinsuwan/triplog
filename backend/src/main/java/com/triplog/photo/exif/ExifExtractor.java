package com.triplog.photo.exif;

import com.drew.imaging.ImageMetadataReader;
import com.drew.lang.GeoLocation;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.GpsDirectory;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 사진 바이트에서 촬영시각·GPS(EXIF)를 추출한다(S2-LOG-02 #36).
 *
 * 설계 원칙(이 이슈의 Acceptance: "EXIF 없어도 오류 없이 처리"):
 *  - EXIF 추출 실패는 절대 업로드를 막지 않는다. 모든 파싱 예외를 격리하고 빈 결과를 돌려준다.
 *  - 촬영시각은 라이브러리의 Date 변환(getDateOriginal) 대신 EXIF 원문 문자열을 직접 파싱한다.
 *    EXIF DateTimeOriginal 은 타임존 없는 현지시각이라, Date 변환은 서버 TimeZone 에 따라
 *    값이 틀어진다. 문자열 직접 파싱은 서버 환경과 무관하게 항상 같은 LocalDateTime 을 준다.
 *  - 위도·경도는 GeoLocation 단위로 세트 처리한다(한쪽만 있는 깨진 상태를 만들지 않는다).
 *
 * HEIC/HEIF: 실측상 HEIC 도 촬영시각·GPS 가 정상 추출된다(metadata-extractor 2.19.0, #36 검토 시
 * 실제 HEIC 3장 확인). 다만 모든 HEIC 변형을 보장하진 않으므로, 못 읽는 포맷은 다른 입력과
 * 동일하게 null 로 떨어진다(Acceptance 부합).
 */
@Component
public class ExifExtractor {

    // EXIF DateTimeOriginal 표준 포맷. 예: "2026:06:04 12:17:56"
    private static final DateTimeFormatter EXIF_DATETIME =
            DateTimeFormatter.ofPattern("yyyy:MM:dd HH:mm:ss");

    /** 사진 스트림에서 EXIF 를 추출한다. 읽지 못하면 {@link ExifData#empty()}. */
    public ExifData extract(InputStream in) {
        Metadata metadata;
        try {
            metadata = ImageMetadataReader.readMetadata(in);
        } catch (Exception e) {
            // EXIF 없음·손상·미지원 포맷 → 빈 결과. 업로드는 계속된다.
            return ExifData.empty();
        }
        LocalDateTime takenAt = extractTakenAt(metadata);
        GeoLocation location = extractLocation(metadata);
        if (location == null) {
            return new ExifData(takenAt, null, null);
        }
        return new ExifData(takenAt, location.getLatitude(), location.getLongitude());
    }

    // 촬영시각: ExifSubIFD 의 DateTimeOriginal 원문 문자열을 직접 LocalDateTime 으로 파싱.
    private LocalDateTime extractTakenAt(Metadata metadata) {
        ExifSubIFDDirectory dir = metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
        if (dir == null) {
            return null;
        }
        String raw = dir.getString(ExifSubIFDDirectory.TAG_DATETIME_ORIGINAL);
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return LocalDateTime.parse(raw.trim(), EXIF_DATETIME);
        } catch (Exception e) {
            return null; // 비표준 포맷의 시각은 버린다(시각만 null, 좌표는 살린다).
        }
    }

    // GPS: GeoLocation 으로 위경도를 한 쌍으로 얻는다. 좌표가 없거나 0,0 이면 null.
    private GeoLocation extractLocation(Metadata metadata) {
        GpsDirectory dir = metadata.getFirstDirectoryOfType(GpsDirectory.class);
        if (dir == null) {
            return null;
        }
        GeoLocation location = dir.getGeoLocation();
        if (location == null || location.isZero()) {
            return null;
        }
        return location;
    }
}
