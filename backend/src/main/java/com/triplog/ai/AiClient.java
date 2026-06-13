package com.triplog.ai;

import com.triplog.ai.domain.AiCallLog;
import com.triplog.ai.dto.LlmRequest;
import com.triplog.ai.dto.LlmResponse;
import com.triplog.ai.log.AiCallLogger;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * LLM 호출 진입점 (이슈 #66). 호출측(#71 카드 문구 생성)이 쓰는 공통 계층으로,
 * LlmAdapter 호출을 시간 측정으로 감싸 성공/실패를 AiCallLog 에 적재하고(AC2),
 * 실패는 AI_001 로 격리해 전달한다(AC3). 적재는 best-effort 라 적재 실패가 본 흐름을 막지 않는다.
 */
@Service
public class AiClient {

    private static final int ERROR_MESSAGE_MAX = 500;

    private final LlmAdapter llmAdapter;
    private final AiCallLogger aiCallLogger;
    private final String defaultModel;

    public AiClient(LlmAdapter llmAdapter,
                    AiCallLogger aiCallLogger,
                    @Value("${spring.ai.openai.chat.options.model:unknown}") String defaultModel) {
        this.llmAdapter = llmAdapter;
        this.aiCallLogger = aiCallLogger;
        this.defaultModel = defaultModel;
    }

    public LlmResponse generateText(LlmRequest request) {
        long startedAt = System.currentTimeMillis();
        try {
            LlmResponse response = llmAdapter.generateText(request);
            aiCallLogger.record(toSuccessLog(request, response, elapsedMs(startedAt)));
            return response;
        } catch (BusinessException e) {
            aiCallLogger.record(toFailureLog(request, elapsedMs(startedAt), e.getMessage()));
            throw e;
        } catch (RuntimeException e) {
            aiCallLogger.record(toFailureLog(request, elapsedMs(startedAt), e.getMessage()));
            throw new BusinessException(ErrorCode.AI_CALL_FAILED, ErrorCode.AI_CALL_FAILED.getMessage(), e);
        }
    }

    private int elapsedMs(long startedAt) {
        return (int) (System.currentTimeMillis() - startedAt);
    }

    private AiCallLog toSuccessLog(LlmRequest request, LlmResponse response, int costMs) {
        AiCallLog entry = base(request, costMs);
        entry.setModel(response.model() != null ? response.model() : defaultModel);
        entry.setResponseJson(response.text());
        entry.setPromptTokens(response.promptTokens());
        entry.setCompletionTokens(response.completionTokens());
        entry.setTotalTokens(response.totalTokens());
        entry.setSuccess(true);
        return entry;
    }

    private AiCallLog toFailureLog(LlmRequest request, int costMs, String errorMessage) {
        AiCallLog entry = base(request, costMs);
        entry.setModel(defaultModel);
        entry.setSuccess(false);
        entry.setErrorMessage(truncate(errorMessage));
        return entry;
    }

    private AiCallLog base(LlmRequest request, int costMs) {
        AiCallLog entry = new AiCallLog();
        entry.setKind(request.kind());
        entry.setPrompt(request.prompt());
        entry.setCostMs(costMs);
        return entry;
    }

    private String truncate(String message) {
        if (message == null || message.length() <= ERROR_MESSAGE_MAX) {
            return message;
        }
        return message.substring(0, ERROR_MESSAGE_MAX);
    }
}
