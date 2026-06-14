package com.triplog.ai.dto;

/**
 * LLM 텍스트 생성 응답.
 * 토큰·model 메타는 provider 가 제공할 때만 채워지며, 측정 불가 시 null 로 정규화한다
 * (Spring AI 의 EmptyUsage 는 0 을 반환하므로, 어댑터에서 0/빈값 → null 로 바꿔 "측정 불가"와 0 을 구분한다).
 *
 * @param text             생성된 텍스트
 * @param model            응답 모델 식별자(없으면 null)
 * @param promptTokens     입력 토큰(없으면 null)
 * @param completionTokens 출력 토큰(없으면 null)
 * @param totalTokens      합계(없으면 null)
 */
public record LlmResponse(
        String text,
        String model,
        Integer promptTokens,
        Integer completionTokens,
        Integer totalTokens
) {
}
