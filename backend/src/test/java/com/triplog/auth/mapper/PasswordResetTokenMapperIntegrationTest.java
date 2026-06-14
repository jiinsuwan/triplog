package com.triplog.auth.mapper;

import com.triplog.auth.domain.PasswordResetToken;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PasswordResetTokenMapperIntegrationTest {

    @Autowired
    private PasswordResetTokenMapper mapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void consume_by_hash_is_atomic_and_one_time_only() {
        Long userId = insertUser();
        String hash = "a".repeat(64);
        insertToken(userId, hash, LocalDateTime.now().plusMinutes(20));

        assertThat(mapper.consumeByHash(hash, LocalDateTime.now())).isEqualTo(1);
        assertThat(mapper.consumeByHash(hash, LocalDateTime.now())).isZero();

        PasswordResetToken token = mapper.findByHash(hash);
        assertThat(token.getUserId()).isEqualTo(userId);
        assertThat(token.getConsumedAt()).isNotNull();
    }

    @Test
    void revoke_unused_tokens_blocks_later_consume() {
        Long userId = insertUser();
        String hash = "b".repeat(64);
        insertToken(userId, hash, LocalDateTime.now().plusMinutes(20));

        assertThat(mapper.revokeUnusedByUserId(userId, LocalDateTime.now())).isEqualTo(1);

        assertThat(mapper.consumeByHash(hash, LocalDateTime.now())).isZero();
        assertThat(mapper.findByHash(hash).getRevokedAt()).isNotNull();
    }

    @Test
    void expired_token_cannot_be_consumed() {
        Long userId = insertUser();
        String hash = "c".repeat(64);
        insertToken(userId, hash, LocalDateTime.now().minusMinutes(1));

        assertThat(mapper.consumeByHash(hash, LocalDateTime.now())).isZero();
    }

    private Long insertUser() {
        String email = "reset-" + UUID.randomUUID() + "@example.com";
        jdbcTemplate.update("""
                INSERT INTO users (email, password, nickname)
                VALUES (?, ?, ?)
                """, email, "encoded", "tester");
        return jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, email);
    }

    private void insertToken(Long userId, String hash, LocalDateTime expiresAt) {
        PasswordResetToken token = new PasswordResetToken();
        token.setUserId(userId);
        token.setTokenHash(hash);
        token.setExpiresAt(expiresAt);
        mapper.insert(token);
    }
}
