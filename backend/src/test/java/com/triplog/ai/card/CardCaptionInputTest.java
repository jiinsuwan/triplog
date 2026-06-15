package com.triplog.ai.card;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.ai.card.dto.CardCaptionItem;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 사이드카 items를 #71 입력으로 받아들이는 계약 테스트 (S3-LOG-03).
 *
 * <p>(1) 입력 역직렬화는 <b>unknown 필드 허용</b>(출력 검증기의 엄격 매퍼와 분리)이라,
 * 렌더용 필드(bbox_norm·polygons 등)가 섞여 있어도 파싱된다. (2) {@link ValidationContext#from}이
 * anchors 없는 item도 0으로 채워 불변식을 강제한다.
 */
class CardCaptionInputTest {

    // 입력 전용 매퍼 = 기본(FAIL_ON_UNKNOWN_PROPERTIES=false). CardCaptionValidator의 엄격 매퍼를 쓰지 않는다.
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void deserializes_sidecar_item_ignoring_render_only_fields() throws Exception {
        // 추론 서버(serve_outline.py _items_json)가 실제로 내보내는 형태 그대로 —
        // LLM 미사용 필드(conf/bbox/polygons)가 항상 따라온다. center/area는 API 키.
        String json = """
                {"id":2,"label":"치즈 라면 그릇","conf":0.64,"src":"det",
                 "bbox":[0.5,0.1,0.99,0.52],"center":[0.75,0.31],"area":0.14,
                 "polygons":[[[0.5,0.1],[0.6,0.2],[0.7,0.1]]],
                 "anchors":[[0.62,0.14,88.0],[0.9,0.4,71.0]]}
                """;

        CardCaptionItem item = mapper.readValue(json, CardCaptionItem.class);

        assertThat(item.id()).isEqualTo(2);
        assertThat(item.label()).isEqualTo("치즈 라면 그릇");
        assertThat(item.src()).isEqualTo("det");
        assertThat(item.center()).containsExactly(0.75, 0.31);   // center 키 — 위치 신호 보존
        assertThat(item.area()).isEqualTo(0.14);                 // area 키 — 면적 신호 보존
        assertThat(item.anchors()).hasSize(2);
        // bbox/polygons/conf 등 unknown 필드가 있어도 예외 없이 파싱됨
    }

    @Test
    void label_is_null_for_grid_sal_items() throws Exception {
        String json = """
                {"id":4,"label":null,"src":"grid","center":[0.5,0.55],"area":0.018,
                 "anchors":[[0.4,0.45,55.0]]}
                """;

        CardCaptionItem item = mapper.readValue(json, CardCaptionItem.class);

        assertThat(item.label()).isNull();
        assertThat(item.src()).isEqualTo("grid");
    }

    @Test
    void from_fills_anchorCounts_for_every_item_including_anchorless() {
        List<CardCaptionItem> items = List.of(
                new CardCaptionItem(0, "a", "det", List.of(0.5, 0.5), 0.02,
                        List.of(List.of(0.4, 0.4, 9.0), List.of(0.6, 0.6, 8.0))),
                new CardCaptionItem(1, null, "grid", List.of(0.3, 0.3), 0.01, null)); // anchors 없음 → 0

        ValidationContext ctx = ValidationContext.from(items);

        assertThat(ctx.validItemIds()).containsExactlyInAnyOrder(0, 1);
        assertThat(ctx.anchorCounts()).containsEntry(0, 2).containsEntry(1, 0);
        // 불변식: validItemIds ⊆ anchorCounts.keySet()
        assertThat(ctx.anchorCounts().keySet()).containsAll(ctx.validItemIds());
    }

    @Test
    void from_skips_items_without_id() {
        List<CardCaptionItem> items = List.of(
                new CardCaptionItem(null, "x", "det", List.of(0.5, 0.5), 0.02,
                        List.of(List.of(0.4, 0.4, 9.0))));

        ValidationContext ctx = ValidationContext.from(items);

        assertThat(ctx.validItemIds()).isEmpty();
        assertThat(ctx.anchorCounts()).isEmpty();
    }
}
