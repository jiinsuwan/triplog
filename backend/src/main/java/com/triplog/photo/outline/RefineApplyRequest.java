package com.triplog.photo.outline;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/**
 * 정제 적용 요청 (S4-LOG-01 PR2). 미리보기로 받은 polygons·absorbItemIds 를 그대로 보내 저장한다(inference 없음).
 * 좌표(0~1)·소유권은 OutlineCorrectionService 에서 검증한다.
 */
public record RefineApplyRequest(Integer itemId, JsonNode polygons, List<Integer> absorbItemIds) {
}
