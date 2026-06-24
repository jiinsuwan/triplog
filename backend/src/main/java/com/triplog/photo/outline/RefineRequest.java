package com.triplog.photo.outline;

/**
 * +/− 정제 요청 (S4-LOG-01). itemId = 다듬을 기존 객체(필수). pos = 포지티브 점(넣기), neg = 네거티브 점(빼기).
 * 각 점 [x, y] 0~1 정규화. BE 가 대상 객체 안쪽 씨앗 점을 pos 앞에 더해 "그 객체"에 머물게 하므로
 * 사용자 pos 는 0개여도 된다(빼기만 가능). pos 점이 다른 객체 안쪽에 떨어지면 그 객체를 흡수(병합·삭제)한다.
 * 값 검증은 OutlineCorrectionService 에서.
 */
public record RefineRequest(Integer itemId, double[][] pos, double[][] neg) {
}
