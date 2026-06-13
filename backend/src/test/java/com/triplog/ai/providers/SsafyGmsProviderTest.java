package com.triplog.ai.providers;

import com.triplog.ai.dto.LlmRequest;
import com.triplog.ai.dto.LlmResponse;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.DefaultUsage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.ObjectProvider;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * SsafyGmsProvider의 ChatResponse→LlmResponse 파싱을 ChatModel mock + 실제 응답 객체로 검증한다(실 GMS 없이).
 * live 테스트는 CI에서 skip 되므로, 토큰 0→null 정규화·빈 결과 격리의 회귀 가드는 이 테스트가 담당한다.
 * Spring AI 응답 타입은 final 메서드를 가져 mock 불가 → 실제 객체로 구성한다.
 */
class SsafyGmsProviderTest {

    private SsafyGmsProvider providerWith(ChatModel chatModel) {
        @SuppressWarnings("unchecked")
        ObjectProvider<ChatModel> op = mock(ObjectProvider.class);
        when(op.getIfAvailable()).thenReturn(chatModel);
        return new SsafyGmsProvider(op, "test-key", "gpt-4o-mini");
    }

    private ChatResponse chatResponse(String text, String model, Integer p, Integer c, Integer t) {
        ChatResponseMetadata meta = ChatResponseMetadata.builder()
                .model(model)
                .usage(new DefaultUsage(p, c, t))
                .build();
        return new ChatResponse(List.of(new Generation(new AssistantMessage(text))), meta);
    }

    @Test
    void parses_text_model_and_tokens() {
        ChatModel chatModel = mock(ChatModel.class);
        when(chatModel.call(any(Prompt.class))).thenReturn(chatResponse("문구", "gpt-4o-mini", 12, 8, 20));

        LlmResponse r = providerWith(chatModel).generateText(new LlmRequest("card-text", "p", 60));

        assertThat(r.text()).isEqualTo("문구");
        assertThat(r.model()).isEqualTo("gpt-4o-mini");
        assertThat(r.promptTokens()).isEqualTo(12);
        assertThat(r.completionTokens()).isEqualTo(8);
        assertThat(r.totalTokens()).isEqualTo(20);
    }

    @Test
    void normalizes_zero_usage_to_null() {
        ChatModel chatModel = mock(ChatModel.class);
        when(chatModel.call(any(Prompt.class))).thenReturn(chatResponse("문구", "gpt-4o-mini", 0, 0, 0));

        LlmResponse r = providerWith(chatModel).generateText(new LlmRequest("card-text", "p", null));

        assertThat(r.promptTokens()).isNull();
        assertThat(r.completionTokens()).isNull();
        assertThat(r.totalTokens()).isNull();
    }

    @Test
    void empty_result_is_isolated_as_ai_001() {
        ChatModel chatModel = mock(ChatModel.class);
        when(chatModel.call(any(Prompt.class))).thenReturn(new ChatResponse(List.of()));

        assertThatThrownBy(() -> providerWith(chatModel).generateText(new LlmRequest("card-text", "p", null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.AI_CALL_FAILED);
    }

    @Test
    void missing_key_fails_fast_without_calling_model() {
        @SuppressWarnings("unchecked")
        ObjectProvider<ChatModel> op = mock(ObjectProvider.class);
        SsafyGmsProvider noKey = new SsafyGmsProvider(op, "", "gpt-4o-mini");

        assertThatThrownBy(() -> noKey.generateText(new LlmRequest("card-text", "p", null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.AI_CALL_FAILED);
    }
}
