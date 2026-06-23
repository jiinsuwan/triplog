-- Sprint 4 trip: preserve TourAPI detail documents for later AI embedding.
-- `places` remains the public map/search catalog; this table stores
-- source detail text that can be embedded later without duplicating places.

CREATE TABLE IF NOT EXISTS place_documents (
    id             BIGINT        NOT NULL AUTO_INCREMENT,
    place_id       BIGINT        NULL,
    source         VARCHAR(50)   NOT NULL,
    source_id      VARCHAR(128)  NOT NULL,
    document_type  VARCHAR(50)   NOT NULL,
    place_type     VARCHAR(30)   NOT NULL,
    title          VARCHAR(200)  NOT NULL,
    overview       TEXT          NULL,
    details_json   JSON          NULL,
    document_text  MEDIUMTEXT    NOT NULL,
    raw_payload    JSON          NOT NULL,
    content_hash   CHAR(64)      NOT NULL,
    fetched_at     VARCHAR(40)   NULL,
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_place_documents_source_doc (source, source_id, document_type),
    KEY idx_place_documents_place (place_id),
    KEY idx_place_documents_source (source, source_id),
    KEY idx_place_documents_hash (content_hash),
    CONSTRAINT fk_place_documents_place FOREIGN KEY (place_id) REFERENCES places (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE INDEX idx_places_type_region ON places (place_type, region1, region2);
