package com.triplog.ai;

import com.triplog.ai.domain.AiCallLog;
import com.triplog.ai.dto.LlmRequest;
import com.triplog.ai.dto.LlmResponse;
import com.triplog.ai.log.AiCallLogger;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiClientTest {

    @Mock
    private LlmAdapter llmAdapter;

    @Mock
    private AiCallLogger aiCallLogger;

    private AiClient aiClient;

    @BeforeEach
    void setUp() {
        aiClient = new AiClient(llmAdapter, aiCallLogger, "gpt-4o-mini");
    }

    @Test
    void success_call_logs_success_and_returns_response() {
        LlmRequest request = new LlmRequest("card-text", "전주 한옥마을 사진", 60);
        LlmResponse response = new LlmResponse("골목 따라 걷는 한옥", "gpt-4o-mini", 12, 8, 20);
        when(llmAdapter.generateText(request)).thenReturn(response);

        LlmResponse result = aiClient.generateText(request);

        assertThat(result).isEqualTo(response);
        ArgumentCaptor<AiCallLog> captor = ArgumentCaptor.forClass(AiCallLog.class);
        verify(aiCallLogger).record(captor.capture());
        AiCallLog logged = captor.getValue();
        assertThat(logged.isSuccess()).isTrue();
        assertThat(logged.getKind()).isEqualTo("card-text");
        assertThat(logged.getModel()).isEqualTo("gpt-4o-mini");
        assertThat(logged.getResponseJson()).isEqualTo("골목 따라 걷는 한옥");
        assertThat(logged.getTotalTokens()).isEqualTo(20);
        assertThat(logged.getCostMs()).isGreaterThanOrEqualTo(0);
        assertThat(logged.getErrorMessage()).isNull();
    }

    @Test
    void adapter_business_exception_is_logged_as_failure_and_propagated() {
        LlmRequest request = new LlmRequest("card-text", "p", null);
        BusinessException thrown = new BusinessException(ErrorCode.AI_CALL_FAILED);
        when(llmAdapter.generateText(request)).thenThrow(thrown);

        assertThatThrownBy(() -> aiClient.generateText(request))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.AI_CALL_FAILED);

        ArgumentCaptor<AiCallLog> captor = ArgumentCaptor.forClass(AiCallLog.class);
        verify(aiCallLogger).record(captor.capture());
        AiCallLog logged = captor.getValue();
        assertThat(logged.isSuccess()).isFalse();
        assertThat(logged.getModel()).isEqualTo("gpt-4o-mini");
    }

    @Test
    void adapter_unexpected_exception_is_translated_to_ai_001() {
        LlmRequest request = new LlmRequest("card-text", "p", null);
        when(llmAdapter.generateText(request)).thenThrow(new RuntimeException("connection reset"));

        assertThatThrownBy(() -> aiClient.generateText(request))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.AI_CALL_FAILED);

        ArgumentCaptor<AiCallLog> captor = ArgumentCaptor.forClass(AiCallLog.class);
        verify(aiCallLogger).record(captor.capture());
        assertThat(captor.getValue().isSuccess()).isFalse();
    }

    @Test
    void log_record_failure_does_not_break_successful_call() {
        // REQUIRES_NEW 프록시 commit 실패를 모사: record() 가 호출측으로 예외를 던지는 상황.
        LlmRequest request = new LlmRequest("card-text", "p", null);
        LlmResponse response = new LlmResponse("문구", "gpt-4o-mini", 1, 1, 2);
        when(llmAdapter.generateText(request)).thenReturn(response);
        doThrow(new RuntimeException("tx commit failed")).when(aiCallLogger).record(any());

        LlmResponse result = aiClient.generateText(request);

        assertThat(result).isEqualTo(response);
    }

    @Test
    void log_record_failure_preserves_original_failure() {
        // 실패 경로에서도 로그 적재 실패가 원래 AI_CALL_FAILED 를 tx 예외로 마스킹하지 않아야 한다.
        LlmRequest request = new LlmRequest("card-text", "p", null);
        when(llmAdapter.generateText(request)).thenThrow(new BusinessException(ErrorCode.AI_CALL_FAILED));
        doThrow(new RuntimeException("tx commit failed")).when(aiCallLogger).record(any());

        assertThatThrownBy(() -> aiClient.generateText(request))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.AI_CALL_FAILED);
    }
}
