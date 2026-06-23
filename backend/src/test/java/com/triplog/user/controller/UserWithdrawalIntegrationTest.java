package com.triplog.user.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.auth.dto.LoginRequest;
import com.triplog.auth.dto.RefreshTokenRequest;
import com.triplog.auth.jwt.JwtTokenProvider;
import com.triplog.user.dto.WithdrawUserRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UserWithdrawalIntegrationTest {

    private static final Path UPLOAD_DIR = createTempDir();

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.upload-dir", UPLOAD_DIR::toString);
    }

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JwtTokenProvider tokenProvider;

    private final List<String> emails = new ArrayList<>();
    private final List<Long> socialUserIds = new ArrayList<>();

    @BeforeEach
    void setUp() throws IOException {
        clearUploadDir();
    }

    @AfterEach
    void tearDown() throws IOException {
        for (String email : emails) {
            jdbcTemplate.update("DELETE FROM users WHERE email = ?", email);
        }
        for (Long userId : socialUserIds) {
            jdbcTemplate.update("DELETE FROM users WHERE id = ?", userId);
        }
        clearUploadDir();
    }

    @Test
    void withdraw_deletes_owned_data_and_files_but_preserves_other_users_data() throws Exception {
        UserSession owner = createUser("withdraw-owner-" + UUID.randomUUID() + "@example.com");
        UserSession other = createUser("withdraw-other-" + UUID.randomUUID() + "@example.com");

        long ownerTripId = insertTrip(owner.userId());
        long ownerStopId = insertItineraryStop(ownerTripId);
        Path linkedFile = createStoredFile();
        Path unlinkedFile = createStoredFile();
        long linkedPhotoId = insertPhoto(owner.userId(), ownerTripId, linkedFile.getFileName().toString());
        long unlinkedPhotoId = insertPhoto(owner.userId(), null, unlinkedFile.getFileName().toString());
        insertPhotoOutline(linkedPhotoId);
        insertPhotoOutline(unlinkedPhotoId);
        insertPasswordResetToken(owner.userId());

        long otherTripId = insertTrip(other.userId());
        Path otherFile = createStoredFile();
        long otherPhotoId = insertPhoto(other.userId(), otherTripId, otherFile.getFileName().toString());
        insertPhotoOutline(otherPhotoId);

        mockMvc.perform(delete("/users/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new WithdrawUserRequest("password123"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data").value(nullValue()));

        assertThat(count("users", "id", owner.userId())).isZero();
        assertThat(count("trips", "id", ownerTripId)).isZero();
        assertThat(count("itinerary_stops", "id", ownerStopId)).isZero();
        assertThat(count("photos", "id", linkedPhotoId)).isZero();
        assertThat(count("photos", "id", unlinkedPhotoId)).isZero();
        assertThat(count("photo_outline", "photo_id", linkedPhotoId)).isZero();
        assertThat(count("photo_outline", "photo_id", unlinkedPhotoId)).isZero();
        assertThat(count("refresh_token", "user_id", owner.userId())).isZero();
        assertThat(count("password_reset_tokens", "user_id", owner.userId())).isZero();
        assertThat(Files.exists(linkedFile)).isFalse();
        assertThat(Files.exists(unlinkedFile)).isFalse();

        assertThat(count("users", "id", other.userId())).isEqualTo(1);
        assertThat(count("trips", "id", otherTripId)).isEqualTo(1);
        assertThat(count("photos", "id", otherPhotoId)).isEqualTo(1);
        assertThat(count("photo_outline", "photo_id", otherPhotoId)).isEqualTo(1);
        assertThat(Files.exists(otherFile)).isTrue();

        mockMvc.perform(get("/users/me").header(HttpHeaders.AUTHORIZATION, bearer(owner.accessToken())))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_001"));

        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RefreshTokenRequest(owner.refreshToken()))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_002"));
    }

    @Test
    void withdraw_rejects_wrong_password_without_deleting_data_or_files() throws Exception {
        UserSession owner = createUser("withdraw-wrong-" + UUID.randomUUID() + "@example.com");
        long tripId = insertTrip(owner.userId());
        Path file = createStoredFile();
        long photoId = insertPhoto(owner.userId(), tripId, file.getFileName().toString());

        mockMvc.perform(delete("/users/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new WithdrawUserRequest("wrong"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("USER_003"));

        assertThat(count("users", "id", owner.userId())).isEqualTo(1);
        assertThat(count("trips", "id", tripId)).isEqualTo(1);
        assertThat(count("photos", "id", photoId)).isEqualTo(1);
        assertThat(Files.exists(file)).isTrue();

        mockMvc.perform(get("/users/me").header(HttpHeaders.AUTHORIZATION, bearer(owner.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(owner.userId()));
    }

    @Test
    void withdraw_rejects_missing_or_blank_password_without_deleting_user() throws Exception {
        UserSession owner = createUser("withdraw-invalid-" + UUID.randomUUID() + "@example.com");

        mockMvc.perform(delete("/users/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_001"));

        mockMvc.perform(delete("/users/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new WithdrawUserRequest(" "))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_001"));

        assertThat(count("users", "id", owner.userId())).isEqualTo(1);
    }

    @Test
    void social_only_user_can_withdraw_without_password() throws Exception {
        UserSession owner = createSocialUser();

        mockMvc.perform(get("/users/me").header(HttpHeaders.AUTHORIZATION, bearer(owner.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(owner.userId()))
                .andExpect(jsonPath("$.data.email").value(nullValue()))
                .andExpect(jsonPath("$.data.hasPassword").value(false));

        mockMvc.perform(delete("/users/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        assertThat(count("users", "id", owner.userId())).isZero();
        assertThat(count("social_accounts", "user_id", owner.userId())).isZero();
    }

    private UserSession createUser(String email) throws Exception {
        emails.add(email);
        jdbcTemplate.update("""
                        INSERT INTO users (email, password, nickname)
                        VALUES (?, ?, ?)
                        """,
                email, passwordEncoder.encode("password123"), "tester");
        Long userId = jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, email);

        JsonNode loginBody = postJson("/auth/login", new LoginRequest(email, "password123"))
                .andExpect(status().isOk())
                .andReturnBody();
        return new UserSession(
                userId,
                loginBody.at("/data/accessToken").asText(),
                loginBody.at("/data/refreshToken").asText());
    }

    private UserSession createSocialUser() {
        String providerUserId = "social-withdraw-" + UUID.randomUUID();
        jdbcTemplate.update("""
                        INSERT INTO users (email, password, nickname)
                        VALUES (NULL, NULL, ?)
                        """,
                "social tester");
        Long userId = jdbcTemplate.queryForObject(
                "SELECT id FROM users WHERE nickname = ? ORDER BY id DESC LIMIT 1", Long.class, "social tester");
        socialUserIds.add(userId);
        jdbcTemplate.update("""
                        INSERT INTO social_accounts (user_id, provider, provider_user_id, email, nickname)
                        VALUES (?, 'KAKAO', ?, 'social@example.com', 'social tester')
                        """,
                userId, providerUserId);
        return new UserSession(userId, tokenProvider.createAccessToken(userId), null);
    }

    private long insertTrip(long userId) {
        jdbcTemplate.update("""
                        INSERT INTO trips (user_id, title, start_date, end_date, region, theme, status)
                        VALUES (?, '제주 여행', '2026-06-01', '2026-06-03', '제주', '힐링', 'planning')
                        """,
                userId);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM trips WHERE user_id = ? ORDER BY id DESC LIMIT 1", Long.class, userId);
    }

    private long insertItineraryStop(long tripId) {
        jdbcTemplate.update("""
                        INSERT INTO itinerary_stops (
                            trip_id, day_number, sort_order, place_source, place_provider, db_place_id,
                            source_place_id, place_type, place_name, latitude, longitude, transport
                        )
                        VALUES (?, 1, 1, 'DB', NULL, NULL, NULL, 'PLACE', '협재 해수욕장', 33.39300000, 126.23900000, 'walk')
                        """,
                tripId);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM itinerary_stops WHERE trip_id = ? ORDER BY id DESC LIMIT 1", Long.class, tripId);
    }

    private long insertPhoto(long userId, Long tripId, String storedName) {
        jdbcTemplate.update("""
                        INSERT INTO photos (user_id, original_filename, stored_filename, content_type, size_bytes, trip_id)
                        VALUES (?, 'o.jpg', ?, 'image/jpeg', 1, ?)
                        """,
                userId, storedName, tripId);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM photos WHERE stored_filename = ?", Long.class, storedName);
    }

    private void insertPhotoOutline(long photoId) {
        jdbcTemplate.update("INSERT INTO photo_outline (photo_id, status) VALUES (?, 'PENDING')", photoId);
    }

    private void insertPasswordResetToken(long userId) {
        String tokenHash = "%064x".formatted(System.nanoTime());
        jdbcTemplate.update("""
                        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
                        VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))
                        """,
                userId, tokenHash);
    }

    private int count(String table, String column, long value) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE " + column + " = ?", Integer.class, value);
        return count == null ? 0 : count;
    }

    private Path createStoredFile() throws IOException {
        Files.createDirectories(UPLOAD_DIR);
        Path path = UPLOAD_DIR.resolve("f-" + System.nanoTime() + ".jpg");
        Files.writeString(path, "x");
        return path;
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

    private ResultActionsWithBody postJson(String path, Object body) throws Exception {
        var resultActions = mockMvc.perform(post(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
        return new ResultActionsWithBody(resultActions);
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private static Path createTempDir() {
        try {
            return Files.createTempDirectory("triplog-withdrawal-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private record UserSession(Long userId, String accessToken, String refreshToken) {
    }

    private final class ResultActionsWithBody {
        private final org.springframework.test.web.servlet.ResultActions delegate;

        private ResultActionsWithBody(org.springframework.test.web.servlet.ResultActions delegate) {
            this.delegate = delegate;
        }

        ResultActionsWithBody andExpect(org.springframework.test.web.servlet.ResultMatcher matcher) throws Exception {
            delegate.andExpect(matcher);
            return this;
        }

        JsonNode andReturnBody() throws Exception {
            return objectMapper.readTree(delegate.andReturn().getResponse().getContentAsString());
        }
    }
}
