package com.triplog.photo.outline;

import com.fasterxml.jackson.databind.JsonNode;
import com.triplog.photo.domain.OutlineStatus;

/**
 * 사진 윤곽선 전처리 상태/결과 응답 (S3-LOG-02 #70).
 * status=READY 일 때만 items(객체별 윤곽선·앵커)가 채워진다. 전처리 전(PENDING)·실패(FAILED)면 items=null.
 */
public record PhotoOutlineResponse(Long photoId, OutlineStatus status, JsonNode items) {
}
