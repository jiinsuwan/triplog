package com.triplog.ai.card;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.triplog.ai.card.dto.CardCaptionItem;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;

import java.util.List;

/**
 * 카드 문구 LLM 프롬프트 빌더 (OUTLINE_API §2-1 "최초 1회 텍스트 배치 규칙").
 *
 * <p>사이드카 items 메타(이미지 없이)를 입력으로, LLM이 <b>코멘트 대상 선택 + 짧은 문구</b>만
 * 산출하도록 지시한다 — 좌표·외곽선·장식은 만들지 않는다(0004 D3·D4). 응답 스키마는 §2-2이며
 * 파싱·검증은 {@link CardCaptionValidator}가 담당한다.
 *
 * <p>재시도는 동일 프롬프트 재호출이다(교정 프롬프트 없음) — 형식 위반은 LLM 비결정성으로 다음
 * 시도에 회복될 수 있고, 교정 프롬프트의 효과는 미검증이라 크레딧만 가중하므로 1차 범위에서 제외한다.
 *
 * <p>items 직렬화는 record 필드 선언 순서를 따라 <b>결정적</b>이다 — 같은 입력이면 같은 프롬프트라
 * 회귀 테스트·재현이 가능하다(스프링 빈 의존 없는 순수 클래스).
 */
public class CardCaptionPromptBuilder {

    // items 직렬화 전용 — 컴팩트 JSON(개행/들여쓰기 없음)으로 토큰(크레딧)을 아낀다.
    private static final ObjectMapper OBJECT_MAPPER = JsonMapper.builder().build();

    /** 사이드카 items로 최초 1회 문구 배치를 요청하는 프롬프트를 만든다. */
    public String build(List<CardCaptionItem> items) {
        return INSTRUCTION_HEADER
                + "\n\n[items]\n" + serializeItems(items)
                + "\n\n" + RULES
                + "\n\n" + OUTPUT_FORMAT;
    }

    private String serializeItems(List<CardCaptionItem> items) {
        try {
            return OBJECT_MAPPER.writeValueAsString(items == null ? List.of() : items);
        } catch (JsonProcessingException e) {
            // 입력 items 직렬화 실패 = 호출측 버그(검출 메타 손상). AI 호출 전에 막는다.
            throw new BusinessException(ErrorCode.AI_INVALID_RESPONSE, "items 직렬화 실패", e);
        }
    }

    private static final String INSTRUCTION_HEADER = """
            당신은 여행 사진 카드의 문구를 배치하는 도우미입니다.
            아래 items는 사진에서 자동 검출된 객체 목록입니다. 이미지는 주어지지 않으며, 메타데이터만으로 판단합니다.
            각 item의 center/area는 0~1 정규화 좌표·면적이고, anchors는 점수순 후보 좌표 [x, y, score]입니다.""";

    // §2-1.1~2-1.4 규칙. 개수(3~6)·줄수(2)는 §2-1 권고(사용자 이후 자유 조정 전제)라 가이드로 제시한다.
    private static final String RULES = """
            [작업 규칙]
            1. 코멘트를 달 객체를 3~6개 고릅니다. 전부가 아니라 주인공·특이점 위주로 area·center·label·src를 보고 고릅니다. src가 grid 또는 sal인 항목은 label이 없으니(null) 위치(center)·면적(area)으로만 판단합니다.
            2. anchors가 빈 항목은 문구를 놓을 자리가 없으니 코멘트 대상에서 제외합니다.
            3. 각 객체의 anchor는 anchors[0](1순위)을 기본으로 씁니다. 이미 다른 문구를 같은 영역에 배치했다면 anchors[1] 이후 인덱스로 피해 분산합니다. 화면 가장자리 0.06 이내와 네 코너는 피합니다(날짜·장소는 좌상단, 마무리는 하단 자리로 예약되어 있습니다).
            4. note(문구)는 객체당 2줄 이내의 짧은 문구입니다. 배열의 한 원소가 한 줄입니다.
            5. closing은 하단에 들어갈 마무리 한 줄입니다(선택).
            6. 모든 문구(note·closing)는 한국어로 작성합니다. label이 영어여도 한국어로 씁니다.
            7. 좌표·외곽선·장식은 만들지 않습니다. 객체는 itemId와 anchor(인덱스)로만 참조합니다. 아래 출력 형식에 없는 필드는 절대 넣지 않습니다.""";

    private static final String OUTPUT_FORMAT = """
            [출력 형식] 아래 JSON 객체 하나만 출력합니다. 설명·코드블록·마크다운 없이 JSON만 출력합니다.
            {"objects":[{"itemId":<int>,"anchor":<int>,"note":["<문구>"]}],"closing":{"text":"<마무리 한 줄>"}}""";
}
