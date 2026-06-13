package com.triplog.ai.card;

import com.triplog.ai.card.dto.CardCaptionObject;
import com.triplog.ai.card.dto.CardCaptionResponse;
import com.triplog.ai.card.dto.CardClosing;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * OUTLINE_API §2-2 LLM 응답 스키마 검증 테스트.
 * §8-1 "AI 응답 JSON 파싱 = 매우 높음" 대상.
 */
class CardCaptionValidatorTest {

    private final CardCaptionValidator validator = new CardCaptionValidator();

    // ---------- 파싱 ----------

    @Test
    void parses_valid_json() {
        String json = """
                { "objects": [ { "itemId": 0, "anchor": 0, "note": ["고소한 감자", "손이 가는 맛"] } ],
                  "closing": { "text": "오늘의 만찬" } }
                """;

        CardCaptionResponse res = validator.parse(json);

        assertThat(res.objects()).hasSize(1);
        assertThat(res.objects().get(0).itemId()).isEqualTo(0);
        assertThat(res.closing().text()).isEqualTo("오늘의 만찬");
    }

    @Test
    void rejects_unknown_coordinate_field() {
        // LLM 임의 좌표 주입 차단 (0004 D4) — 알 수 없는 필드 = 파싱 실패
        String json = """
                { "objects": [ { "itemId": 0, "note": ["x"], "cx": 0.5, "cy": 0.5 } ],
                  "closing": { "text": "끝" } }
                """;

        assertThatThrownBy(() -> validator.parse(json))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.AI_INVALID_RESPONSE);
    }

    @Test
    void rejects_malformed_json() {
        assertThatThrownBy(() -> validator.parse("{ not json"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.AI_INVALID_RESPONSE);
    }

    @Test
    void rejects_type_mismatch() {
        // objects 가 배열이 아니라 객체 — 구문은 맞으나 타입 불일치
        String json = """
                { "objects": {}, "closing": { "text": "끝" } }
                """;

        assertThatThrownBy(() -> validator.parse(json))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.AI_INVALID_RESPONSE);
    }

    // ---------- 구조 검증 (거부) ----------

    @Test
    void rejects_missing_objects() {
        CardCaptionResponse res = new CardCaptionResponse(null, new CardClosing("끝"));

        ValidationResult result = validator.validateStructure(res);

        assertThat(result.valid()).isFalse();
        assertThat(result.errors()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.OBJECTS_REQUIRED);
    }

    @Test
    void rejects_null_item_id() {
        CardCaptionResponse res = withFirst(new CardCaptionObject(null, 0, List.of("a")));

        ValidationResult result = validator.validateStructure(res);

        assertThat(result.valid()).isFalse();
        assertThat(result.errors()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.ITEM_ID_REQUIRED);
    }

    @Test
    void rejects_blank_note() {
        CardCaptionResponse res = withFirst(new CardCaptionObject(0, 0, List.of()));

        ValidationResult result = validator.validateStructure(res);

        assertThat(result.valid()).isFalse();
        assertThat(result.errors()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.NOTE_REQUIRED);
    }

    @Test
    void rejects_note_with_blank_line() {
        // 일부만 빈 줄("맛있다", "")도 거부 — 빈 줄 렌더 누수 차단
        CardCaptionResponse res = withFirst(new CardCaptionObject(0, 0, List.of("맛있다", "")));

        ValidationResult result = validator.validateStructure(res);

        assertThat(result.valid()).isFalse();
        assertThat(result.errors()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.NOTE_REQUIRED);
    }

    // ---------- 구조 검증 (통과 + 경고) ----------

    @Test
    void valid_structure_passes_without_warnings() {
        ValidationResult result = validator.validateStructure(validSample());

        assertThat(result.valid()).isTrue();
        assertThat(result.warnings()).isEmpty();
    }

    @Test
    void warns_empty_objects() {
        CardCaptionResponse res = new CardCaptionResponse(List.of(), new CardClosing("끝"));

        ValidationResult result = validator.validateStructure(res);

        assertThat(result.valid()).isTrue();
        assertThat(result.warnings()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.OBJECTS_EMPTY)
                .doesNotContain(CardCaptionRule.OBJECT_COUNT_RANGE);
    }

    @Test
    void warns_object_count_out_of_range() {
        CardCaptionResponse res = new CardCaptionResponse(
                List.of(new CardCaptionObject(0, 0, List.of("한 개뿐"))), new CardClosing("끝"));

        ValidationResult result = validator.validateStructure(res);

        assertThat(result.valid()).isTrue(); // 경고는 통과를 막지 않음
        assertThat(result.warnings()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.OBJECT_COUNT_RANGE);
    }

    @Test
    void warns_note_exceeding_two_lines() {
        CardCaptionResponse res = withFirst(new CardCaptionObject(0, 0, List.of("한", "두", "세")));

        ValidationResult result = validator.validateStructure(res);

        assertThat(result.valid()).isTrue();
        assertThat(result.warnings()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.NOTE_TOO_MANY_LINES);
    }

    @Test
    void warns_duplicate_item_id() {
        CardCaptionResponse res = new CardCaptionResponse(
                List.of(
                        new CardCaptionObject(0, 0, List.of("a")),
                        new CardCaptionObject(0, 1, List.of("b")),
                        new CardCaptionObject(1, 0, List.of("c"))),
                new CardClosing("끝"));

        ValidationResult result = validator.validateStructure(res);

        assertThat(result.warnings()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.ITEM_ID_DUPLICATE);
    }

    @Test
    void warns_missing_anchor() {
        CardCaptionResponse res = withFirst(new CardCaptionObject(0, null, List.of("a")));

        ValidationResult result = validator.validateStructure(res);

        assertThat(result.valid()).isTrue();
        assertThat(result.warnings()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.ANCHOR_DEFAULTED);
    }

    @Test
    void warns_missing_closing() {
        CardCaptionResponse res = new CardCaptionResponse(validSample().objects(), null);

        ValidationResult result = validator.validateStructure(res);

        assertThat(result.valid()).isTrue();
        assertThat(result.warnings()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.CLOSING_MISSING);
    }

    @Test
    void invalid_when_error_and_warning_coexist() {
        // objects 1개(개수 경고) + note 빈값(에러)
        CardCaptionResponse res = new CardCaptionResponse(
                List.of(new CardCaptionObject(0, 0, List.of())), new CardClosing("끝"));

        ValidationResult result = validator.validateStructure(res);

        assertThat(result.valid()).isFalse(); // error 가 있으면 warning 유무와 무관하게 invalid
        assertThat(result.errors()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.NOTE_REQUIRED);
        assertThat(result.warnings()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.OBJECT_COUNT_RANGE);
    }

    // ---------- 참조 검증 ----------

    @Test
    void rejects_unknown_item_id() {
        CardCaptionResponse res = withFirst(new CardCaptionObject(99, 0, List.of("a")));
        ValidationContext ctx = new ValidationContext(Set.of(0, 1, 2), Map.of(0, 3, 1, 3, 2, 3));

        ValidationResult result = validator.validate(res, ctx);

        assertThat(result.valid()).isFalse();
        assertThat(result.errors()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.ITEM_ID_UNKNOWN);
    }

    @ParameterizedTest
    @CsvSource({
            "-1, 3",  // 음수
            "3, 3",   // == anchors 개수 (경계)
            "5, 3"    // 초과
    })
    void rejects_anchor_index_outside_range(int anchor, int count) {
        CardCaptionResponse res = withFirst(new CardCaptionObject(0, anchor, List.of("a")));
        ValidationContext ctx = new ValidationContext(Set.of(0, 1, 2), Map.of(0, count, 1, 3, 2, 3));

        ValidationResult result = validator.validate(res, ctx);

        assertThat(result.valid()).isFalse();
        assertThat(result.errors()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.ANCHOR_OUT_OF_RANGE);
    }

    @Test
    void rejects_anchor_when_count_missing() {
        // validItemIds 엔 있으나 anchorCounts 에 키 없음 → 현재 거동: anchor 0 도 거부 (계약 불변식 명문화)
        CardCaptionResponse res = withFirst(new CardCaptionObject(0, 0, List.of("a")));
        ValidationContext ctx = new ValidationContext(Set.of(0, 1, 2), Map.of(1, 3, 2, 3)); // 0 누락

        ValidationResult result = validator.validate(res, ctx);

        assertThat(result.valid()).isFalse();
        assertThat(result.errors()).extracting(ValidationResult.Issue::rule)
                .contains(CardCaptionRule.ANCHOR_OUT_OF_RANGE);
    }

    @Test
    void structure_and_reference_both_valid_passes() {
        // validSample 의 셋째는 anchor 2 (count 3 의 상한 직전) — 유효 경계 커버
        ValidationContext ctx = new ValidationContext(Set.of(0, 1, 2), Map.of(0, 3, 1, 3, 2, 3));

        ValidationResult result = validator.validate(validSample(), ctx);

        assertThat(result.valid()).isTrue();
        assertThat(result.warnings()).isEmpty();
    }

    // ---------- 헬퍼 ----------

    /** 권고 범위(3개)·정상 note 의 표준 유효 샘플. 셋째 anchor=2 로 상한 직전 경계를 포함. */
    private CardCaptionResponse validSample() {
        return new CardCaptionResponse(
                List.of(
                        new CardCaptionObject(0, 0, List.of("고소한 감자", "손이 가는 맛")),
                        new CardCaptionObject(1, 1, List.of("톡 쏘는 탄산")),
                        new CardCaptionObject(2, 2, List.of("부드러운 한 접시"))),
                new CardClosing("오늘의 만찬, 다 같이"));
    }

    /** 첫 객체만 교체하고 나머지 2개는 정상 — 개수 경고 없이 단일 규칙을 격리해 검증. */
    private CardCaptionResponse withFirst(CardCaptionObject first) {
        return new CardCaptionResponse(
                List.of(
                        first,
                        new CardCaptionObject(1, 0, List.of("b")),
                        new CardCaptionObject(2, 0, List.of("c"))),
                new CardClosing("끝"));
    }
}
