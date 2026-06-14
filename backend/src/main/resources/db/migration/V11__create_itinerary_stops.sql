-- S3-TRIP-01(#77): itinerary stop storage contract.
-- A stop is a user-added itinerary item, not the original place catalog row.
-- DB places keep a nullable FK plus a snapshot; Kakao places are restored from the snapshot only.
-- V10 is reserved by S3-CORE-02(#66) AiCallLog; this migration intentionally uses V11.

CREATE TABLE IF NOT EXISTS itinerary_stops (
    id              BIGINT         NOT NULL AUTO_INCREMENT,
    trip_id         BIGINT         NOT NULL,
    day_number      INT            NOT NULL,
    sort_order      INT            NOT NULL,
    place_source    VARCHAR(30)    NOT NULL,
    place_provider  VARCHAR(50)    NULL,
    db_place_id     BIGINT         NULL,
    source_place_id VARCHAR(128)   NULL,
    place_type      VARCHAR(30)    NOT NULL,
    place_name      VARCHAR(200)   NOT NULL,
    category        VARCHAR(100)   NULL,
    category_group  VARCHAR(100)   NULL,
    region1         VARCHAR(50)    NULL,
    region2         VARCHAR(50)    NULL,
    address         VARCHAR(255)   NULL,
    road_address    VARCHAR(255)   NULL,
    latitude        DECIMAL(12,8)  NOT NULL,
    longitude       DECIMAL(12,8)  NOT NULL,
    phone           VARCHAR(50)    NULL,
    place_url       VARCHAR(500)   NULL,
    selected_time   TIME           NULL,
    memo            VARCHAR(500)   NULL,
    transport       VARCHAR(30)    NOT NULL,
    created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_itinerary_stops_trip_day_order (trip_id, day_number, sort_order),
    KEY idx_itinerary_stops_trip_day (trip_id, day_number, id),
    KEY idx_itinerary_stops_db_place (db_place_id),
    KEY idx_itinerary_stops_source (place_source, source_place_id),
    CONSTRAINT fk_itinerary_stops_trip FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE,
    CONSTRAINT fk_itinerary_stops_db_place FOREIGN KEY (db_place_id) REFERENCES places (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
