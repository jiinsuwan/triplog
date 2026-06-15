package com.triplog.ai.card.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * 카드 문구 생성 LLM에 넘기는 입력 item (OUTLINE_API §1·§2-1).
 *
 * <p>사이드카 자동 초안 {@code items[]}에서 <b>LLM 선택 판단에 필요한 필드만</b> 추린 것이다 —
 * 좌표 해소용 필드(bbox·polygons)는 렌더(S3-LOG-04) 책임이라 제외하고, 선택(§2-1.1)에 쓰는
 * {@code label·src·center·area}와 앵커 선택(§2-1.2)에 쓰는 {@code anchors}만 담는다.
 *
 * <p><b>필드명 정본 = 사이드카 실측 출력 키</b>(예 {@code center_norm}/{@code area_frac}).
 * OUTLINE_API.md §1 예시 표기({@code center}/{@code area}/{@code bbox})는 구버전 표기이고,
 * 추론 서버(S3-LOG-02)가 실제로 내보내는 키는 {@code *_norm}/{@code area_frac}이다.
 *
 * <p><b>역직렬화 정책: unknown 필드 허용</b>({@link JsonIgnoreProperties}로 타입에 고정).
 * 사이드카 items에는 LLM 입력에 안 쓰는 {@code bbox_norm}/{@code polygons}/{@code conf}/
 * {@code tightened}/{@code poly_norm}이 항상 따라온다. 정책을 매퍼 설정이 아니라 타입에 박아
 * 어떤 매퍼(LOG-04의 {@code convertValue} 포함)로 역직렬화해도 관대하게 한다 — 입력은 관대,
 * <b>출력 검증기 {@link com.triplog.ai.card.CardCaptionValidator}는 정반대로 unknown 거부</b>
 * (좌표 주입 차단, 0004 D4)이므로 둘을 절대 한 매퍼로 합치지 않는다.
 *
 * @param id      §1 {@code items[].id} (응답 {@code itemId}가 참조)
 * @param label   객체 라벨 (참고용 — {@code grid}/{@code sal}은 null, 위치·면적으로만 판단)
 * @param src     항목 출처 ({@code det}/{@code det-weak}/{@code det-zoom}/{@code grid}/{@code sal})
 * @param center  객체 중심 {@code [x, y]} (0~1 정규화, 키 {@code center_norm})
 * @param area    객체 면적 비율 (0~1, 키 {@code area_frac})
 * @param anchors 점수순 앵커 좌표 {@code [[x, y, score], ...]} (최대 3개, §2-1)
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CardCaptionItem(
        Integer id,
        String label,
        String src,
        @JsonProperty("center_norm") List<Double> center,
        @JsonProperty("area_frac") Double area,
        List<List<Double>> anchors
) {
}
