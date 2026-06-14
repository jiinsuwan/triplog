package com.triplog.ai.card;

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
}
