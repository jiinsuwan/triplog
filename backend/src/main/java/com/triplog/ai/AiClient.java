package com.triplog.ai;

import com.triplog.ai.domain.AiCallLog;
import com.triplog.ai.dto.LlmRequest;
import com.triplog.ai.dto.LlmResponse;
import com.triplog.ai.log.AiCallLogger;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * LLM 호출 진입점 (이슈 #66). 호출측(#71 카드 문구 생성)이 쓰는 공통 계층으로,
 * LlmAdapter 호출을 시간 측정으로 감싸 성공/실패를 AiCallLog 에 적재하고(AC2),
 * 실패는 AI_001 로 격리해 전달한다(AC3). 적재는 best-effort 라 적재 실패가 본 흐름을 막지 않는다.
 */
@Service
public class AiClient {

    private static final Logger log = LoggerFactory.getLogger(AiClient.class);
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
            safeRecord(toSuccessLog(request, response, elapsedMs(startedAt)));
            return response;
        } catch (BusinessException e) {
            safeRecord(toFailureLog(request, elapsedMs(startedAt), e.getMessage()));
            throw e;
        } catch (RuntimeException e) {
            safeRecord(toFailureLog(request, elapsedMs(startedAt), e.getMessage()));
            throw new BusinessException(ErrorCode.AI_CALL_FAILED, ErrorCode.AI_CALL_FAILED.getMessage(), e);
        }
    }

    /**
     * AiCallLog 적재를 본 흐름에서 격리한다(이슈 #66 AC3). record 는 내부에서 insert 예외를 삼키지만,
     * {@code @Transactional(REQUIRES_NEW)} 프록시의 트랜잭션 begin/commit 실패는 record 본문 try/catch
     * 밖(프록시 경계)에서 터져 호출측으로 전파될 수 있다. 여기서 한 번 더 감싸 로그 적재 실패가
     * LLM 호출 성공을 AI_CALL_FAILED 로 뒤집거나, 실패 경로에서 원래 원인을 마스킹하지 않게 한다.
     */
    private void safeRecord(AiCallLog entry) {
        try {
            aiCallLogger.record(entry);
        } catch (RuntimeException e) {
            log.warn("AiCallLog 적재 실패 (호출 흐름은 계속): kind={}, success={}",
                    entry.getKind(), entry.isSuccess(), e);
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
