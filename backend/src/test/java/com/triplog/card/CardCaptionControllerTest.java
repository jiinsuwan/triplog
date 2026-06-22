package com.triplog.card;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.ai.card.CardCaptionResult;
import com.triplog.ai.card.CardCaptionService;
import com.triplog.ai.card.dto.CardCaptionItem;
import com.triplog.ai.card.dto.CardCaptionObject;
import com.triplog.ai.card.dto.CardCaptionResponse;
import com.triplog.ai.card.dto.CardClosing;
import com.triplog.common.ApiResponse;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.photo.domain.OutlineStatus;
import com.triplog.photo.outline.PhotoOutlineResponse;
import com.triplog.photo.service.PhotoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CardCaptionControllerTest {

    @Mock
    PhotoService photoService;

    @Mock
    CardCaptionService cardCaptionService;

    @Captor
    ArgumentCaptor<List<CardCaptionItem>> itemsCaptor;

    private final ObjectMapper mapper = new ObjectMapper();
    private CardCaptionController controller;

    @BeforeEach
    void setUp() {
        controller = new CardCaptionController(photoService, cardCaptionService, mapper);
    }

    @Test
    void READY_외곽선_items_를_파생해_문구를_생성한다() throws Exception {
        // 외곽선 items 는 추론 서버 계약 형식(center/area/anchors + bbox/polygons/conf).
        JsonNode items = mapper.readTree(
                "[{\"id\":0,\"label\":\"dish\",\"src\":\"det\",\"center\":[0.5,0.5],\"area\":0.2,"
                        + "\"bbox\":[0.3,0.3,0.7,0.7],\"polygons\":[],\"conf\":0.9,"
                        + "\"anchors\":[[0.5,0.3,0.9]]}]");
        when(photoService.getOutline(1L, 7L))
                .thenReturn(new PhotoOutlineResponse(7L, OutlineStatus.READY, items));
        CardCaptionResult result = new CardCaptionResult(
                new CardCaptionResponse(List.of(new CardCaptionObject(0, 0, List.of("맛있다"))),
                        new CardClosing("오늘의 한 끼")),
                List.of());
        when(cardCaptionService.generate(anyList())).thenReturn(result);

        ApiResponse<CardCaptionResult> res = controller.caption(1L, 7L);

        assertThat(res.data()).isSameAs(result);
        // 파생된 입력 검증: center/area/anchors 보존, bbox/polygons/conf 는 무시(계약 보존).
        verify(cardCaptionService).generate(itemsCaptor.capture());
        List<CardCaptionItem> derived = itemsCaptor.getValue();
        assertThat(derived).hasSize(1);
        assertThat(derived.get(0).id()).isZero();
        assertThat(derived.get(0).center()).containsExactly(0.5, 0.5);
        assertThat(derived.get(0).area()).isEqualTo(0.2);
        assertThat(derived.get(0).anchors().get(0)).containsExactly(0.5, 0.3, 0.9);
    }

    @Test
    void 외곽선_미완료면_INVALID_INPUT_을_던진다() {
        when(photoService.getOutline(1L, 7L))
                .thenReturn(new PhotoOutlineResponse(7L, OutlineStatus.PENDING, null));

        assertThatThrownBy(() -> controller.caption(1L, 7L))
                .isInstanceOf(BusinessException.class)
                .satisfies(e ->
                        assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void READY_이지만_items_가_비면_문구_생성_없이_INVALID_INPUT_을_던진다() throws Exception {
        when(photoService.getOutline(1L, 7L))
                .thenReturn(new PhotoOutlineResponse(7L, OutlineStatus.READY, mapper.readTree("[]")));

        assertThatThrownBy(() -> controller.caption(1L, 7L))
                .isInstanceOf(BusinessException.class)
                .satisfies(e ->
                        assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
        // 크레딧 보호: 빈 items 면 LLM(GMS) 호출에 도달하지 않는다.
        verifyNoInteractions(cardCaptionService);
    }

    @Test
    void READY_이지만_items_가_배열이_아니면_INVALID_INPUT_을_던진다() throws Exception {
        // 계약 위반(NullNode 등 비배열)도 NPE/500 이 아니라 4xx 로 끊고 LLM 호출에 도달하지 않는다.
        when(photoService.getOutline(1L, 7L))
                .thenReturn(new PhotoOutlineResponse(7L, OutlineStatus.READY, mapper.readTree("null")));

        assertThatThrownBy(() -> controller.caption(1L, 7L))
                .isInstanceOf(BusinessException.class)
                .satisfies(e ->
                        assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
        verifyNoInteractions(cardCaptionService);
    }
}
