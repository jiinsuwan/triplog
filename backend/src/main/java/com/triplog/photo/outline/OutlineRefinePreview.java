package com.triplog.photo.outline;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/**
 * 정제 미리보기 결과 (S4-LOG-01 PR2). 아직 저장하지 않은 상태 — FE 가 결과를 보고 적용/취소를 결정한다.
 * itemId = 다듬은 객체(못 잡으면 -1), polygons = 새 외곽선(0~1 정규화), absorbItemIds = 적용 시 흡수(삭제)될 다른 객체.
 */
public record OutlineRefinePreview(int itemId, JsonNode polygons, List<Integer> absorbItemIds) {
}
