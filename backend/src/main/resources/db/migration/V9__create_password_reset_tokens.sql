CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id           BIGINT      NOT NULL AUTO_INCREMENT,
    user_id      BIGINT      NOT NULL,
    token_hash   CHAR(64)    NOT NULL,
    expires_at   DATETIME    NOT NULL,
    consumed_at  DATETIME    NULL,
    revoked_at   DATETIME    NULL,
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_password_reset_tokens_hash (token_hash),
    KEY idx_password_reset_tokens_user_unused (user_id, consumed_at, revoked_at),
    KEY idx_password_reset_tokens_expires_at (expires_at),
    CONSTRAINT fk_password_reset_tokens_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
