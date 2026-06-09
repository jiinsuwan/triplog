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
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PhotoControllerIntegrationTest {

    private static final long USER_ID = 2001L;

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

    private static Path createTempDir() {
        try {
            return Files.createTempDirectory("triplog-photo-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
