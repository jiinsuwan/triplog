-- Sprint 4 social login: map OAuth provider accounts to internal users.
ALTER TABLE users
    MODIFY email VARCHAR(255) NULL,
    MODIFY password VARCHAR(255) NULL;

CREATE TABLE IF NOT EXISTS social_accounts (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    user_id          BIGINT       NOT NULL,
    provider         VARCHAR(20)  NOT NULL,
    provider_user_id VARCHAR(128) NOT NULL,
    email            VARCHAR(255) NULL,
    nickname         VARCHAR(50)  NULL,
    profile_img      VARCHAR(512) NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_social_accounts_provider_user (provider, provider_user_id),
    UNIQUE KEY uk_social_accounts_user_provider (user_id, provider),
    KEY idx_social_accounts_user_id (user_id),
    KEY idx_social_accounts_email (email),
    CONSTRAINT fk_social_accounts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
