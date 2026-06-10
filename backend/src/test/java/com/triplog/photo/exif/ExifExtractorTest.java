package com.triplog.photo.exif;

import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * ExifExtractor 단위 테스트(Spring context 불필요 — 순수 컴포넌트).
 *
 * 기대값은 구현이 아니라 픽스처의 실측 EXIF 에서 끌어왔다(거짓 안전 방지):
 *   with-gps.jpg → DateTimeOriginal 2026:06:04 12:17:56, GPS 33.518747 / 126.499594 (제주).
 */
class ExifExtractorTest {

    private final ExifExtractor extractor = new ExifExtractor();

    @Test
    void extracts_taken_at_and_gps_from_real_photo() throws IOException {
        try (InputStream in = fixture("with-gps.jpg")) {
            ExifData data = extractor.extract(in);

            // 촬영시각: 타임존 없는 현지시각 그대로(서버 TZ 무관).
            assertThat(data.takenAt()).isEqualTo(LocalDateTime.of(2026, 6, 4, 12, 17, 56));
            assertThat(data.latitude()).isCloseTo(33.518747, within(1e-4));
            assertThat(data.longitude()).isCloseTo(126.499594, within(1e-4));
        }
    }

    @Test
    void returns_all_null_for_image_without_exif() {
        // 진짜 이미지지만 EXIF 디렉토리가 없는 경우(예: 합성 PNG) → 무예외·전부 null.
        ExifData data = extractor.extract(new ByteArrayInputStream(pngWithoutExif()));

        assertThat(data.takenAt()).isNull();
        assertThat(data.latitude()).isNull();
        assertThat(data.longitude()).isNull();
    }

    @Test
    void returns_all_null_for_non_image_bytes_without_error() {
        // 이미지조차 아닌 바이트(파싱 예외 경로) → 예외가 새어나오지 않고 빈 결과.
        ExifData data = extractor.extract(new ByteArrayInputStream("not an image".getBytes()));

        assertThat(data.takenAt()).isNull();
        assertThat(data.latitude()).isNull();
        assertThat(data.longitude()).isNull();
    }

    @Test
    void extracts_taken_at_only_when_gps_absent() throws IOException {
        // 실내·위치끄고 찍은 사진: 촬영시각은 있고 GPS 만 없음 → 좌표만 null(시각/GPS 독립).
        try (InputStream in = fixture("time-only.jpg")) {
            ExifData data = extractor.extract(in);

            assertThat(data.takenAt()).isEqualTo(LocalDateTime.of(2026, 6, 4, 12, 17, 56));
            assertThat(data.latitude()).isNull();
            assertThat(data.longitude()).isNull();
        }
    }

    @Test
    void keeps_gps_when_taken_at_is_malformed() throws IOException {
        // 시각 문자열이 비표준이면 takenAt 만 버리고 좌표는 살린다(부분 추출).
        try (InputStream in = fixture("bad-time.jpg")) {
            ExifData data = extractor.extract(in);

            assertThat(data.takenAt()).isNull();
            assertThat(data.latitude()).isCloseTo(33.518747, within(1e-4));
            assertThat(data.longitude()).isCloseTo(126.499594, within(1e-4));
        }
    }

    private InputStream fixture(String name) {
        InputStream in = getClass().getResourceAsStream("/fixtures/exif/" + name);
        assertThat(in).as("픽스처 %s 가 존재해야 한다", name).isNotNull();
        return in;
    }

    private static byte[] pngWithoutExif() {
        try {
            BufferedImage img = new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, "png", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
