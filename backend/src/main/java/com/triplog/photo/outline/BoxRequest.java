package com.triplog.photo.outline;

/** 박스 보정 요청 (S4-LOG-01). box = [x1, y1, x2, y2] 0~1 정규화. 값 검증은 OutlineCorrectionService 에서. */
public record BoxRequest(double[] box) {
}
