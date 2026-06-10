-- Sprint 2 log: 사진 업로드 메타 테이블.
-- S2-LOG-01(#35)이 이 테이블을 만든다. 같은 스프린트의 후속 이슈가 채울 칸은
-- nullable 로 미리 선언한다(마이그레이션 난립 방지 — decision A):
--   * taken_at / latitude / longitude : EXIF 추출(S2-LOG-02 #36)이 채운다.
--   * trip_id                          : 여행 연결(S2-LOG-03 #37)이 값 + FK(ON DELETE CASCADE)를 추가한다.
--       주의: ON DELETE CASCADE 는 photos row 만 지운다. UPLOAD_DIR 의 실제 파일은
--       #37(여행 삭제)·회원 탈퇴 시 앱 코드로 직접 지워야 한다(고아 파일 방지).
-- 공개 URL 은 stored_filename 으로부터 정적 서빙(S2-LOG-04 #38)에서 파생한다(여기 컬럼으로 두지 않음).

CREATE TABLE IF NOT EXISTS photos (
    id                BIGINT        NOT NULL AUTO_INCREMENT,
    user_id           BIGINT        NOT NULL,                 -- 올린 사람(소유자)
    original_filename VARCHAR(255)  NOT NULL,                 -- 사용자가 올린 원본 파일명
    stored_filename   VARCHAR(255)  NOT NULL,                 -- 디스크 저장명(UUID 기반, 충돌·경로조작 방지)
    content_type      VARCHAR(100)  NOT NULL,                 -- image/jpeg 등 검증된 MIME
    size_bytes        BIGINT        NOT NULL,                 -- 파일 크기(바이트)
    created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- ↓ 후속 이슈가 채우는 forward-nullable 컬럼 (지금은 비어 있음)
    trip_id           BIGINT        NULL,                     -- #37 여행 연결 (FK·cascade 도 #37에서)
    taken_at          DATETIME      NULL,                     -- #36 EXIF 촬영시각
    latitude          DOUBLE        NULL,                     -- #36 EXIF GPS 위도
    longitude         DOUBLE        NULL,                     -- #36 EXIF GPS 경도
    PRIMARY KEY (id),
    UNIQUE KEY uk_photos_stored_filename (stored_filename),
    KEY idx_photos_user_created (user_id, created_at, id),
    CONSTRAINT fk_photos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
