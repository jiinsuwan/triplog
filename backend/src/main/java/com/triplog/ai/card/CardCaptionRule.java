package com.triplog.ai.card;

/**
 * 카드 문구 응답 검증 규칙 (OUTLINE_API §2-2).
 *
 * <p>{@code ERROR} = 거부(구조 불변식 위반), {@code WARNING} = 권고(허용 + 기록).
 * 강제/권고 구분 근거: §2-1은 개수(3~6)·줄수(2줄)를 LLM 판단 가이드로 두고
 * "사용자가 이후 자유 조정"을 전제하므로 거부가 아닌 경고. 좌표 금지(0004 D4)와
 * 필수 필드 누락만 거부.
 */
public enum CardCaptionRule {

    // 거부 — 구조 불변식
    OBJECTS_REQUIRED(Severity.ERROR, "objects 필드가 없거나 null입니다."),
    ITEM_ID_REQUIRED(Severity.ERROR, "objects[].itemId가 없습니다."),
    NOTE_REQUIRED(Severity.ERROR, "objects[].note가 없거나 빈/공백 줄을 포함합니다."),
    ITEM_ID_UNKNOWN(Severity.ERROR, "itemId가 사이드카 items에 존재하지 않습니다."),
    ANCHOR_OUT_OF_RANGE(Severity.ERROR, "anchor 인덱스가 해당 item의 anchors 범위를 벗어났습니다."),

    // 권고 — 허용 + 기록
    OBJECTS_EMPTY(Severity.WARNING, "objects가 비어 있습니다 — 문구 없는 카드가 됩니다."),
    OBJECT_COUNT_RANGE(Severity.WARNING, "objects 개수가 권고 범위(3~6) 밖입니다."),
    NOTE_TOO_MANY_LINES(Severity.WARNING, "note가 2줄을 초과합니다 (§2-1.4)."),
    ITEM_ID_DUPLICATE(Severity.WARNING, "같은 itemId에 두 번 이상 코멘트가 달렸습니다."),
    ANCHOR_DEFAULTED(Severity.WARNING, "anchor가 없어 기본값 0을 적용합니다."),
    CLOSING_MISSING(Severity.WARNING, "closing이 없습니다.");

    public enum Severity {
        ERROR, WARNING
    }

    private final Severity severity;
    private final String message;

    CardCaptionRule(Severity severity, String message) {
        this.severity = severity;
        this.message = message;
    }

    public Severity severity() {
        return severity;
    }

    public String message() {
        return message;
    }
}
