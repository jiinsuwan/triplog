package com.triplog.ai.card;

import com.triplog.ai.AiClient;
import com.triplog.ai.card.dto.CardCaptionItem;
import com.triplog.ai.dto.LlmResponse;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 카드 문구 오케스트레이터 재시도 흐름 테스트 (S3-LOG-03, 이슈 #71).
 *
 * <p>{@link AiClient}를 mock해 라이브 GMS 호출(크레딧 차감) 없이 재시도 제어만 직교적으로 본다 —
 * 검증 규칙 자체는 {@link CardCaptionValidatorTest}가 덮으므로 여기서 재현하지 않는다. 핵심:
 * 형식 위반만 재시도(상한 1) / 경고는 재시도 없이 통과 / 호출 실패는 즉시 surface.
 */
@ExtendWith(MockitoExtension.class)
class CardCaptionServiceTest {

    @Mock
    private AiClient aiClient;

    private CardCaptionService service;

    @BeforeEach
    void setUp() {
        service = new CardCaptionService(aiClient);
    }

    private static List<CardCaptionItem> items() {
        return List.of(
                new CardCaptionItem(0, "커피", "det", List.of(0.3, 0.4), 0.02, List.of(List.of(0.3, 0.3, 9.0))),
                new CardCaptionItem(1, "케이크", "det", List.of(0.6, 0.5), 0.05, List.of(List.of(0.6, 0.6, 8.0))),
                new CardCaptionItem(2, "접시", "det", List.of(0.5, 0.7), 0.08, List.of(List.of(0.5, 0.5, 7.0))));
    }

    private static LlmResponse resp(String text) {
        return new LlmResponse(text, "gpt-4o-mini", null, null, null);
    }

    // 통과 — objects 3개(권고 범위), 유효 itemId/anchor, closing 존재
    private static final String VALID = """
            {"objects":[{"itemId":0,"anchor":0,"note":["향긋한 커피"]},
                        {"itemId":1,"anchor":0,"note":["달콤한 케이크"]},
                        {"itemId":2,"anchor":0,"note":["가득한 접시"]}],
             "closing":{"text":"오늘의 디저트"}}""";
    // 통과지만 경고 — objects 1개(OBJECT_COUNT_RANGE 경고). errors 없음 → 재시도 안 함
    private static final String WARN_ONLY = """
            {"objects":[{"itemId":0,"anchor":0,"note":["향긋한 커피"]}],"closing":{"text":"끝"}}""";
    // 거부(ERROR) — itemId 99는 items에 없음(ITEM_ID_UNKNOWN)
    private static final String INVALID = """
            {"objects":[{"itemId":99,"anchor":0,"note":["x"]}],"closing":{"text":"끝"}}""";
    // 파싱 실패(AI_002)
    private static final String MALFORMED = "{ not json";

    @Test
    void valid_first_response_returns_without_retry() {
        when(aiClient.generateText(any())).thenReturn(resp(VALID));

        CardCaptionResult result = service.generate(items());

        assertThat(result.response().objects()).hasSize(3);
        assertThat(result.warnings()).isEmpty();
        verify(aiClient, times(1)).generateText(any());
    }

    @Test
    void warnings_only_response_returns_without_retry() {
        when(aiClient.generateText(any())).thenReturn(resp(WARN_ONLY));

        CardCaptionResult result = service.generate(items());

        assertThat(result.response().objects()).hasSize(1);
        assertThat(result.warnings()).isNotEmpty(); // 권고 개수 범위(3~6) 밖 경고
        verify(aiClient, times(1)).generateText(any()); // 경고는 무한 재시도를 부르지 않는다
    }

    @Test
    void validation_error_then_valid_retries_once() {
        when(aiClient.generateText(any())).thenReturn(resp(INVALID)).thenReturn(resp(VALID));

        CardCaptionResult result = service.generate(items());

        assertThat(result.response().objects()).hasSize(3);
        verify(aiClient, times(2)).generateText(any());
    }

    @Test
    void parse_failure_then_valid_retries_once() {
        when(aiClient.generateText(any())).thenReturn(resp(MALFORMED)).thenReturn(resp(VALID));

        CardCaptionResult result = service.generate(items());

        assertThat(result.response().objects()).hasSize(3);
        verify(aiClient, times(2)).generateText(any());
    }

    @Test
    void always_invalid_throws_AI_002_after_two_attempts() {
        when(aiClient.generateText(any())).thenReturn(resp(INVALID));

        assertThatThrownBy(() -> service.generate(items()))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.AI_INVALID_RESPONSE));
        verify(aiClient, times(2)).generateText(any()); // 상한 1 = 원호출 + 재시도 1
    }

    @Test
    void call_failure_is_surfaced_without_retry() {
        when(aiClient.generateText(any())).thenThrow(new BusinessException(ErrorCode.AI_CALL_FAILED));

        assertThatThrownBy(() -> service.generate(items()))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.AI_CALL_FAILED));
        verify(aiClient, times(1)).generateText(any()); // AI_001은 재시도하지 않는다
    }
}
