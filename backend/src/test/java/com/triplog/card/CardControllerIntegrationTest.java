package com.triplog.card;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class CardControllerIntegrationTest {

    private static final long USER_ID = 6101L;
    private static final long OTHER_ID = 6102L;
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

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() throws IOException {
        insertUser(USER_ID, "card-owner@example.com");
        insertUser(OTHER_ID, "card-other@example.com");
        clearUploadDir();
    }

    @Test
    void saves_lists_serves_and_deletes_card() throws Exception {
        long tripId = insertTrip(USER_ID, "past");
        long photoId = insertPhoto(USER_ID, tripId);

        JsonNode saveBody = objectMapper.readTree(saveCard(tripId, photoId, USER_ID, png("card.png", 12, 8))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.tripId").value(tripId))
                .andExpect(jsonPath("$.data.photoId").value(photoId))
                .andExpect(jsonPath("$.data.width").value(12))
                .andExpect(jsonPath("$.data.height").value(8))
                .andReturn()
                .getResponse()
                .getContentAsString());
        long cardId = saveBody.at("/data/id").asLong();

        mockMvc.perform(get("/trips/" + tripId + "/cards").header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].id").value(cardId));

        mockMvc.perform(get("/cards/" + cardId + "/image").header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG));

        mockMvc.perform(delete("/cards/" + cardId).header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data").value(nullValue()));

        assertThat(countCards()).isZero();
    }

    @Test
    void save_upserts_same_trip_photo_and_replaces_stored_file() throws Exception {
        long tripId = insertTrip(USER_ID, "past");
        long photoId = insertPhoto(USER_ID, tripId);

        saveCard(tripId, photoId, USER_ID, png("first.png", 10, 10))
                .andExpect(status().isCreated());
        String firstStored = storedFilename();

        saveCard(tripId, photoId, USER_ID, png("second.png", 20, 14))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.width").value(20))
                .andExpect(jsonPath("$.data.height").value(14));

        assertThat(countCards()).isEqualTo(1);
        assertThat(storedFilename()).isNotEqualTo(firstStored);
    }

    @Test
    void lists_past_trip_memories_with_empty_and_completed_polaroid_data() throws Exception {
        long emptyTrip = insertTrip(USER_ID, "past");
        long completedTrip = insertTrip(USER_ID, "past");
        long planningTrip = insertTrip(USER_ID, "planning");
        long photoId = insertPhoto(USER_ID, completedTrip);
        insertPhoto(USER_ID, planningTrip);

        saveCard(completedTrip, photoId, USER_ID, png("memory.png", 9, 16))
                .andExpect(status().isCreated());

        JsonNode body = objectMapper.readTree(mockMvc.perform(get("/memories")
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
        assertThat(body.path("data").size()).isEqualTo(2);
        JsonNode completed = findMemory(body.path("data"), completedTrip);
        JsonNode empty = findMemory(body.path("data"), emptyTrip);
        assertThat(completed.path("cardCount").asLong()).isEqualTo(1);
        assertThat(completed.path("completed").asBoolean()).isTrue();
        assertThat(completed.path("coverImageUrl").asText()).isNotBlank();
        assertThat(empty.path("cardCount").asLong()).isZero();
        assertThat(empty.path("completed").asBoolean()).isFalse();
    }

    @Test
    void rejects_other_users_trip_photo_and_card() throws Exception {
        long ownerTrip = insertTrip(USER_ID, "past");
        long ownerPhoto = insertPhoto(USER_ID, ownerTrip);
        long othersTrip = insertTrip(OTHER_ID, "past");
        long othersPhoto = insertPhoto(OTHER_ID, othersTrip);

        saveCard(ownerTrip, ownerPhoto, USER_ID, png("mine.png", 8, 8))
                .andExpect(status().isCreated());
        long myCard = cardId();

        saveCard(othersTrip, ownerPhoto, USER_ID, png("bad-trip.png", 8, 8))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("TRIP_002"));

        saveCard(ownerTrip, othersPhoto, USER_ID, png("bad-photo.png", 8, 8))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PHOTO_005"));

        mockMvc.perform(get("/cards/" + myCard + "/image").header(HttpHeaders.AUTHORIZATION, bearer(OTHER_ID)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CARD_002"));
    }

    @Test
    void rejects_photo_not_linked_to_that_trip_and_non_png_file() throws Exception {
        long tripId = insertTrip(USER_ID, "past");
        long otherTrip = insertTrip(USER_ID, "past");
        long photoOnOtherTrip = insertPhoto(USER_ID, otherTrip);

        saveCard(tripId, photoOnOtherTrip, USER_ID, png("wrong-trip.png", 8, 8))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CARD_003"));

        saveCard(tripId, insertPhoto(USER_ID, tripId), USER_ID,
                new MockMultipartFile("file", "note.txt", MediaType.TEXT_PLAIN_VALUE, "x".getBytes()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CARD_003"));
    }

    private org.springframework.test.web.servlet.ResultActions saveCard(
            long tripId, long photoId, long userId, MockMultipartFile file) throws Exception {
        return mockMvc.perform(multipart("/trips/" + tripId + "/cards")
                .file(file)
                .param("photoId", String.valueOf(photoId))
                .header(HttpHeaders.AUTHORIZATION, bearer(userId)));
    }

    private JsonNode findMemory(JsonNode memories, long tripId) {
        for (JsonNode memory : memories) {
            if (memory.path("tripId").asLong() == tripId) {
                return memory;
            }
        }
        throw new AssertionError("memory not found: " + tripId);
    }

    private void insertUser(long id, String email) {
        jdbcTemplate.update("""
                        INSERT INTO users (id, email, password, nickname)
                        VALUES (?, ?, 'encoded', 'tester')
                        """,
                id, email);
    }

    private long insertTrip(long userId, String status) {
        jdbcTemplate.update("""
                        INSERT INTO trips (user_id, title, start_date, end_date, region, theme, status)
                        VALUES (?, '교토 단풍 기행', '2026-06-01', '2026-06-03', '교토', '단풍 사찰', ?)
                        """,
                userId, status);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM trips WHERE user_id = ? ORDER BY id DESC LIMIT 1", Long.class, userId);
    }

    private long insertPhoto(long userId, long tripId) {
        jdbcTemplate.update("""
                        INSERT INTO photos (user_id, original_filename, stored_filename, content_type, size_bytes, trip_id)
                        VALUES (?, 'o.jpg', ?, 'image/jpeg', 1, ?)
                        """,
                userId, "photo-" + userId + "-" + tripId + "-" + System.nanoTime() + ".jpg", tripId);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM photos WHERE user_id = ? ORDER BY id DESC LIMIT 1", Long.class, userId);
    }

    private MockMultipartFile png(String name, int width, int height) {
        try {
            BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            image.setRGB(0, 0, Color.ORANGE.getRGB());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, "png", out);
            return new MockMultipartFile("file", name, MediaType.IMAGE_PNG_VALUE, out.toByteArray());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private int countCards() {
        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cards", Integer.class);
        return count == null ? 0 : count;
    }

    private long cardId() {
        return jdbcTemplate.queryForObject("SELECT id FROM cards ORDER BY id DESC LIMIT 1", Long.class);
    }

    private String storedFilename() {
        return jdbcTemplate.queryForObject("SELECT stored_filename FROM cards ORDER BY id DESC LIMIT 1", String.class);
    }

    private String bearer(long userId) {
        return "Bearer " + tokenProvider.createAccessToken(userId);
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

    private static Path createTempDir() {
        try {
            return Files.createTempDirectory("triplog-card-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
