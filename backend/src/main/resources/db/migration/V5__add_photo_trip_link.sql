-- S2-LOG-03(#37): 사진 ↔ 여행 연결.
-- photos.trip_id 는 V4 에서 nullable 컬럼으로 미리 선언됐다. 여기서 인덱스 + FK 를 추가한다.
--   * idx_photos_trip : 여행별 사진 조회 + FK 무결성 검사 성능.
--   * fk_photos_trip(ON DELETE CASCADE): 여행 삭제 시 연결된 photos row 자동 삭제.
--       주의: CASCADE 는 photos row 만 지운다. UPLOAD_DIR 의 실제 파일은
--       앱 코드(트랜잭션 afterCommit)로 직접 삭제해야 한다(고아 파일 방지, #37).
--
-- 인덱스를 FK 보다 먼저 선언해 FK 가 이를 재사용하게 한다(중복 인덱스 방지).
ALTER TABLE photos
    ADD KEY idx_photos_trip (trip_id),
    ADD CONSTRAINT fk_photos_trip FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE;
