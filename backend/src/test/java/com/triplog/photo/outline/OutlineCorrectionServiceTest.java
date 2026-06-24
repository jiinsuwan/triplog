package com.triplog.photo.outline;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.photo.domain.OutlineStatus;
import com.triplog.photo.domain.Photo;
import com.triplog.photo.domain.PhotoOutline;
import com.triplog.photo.mapper.PhotoOutlineMapper;
import com.triplog.photo.service.PhotoService;
import com.triplog.photo.storage.PhotoStorage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 외곽선 보정 서비스 단위 테스트(DB·사이드카 무관, Mockito).
 * 핵심 = item_id BE 소유 / 빈결과 no-op / 404 재등록 / 503 매핑·미기록 / PENDING·비소유자 차단 / 좌표 검증.
 * TransactionTemplate 은 mock PlatformTransactionManager 로 콜백을 동기 실행한다(쓰기 경로 검증).
 */
@ExtendWith(MockitoExtension.class)
class OutlineCorrectionServiceTest {

    @Mock private PhotoService photoService;
    @Mock private PhotoOutlineMapper outlineMapper;
    @Mock private PhotoStorage photoStorage;
    @Mock private InferenceClient inferenceClient;
    @Mock private PlatformTransactionManager txManager;

    private final ObjectMapper mapper = new ObjectMapper();

    private static final Long USER = 1L;
    private static final Long PHOTO = 7L;
    private static final double[] POINT = {0.5, 0.5};

    private OutlineCorrectionService service() {
        return new OutlineCorrectionService(photoService, outlineMapper, photoStorage,
                inferenceClient, mapper, txManager);
    }

    private Photo ownedPhoto() {
        Photo p = new Photo();
        p.setId(PHOTO);
        p.setUserId(USER);
        p.setStoredFilename("s-7.jpg");
        return p;
    }

    private PhotoOutline outline(OutlineStatus status, String imageId, String items) {
        PhotoOutline o = new PhotoOutline();
        o.setPhotoId(PHOTO);
        o.setStatus(status);
        o.setImageId(imageId);
        o.setItems(items);
        return o;
    }

    private JsonNode json(String s) {
        try {
            return mapper.readTree(s);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void tap_merges_polygon_with_BE_owned_id_and_persists() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[{\"id\":0}]"));
        when(inferenceClient.tap(eq("img-7"), any())).thenReturn(json("[[[0.1,0.1],[0.2,0.2]]]"));
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[{\"id\":0}]"));
        when(outlineMapper.updateCorrection(eq(PHOTO), any(), eq("img-7"))).thenReturn(1);

        OutlineCorrectionResponse resp = service().tap(USER, PHOTO, POINT);

        assertThat(resp.itemId()).isEqualTo(1);                 // DB items max(0)+1, 서버 item_id 무시
        ArgumentCaptor<String> itemsCap = ArgumentCaptor.forClass(String.class);
        verify(outlineMapper).updateCorrection(eq(PHOTO), itemsCap.capture(), eq("img-7"));
        JsonNode merged = json(itemsCap.getValue());
        assertThat(merged).hasSize(2);
        JsonNode added = merged.get(1);
        assertThat(added.get("id").asInt()).isEqualTo(1);
        assertThat(added.get("src").asText()).isEqualTo("user");
        // 자동검출 item 과 같은 shape: bbox/center/area + 합성 anchors(객체 바깥 3점, 문구 후보용 S4-LOG-01)
        assertThat(added.get("center").isArray()).isTrue();
        assertThat(added.get("center")).hasSize(2);
        assertThat(added.has("bbox")).isTrue();
        assertThat(added.has("area")).isTrue();
        assertThat(added.get("anchors").isArray()).isTrue();
        assertThat(added.get("anchors")).hasSize(3);
        for (JsonNode a : added.get("anchors")) {
            assertThat(a).hasSize(3);                            // [x, y, score]
            assertThat(a.get(0).asDouble()).isBetween(0.0, 1.0);
            assertThat(a.get(1).asDouble()).isBetween(0.0, 1.0);
        }
    }

    @Test
    void new_item_id_is_db_max_plus_one() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[{\"id\":0},{\"id\":5}]"));
        when(inferenceClient.tap(eq("img-7"), any())).thenReturn(json("[[[0.1,0.1]]]"));
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[{\"id\":0},{\"id\":5}]"));
        when(outlineMapper.updateCorrection(eq(PHOTO), any(), eq("img-7"))).thenReturn(1);

        OutlineCorrectionResponse resp = service().tap(USER, PHOTO, POINT);

        assertThat(resp.itemId()).isEqualTo(6);
    }

