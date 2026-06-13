package com.triplog.ai.card;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.triplog.ai.card.dto.CardCaptionObject;
import com.triplog.ai.card.dto.CardCaptionResponse;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 카드 문구 LLM 응답 파싱 + 검증 (OUTLINE_API §2-2).
 *
 * <p>파싱은 알 수 없는 필드를 거부하여 LLM의 임의 좌표 주입을 구조적으로 차단한다
 * (0004 D4). 검증은 2단계 — 구조 검증(사이드카 불요, CI 단위 테스트 대상)과
 * 참조 검증(items 주입)으로 나눈다. 스프링 빈 의존이 없는 순수 클래스다.
 */
public class CardCaptionValidator {

    /** §2-1 권고: 코멘트는 주인공 위주 3~6개. */
    private static final int RECOMMENDED_MIN_OBJECTS = 3;
    private static final int RECOMMENDED_MAX_OBJECTS = 6;
    /** §2-1.4 권고: 2줄 이내 짧은 문구. */
    private static final int MAX_NOTE_LINES = 2;

    // 알 수 없는 필드(좌표 등) = 거부 → 좌표 금지(0004 D4)를 파싱에서 강제.
    // ObjectMapper는 설정 후 thread-safe라 단일 인스턴스를 공유한다.
    private static final ObjectMapper OBJECT_MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    /**
     * LLM 원시 JSON을 응답 DTO로 파싱한다. malformed JSON·타입 불일치·알 수 없는 필드
     * (좌표 주입 등)면 {@link ErrorCode#AI_INVALID_RESPONSE}로 거부한다.
     */
    public CardCaptionResponse parse(String json) {
        try {
            CardCaptionResponse parsed = OBJECT_MAPPER.readValue(json, CardCaptionResponse.class);
            if (parsed == null) {
                // JSON 리터럴 null 등 — 파싱은 됐으나 본문이 없음
                throw new BusinessException(ErrorCode.AI_INVALID_RESPONSE, "AI 응답이 비어 있습니다.");
            }
            return parsed;
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.AI_INVALID_RESPONSE, "AI 응답 JSON 파싱 실패", e);
        }
    }

    /** 1단계 — 구조 검증 (사이드카 items 불요). */
    public ValidationResult validateStructure(CardCaptionResponse response) {
        List<ValidationResult.Issue> issues = new ArrayList<>();
        collectStructureIssues(response, issues);
        return new ValidationResult(issues);
    }

    /** 2단계 — 구조 + 참조 검증 (사이드카 items 주입). */
    public ValidationResult validate(CardCaptionResponse response, ValidationContext context) {
        List<ValidationResult.Issue> issues = new ArrayList<>();
        collectStructureIssues(response, issues);
        collectReferenceIssues(response, context, issues);
        return new ValidationResult(issues);
    }

    private void collectStructureIssues(CardCaptionResponse response, List<ValidationResult.Issue> issues) {
        if (response.objects() == null) {
            issues.add(issue(CardCaptionRule.OBJECTS_REQUIRED, "objects"));
        } else {
            List<CardCaptionObject> objects = response.objects();
            if (objects.isEmpty()) {
                issues.add(issue(CardCaptionRule.OBJECTS_EMPTY, "objects"));
            } else if (objects.size() < RECOMMENDED_MIN_OBJECTS || objects.size() > RECOMMENDED_MAX_OBJECTS) {
                issues.add(issue(CardCaptionRule.OBJECT_COUNT_RANGE, "objects"));
            }

            Set<Integer> seen = new HashSet<>();
            for (int i = 0; i < objects.size(); i++) {
                CardCaptionObject obj = objects.get(i);
                String path = objectPath(i);

                if (obj.itemId() == null) {
                    issues.add(issue(CardCaptionRule.ITEM_ID_REQUIRED, path));
                } else if (!seen.add(obj.itemId())) {
                    issues.add(issue(CardCaptionRule.ITEM_ID_DUPLICATE, path + ".itemId"));
                }

                if (isNoteInvalid(obj.note())) {
                    issues.add(issue(CardCaptionRule.NOTE_REQUIRED, path + ".note"));
                } else if (obj.note().size() > MAX_NOTE_LINES) {
                    issues.add(issue(CardCaptionRule.NOTE_TOO_MANY_LINES, path + ".note"));
                }

                if (obj.anchor() == null) {
                    issues.add(issue(CardCaptionRule.ANCHOR_DEFAULTED, path + ".anchor"));
                }
            }
        }

        if (response.closing() == null
                || response.closing().text() == null
                || response.closing().text().isBlank()) {
            issues.add(issue(CardCaptionRule.CLOSING_MISSING, "closing"));
        }
    }

    private void collectReferenceIssues(CardCaptionResponse response, ValidationContext context,
                                        List<ValidationResult.Issue> issues) {
        if (response.objects() == null) {
            return;
        }
        List<CardCaptionObject> objects = response.objects();
        for (int i = 0; i < objects.size(); i++) {
            CardCaptionObject obj = objects.get(i);
            String path = objectPath(i);

            if (obj.itemId() == null) {
                continue; // 구조 검증에서 이미 보고됨
            }
            if (!context.validItemIds().contains(obj.itemId())) {
                issues.add(issue(CardCaptionRule.ITEM_ID_UNKNOWN, path + ".itemId"));
                continue;
            }
            int anchorIndex = obj.anchor() == null ? 0 : obj.anchor();
            int anchorCount = context.anchorCounts().getOrDefault(obj.itemId(), 0);
            if (anchorIndex < 0 || anchorIndex >= anchorCount) {
                issues.add(issue(CardCaptionRule.ANCHOR_OUT_OF_RANGE, path + ".anchor"));
            }
        }
    }

    /** note가 비었거나 빈/공백 줄을 하나라도 포함하면 무효 — 빈 줄이 렌더로 새지 않게 한다. */
    private boolean isNoteInvalid(List<String> note) {
        return note == null || note.isEmpty()
                || note.stream().anyMatch(line -> line == null || line.isBlank());
    }

    private String objectPath(int index) {
        return "objects[" + index + "]";
    }

    private ValidationResult.Issue issue(CardCaptionRule rule, String path) {
        return new ValidationResult.Issue(rule, path);
    }
}
