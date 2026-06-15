package com.triplog.ai.card;

import com.triplog.ai.AiClient;
import com.triplog.ai.card.dto.CardCaptionItem;
import com.triplog.ai.card.dto.CardCaptionResponse;
import com.triplog.ai.dto.LlmRequest;
import com.triplog.ai.dto.LlmResponse;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 카드 문구 생성 오케스트레이터 (S3-LOG-03, 이슈 #71).
 *
 * <p>사이드카 items → 프롬프트({@link CardCaptionPromptBuilder}) → LLM 호출({@link AiClient}) →
 * 파싱·검증({@link CardCaptionValidator})을 잇는다. 좌표·외곽선은 만들지 않고 LLM은 선택+문구만
 * 한다(0004 D3·D4). 호출 로깅·실패 격리·시간 측정은 {@link AiClient}가 이미 하므로 여기서 재구현
 * 하지 않는다.
 *
 * <p><b>재시도 정책(설계 확정 2026-06-15)</b>:
 * <ul>
 *   <li>형식 위반(파싱 실패 AI_002 / 구조·참조 검증 ERROR)만 재시도한다. 재시도는 동일 프롬프트
 *       재호출이다(교정 프롬프트 없음).</li>
 *   <li>경고(WARNING)는 통과를 막지 않는다 — 재시도하지 않고 결과에 실어 돌려준다(무한 재시도 방지).</li>
 *   <li>호출 실패·빈응답(AI_001)은 재시도하지 않고 즉시 surface한다 — 원인 불명 실패를 무차별
 *       재호출하면 GMS 크레딧만 소모한다(호출당 차감).</li>
 *   <li>상한 1회(원호출 + 재시도 1 = 총 2회). 소진 시 AI_002로 surface하고, 자동 초안 폴백은
 *       호출측(S3-LOG-07 #75)이 흡수한다.</li>
 * </ul>
 * 전역 Spring AI retry(application.yml {@code spring.ai.retry.max-attempts:1})는 건드리지 않는다.
 */
@Service
public class CardCaptionService {

    private static final Logger log = LoggerFactory.getLogger(CardCaptionService.class);

    /** 재시도 상한 — 원호출 + 재시도 1 = 총 2회. */
    private static final int MAX_RETRY = 1;
    /** 출력 토큰 상한 — 카드 문구는 ~120~180토큰(0004 D3)이라 작게 잡아 크레딧·길이를 보호한다. */
    private static final int MAX_TOKENS = 256;
    /** AiCallLog 적재·감사 분류용 호출 종류. */
    private static final String KIND = "card-text";

    private final AiClient aiClient;
    private final CardCaptionPromptBuilder promptBuilder = new CardCaptionPromptBuilder();
    private final CardCaptionValidator validator = new CardCaptionValidator();

    public CardCaptionService(AiClient aiClient) {
        this.aiClient = aiClient;
    }

    /**
     * items로 카드 문구를 생성한다. 검증 통과 시 응답 + 경고를 돌려주고, 재시도 소진 시
     * {@link ErrorCode#AI_INVALID_RESPONSE}, 호출 실패 시 {@link ErrorCode#AI_CALL_FAILED}를 던진다.
     */
    public CardCaptionResult generate(List<CardCaptionItem> items) {
        ValidationContext context = ValidationContext.from(items);
        String prompt = promptBuilder.build(items);
        ValidationResult lastInvalid = null;

        for (int attempt = 0; attempt <= MAX_RETRY; attempt++) {
            CardCaptionResponse parsed;
            try {
                LlmResponse response = aiClient.generateText(new LlmRequest(KIND, prompt, MAX_TOKENS));
                parsed = validator.parse(response.text());
            } catch (BusinessException e) {
                if (e.getErrorCode() == ErrorCode.AI_CALL_FAILED) {
                    throw e; // 호출 실패·빈응답 → 재시도 없이 즉시 surface
                }
                // AI_INVALID_RESPONSE (파싱 실패) → 형식 위반이므로 재시도
                log.debug("카드 문구 파싱 실패, 재시도 {}/{}", attempt, MAX_RETRY);
                continue;
            }

            ValidationResult result = validator.validate(parsed, context);
            if (result.valid()) {
                return new CardCaptionResult(parsed, result.warnings());
            }
            lastInvalid = result;
            log.debug("카드 문구 검증 실패(errors={}), 재시도 {}/{}", result.errors().size(), attempt, MAX_RETRY);
        }

        throw new BusinessException(ErrorCode.AI_INVALID_RESPONSE,
                "카드 문구가 재시도 후에도 검증을 통과하지 못했습니다"
                        + (lastInvalid != null ? " (errors=" + lastInvalid.errors().size() + ")" : ""));
    }
}