    @Test
    void failed_photo_registers_then_corrects() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.FAILED, null, null));
        when(photoStorage.load("s-7.jpg")).thenReturn(new ByteArrayResource(new byte[]{1}));
        when(inferenceClient.preprocess(any(), eq("s-7.jpg")))
                .thenReturn(new InferenceClient.PreprocessResult("[]", "img-new"));
        when(inferenceClient.tap(eq("img-new"), any())).thenReturn(json("[[[0.1,0.1]]]"));
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.FAILED, null, null));
        when(outlineMapper.updateCorrection(eq(PHOTO), any(), eq("img-new"))).thenReturn(1);

        OutlineCorrectionResponse resp = service().tap(USER, PHOTO, POINT);

        assertThat(resp.itemId()).isEqualTo(0);                 // items null → 새 배열 → id 0
        verify(inferenceClient).preprocess(any(), eq("s-7.jpg"));
        verify(outlineMapper).updateCorrection(eq(PHOTO), any(), eq("img-new"));
    }

    @Test
    void image_missing_reregisters_and_retries_with_fresh_id() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "stale", "[]"));
        when(inferenceClient.tap(eq("stale"), any())).thenThrow(new InferenceImageMissingException("gone"));
        when(photoStorage.load("s-7.jpg")).thenReturn(new ByteArrayResource(new byte[]{1}));
        when(inferenceClient.preprocess(any(), eq("s-7.jpg")))
                .thenReturn(new InferenceClient.PreprocessResult("[]", "img-fresh"));
        when(inferenceClient.tap(eq("img-fresh"), any())).thenReturn(json("[[[0.1,0.1]]]"));
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "stale", "[]"));
        when(outlineMapper.updateCorrection(eq(PHOTO), any(), eq("img-fresh"))).thenReturn(1);

        OutlineCorrectionResponse resp = service().tap(USER, PHOTO, POINT);

        assertThat(resp.itemId()).isEqualTo(0);
        verify(inferenceClient).preprocess(any(), eq("s-7.jpg"));
        verify(outlineMapper).updateCorrection(eq(PHOTO), any(), eq("img-fresh"));   // 새 image_id 저장
    }

    @Test
    void inference_unavailable_maps_to_503_without_write() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[]"));
        when(inferenceClient.tap(eq("img-7"), any())).thenThrow(new InferenceException("down"));

        assertThatThrownBy(() -> service().tap(USER, PHOTO, POINT))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INFERENCE_UNAVAILABLE);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
    }

    @Test
    void empty_result_is_noop_without_persist() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[]"));
        when(inferenceClient.tap(eq("img-7"), any())).thenReturn(json("[]"));

        OutlineCorrectionResponse resp = service().tap(USER, PHOTO, POINT);

        assertThat(resp.itemId()).isEqualTo(-1);
        assertThat(resp.polygons().isEmpty()).isTrue();
        verify(outlineMapper, never()).findByPhotoIdForUpdate(any());
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
    }

    @Test
    void pending_photo_is_rejected_as_processing() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.PENDING, null, null));

        assertThatThrownBy(() -> service().tap(USER, PHOTO, POINT))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.OUTLINE_PROCESSING);
        verifyNoInteractions(inferenceClient);
    }

    @Test
    void non_owner_is_rejected_before_inference() {
        when(photoService.requireOwnedPhoto(USER, PHOTO))
                .thenThrow(new BusinessException(ErrorCode.PHOTO_ACCESS_DENIED));

        assertThatThrownBy(() -> service().tap(USER, PHOTO, POINT))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.PHOTO_ACCESS_DENIED);
        verifyNoInteractions(inferenceClient, outlineMapper);
    }

    @Test
    void invalid_point_is_rejected_before_any_interaction() {
        assertThatThrownBy(() -> service().tap(USER, PHOTO, new double[]{1.5, 0.2}))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT);
        verifyNoInteractions(photoService, inferenceClient, outlineMapper);
    }

    @Test
    void box_must_be_ordered() {
        assertThatThrownBy(() -> service().box(USER, PHOTO, new double[]{0.5, 0.5, 0.5, 0.9}))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT);
        verifyNoInteractions(inferenceClient);
    }

    @Test
    void refine_requires_itemId() {
        // 씨앗을 BE 가 더하므로 pos 0개는 허용되지만, 어느 객체를 정제할지(itemId)는 필수.
        assertThatThrownBy(() -> service().refine(USER, PHOTO, null, new double[][]{{0.5, 0.5}}, null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT);
        verifyNoInteractions(inferenceClient);
    }

    @Test
    void box_merges_and_persists() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[]"));
        when(inferenceClient.box(eq("img-7"), any())).thenReturn(json("[[[0.1,0.1],[0.4,0.4]]]"));
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[]"));
        when(outlineMapper.updateCorrection(eq(PHOTO), any(), eq("img-7"))).thenReturn(1);

        OutlineCorrectionResponse resp = service().box(USER, PHOTO, new double[]{0.1, 0.1, 0.5, 0.5});

        assertThat(resp.itemId()).isEqualTo(0);
        verify(inferenceClient).box(eq("img-7"), any());
    }

    @Test
    void refine_replaces_target_item_polygons() {
        String existing = "[{\"id\":5,\"src\":\"user\",\"polygons\":[[[0.4,0.4],[0.6,0.4],[0.6,0.6],[0.4,0.6]]]}]";
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(inferenceClient.refine(eq("img-7"), any(), any())).thenReturn(json("[[[0.1,0.1],[0.3,0.1],[0.3,0.3]]]"));
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(outlineMapper.updateCorrection(eq(PHOTO), any(), eq("img-7"))).thenReturn(1);

        OutlineCorrectionResponse resp = service().refine(USER, PHOTO, 5,
                new double[][]{{0.5, 0.5}}, new double[][]{{0.2, 0.2}});

        assertThat(resp.itemId()).isEqualTo(5);                 // 새 id 아님 — 그 객체 교체
        verify(inferenceClient).refine(eq("img-7"), any(), any());
        ArgumentCaptor<String> itemsCap = ArgumentCaptor.forClass(String.class);
        verify(outlineMapper).updateCorrection(eq(PHOTO), itemsCap.capture(), eq("img-7"));
        JsonNode saved = json(itemsCap.getValue());
        assertThat(saved).hasSize(1);                           // item 수 불변(교체)
        assertThat(saved.get(0).get("id").asInt()).isEqualTo(5);
        assertThat(saved.get(0).get("polygons")).isEqualTo(json("[[[0.1,0.1],[0.3,0.1],[0.3,0.3]]]"));
        assertThat(saved.get(0).get("anchors")).hasSize(3);     // 모양 바뀜 → 앵커 재생성
    }

    @Test
    void refine_absorbs_other_item_when_pos_inside_it() {
        // 정제 중 사용자 pos 점이 다른 객체(id 9) 안쪽 → 그 객체 흡수(병합·삭제). 결과는 대상(5)만.
        String existing = "[{\"id\":5,\"src\":\"user\",\"polygons\":[[[0.4,0.4],[0.6,0.4],[0.6,0.6],[0.4,0.6]]]},"
                + "{\"id\":9,\"src\":\"det\",\"polygons\":[[[0.0,0.0],[0.2,0.0],[0.2,0.2],[0.0,0.2]]]}]";
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(inferenceClient.refine(eq("img-7"), any(), any())).thenReturn(json("[[[0.0,0.0],[0.6,0.0],[0.6,0.6]]]"));
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(outlineMapper.updateCorrection(eq(PHOTO), any(), eq("img-7"))).thenReturn(1);

        OutlineCorrectionResponse resp = service().refine(USER, PHOTO, 5,
                new double[][]{{0.1, 0.1}}, null);              // 0.1,0.1 = item 9 안쪽

        assertThat(resp.itemId()).isEqualTo(5);
        ArgumentCaptor<String> itemsCap = ArgumentCaptor.forClass(String.class);
        verify(outlineMapper).updateCorrection(eq(PHOTO), itemsCap.capture(), eq("img-7"));
        JsonNode saved = json(itemsCap.getValue());
        assertThat(saved).hasSize(1);                           // 9 흡수 삭제 → 5만
        assertThat(saved.get(0).get("id").asInt()).isEqualTo(5);
    }

    @Test
    void refine_noop_when_target_missing() {
        // 대상 itemId 가 items 에 없으면 no-op — inference 도 안 부른다.
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[{\"id\":0}]"));

        OutlineCorrectionResponse resp = service().refine(USER, PHOTO, 99,
                new double[][]{{0.5, 0.5}}, null);

        assertThat(resp.itemId()).isEqualTo(-1);
        assertThat(resp.polygons().isEmpty()).isTrue();
        verifyNoInteractions(inferenceClient);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
    }

    @Test
    void refine_noop_keeps_existing_when_inference_empty() {
        // 정제 결과가 비면(못 잡음) 기존 모양 유지 — 저장 안 함.
        String existing = "[{\"id\":5,\"src\":\"user\",\"polygons\":[[[0.4,0.4],[0.6,0.4],[0.6,0.6],[0.4,0.6]]]}]";
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(inferenceClient.refine(eq("img-7"), any(), any())).thenReturn(json("[]"));

        OutlineCorrectionResponse resp = service().refine(USER, PHOTO, 5,
                new double[][]{{0.5, 0.5}}, null);

        assertThat(resp.itemId()).isEqualTo(-1);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
    }

    @Test
    void coordinates_reject_nan_infinity_negative() {
        assertThatThrownBy(() -> service().tap(USER, PHOTO, new double[]{Double.NaN, 0.5}))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT);
        assertThatThrownBy(() -> service().tap(USER, PHOTO, new double[]{Double.POSITIVE_INFINITY, 0.5}))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT);
        assertThatThrownBy(() -> service().tap(USER, PHOTO, new double[]{-0.1, 0.5}))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT);
        verifyNoInteractions(inferenceClient);
    }

    @Test
    void refine_rejects_too_many_points() {
        double[][] huge = new double[65][];
        for (int i = 0; i < huge.length; i++) {
            huge[i] = new double[]{0.5, 0.5};
        }
        assertThatThrownBy(() -> service().refine(USER, PHOTO, 0, huge, null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT);
        verifyNoInteractions(inferenceClient);
    }

    @Test
    void image_missing_twice_maps_to_503_without_write() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "stale", "[]"));
        when(inferenceClient.tap(eq("stale"), any())).thenThrow(new InferenceImageMissingException("gone"));
        when(photoStorage.load("s-7.jpg")).thenReturn(new ByteArrayResource(new byte[]{1}));
        when(inferenceClient.preprocess(any(), eq("s-7.jpg")))
                .thenReturn(new InferenceClient.PreprocessResult("[]", "img-fresh"));
        when(inferenceClient.tap(eq("img-fresh"), any())).thenThrow(new InferenceImageMissingException("again"));

        assertThatThrownBy(() -> service().tap(USER, PHOTO, POINT))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INFERENCE_UNAVAILABLE);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
    }

    @Test
    void register_failure_during_correction_maps_to_503() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.FAILED, null, null));
        when(photoStorage.load("s-7.jpg")).thenReturn(new ByteArrayResource(new byte[]{1}));
        when(inferenceClient.preprocess(any(), eq("s-7.jpg"))).thenThrow(new InferenceException("server down"));

        assertThatThrownBy(() -> service().tap(USER, PHOTO, POINT))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INFERENCE_UNAVAILABLE);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
    }

    @Test
    void null_image_id_from_register_maps_to_503() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.FAILED, null, null));
        when(photoStorage.load("s-7.jpg")).thenReturn(new ByteArrayResource(new byte[]{1}));
        when(inferenceClient.preprocess(any(), eq("s-7.jpg")))
                .thenReturn(new InferenceClient.PreprocessResult("[]", null));

        assertThatThrownBy(() -> service().tap(USER, PHOTO, POINT))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INFERENCE_UNAVAILABLE);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
    }

    @Test
    void malformed_polygons_loop_does_not_crash() {
        // 내부 loop 가 배열이 아닌 schema drift — addGeometry 가 NPE/500 없이 방어해야 한다.
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[]"));
        when(inferenceClient.tap(eq("img-7"), any())).thenReturn(json("[{\"a\":1}]"));
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[]"));
        when(outlineMapper.updateCorrection(eq(PHOTO), any(), eq("img-7"))).thenReturn(1);

        OutlineCorrectionResponse resp = service().tap(USER, PHOTO, POINT);

        assertThat(resp.itemId()).isEqualTo(0);
    }
}
