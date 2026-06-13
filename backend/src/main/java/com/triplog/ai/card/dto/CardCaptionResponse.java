package com.triplog.ai.card.dto;

import java.util.List;

/**
 * 텍스트 LLM의 카드 문구 응답 스키마 (OUTLINE_API §2-2, 0004 D3).
 *
 * <p>LLM은 <b>객체 선택 + 짧은 문구만</b> 생성하고 좌표·외곽선·장식은 만들지 않는다.
 * 검증·파싱은 {@link com.triplog.ai.card.CardCaptionValidator}.
 *
 * @param objects 코멘트를 달 객체 목록
 * @param closing 마무리 한 줄 (선택)
 */
public record CardCaptionResponse(
        List<CardCaptionObject> objects,
        CardClosing closing
) {
}
