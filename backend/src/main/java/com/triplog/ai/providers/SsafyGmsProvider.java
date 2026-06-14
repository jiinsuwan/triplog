package com.triplog.ai.providers;

import com.triplog.ai.LlmAdapter;
import com.triplog.ai.dto.LlmRequest;
import com.triplog.ai.dto.LlmResponse;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * SSAFY GMS(OpenAI 호환 게이트웨이) 텍스트 LLM provider — 유일 구현 (architecture §6, 과설계 방지).
 * ChatModel 자동설정 빈을 ObjectProvider 로 받아, 키/빈이 없어도 이 provider 빈은 항상 생성된다
 * (컨텍스트 보호). 키 미설정이면 네트워크 호출 없이 즉시 AI_001 로 격리한다(이슈 #66 AC3).
 */
@Component
public class SsafyGmsProvider implements LlmAdapter {

    private static final Logger log = LoggerFactory.getLogger(SsafyGmsProvider.class);

    private final ObjectProvider<ChatModel> chatModelProvider;
    private final String apiKey;
    private final String model;

    public SsafyGmsProvider(ObjectProvider<ChatModel> chatModelProvider,
                            @Value("${spring.ai.openai.api-key:}") String apiKey,
                            @Value("${spring.ai.openai.chat.options.model:gpt-4o-mini}") String model) {
        this.chatModelProvider = chatModelProvider;
        this.apiKey = apiKey;
        this.model = model;
    }

    @Override
    public LlmResponse generateText(LlmRequest request) {
        if (!StringUtils.hasText(apiKey)) {
            throw new BusinessException(ErrorCode.AI_CALL_FAILED, "GMS API 키가 설정되지 않았습니다.");
        }
        ChatModel chatModel = chatModelProvider.getIfAvailable();
        if (chatModel == null) {
            throw new BusinessException(ErrorCode.AI_CALL_FAILED, "LLM ChatModel 이 초기화되지 않았습니다.");
        }
        try {
            ChatResponse response = chatModel.call(new Prompt(request.prompt(), options(request)));
            return toLlmResponse(response);
        } catch (BusinessException e) {
            throw e;
        } catch (RuntimeException e) {
            // 원본 예외 메시지(게이트웨이 내부정보 포함 가능)는 서버 로그에만 남기고,
            // 사용자 응답·AiCallLog 에는 고정 메시지만 노출한다(정보 노출 격리).
            log.warn("GMS 호출 실패: kind={}", request.kind(), e);
            throw new BusinessException(ErrorCode.AI_CALL_FAILED, ErrorCode.AI_CALL_FAILED.getMessage(), e);
        }
    }

    private OpenAiChatOptions options(LlmRequest request) {
        OpenAiChatOptions.Builder builder = OpenAiChatOptions.builder().model(model);
        if (request.maxTokens() != null) {
            builder.maxTokens(request.maxTokens());
        }
        return builder.build();
    }

    private LlmResponse toLlmResponse(ChatResponse response) {
        Generation result = response.getResult();
        if (result == null || result.getOutput() == null) {
            // 빈 generations(콘텐츠 필터·빈 응답 등)로 결과가 없을 때 — NPE 대신 명확한 격리.
            throw new BusinessException(ErrorCode.AI_CALL_FAILED, "GMS 응답에 생성 결과가 없습니다.");
        }
        String text = result.getOutput().getText();
        if (!StringUtils.hasText(text)) {
            // 빈 문구를 성공으로 기록하면 카드에 빈 박스가 렌더된다. 실패로 격리해 호출측이 fallback 하게 한다.
            throw new BusinessException(ErrorCode.AI_CALL_FAILED, "GMS 응답 텍스트가 비어 있습니다.");
        }
        String respModel = blankToNull(response.getMetadata().getModel());
        Usage usage = response.getMetadata().getUsage();
        return new LlmResponse(
                text,
                respModel != null ? respModel : model,
                tokenOrNull(usage == null ? null : usage.getPromptTokens()),
                tokenOrNull(usage == null ? null : usage.getCompletionTokens()),
                tokenOrNull(usage == null ? null : usage.getTotalTokens()));
    }

    private String blankToNull(String value) {
        return StringUtils.hasText(value) ? value : null;
    }

    // Spring AI 의 EmptyUsage 는 0 을 반환 → "측정 불가"와 실제 0 을 구분하려 null 로 정규화한다.
    private Integer tokenOrNull(Integer value) {
        return (value == null || value == 0) ? null : value;
    }
}
