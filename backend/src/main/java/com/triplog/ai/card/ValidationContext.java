package com.triplog.ai.card;

import com.triplog.ai.card.dto.CardCaptionItem;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 참조 검증 입력 (OUTLINE_API §2-2).
 *
 * <p>사이드카 items(§1)에서 추출한 최소 정보만 담는다 — 검증기가 사이드카를 직접
 * 호출하지 않게 하여 단위 테스트를 가능하게 한다(2단계 분리). items 조달 경로는
 * 렌더·사이드카 연동(S3-LOG-02/04)에서 정의한다.
 *
 * <p>불변식: {@code validItemIds} ⊆ {@code anchorCounts.keySet()}. anchors가 없는 item도
 * {@code anchorCounts}에 0으로 명시해야 한다 — 키가 누락되면 0으로 간주되어 anchor 0조차
 * ANCHOR_OUT_OF_RANGE로 거부된다.
 *
 * @param validItemIds 허용 itemId 집합 ({@code items[].id})
 * @param anchorCounts  itemId별 {@code anchors} 개수 (anchor 인덱스 상한)
 */
public record ValidationContext(
        Set<Integer> validItemIds,
        Map<Integer, Integer> anchorCounts
) {

    /** 방어적 불변 복사 — 외부에서 넘긴 컬렉션이 이후 변경돼도 검증 컨텍스트가 흔들리지 않게 한다. */
    public ValidationContext {
        validItemIds = validItemIds == null ? Set.of() : Set.copyOf(validItemIds);
        anchorCounts = anchorCounts == null ? Map.of() : Map.copyOf(anchorCounts);
    }

    /**
     * 사이드카 items에서 참조 검증 컨텍스트를 만든다 (S3-LOG-03).
     *
     * <p>불변식을 한 곳에서 강제한다 — <b>모든 item에 대해 {@code anchorCounts} 키를 채운다</b>.
     * {@code anchors}가 null/빈 item({@code grid}/{@code sal} 구제 항목 등)도 0으로 명시해야
     * {@code validItemIds ⊆ anchorCounts.keySet()}이 성립하고, anchor 0조차 거짓
     * ANCHOR_OUT_OF_RANGE로 거부되는 일이 없다. {@code id}가 null인 item은 참조 대상이 아니므로
     * 건너뛴다.
     */
    public static ValidationContext from(List<CardCaptionItem> items) {
        Set<Integer> validItemIds = new HashSet<>();
        Map<Integer, Integer> anchorCounts = new HashMap<>();
        if (items != null) {
            for (CardCaptionItem item : items) {
                if (item == null || item.id() == null) {
                    continue;
                }
                validItemIds.add(item.id());
                anchorCounts.put(item.id(), item.anchors() == null ? 0 : item.anchors().size());
            }
        }
        return new ValidationContext(validItemIds, anchorCounts);
    }
}
