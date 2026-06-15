-- Sprint 3 log (S3-LOG-02 #70): 사진별 윤곽선 전처리 결과/상태 테이블.
-- 업로드된 사진마다 추론 서버(inference/)가 윤곽선·텍스트 앵커를 1회 계산해 여기에 적재한다.
-- 추론 서버의 메모리 캐시는 휘발성이므로, 이 테이블이 items 의 정본(SoT)이다.
--   * 업로드 시 PENDING 행을 만든다. 백그라운드 전처리가 추론 서버를 호출해 READY/FAILED 로 바꾼다.
--   * items 는 완료 시에만 채운다(JSON: 객체별 폴리곤·앵커·라벨 — poc/card/OUTLINE_API.md §1 형식).
--   * 추론 서버가 죽어도 업로드·카드 기본 동작은 유지된다(FAILED 로 남고 윤곽선만 없음).
-- photo 1건당 1행(photo_id = PK = FK). 사진 삭제 시 함께 삭제(ON DELETE CASCADE).
-- 머지 주의: 병행 트랙(trip/core)이 같은 V12 를 집지 않도록 머지 직전 다음 빈 번호를 확인한다
--   (Flyway out-of-order=false — 결번/중복 시 마이그레이션이 깨진다).
CREATE TABLE IF NOT EXISTS photo_outline (
    photo_id   BIGINT       NOT NULL,                 -- photos.id (1:1)
    status     VARCHAR(20)  NOT NULL,                 -- PENDING / READY / FAILED
    items      JSON         NULL,                     -- 윤곽선·앵커 결과(완료 시) — OUTLINE_API §1
    error      VARCHAR(500) NULL,                     -- 실패 사유 요약(FAILED 시)
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (photo_id),
    KEY idx_photo_outline_status (status, photo_id),  -- 백그라운드 워커의 PENDING 조회용
    CONSTRAINT fk_photo_outline_photo FOREIGN KEY (photo_id) REFERENCES photos (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
