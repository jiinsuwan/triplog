package com.triplog.ai.dto;

/**
 * LLM 텍스트 생성 요청.
 *
 * @param kind      호출 종류(AiCallLog 적재·감사 분류용, 예: "card-text")
 * @param prompt    입력 프롬프트
 * @param maxTokens 출력 토큰 상한(크레딧·길이 보호). null 이면 provider 기본값을 따른다.
 */
public record LlmRequest(String kind, String prompt, Integer maxTokens) {
}
