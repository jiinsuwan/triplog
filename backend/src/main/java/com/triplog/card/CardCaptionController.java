package com.triplog.card;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.ai.card.CardCaptionResult;
import com.triplog.ai.card.CardCaptionService;
import com.triplog.ai.card.dto.CardCaptionItem;
import com.triplog.common.ApiResponse;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.photo.domain.OutlineStatus;
import com.triplog.photo.outline.PhotoOutlineResponse;
import com.triplog.photo.service.PhotoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 카드 문구 생성 (S3-LOG-06 4단계).
 *
 * <p>사진의 외곽선(READY) items 에서 문구 입력(items)을 <b>서버가 파생</b>한다 — 클라이언트가 items 를
 * 보내지 않는다(소유권·계약·크레딧 보호). 한 사진(=한 카드)의 items 전체를 한 번에
 * {@link CardCaptionService#generate}로 넘긴다(item별 N콜 금지).
 *
 * <p>외곽선 items 의 필드명은 추론 서버 계약(center/area/anchors)과 동일하므로
 * {@link CardCaptionItem}(unknown 무시)로 그대로 역직렬화된다.
 *
 * <p>GMS 호출당 크레딧이 차감되므로, 호출은 사용자 트리거이고 호출측(FE)이 세션 캐시·in-flight
 * 가드·자동 재시도 금지로 보호한다. 검증 실패(형식 위반)·호출 실패는 서비스가 AI_002/AI_001 로 던진다.
 */
@Tag(name = "Card", description = "Card caption generation API")
@RestController
public class CardCaptionController {

    private final PhotoService photoService;
    private final CardCaptionService cardCaptionService;
    private final ObjectMapper objectMapper;

    public CardCaptionController(PhotoService photoService,
                                 CardCaptionService cardCaptionService,
                                 ObjectMapper objectMapper) {
        this.photoService = photoService;
        this.cardCaptionService = cardCaptionService;
        this.objectMapper = objectMapper;
    }

    @Operation(summary = "Generate a card caption from a photo's outline (owner only)")
    @PostMapping("/photos/{photoId}/card-caption")
    public ApiResponse<CardCaptionResult> caption(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long photoId) {
        // 소유자 검증 + 외곽선 조회는 PhotoService 가 담당(미소유 → PHOTO_005).
        PhotoOutlineResponse outline = photoService.getOutline(userId, photoId);
        // items 는 추론 서버 계약상 항상 배열이다. status 미완료·null·비배열(계약 위반)은
        // convertValue/isEmpty 에서 NPE·500 으로 새지 않도록 여기서 4xx 로 끊는다.
        if (outline.status() != OutlineStatus.READY || outline.items() == null || !outline.items().isArray()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "사진 외곽선 처리가 끝나지 않아 카드 문구를 만들 수 없습니다.");
        }
        List<CardCaptionItem> items =
                objectMapper.convertValue(outline.items(), new TypeReference<List<CardCaptionItem>>() {});
        // 인식된 피사체가 0개면 문구를 만들 객체가 없다 — LLM(GMS) 호출 전 차단(크레딧 보호).
        if (items.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "인식된 피사체가 없어 카드 문구를 만들 수 없습니다.");
        }
        return ApiResponse.success("Card caption.", cardCaptionService.generate(items));
    }
}
