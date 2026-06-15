-- Sprint 3 log (S3-LOG-02 #70 리뷰 P2): V12 이전 업로드 사진 백필.
-- V12 부터 신규 업로드는 PENDING 행을 만들지만, 그 전에 올라온 사진은 photo_outline 행이 없다.
-- 행이 없으면 조회 시 영구 PENDING 으로 보이고(getOutline 의 no-row=PENDING 기본값),
-- 워커도 집지 않는다(워커는 PENDING '행'만 조회). 그래서 윤곽선이 영원히 안 생긴다.
-- 행이 없는 기존 사진에 PENDING 행을 만들어 워커가 1회 전처리하도록 한다.
-- 멱등: LEFT JOIN ... IS NULL 이라 이미 행이 있으면 건너뛴다. 사진이 0건이면 no-op.
-- 머지 주의: 병행 트랙이 같은 V13 을 집지 않도록 머지 직전 다음 빈 번호를 확인한다
--   (Flyway out-of-order=false — 결번/중복 시 마이그레이션이 깨진다).
INSERT INTO photo_outline (photo_id, status)
SELECT p.id, 'PENDING'
FROM photos p
LEFT JOIN photo_outline o ON o.photo_id = p.id
WHERE o.photo_id IS NULL;
