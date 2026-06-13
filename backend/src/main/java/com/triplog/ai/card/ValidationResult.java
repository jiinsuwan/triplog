package com.triplog.ai.card;

import java.util.List;

/**
 * 검증 결과 (OUTLINE_API §2-2).
 *
 * <p>{@link #errors()}가 비어 있으면 통과({@link #valid()}). {@link #warnings()}는
 * 통과를 막지 않는다 — 호출자(S3-LOG-03 어댑터)가 기록·폴백 판단에 사용한다.
 *
 * @param issues 위반 목록 (없으면 빈 리스트)
 */
public record ValidationResult(List<Issue> issues) {

    /**
     * 위반 1건.
     *
     * @param rule 위반 규칙
     * @param path 위반 위치 (예: {@code objects[2].note})
     */
    public record Issue(CardCaptionRule rule, String path) {
    }

    public List<Issue> errors() {
        return issues.stream()
                .filter(i -> i.rule().severity() == CardCaptionRule.Severity.ERROR)
                .toList();
    }

    public List<Issue> warnings() {
        return issues.stream()
                .filter(i -> i.rule().severity() == CardCaptionRule.Severity.WARNING)
                .toList();
    }

    public boolean valid() {
        return errors().isEmpty();
    }
}
