package com.triplog.ai.card.dto;

import java.util.List;

/**
 * LLM이 코멘트를 다는 객체 1개 (OUTLINE_API §2-2).
 *
 * <p>좌표는 포함하지 않는다 — {@code itemId}/{@code anchor}로 사이드카 items(§1)를
 * 참조만 한다 (LLM 임의 좌표 생성 금지, 0004 D4). 좌표 해소는 렌더 단계(S3-LOG-04) 책임.
 *
 * @param itemId §1 {@code items[].id} 참조 (필수)
 * @param anchor 해당 item의 {@code anchors} 인덱스 (선택, 없으면 0). {@code 0 ≤ anchor < anchors 길이}
 * @param note   1~2줄 짧은 문구 (필수, §2-1.4)
 */
public record CardCaptionObject(
        Integer itemId,
        Integer anchor,
        List<String> note
) {
}
