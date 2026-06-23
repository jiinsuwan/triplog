package com.triplog.photo.outline;

/**
 * +/− 정제 요청 (S4-LOG-01). pos = 포지티브 점들(필수, 1개 이상), neg = 네거티브 점들(선택).
 * 각 점 [x, y] 0~1 정규화. 값 검증은 OutlineCorrectionService 에서.
 */
public record RefineRequest(double[][] pos, double[][] neg) {
}
