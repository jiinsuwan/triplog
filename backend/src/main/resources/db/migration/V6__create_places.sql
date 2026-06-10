-- Sprint 2 trip: public place catalog.
-- The table is intentionally generic so later public datasets
-- (parks, museums, markets, festivals) can be merged by source/type.

CREATE TABLE IF NOT EXISTS places (
    id            BIGINT        NOT NULL AUTO_INCREMENT,
    source        VARCHAR(50)   NOT NULL,
    source_id     VARCHAR(128)  NOT NULL,
    place_type    VARCHAR(30)   NOT NULL,
    name          VARCHAR(200)  NOT NULL,
    category      VARCHAR(100)  NOT NULL,
    region1       VARCHAR(50)   NOT NULL,
    region2       VARCHAR(50)   NULL,
    address       VARCHAR(255)  NULL,
    road_address  VARCHAR(255)  NULL,
    latitude      DECIMAL(12,8) NOT NULL,
    longitude     DECIMAL(12,8) NOT NULL,
    phone         VARCHAR(50)   NULL,
    summary       VARCHAR(500)  NULL,
    description   TEXT          NULL,
    facilities    TEXT          NULL,
    homepage      VARCHAR(500)  NULL,
    image_url     VARCHAR(500)  NULL,
    raw_payload   JSON          NULL,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_places_source_source_id (source, source_id),
    KEY idx_places_region_type (region1, region2, place_type),
    KEY idx_places_category (category),
    KEY idx_places_name (name),
    KEY idx_places_lat_lng (latitude, longitude)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
