package com.triplog.ai.card;

import com.triplog.ai.card.dto.CardCaptionItem;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 카드 문구 프롬프트 빌더 테스트 (OUTLINE_API §2-1).
 *
 * <p>레퍼런스 사진의 사이드카 items를 고정 입력으로, 프롬프트가 결정적이고(재현 가능) §2-1 배치
 * 규칙과 §2-2 출력 스키마를 빠짐없이 담는지 검증한다(이슈 #71 Test Criteria "프롬프트 회귀 케이스
 * 1세트"). 픽스처는 <b>익명/합성</b>이다 — 실제 {@code poc/card/out/v12/auto_*.json}은 개인 사진을
 * 포함해 커밋 금지라, §1 스키마(키·타입)만 본떠 합성한다.
 */
class CardCaptionPromptBuilderTest {

    private final CardCaptionPromptBuilder builder = new CardCaptionPromptBuilder();

    /**
     * 레퍼런스 음식 사진 1장의 자동 검출 items 고정 입력 (OUTLINE_API §1 스키마, 합성값).
     * det/det-weak 라벨 객체와 label 없는 grid 구제 객체(§5 한계)를 함께 둔다.
     */
    private static List<CardCaptionItem> referenceItems() {
        return List.of(
                new CardCaptionItem(0, "꽈배기 튀김 접시", "det",
                        List.of(0.10, 0.93), 0.072,
                        List.of(List.of(0.22, 0.80, 72.0), List.of(0.05, 0.62, 70.6))),
                new CardCaptionItem(1, "치즈 라면 그릇", "det",
                        List.of(0.75, 0.31), 0.140,
                        List.of(List.of(0.62, 0.14, 88.0), List.of(0.90, 0.40, 71.0))),
                new CardCaptionItem(2, "치즈 떡볶이 그릇", "det-weak",
                        List.of(0.45, 0.22), 0.090,
                        List.of(List.of(0.33, 0.06, 79.0))),
                new CardCaptionItem(3, "음료 잔", "det",
                        List.of(0.84, 0.78), 0.031,
                        List.of(List.of(0.72, 0.66, 66.0))),
                // label 없는 구제 객체 — 위치·면적으로만 판단 (§2-1.1, §5)
                new CardCaptionItem(4, null, "grid",
                        List.of(0.50, 0.55), 0.018,
                        List.of(List.of(0.40, 0.45, 55.0))));
    }

    @Test
    void prompt_is_deterministic_for_same_items() {
        assertThat(builder.build(referenceItems())).isEqualTo(builder.build(referenceItems()));
    }

    @Test
    void carries_section_2_1_placement_rules() {
        String prompt = builder.build(referenceItems());

        assertThat(prompt)
                .contains("3~6개")        // §2-1.1 코멘트 대상 개수
                .contains("anchors[0]")    // §2-1.2 기본 앵커
                .contains("2줄")           // §2-1.4 줄 수
                .contains("좌상단")        // §2-1.3 고정 요소
                .contains("우하단")
                .contains("grid")         // label 없는 항목 처리 지시 (§5)
                .contains("한국어")        // 출력 언어 강제
                .contains("코멘트 대상에서 제외")  // anchors 빈 항목 skip 지시
                .contains("좌표");         // 0004 D4 좌표 금지
    }

    @Test
    void carries_section_2_2_output_schema() {
        String prompt = builder.build(referenceItems());

        assertThat(prompt)
                .contains("objects")
                .contains("itemId")
                .contains("anchor")
                .contains("note")
                .contains("closing");
    }

    @Test
    void embeds_item_metadata() {
        String prompt = builder.build(referenceItems());

        // 직렬화된 items가 프롬프트에 그대로 실린다 (API 계약 키 center/area/anchors)
        assertThat(prompt)
                .contains("\"id\":0")
                .contains("꽈배기 튀김 접시")
                .contains("\"src\":\"grid\"")
                .contains("\"center\":")
                .contains("\"area\":")
                .contains("\"anchors\":");
        // label 없는 항목은 null로 직렬화 (위치·면적으로만 판단하라는 신호)
        assertThat(prompt).contains("\"label\":null");
    }
}
