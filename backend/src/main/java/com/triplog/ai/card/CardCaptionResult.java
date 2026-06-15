package com.triplog.ai.card;

import com.triplog.ai.card.dto.CardCaptionResponse;

import java.util.List;

/**
 * 카드 문구 생성 결과 (S3-LOG-03).
 *
 * <p>검증을 통과한 응답과, 통과를 막지 않은 경고 목록을 함께 돌려준다 — 경고(앵커 기본값 적용·
 * 권고 개수 초과·closing 누락 등)는 호출측(렌더·위저드)이 기록하거나 사용자 보정 안내에 쓴다
 * ({@link ValidationResult} 계약). errors는 검증 통과 시 항상 비어 있으므로 담지 않는다.
 *
 * @param response 검증을 통과한 LLM 문구 응답
 * @param warnings 통과를 막지 않은 경고 (없으면 빈 리스트)
 */
public record CardCaptionResult(
        CardCaptionResponse response,
        List<ValidationResult.Issue> warnings
) {
}
