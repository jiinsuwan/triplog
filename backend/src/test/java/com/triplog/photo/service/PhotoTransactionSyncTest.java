package com.triplog.photo.service;

import com.triplog.trip.service.TripService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 트랜잭션 경계에서 DB row 와 저장 파일이 함께 움직이는지 검증한다(파일-트랜잭션 일관성).
 * 두 방향을 한 자리에 모은다:
 *  - 업로드 롤백 → 저장한 파일 정리(고아 방지, #46)
 *  - 여행 삭제 커밋 → 연결 사진 row(CASCADE) + 파일(afterCommit) 동반 삭제, 롤백 시 보존(#37)
 *
 * 클래스 레벨 @Transactional 을 일부러 쓰지 않는다 — 테스트 자동 롤백 대신 TransactionTemplate 으로
 * 트랜잭션을 직접 제어해 "커밋/롤백 후" 상태를 단언하기 위함이다(afterCommit 콜백은 실커밋에만 발동).
 */
@SpringBootTest
@ActiveProfiles("test")
class PhotoTransactionSyncTest {

    private static final long UPLOAD_USER_ID = 3001L;
    private static final long CASCADE_USER_ID = 4001L;

    private static final Path UPLOAD_DIR = createTempDir();

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.upload-dir", UPLOAD_DIR::toString);
    }

    @Autowired
    private PhotoService photoService;
    @Autowired
    private TripService tripService;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    private TransactionTemplate tx;

    @BeforeEach
    void setUp() throws IOException {
        tx = new TransactionTemplate(transactionManager);
        insertUser(UPLOAD_USER_ID, "rollback@example.com");
        insertUser(CASCADE_USER_ID, "cascade@example.com");
        clearUploadDir();
    }

    @AfterEach
    void tearDown() throws IOException {
        // 실커밋이라 자동 롤백되지 않으므로 직접 정리(users 삭제 → trips/photos CASCADE).
        jdbcTemplate.update("DELETE FROM photos WHERE user_id IN (?, ?)", UPLOAD_USER_ID, CASCADE_USER_ID);
        jdbcTemplate.update("DELETE FROM users WHERE id IN (?, ?)", UPLOAD_USER_ID, CASCADE_USER_ID);
        clearUploadDir();
    }

    // ---- 업로드 롤백: 고아 파일 정리(#46) ----

    @Test
    void rolled_back_transaction_cleans_up_stored_files() {
        // 트랜잭션 안에서 업로드한 뒤 강제 롤백한다(= commit 실패와 동일한 롤백 효과).
        tx.executeWithoutResult(status -> {
            photoService.upload(UPLOAD_USER_ID, List.of(
                    new MockMultipartFile("files", "a.jpg", "image/jpeg", new byte[16])));
            // 커밋 전: 파일은 디스크에 있고 DB 행도 (트랜잭션 안에서) 보인다.
            assertThat(storedFileCount()).isEqualTo(1);
            status.setRollbackOnly();
        });

        // 롤백 후: afterCompletion 동기화가 저장 파일을 정리해야 한다(고아 없음).
        assertThat(storedFileCount()).isZero();
        // DB 행도 롤백으로 사라진다.
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM photos WHERE user_id = ?", Integer.class, UPLOAD_USER_ID);
        assertThat(count).isZero();
    }

    // ---- 여행 삭제: CASCADE row + afterCommit 파일 동반 삭제(#37) ----

    @Test
    void deleting_trip_removes_linked_photos_but_keeps_other_trips() throws IOException {
        long tripId = insertTrip(CASCADE_USER_ID);
        long otherTrip = insertTrip(CASCADE_USER_ID);
        Path f1 = createStoredFile();
        Path f2 = createStoredFile();
        Path fOther = createStoredFile();
        insertPhoto(CASCADE_USER_ID, tripId, f1.getFileName().toString());
        insertPhoto(CASCADE_USER_ID, tripId, f2.getFileName().toString());
        insertPhoto(CASCADE_USER_ID, otherTrip, fOther.getFileName().toString());

        assertThat(countTripPhotos(tripId)).isEqualTo(2);

        // 실제 커밋으로 여행 삭제 → photos row(CASCADE) + 파일(afterCommit) 동반 삭제.
        tx.executeWithoutResult(status -> tripService.delete(CASCADE_USER_ID, tripId));

        // 삭제 대상: row + 파일 동반 삭제
        assertThat(countTripPhotos(tripId)).isZero();
        assertThat(Files.exists(f1)).isFalse();
        assertThat(Files.exists(f2)).isFalse();
        // 격리: 다른 여행 사진은 보존(WHERE trip_id 정확성 + CASCADE 범위)
        assertThat(countTripPhotos(otherTrip)).isEqualTo(1);
        assertThat(Files.exists(fOther)).isTrue();
    }

    @Test
    void rollback_preserves_files_and_rows() throws IOException {
        long tripId = insertTrip(CASCADE_USER_ID);
        Path file = createStoredFile();
        insertPhoto(CASCADE_USER_ID, tripId, file.getFileName().toString());

        // 삭제를 트랜잭션 안에서 실행하되 롤백 → afterCommit 미발동 → 파일·row 손실 0.
        // (afterCompletion 으로 잘못 구현했다면 롤백 시에도 파일이 지워졌을 것 — 데이터 손실 방어.)
        tx.executeWithoutResult(status -> {
            tripService.delete(CASCADE_USER_ID, tripId);
            status.setRollbackOnly();
        });

        assertThat(Files.exists(file)).isTrue();
        assertThat(countTripPhotos(tripId)).isEqualTo(1);
    }

    // ---- helpers ----

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
                        VALUES (?, '제주 여행', '2026-06-01', '2026-06-03', '제주', '힐링', 'planning')
                        """,
                userId);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM trips WHERE user_id = ? ORDER BY id DESC LIMIT 1", Long.class, userId);
    }

    private void insertPhoto(long userId, long tripId, String storedName) {
        jdbcTemplate.update("""
                        INSERT INTO photos (user_id, original_filename, stored_filename, content_type, size_bytes, trip_id)
                        VALUES (?, 'o.jpg', ?, 'image/jpeg', 1, ?)
                        """,
                userId, storedName, tripId);
    }

    private Path createStoredFile() throws IOException {
        Files.createDirectories(UPLOAD_DIR);
        Path p = UPLOAD_DIR.resolve("f-" + System.nanoTime() + ".jpg");
        Files.writeString(p, "x");
        return p;
    }

    private int countTripPhotos(long tripId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM photos WHERE trip_id = ?", Integer.class, tripId);
        return count == null ? 0 : count;
    }

    private long storedFileCount() {
        if (!Files.exists(UPLOAD_DIR)) {
            return 0;
        }
        try (var files = Files.list(UPLOAD_DIR)) {
            return files.count();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
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

    private static Path createTempDir() {
        try {
            return Files.createTempDirectory("triplog-photo-tx-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
