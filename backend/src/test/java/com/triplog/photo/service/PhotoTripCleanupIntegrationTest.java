package com.triplog.photo.service;

import com.triplog.trip.service.TripService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 여행 삭제 시 연결 사진의 DB row(FK CASCADE) + 실제 파일(afterCommit)이 함께 삭제되는지 검증(#37).
 *
 * afterCommit 콜백은 "실제 커밋"에만 발동하므로, 테스트 자동 롤백(@Transactional) 대신
 * TransactionTemplate 으로 직접 커밋시킨다(PhotoServiceRollbackTest 와 같은 이유).
 *
 * 이 테스트는 순서 불변식도 간접 검증한다: cleanup 이 trips 삭제 *후*에 파일명을 조회하면
 * CASCADE 로 row 가 사라져 빈 목록이 되고, 파일이 남아 아래 단언이 실패한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class PhotoTripCleanupIntegrationTest {

    private static final long USER_ID = 4001L;
    private static final Path UPLOAD_DIR = createTempDir();

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.upload-dir", UPLOAD_DIR::toString);
    }

    @Autowired
    private TripService tripService;
    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private PlatformTransactionManager transactionManager;

    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        tx = new TransactionTemplate(transactionManager);
        jdbcTemplate.update("INSERT INTO users (id, email, password, nickname) VALUES (?, ?, ?, ?)",
                USER_ID, "cascade@example.com", "{noop}password", "tester");
    }

    @AfterEach
    void tearDown() throws IOException {
        // 실커밋이라 자동 롤백되지 않으므로 직접 정리(users 삭제 → trips/photos CASCADE).
        jdbcTemplate.update("DELETE FROM users WHERE id = ?", USER_ID);
        if (Files.exists(UPLOAD_DIR)) {
            try (var files = Files.list(UPLOAD_DIR)) {
                for (Path p : files.toList()) {
                    Files.deleteIfExists(p);
                }
            }
        }
    }

    @Test
    void deleting_trip_removes_linked_photos_but_keeps_other_trips() throws IOException {
        long tripId = insertTrip();
        long otherTrip = insertTrip();
        Path f1 = createStoredFile();
        Path f2 = createStoredFile();
        Path fOther = createStoredFile();
        insertPhoto(tripId, f1.getFileName().toString());
        insertPhoto(tripId, f2.getFileName().toString());
        insertPhoto(otherTrip, fOther.getFileName().toString());

        assertThat(countTripPhotos(tripId)).isEqualTo(2);

        // 실제 커밋으로 여행 삭제 → photos row(CASCADE) + 파일(afterCommit) 동반 삭제.
        tx.executeWithoutResult(status -> tripService.delete(USER_ID, tripId));

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
        long tripId = insertTrip();
        Path file = createStoredFile();
        insertPhoto(tripId, file.getFileName().toString());

        // 삭제를 트랜잭션 안에서 실행하되 롤백 → afterCommit 미발동 → 파일·row 손실 0.
        // (afterCompletion 으로 잘못 구현했다면 롤백 시에도 파일이 지워졌을 것 — 데이터 손실 방어.)
        tx.executeWithoutResult(status -> {
            tripService.delete(USER_ID, tripId);
            status.setRollbackOnly();
        });

        assertThat(Files.exists(file)).isTrue();
        assertThat(countTripPhotos(tripId)).isEqualTo(1);
    }

    private long insertTrip() {
        jdbcTemplate.update("""
                        INSERT INTO trips (user_id, title, start_date, end_date, region, theme, status)
                        VALUES (?, '제주 여행', '2026-06-01', '2026-06-03', '제주', '힐링', 'planning')
                        """,
                USER_ID);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM trips WHERE user_id = ? ORDER BY id DESC LIMIT 1", Long.class, USER_ID);
    }

    private void insertPhoto(long tripId, String storedName) {
        jdbcTemplate.update("""
                        INSERT INTO photos (user_id, original_filename, stored_filename, content_type, size_bytes, trip_id)
                        VALUES (?, 'o.jpg', ?, 'image/jpeg', 1, ?)
                        """,
                USER_ID, storedName, tripId);
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

    private static Path createTempDir() {
        try {
            return Files.createTempDirectory("triplog-cascade-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
