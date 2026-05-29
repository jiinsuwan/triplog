-- V1: 초기 마이그레이션 골격 (Sprint 0, core)
-- 인증 골격이 참조할 최소 테이블만 둔다. 도메인 테이블(Trip/Place/Photo/Card 등)은
-- 각 Sprint에서 V2, V3... 로 추가한다. (architecture §5, N1=Flyway / N2=snake_case)

CREATE TABLE IF NOT EXISTS users (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    email        VARCHAR(255) NOT NULL,
    password     VARCHAR(255) NOT NULL,          -- bcrypt
    nickname     VARCHAR(50)  NOT NULL,
    profile_img  VARCHAR(512) NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_email (email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Refresh Token 저장 (architecture §7, A3: DB 저장 방식)
CREATE TABLE IF NOT EXISTS refresh_token (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    token       VARCHAR(512) NOT NULL,
    expires_at  DATETIME     NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_refresh_token_token (token),
    KEY idx_refresh_token_user_id (user_id),
    CONSTRAINT fk_refresh_token_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
