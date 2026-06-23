-- 외곽선 보정(tap/box/refine, S4-LOG-01 #114)용 추론 서버 캐시 키.
-- image_id = 추론 서버(inference/)가 사진을 메모리에 올려두고 돌려주는 임시 식별자(uuid hex[:12], 12자).
-- 한 보정 세션의 여러 클릭이 같은 사진을 재사용하도록 BE 가 기억해 둔다. 휘발성이라 서버 퇴출·재시작 시
-- 404 가 나며, 그때 BE 가 재등록해 갱신한다. 외곽선 결과(폴리곤)의 정본은 items 컬럼이다(image_id 아님).
ALTER TABLE photo_outline
    ADD COLUMN image_id VARCHAR(64) NULL AFTER status;
