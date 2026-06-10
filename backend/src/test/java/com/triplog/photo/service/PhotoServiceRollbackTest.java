package com.triplog.photo.service;

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
 * 트랜잭션 롤백 시 저장된 파일이 정리되는지 검증한다(고아 파일 방지, #46 리뷰 반영).
 *
 * 일부러 클래스 레벨 @Transactional 을 쓰지 않는다 — 테스트 자동 롤백 대신 TransactionTemplate 로
 * 트랜잭션을 직접 제어해 "롤백 후" 상태를 단언하기 위함이다.
 */
@SpringBootTest
@ActiveProfiles("test")
class PhotoServiceRollbackTest {

    private static final long USER_ID = 3001L;

    private static final Path UPLOAD_DIR = createTempDir();

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.upload-dir", UPLOAD_DIR::toString);
    }

    @Autowired
    private PhotoService photoService;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() throws IOException {
        jdbcTemplate.update("""
                        INSERT INTO users (id, email, password, nickname)
                        VALUES (?, ?, ?, ?)
                        """,
                USER_ID, "rollback@example.com", "{noop}password", "tester");
        clearUploadDir();
    }

    @AfterEach
    void tearDown() throws IOException {
        jdbcTemplate.update("DELETE FROM photos WHERE user_id = ?", USER_ID);
        jdbcTemplate.update("DELETE FROM users WHERE id = ?", USER_ID);
        clearUploadDir();
    }

    @Test
    void rolled_back_transaction_cleans_up_stored_files() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);

        // 트랜잭션 안에서 업로드한 뒤 강제 롤백한다(= commit 실패와 동일한 롤백 효과).
        tx.executeWithoutResult(status -> {
            photoService.upload(USER_ID, List.of(
                    new MockMultipartFile("files", "a.jpg", "image/jpeg", new byte[16])));
            // 커밋 전: 파일은 디스크에 있고 DB 행도 (트랜잭션 안에서) 보인다.
            assertThat(storedFileCount()).isEqualTo(1);
            status.setRollbackOnly();
        });

        // 롤백 후: afterCompletion 동기화가 저장 파일을 정리해야 한다(고아 없음).
        assertThat(storedFileCount()).isZero();
        // DB 행도 롤백으로 사라진다.
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM photos WHERE user_id = ?", Integer.class, USER_ID);
        assertThat(count).isZero();
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
            return Files.createTempDirectory("triplog-photo-rollback-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
