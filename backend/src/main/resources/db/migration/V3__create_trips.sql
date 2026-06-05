-- Sprint 1 trip: Trip CRUD table.
-- V2 is reserved by the open S1-CORE-01 auth PR for refresh token revocation.

CREATE TABLE IF NOT EXISTS trips (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    title       VARCHAR(100) NOT NULL,
    start_date  DATE         NOT NULL,
    end_date    DATE         NOT NULL,
    region      VARCHAR(100) NOT NULL,
    theme       VARCHAR(50)  NOT NULL,
    status      VARCHAR(30)  NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_trips_user_created (user_id, created_at, id),
    CONSTRAINT fk_trips_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
