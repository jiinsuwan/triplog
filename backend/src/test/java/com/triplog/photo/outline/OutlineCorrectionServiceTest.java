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
        assertThat(merged.get(1).get("id").asInt()).isEqualTo(1);
        assertThat(merged.get(1).get("src").asText()).isEqualTo("user");
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
    void refine_requires_at_least_one_positive_point() {
        assertThatThrownBy(() -> service().refine(USER, PHOTO, new double[0][], null))
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
    void refine_with_pos_and_neg_merges_and_persists() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[]"));
        when(inferenceClient.refine(eq("img-7"), any(), any())).thenReturn(json("[[[0.1,0.1]]]"));
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[]"));
        when(outlineMapper.updateCorrection(eq(PHOTO), any(), eq("img-7"))).thenReturn(1);

        OutlineCorrectionResponse resp = service().refine(USER, PHOTO,
                new double[][]{{0.5, 0.5}}, new double[][]{{0.2, 0.2}});

        assertThat(resp.itemId()).isEqualTo(0);
        verify(inferenceClient).refine(eq("img-7"), any(), any());
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
        assertThatThrownBy(() -> service().refine(USER, PHOTO, huge, null))
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
}
