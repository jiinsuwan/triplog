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

import java.util.List;

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
    void preview_requires_itemId() {
        // 씨앗을 BE 가 더하므로 pos 0개는 허용되지만, 어느 객체를 정제할지(itemId)는 필수.
        assertThatThrownBy(() -> service().previewRefine(USER, PHOTO, null, new double[][]{{0.5, 0.5}}, null))
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
    void preview_returns_polygons_without_saving() {
        // 미리보기 = inference 결과 polygons 만 돌려주고 저장하지 않는다(적용 전).
        String existing = "[{\"id\":5,\"src\":\"user\",\"polygons\":[[[0.4,0.4],[0.6,0.4],[0.6,0.6],[0.4,0.6]]]}]";
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(inferenceClient.refine(eq("img-7"), any(), any())).thenReturn(json("[[[0.1,0.1],[0.3,0.1],[0.3,0.3]]]"));

        OutlineRefinePreview preview = service().previewRefine(USER, PHOTO, 5,
                new double[][]{{0.5, 0.5}}, new double[][]{{0.2, 0.2}});

        assertThat(preview.itemId()).isEqualTo(5);              // 새 id 아님 — 그 객체를 다듬은 미리보기
        assertThat(preview.polygons()).isEqualTo(json("[[[0.1,0.1],[0.3,0.1],[0.3,0.3]]]"));
        assertThat(preview.absorbItemIds()).isEmpty();
        verify(inferenceClient).refine(eq("img-7"), any(), any());
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());   // 저장 안 함
    }

    @Test
    void commit_replaces_target_polygons() {
        // 적용 = 미리보기 polygons 로 대상(5)을 교체해 저장. inference 없음.
        String existing = "[{\"id\":5,\"src\":\"user\",\"polygons\":[[[0.4,0.4],[0.6,0.4],[0.6,0.6],[0.4,0.6]]]}]";
        JsonNode polygons = json("[[[0.1,0.1],[0.3,0.1],[0.3,0.3]]]");
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(outlineMapper.updateCorrection(eq(PHOTO), any(), eq("img-7"))).thenReturn(1);

        OutlineCorrectionResponse resp = service().commitRefine(USER, PHOTO, 5, polygons, List.of());

        assertThat(resp.itemId()).isEqualTo(5);                 // 새 id 아님 — 그 객체 교체
        verifyNoInteractions(inferenceClient);                  // 적용은 추론 없이 저장만
        ArgumentCaptor<String> itemsCap = ArgumentCaptor.forClass(String.class);
        verify(outlineMapper).updateCorrection(eq(PHOTO), itemsCap.capture(), eq("img-7"));
        JsonNode saved = json(itemsCap.getValue());
        assertThat(saved).hasSize(1);                           // item 수 불변(교체)
        assertThat(saved.get(0).get("id").asInt()).isEqualTo(5);
        assertThat(saved.get(0).get("polygons")).isEqualTo(polygons);
        assertThat(saved.get(0).get("anchors")).hasSize(3);     // 모양 바뀜 → 앵커 재생성
    }

    @Test
    void preview_reports_absorb_without_deleting() {
        // 미리보기에서 사용자 pos 점이 다른 객체(9) 안쪽 → absorbItemIds 에 9 보고. 단 아직 삭제(저장)하지 않는다.
        String existing = "[{\"id\":5,\"src\":\"user\",\"polygons\":[[[0.4,0.4],[0.6,0.4],[0.6,0.6],[0.4,0.6]]]},"
                + "{\"id\":9,\"src\":\"det\",\"polygons\":[[[0.0,0.0],[0.2,0.0],[0.2,0.2],[0.0,0.2]]]}]";
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(inferenceClient.refine(eq("img-7"), any(), any())).thenReturn(json("[[[0.0,0.0],[0.6,0.0],[0.6,0.6]]]"));

        OutlineRefinePreview preview = service().previewRefine(USER, PHOTO, 5,
                new double[][]{{0.1, 0.1}}, null);             // 0.1,0.1 = item 9 안쪽

        assertThat(preview.itemId()).isEqualTo(5);
        assertThat(preview.absorbItemIds()).containsExactly(9);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());   // 미리보기는 저장 안 함
    }

    @Test
    void commit_absorbs_listed_items() {
        // 적용 = 대상(5) 교체 + absorbItemIds(9) 삭제 → 5만 남는다.
        String existing = "[{\"id\":5,\"src\":\"user\",\"polygons\":[[[0.4,0.4],[0.6,0.4],[0.6,0.6],[0.4,0.6]]]},"
                + "{\"id\":9,\"src\":\"det\",\"polygons\":[[[0.0,0.0],[0.2,0.0],[0.2,0.2],[0.0,0.2]]]}]";
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(outlineMapper.updateCorrection(eq(PHOTO), any(), eq("img-7"))).thenReturn(1);

        OutlineCorrectionResponse resp = service().commitRefine(USER, PHOTO, 5,
                json("[[[0.0,0.0],[0.6,0.0],[0.6,0.6]]]"), List.of(9));

        assertThat(resp.itemId()).isEqualTo(5);
        ArgumentCaptor<String> itemsCap = ArgumentCaptor.forClass(String.class);
        verify(outlineMapper).updateCorrection(eq(PHOTO), itemsCap.capture(), eq("img-7"));
        JsonNode saved = json(itemsCap.getValue());
        assertThat(saved).hasSize(1);                           // 9 흡수 삭제 → 5만
        assertThat(saved.get(0).get("id").asInt()).isEqualTo(5);
    }

    @Test
    void preview_noop_when_target_missing() {
        // 대상 itemId 가 items 에 없으면 no-op — inference 도 안 부른다.
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[{\"id\":0}]"));

        OutlineRefinePreview preview = service().previewRefine(USER, PHOTO, 99,
                new double[][]{{0.5, 0.5}}, null);

        assertThat(preview.itemId()).isEqualTo(-1);
        assertThat(preview.polygons().isEmpty()).isTrue();
        assertThat(preview.absorbItemIds()).isEmpty();
        verifyNoInteractions(inferenceClient);
    }

    @Test
    void commit_noop_when_target_missing() {
        // 적용 시점(잠금 후) 대상 itemId 가 사라졌으면 no-op — 저장 안 함.
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", "[{\"id\":0}]"));

        OutlineCorrectionResponse resp = service().commitRefine(USER, PHOTO, 99,
                json("[[[0.1,0.1],[0.3,0.1],[0.3,0.3]]]"), List.of());

        assertThat(resp.itemId()).isEqualTo(-1);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
        verifyNoInteractions(inferenceClient);
    }

    @Test
    void preview_noop_when_inference_empty() {
        // 정제 결과가 비면(못 잡음) 미리보기도 빈 결과 — 적용할 대상이 없다.
        String existing = "[{\"id\":5,\"src\":\"user\",\"polygons\":[[[0.4,0.4],[0.6,0.4],[0.6,0.6],[0.4,0.6]]]}]";
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(inferenceClient.refine(eq("img-7"), any(), any())).thenReturn(json("[]"));

        OutlineRefinePreview preview = service().previewRefine(USER, PHOTO, 5,
                new double[][]{{0.5, 0.5}}, null);

        assertThat(preview.itemId()).isEqualTo(-1);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
    }

    @Test
    void preview_seed_is_inside_concave_object() {
        // U자(오목) 도형 — 꼭짓점 평균은 틈새(객체 밖)에 떨어지지만 씨앗은 보장된 내부점이어야 한다.
        String u = "[{\"id\":5,\"src\":\"user\",\"polygons\":[[[0.2,0.2],[0.3,0.2],[0.3,0.5],[0.5,0.5],"
                + "[0.5,0.2],[0.6,0.2],[0.6,0.7],[0.2,0.7]]]}]";
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", u));
        when(inferenceClient.refine(eq("img-7"), any(), any())).thenReturn(json("[[[0.1,0.1],[0.2,0.1],[0.2,0.2]]]"));

        service().previewRefine(USER, PHOTO, 5, new double[0][], null);   // pos 0개 → 씨앗만 전달

        ArgumentCaptor<double[][]> posCap = ArgumentCaptor.forClass(double[][].class);
        verify(inferenceClient).refine(eq("img-7"), posCap.capture(), any());
        double[] seed = posCap.getValue()[0];                      // pos[0] = 씨앗
        // 씨앗이 U자 틈새(x 0.3~0.5)가 아니라 왼쪽 다리(x 0.2~0.3) 안에 있어야 한다(꼭짓점 평균은 틈새=밖).
        assertThat(seed[0]).isBetween(0.2, 0.3);
        assertThat(seed[1]).isBetween(0.2, 0.7);
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
    void preview_rejects_too_many_points() {
        double[][] huge = new double[65][];
        for (int i = 0; i < huge.length; i++) {
            huge[i] = new double[]{0.5, 0.5};
        }
        assertThatThrownBy(() -> service().previewRefine(USER, PHOTO, 0, huge, null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT);
        verifyNoInteractions(inferenceClient);
    }

    @Test
    void commit_rejects_empty_polygons() {
        // 적용은 polygons 가 필수 — 비면 거부(미리보기에서 못 잡은 결과로는 적용을 호출하지 않는다).
        assertThatThrownBy(() -> service().commitRefine(USER, PHOTO, 5, json("[]"), List.of()))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT);
        verifyNoInteractions(inferenceClient);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
    }

    @Test
    void commit_rejects_malformed_polygons() {
        // FE 가 보낸 polygons 가 계약(loop=점 3개 이상 배열, point=[x,y] 숫자 2개)을 어기면 저장 전에 거절.
        String[] bad = {
                "[[[0.1,0.1],[0.2,0.2]]]",            // 점 2개(3 미만)
                "[[[0.1],[0.2,0.2],[0.3,0.3]]]",       // point 가 [x,y] 2개 아님
                "[[[\"a\",0.2],[0.2,0.2],[0.3,0.3]]]", // 좌표가 숫자 아님(문자열)
                "[123]",                                 // loop 가 배열 아님
                "[[[0.1,0.1],[0.2,0.2],[1.5,0.3]]]",   // 좌표 0~1 범위 밖
        };
        for (String p : bad) {
            assertThatThrownBy(() -> service().commitRefine(USER, PHOTO, 5, json(p), List.of()))
                    .as("malformed polygons: %s", p)
                    .isInstanceOf(BusinessException.class)
                    .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT);
        }
        verifyNoInteractions(inferenceClient);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
    }

    @Test
    void commit_rejects_pending() {
        // 적용 시점에 자동 외곽선 처리 중(PENDING)이면 막는다(stale apply 가 READY 로 덮어쓰는 것 방지).
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.PENDING, "img-7", "[]"));

        assertThatThrownBy(() -> service().commitRefine(USER, PHOTO, 5,
                json("[[[0.1,0.1],[0.2,0.1],[0.2,0.2]]]"), List.of()))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.OUTLINE_PROCESSING);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
        verifyNoInteractions(inferenceClient);
    }

    @Test
    void delete_removes_item_from_items() {
        String existing = "[{\"id\":0,\"src\":\"det\"},{\"id\":3,\"src\":\"user\"}]";
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));

        service().deleteItem(USER, PHOTO, 3);

        ArgumentCaptor<String> itemsCap = ArgumentCaptor.forClass(String.class);
        verify(outlineMapper).updateCorrection(eq(PHOTO), itemsCap.capture(), eq("img-7"));
        JsonNode saved = json(itemsCap.getValue());
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).get("id").asInt()).isEqualTo(0);
    }

    @Test
    void delete_last_item_leaves_empty_items() {
        String existing = "[{\"id\":3,\"src\":\"user\"}]";
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));

        service().deleteItem(USER, PHOTO, 3);

        ArgumentCaptor<String> itemsCap = ArgumentCaptor.forClass(String.class);
        verify(outlineMapper).updateCorrection(eq(PHOTO), itemsCap.capture(), eq("img-7"));
        assertThat(json(itemsCap.getValue())).isEmpty();
    }

    @Test
    void delete_missing_item_is_idempotent() {
        String existing = "[{\"id\":0,\"src\":\"det\"}]";
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));
        when(outlineMapper.findByPhotoIdForUpdate(PHOTO)).thenReturn(outline(OutlineStatus.READY, "img-7", existing));

        service().deleteItem(USER, PHOTO, 99);

        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
    }

    @Test
    void delete_rejects_pending() {
        when(photoService.requireOwnedPhoto(USER, PHOTO)).thenReturn(ownedPhoto());
        when(outlineMapper.findByPhotoId(PHOTO)).thenReturn(outline(OutlineStatus.PENDING, "img-7", "[]"));

        assertThatThrownBy(() -> service().deleteItem(USER, PHOTO, 0))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.OUTLINE_PROCESSING);
        verify(outlineMapper, never()).updateCorrection(any(), any(), any());
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
