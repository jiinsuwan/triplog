package com.triplog.photo.controller;

import com.triplog.auth.jwt.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PhotoControllerIntegrationTest {

    private static final long USER_ID = 2001L;
    private static final long OTHER_ID = 2002L;

    // @TempDir + @DynamicPropertySource 의 초기화 순서가 보장되지 않아, 직접 생성한다.
    private static final Path UPLOAD_DIR = createTempDir();

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.upload-dir", UPLOAD_DIR::toString);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider tokenProvider;

    @BeforeEach
    void setUp() throws IOException {
        insertUser(USER_ID, "photo-owner@example.com");
        clearUploadDir();
    }

    @Test
    void uploads_multiple_photos_records_meta_and_writes_files() throws Exception {
        mockMvc.perform(multipart("/photos")
                        .file(imageFile("beach.jpg", MediaType.IMAGE_JPEG_VALUE, 1024))
                        .file(imageFile("mountain.png", MediaType.IMAGE_PNG_VALUE, 2048))
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].userId").value(USER_ID))
                .andExpect(jsonPath("$.data[0].originalFilename").value("beach.jpg"))
                .andExpect(jsonPath("$.data[0].contentType").value("image/jpeg"))
                .andExpect(jsonPath("$.data[0].sizeBytes").value(1024))
                .andExpect(jsonPath("$.data[0].storedFilename").isNotEmpty())
                .andExpect(jsonPath("$.data[1].originalFilename").value("mountain.png"))
                .andExpect(jsonPath("$.data[1].contentType").value("image/png"));

        // 메타가 DB 에 2건 기록되었는가
        assertThat(countPhotos()).isEqualTo(2);
        // 실제 파일이 디스크에 2개 쓰였는가
        assertThat(storedFileCount()).isEqualTo(2);
    }

    @Test
    void rejects_non_image_without_writing_anything() throws Exception {
        mockMvc.perform(multipart("/photos")
                        .file(new MockMultipartFile("files", "note.txt", MediaType.TEXT_PLAIN_VALUE,
                                "not an image".getBytes()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PHOTO_002"));

        // 형식 검증은 저장 전에 끝나므로 DB·디스크 모두 비어 있어야 한다.
        assertThat(countPhotos()).isZero();
        assertThat(storedFileCount()).isZero();
    }

    @Test
    void rejects_request_with_no_files() throws Exception {
        mockMvc.perform(multipart("/photos")
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PHOTO_001"));
    }

    @Test
    void rejects_unauthenticated_upload() throws Exception {
        mockMvc.perform(multipart("/photos")
                        .file(imageFile("beach.jpg", MediaType.IMAGE_JPEG_VALUE, 1024)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_001"));

        assertThat(countPhotos()).isZero();
        assertThat(storedFileCount()).isZero();
    }

    @Test
    void extracts_and_stores_exif_when_present() throws Exception {
        // EXIF·GPS 가 박힌 실제 사진(제주, 2026-06-04 12:17:56) → 촬영시각·좌표가 DB 에 채워진다.
        byte[] jpg = fixtureBytes("/fixtures/exif/with-gps.jpg");
        mockMvc.perform(multipart("/photos")
                        .file(new MockMultipartFile("files", "jeju.jpg", MediaType.IMAGE_JPEG_VALUE, jpg))
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isCreated());

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT taken_at, latitude, longitude FROM photos WHERE user_id = ?", USER_ID);
        // taken_at 은 타임존 없는 현지시각 그대로 저장된다(서버 TZ 무관).
        assertThat(LocalDateTime.parse(row.get("taken_at").toString()))
                .isEqualTo(LocalDateTime.of(2026, 6, 4, 12, 17, 56));
        assertThat(((Number) row.get("latitude")).doubleValue()).isCloseTo(33.518747, within(1e-4));
        assertThat(((Number) row.get("longitude")).doubleValue()).isCloseTo(126.499594, within(1e-4));
    }

    @Test
    void stores_null_exif_when_absent() throws Exception {
        // EXIF 없는 사진도 오류 없이 업로드되고, 촬영시각·좌표는 null 로 남는다.
        mockMvc.perform(multipart("/photos")
                        .file(imageFile("blank.png", MediaType.IMAGE_PNG_VALUE, 2048))
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isCreated());

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT taken_at, latitude, longitude FROM photos WHERE user_id = ?", USER_ID);
        assertThat(row.get("taken_at")).isNull();
        assertThat(row.get("latitude")).isNull();
        assertThat(row.get("longitude")).isNull();
    }

    @Test
    void extracts_exif_per_file_in_multi_upload() throws Exception {
        // 다중 업로드에서 EXIF 가 파일별로 독립 처리되는가:
        // EXIF 있는 사진만 좌표가 채워지고, 없는 사진은 null 로 남는다(좌표가 새지 않음).
        byte[] jpg = fixtureBytes("/fixtures/exif/with-gps.jpg");
        mockMvc.perform(multipart("/photos")
                        .file(new MockMultipartFile("files", "jeju.jpg", MediaType.IMAGE_JPEG_VALUE, jpg))
                        .file(imageFile("blank.png", MediaType.IMAGE_PNG_VALUE, 2048))
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isCreated());

        Integer withGps = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM photos WHERE user_id = ? AND latitude IS NOT NULL", Integer.class, USER_ID);
        Integer withoutGps = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM photos WHERE user_id = ? AND latitude IS NULL", Integer.class, USER_ID);
        assertThat(withGps).isEqualTo(1);
        assertThat(withoutGps).isEqualTo(1);
    }

    @Test
    void links_photo_to_my_trip() throws Exception {
        long tripId = insertTrip(USER_ID);
        long photoId = insertPhoto(USER_ID, null);

        mockMvc.perform(patch("/photos/" + photoId + "/trip")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tripId\": " + tripId + "}")
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.tripId").value(tripId));

        Long linked = jdbcTemplate.queryForObject(
                "SELECT trip_id FROM photos WHERE id = ?", Long.class, photoId);
        assertThat(linked).isEqualTo(tripId);
    }

    @Test
    void rejects_linking_to_others_trip() throws Exception {
        insertUser(OTHER_ID, "other@example.com");
        long othersTrip = insertTrip(OTHER_ID);
        long myPhoto = insertPhoto(USER_ID, null);

        mockMvc.perform(patch("/photos/" + myPhoto + "/trip")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tripId\": " + othersTrip + "}")
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("TRIP_002"));
    }

    @Test
    void rejects_linking_others_photo() throws Exception {
        insertUser(OTHER_ID, "other@example.com");
        long myTrip = insertTrip(USER_ID);
        long othersPhoto = insertPhoto(OTHER_ID, null);

        mockMvc.perform(patch("/photos/" + othersPhoto + "/trip")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tripId\": " + myTrip + "}")
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PHOTO_005"));
    }

    @Test
    void lists_then_unlinks_trip_photos() throws Exception {
        long tripId = insertTrip(USER_ID);
        long p1 = insertPhoto(USER_ID, tripId);
        insertPhoto(USER_ID, tripId);
        insertPhoto(USER_ID, null); // 연결 안 된 사진은 목록에 안 나온다

        mockMvc.perform(get("/photos").param("tripId", String.valueOf(tripId))
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2));

        mockMvc.perform(delete("/photos/" + p1 + "/trip")
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.tripId").value(nullValue()));

        Long after = jdbcTemplate.queryForObject(
                "SELECT trip_id FROM photos WHERE id = ?", Long.class, p1);
        assertThat(after).isNull();
    }

    private byte[] fixtureBytes(String classpathLocation) throws IOException {
        try (InputStream in = getClass().getResourceAsStream(classpathLocation)) {
            assertThat(in).as("픽스처 %s 가 존재해야 한다", classpathLocation).isNotNull();
            return in.readAllBytes();
        }
    }

    private MockMultipartFile imageFile(String filename, String contentType, int size) {
        return new MockMultipartFile("files", filename, contentType, new byte[size]);
    }

    private int countPhotos() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM photos WHERE user_id = ?", Integer.class, USER_ID);
        return count == null ? 0 : count;
    }

    private long storedFileCount() throws IOException {
        if (!Files.exists(UPLOAD_DIR)) {
            return 0;
        }
        try (var files = Files.list(UPLOAD_DIR)) {
            return files.count();
        }
    }

    private void clearUploadDir() throws IOException {
        if (!Files.exists(UPLOAD_DIR)) {
            return;
        }
        try (var files = Files.list(UPLOAD_DIR)) {
            for (Path path : files.toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    private String bearer(long userId) {
        return "Bearer " + tokenProvider.createAccessToken(userId);
    }

    private void insertUser(long id, String email) {
        jdbcTemplate.update("""
                        INSERT INTO users (id, email, password, nickname)
                        VALUES (?, ?, ?, ?)
                        """,
                id, email, "{noop}password", "tester");
    }

    private long insertTrip(long userId) {
        jdbcTemplate.update("""
                        INSERT INTO trips (user_id, title, start_date, end_date, region, theme, status)
                        VALUES (?, '제주 여행', '2026-06-01', '2026-06-03', '제주', '힐링', 'PLANNED')
                        """,
                userId);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM trips WHERE user_id = ? ORDER BY id DESC LIMIT 1", Long.class, userId);
    }

    private long insertPhoto(long userId, Long tripId) {
        String stored = "stored-" + userId + "-" + System.nanoTime() + ".jpg";
        jdbcTemplate.update("""
                        INSERT INTO photos (user_id, original_filename, stored_filename, content_type, size_bytes, trip_id)
                        VALUES (?, 'o.jpg', ?, 'image/jpeg', 100, ?)
                        """,
                userId, stored, tripId);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM photos WHERE stored_filename = ?", Long.class, stored);
    }

    private static Path createTempDir() {
        try {
            return Files.createTempDirectory("triplog-photo-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
