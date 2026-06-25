-- S4-LOG-06: 추억(여행 1개) 안에 저장되는 완성 카드 PNG.
-- 추억 단위는 trips 이고, cards 는 그 추억 안의 사진별 완성 카드다.
-- 같은 여행의 같은 사진은 카드 1장만 유지한다. 다시 "완료"하면 기존 행을 새 PNG로 교체한다.
CREATE TABLE IF NOT EXISTS cards (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    user_id         BIGINT       NOT NULL,
    trip_id         BIGINT       NOT NULL,
    photo_id        BIGINT       NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    content_type    VARCHAR(100) NOT NULL,
    size_bytes      BIGINT       NOT NULL,
    width           INT          NOT NULL,
    height          INT          NOT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_cards_trip_photo (trip_id, photo_id),
    UNIQUE KEY uk_cards_stored_filename (stored_filename),
    KEY idx_cards_user_updated (user_id, updated_at, id),
    KEY idx_cards_trip_created (trip_id, created_at, id),
    CONSTRAINT fk_cards_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cards_trip FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE,
    CONSTRAINT fk_cards_photo FOREIGN KEY (photo_id) REFERENCES photos (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
