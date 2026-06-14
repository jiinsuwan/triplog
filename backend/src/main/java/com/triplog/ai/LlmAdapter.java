package com.triplog.ai;

import com.triplog.ai.dto.LlmRequest;
import com.triplog.ai.dto.LlmResponse;

/**
 * 텍스트 LLM 호출 어댑터 (architecture §6).
 * 벤더 종속을 최소화하기 위한 얇은 경계 — provider 구현은 PoC 확정 1개(SSAFY GMS)만 둔다.
 * fallback(Anthropic/OpenAI/Google)은 필요해질 때 이 인터페이스로 추가한다(과설계 방지, §6).
 */
public interface LlmAdapter {

    /**
     * 프롬프트로 짧은 텍스트를 생성한다.
     * 실패 시 {@link com.triplog.common.BusinessException}(AI_001)을 던지며,
     * 호출측이 이를 잡아 "초안 없음" 등으로 흡수한다(다른 흐름을 막지 않음 — 이슈 #66 AC3).
     */
    LlmResponse generateText(LlmRequest request);
}
