package com.triplog.photo.outline;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 보정 결과 응답 (S4-LOG-01). 추가된 외곽선 1개 = itemId(BE 가 부여) + polygons(0~1 정규화 루프 배열).
 * 객체를 못 잡으면 itemId=-1, polygons=빈 배열(no-op). image_id 는 내부 캐시 키라 노출하지 않는다.
 */
public record OutlineCorrectionResponse(int itemId, JsonNode polygons) {
}
