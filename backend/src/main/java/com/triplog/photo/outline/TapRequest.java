package com.triplog.photo.outline;

/** 탭 보정 요청 (S4-LOG-01). point = [x, y] 0~1 정규화. 값 검증은 OutlineCorrectionService 에서. */
public record TapRequest(double[] point) {
}
