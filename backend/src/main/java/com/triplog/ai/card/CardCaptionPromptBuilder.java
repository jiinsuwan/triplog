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
 *
 * <p><b>범위(1차·데모):</b> 예시·역할 어휘는 카페·음식 사진에 맞춰져 있다. 풍경·장소·인물 등 일반
 * 여행 사진으로의 일반화는 후속 과제다. 단, 프롬프트는 "이 사진은 음식"이라고 단정하지 않고 items의
 * label로 장면을 추론하므로, 비음식 사진이 와도 일반 기록 톤으로 안전하게 흐른다.
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
            당신은 여행 사진 카드 위에 들어갈 손글씨 메모를 쓰는 도우미입니다.
            아래 items는 사진에서 자동 검출된 객체 목록이며, 이미지는 주어지지 않습니다(메타데이터만으로 판단).
            각 item의 center/area는 0~1 정규화 좌표·면적, anchors는 점수순 후보 [x, y, score]입니다.
            문구는 객체 설명·광고·안내문이 아니라, 사진 주인이 사진 위에 직접 끄적인 짧은 메모처럼 씁니다.""";

    // 스타일·역할 분산·반복 방지·배치 규칙. 개수(3~6)·줄수(2)는 검증기(CardCaptionValidator) 권고와 정합.
    //   장면은 items.label 로만 추론하게 두고 "이 사진은 음식"이라 단정하지 않는다(비음식 사진 안전).
    private static final String RULES = """
            [장면 추론 — 속으로만, 출력 금지]
            - label·개수·면적·위치로 장면을 추정합니다(카페/음료/디저트, 고기/식사/반찬 등). 결과는 출력하지 않습니다.
            - 같은 종류(cup·glass·plate)가 여럿이면 함께한 상황일 수 있고, area가 크면 주인공, 작아도 소스·디저트·트레이 같은 디테일이면 대상이 됩니다.
            - label이 null(src=grid/sal)이면 장면 근거로 쓰지 말고 위치·면적으로만 보조 판단합니다.
            - 불확실하면 장소·메뉴명을 지어내지 않습니다. 음식 관련 label(cup·glass·food·meat·dessert 등)이 없으면 음식 어휘를 피해 담백한 여행 기록 톤으로 씁니다.

            [문구]
            - 한 카드 안에서 문구의 관점이 겹치지 않게 합니다: 주인공·감각(맛·온도·식감·향)·디테일(소스·반찬·얼음·트레이)·상황(나눠 먹기·수다·기다림)·사담(한입만·내가 찜·리필각)·기록(오늘 먹은 것) 중 골라 섞되, 이 단어들은 출력하지 않습니다.
            - 한 카드 안에서 같은 시작어·끝말·명사(오늘·주인공·포인트·끝 등)를 반복하지 않습니다. "~한 맛 / ~의 시작 / ~와 함께 / ~가득 / ~최고 / ~행복" 구조가 반복되면 실패입니다.
            - 사용자에게 말하지 않습니다("느껴보세요·즐겨보세요·간직하세요" 류 금지).
            - 한국어로, 한 줄 12자 안팎. note는 객체당 1~2줄(배열 한 원소=한 줄). 모르는 장소·메뉴·지역명은 만들지 않습니다.
            - 아래는 톤 참고용입니다(그대로 베끼지 말 것): 얼음 동동 · 이 컵은 내가 찜 · 지글지글~ · 상추 리필각.

            [객체 선택·배치]
            - 코멘트 달 객체 3~6개: 전부 말고 주인공·특이점·분위기 디테일 위주.
            - anchors가 빈 객체는 제외합니다. anchor는 anchors[0] 기본, 같은 영역에 이미 배치했으면 anchors[1] 이후로 분산하되, 고른 인덱스가 그 객체의 anchors에 없으면 그 객체를 빼고 다른 객체를 고릅니다.
            - 화면 가장자리 0.06 이내·네 코너·하단(마무리 자리)은 피합니다.
            - 좌표·외곽선·장식은 만들지 않고, 객체는 itemId·anchor(인덱스)로만 참조합니다. 출력 형식에 없는 필드는 넣지 않습니다.

            [closing — 가능하면 포함]
            - 사진 전체를 가볍게 맺는 한 줄. note들의 요약이 아니고, "여행의 기억·소소한 행복·추억을 간직" 같은 뻔한 마무리로 흐르지 않게 합니다. 사용자에게 말하지 않습니다.
            - 객체 문구가 감성적이면 closing은 담백하게, 담백하면 살짝 감성적으로 씁니다.""";

    private static final String OUTPUT_FORMAT = """
            [출력 형식] 아래 JSON 객체 하나만 출력합니다. 설명·코드블록·마크다운 없이 JSON만 출력합니다.
            {"objects":[{"itemId":<int>,"anchor":<int>,"note":["<문구>"]}],"closing":{"text":"<마무리 한 줄>"}}""";
}
