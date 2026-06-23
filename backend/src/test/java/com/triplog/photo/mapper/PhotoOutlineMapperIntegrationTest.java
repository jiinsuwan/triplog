package com.triplog.photo.mapper;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.photo.domain.OutlineStatus;
import com.triplog.photo.domain.PhotoOutline;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PhotoOutlineMapper 통합 테스트 (S4-LOG-01). image_id 영속·재조회와 보정 저장(updateCorrection)을 확인한다.
 * 로컬 MySQL triplog_test 필요(없으면 컨텍스트 로드 실패 — 회귀 아님). CI Backend Test 에서 실행된다.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PhotoOutlineMapperIntegrationTest {

    @Autowired
    private PhotoOutlineMapper mapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void markReady_persists_image_id_and_items_and_reloads() throws Exception {
        Long photoId = insertPhoto();
        mapper.insertPending(photoId);

        mapper.markReady(photoId, "[{\"id\":0}]", "img-abc");

        PhotoOutline o = mapper.findByPhotoId(photoId);
        assertThat(o.getStatus()).isEqualTo(OutlineStatus.READY);
        assertThat(o.getImageId()).isEqualTo("img-abc");
        // MySQL JSON 컬럼은 공백을 재포맷하므로 문자열이 아니라 구조로 검증한다.
        JsonNode items = objectMapper.readTree(o.getItems());
        assertThat(items).hasSize(1);
        assertThat(items.get(0).get("id").asInt()).isEqualTo(0);
    }

    @Test
    void updateCorrection_replaces_items_and_refreshes_image_id() throws Exception {
        Long photoId = insertPhoto();
        mapper.insertPending(photoId);
        mapper.markReady(photoId, "[{\"id\":0}]", "img-old");

        int rows = mapper.updateCorrection(photoId,
                "[{\"id\":0},{\"id\":1,\"src\":\"user\"}]", "img-new");

        assertThat(rows).isEqualTo(1);
        PhotoOutline o = mapper.findByPhotoId(photoId);
        assertThat(o.getStatus()).isEqualTo(OutlineStatus.READY);
        assertThat(o.getImageId()).isEqualTo("img-new");
        JsonNode items = objectMapper.readTree(o.getItems());
        assertThat(items).hasSize(2);
        assertThat(items.get(1).get("src").asText()).isEqualTo("user");
    }

    @Test
    void findByPhotoIdForUpdate_returns_current_row() {
        Long photoId = insertPhoto();
        mapper.insertPending(photoId);
        mapper.markReady(photoId, "[]", "img-lock");

        PhotoOutline locked = mapper.findByPhotoIdForUpdate(photoId);

        assertThat(locked).isNotNull();
        assertThat(locked.getImageId()).isEqualTo("img-lock");
    }

    private Long insertPhoto() {
        String email = "outline-" + UUID.randomUUID() + "@example.com";
        jdbcTemplate.update("""
                INSERT INTO users (email, password, nickname)
                VALUES (?, ?, ?)
                """, email, "encoded", "tester");
        Long userId = jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, email);

        String stored = UUID.randomUUID() + ".jpg";
        jdbcTemplate.update("""
                INSERT INTO photos (user_id, original_filename, stored_filename, content_type, size_bytes)
                VALUES (?, ?, ?, ?, ?)
                """, userId, "orig.jpg", stored, "image/jpeg", 1234L);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM photos WHERE stored_filename = ?", Long.class, stored);
    }
}
