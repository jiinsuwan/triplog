package com.triplog.photo.outline;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.photo.domain.OutlineStatus;
import com.triplog.photo.domain.Photo;
import com.triplog.photo.domain.PhotoOutline;
import com.triplog.photo.mapper.PhotoOutlineMapper;
import com.triplog.photo.service.PhotoService;
import com.triplog.photo.storage.PhotoStorage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.function.Function;

/**
 * 에디터 외곽선 보정(tap/box/refine) (S4-LOG-01 #114).
 * 추론 사이드카를 BE 프록시로 호출해 폴리곤을 받아, BE 가 item_id 를 부여해 photo_outline.items 에 누적 저장한다.
 *
 * 설계 요지:
 *  - item_id 소유 = BE. 사이드카의 item_id 는 사이드카 인메모리 상태 기준이라(재등록 시 어긋남) 쓰지 않고,
 *    polygons 만 취해 DB items 기준 max+1 을 부여한다.
 *  - inference 호출은 트랜잭션 밖. 저장만 짧은 트랜잭션 + 행 잠금(FOR UPDATE)으로 동시 보정 lost-update 를 막는다.
 *  - image_id 는 세션 캐시 키. 없거나 404(퇴출/재시작)면 사진을 재등록해 새 키로 1회 재시도한다.
 *  - 사이드카 불능(연결·타임아웃)은 503(INFERENCE_UNAVAILABLE) — 카드 기본 동작은 baseline 유지.
 *  - 객체를 못 잡으면(빈 polygons) no-op: 저장하지 않고 빈 결과를 돌려준다.
 */
@Service
public class OutlineCorrectionService {

    private static final int NO_OP_ITEM_ID = -1;          // 객체를 못 잡았을 때(빈 polygons) 응답 표식
    private static final String USER_SRC = "user";        // 사용자 보정 item 의 label·src
    private static final int MAX_REFINE_POINTS = 64;       // refine pos/neg 점 개수 상한(+/- 클릭은 소수 — 거대 배열 차단)

    private final PhotoService photoService;
    private final PhotoOutlineMapper outlineMapper;
    private final PhotoStorage photoStorage;
    private final InferenceClient inferenceClient;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate txTemplate;

    public OutlineCorrectionService(PhotoService photoService, PhotoOutlineMapper outlineMapper,
                                    PhotoStorage photoStorage, InferenceClient inferenceClient,
                                    ObjectMapper objectMapper, PlatformTransactionManager txManager) {
        this.photoService = photoService;
        this.outlineMapper = outlineMapper;
        this.photoStorage = photoStorage;
        this.inferenceClient = inferenceClient;
        this.objectMapper = objectMapper;
        this.txTemplate = new TransactionTemplate(txManager);
    }

    /** 탭 = 한 점으로 단일 객체 외곽선 추가. */
    public OutlineCorrectionResponse tap(Long userId, Long photoId, double[] point) {
        validatePoint(point, "point");
        return apply(userId, photoId, imageId -> inferenceClient.tap(imageId, point));
    }

    /** 박스 = 드래그 영역으로 무리 외곽선 추가. */
    public OutlineCorrectionResponse box(Long userId, Long photoId, double[] box) {
        validateBox(box);
        return apply(userId, photoId, imageId -> inferenceClient.box(imageId, box));
    }

    /** 정제 = 포지티브/네거티브 점 묶음으로 한 객체를 다듬어 추가. */
    public OutlineCorrectionResponse refine(Long userId, Long photoId, double[][] pos, double[][] neg) {
        validatePoints(pos, true, "pos");
        validatePoints(neg, false, "neg");
        double[][] safeNeg = (neg != null) ? neg : new double[0][];
        return apply(userId, photoId, imageId -> inferenceClient.refine(imageId, pos, safeNeg));
    }

    // 소유권 → 상태 확인 → (트랜잭션 밖) inference 호출 → 빈 결과면 no-op → (트랜잭션 안) items 병합 저장.
    private OutlineCorrectionResponse apply(Long userId, Long photoId, Function<String, JsonNode> op) {
        Photo photo = photoService.requireOwnedPhoto(userId, photoId);
        PhotoOutline outline = outlineMapper.findByPhotoId(photoId);
        if (outline != null && outline.getStatus() == OutlineStatus.PENDING) {
            // 자동 초안이 아직 도는 중 — 끝나면 워커가 markReady. 지금 보정하면 워커가 사용자 보정을 덮어쓸 수 있다.
            throw new BusinessException(ErrorCode.OUTLINE_PROCESSING);
        }
        String imageId = (outline != null) ? outline.getImageId() : null;

        OutlineCall call = callInference(photo, imageId, op);
        JsonNode polygons = call.polygons();
        if (polygons == null || !polygons.isArray() || polygons.isEmpty()) {
            return new OutlineCorrectionResponse(NO_OP_ITEM_ID, objectMapper.createArrayNode());  // no-op
        }
        int newId = persist(photoId, polygons, call.imageId());
        return new OutlineCorrectionResponse(newId, polygons);
    }

    private record OutlineCall(JsonNode polygons, String imageId) {
    }

    // image_id 가 없으면 등록, 404(퇴출/재시작)면 재등록 후 1회 재시도. 그 외 사이드카 오류는 503.
    private OutlineCall callInference(Photo photo, String imageId, Function<String, JsonNode> op) {
        try {
            String effectiveId = (imageId != null && !imageId.isBlank()) ? imageId : register(photo);
            try {
                return new OutlineCall(op.apply(effectiveId), effectiveId);
            } catch (InferenceImageMissingException miss) {
                String fresh = register(photo);
                return new OutlineCall(op.apply(fresh), fresh);
            }
        } catch (InferenceException e) {
            throw new BusinessException(ErrorCode.INFERENCE_UNAVAILABLE);
        }
    }

    // 쓰기 구간만 짧은 트랜잭션 + FOR UPDATE 로 행을 잠가, 동시 보정이 같은 items 를 읽고 덮어쓰는 것을 막는다.
    private int persist(Long photoId, JsonNode polygons, String imageId) {
        Integer newId = txTemplate.execute(status -> {
            PhotoOutline locked = outlineMapper.findByPhotoIdForUpdate(photoId);
            ArrayNode items = parseItems(locked == null ? null : locked.getItems());
            int id = nextId(items);
            items.add(userItem(id, polygons));
            int rows = outlineMapper.updateCorrection(photoId, writeJson(items), imageId);
            if (rows == 0) {
                throw new BusinessException(ErrorCode.PHOTO_NOT_FOUND);  // 보정 중 행이 사라짐(삭제 등)
            }
            return id;
        });
        return newId != null ? newId : 0;
    }

    private String register(Photo photo) {
        byte[] bytes = readBytes(photo.getStoredFilename());
        String imageId = inferenceClient.preprocess(bytes, photo.getStoredFilename()).imageId();
        if (imageId == null || imageId.isBlank()) {
            // 정상 서버는 항상 image_id 를 돌려준다(serve_outline). 누락이면 보정 불가 → 503 으로 흡수(방어).
            throw new InferenceException("추론 서버 응답에 image_id 없음");
        }
        return imageId;
    }

    private byte[] readBytes(String storedFilename) {
        try (var in = photoStorage.load(storedFilename).getInputStream()) {
            return in.readAllBytes();
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.PHOTO_STORAGE_FAILED, "사진 읽기 실패: " + storedFilename, e);
        }
    }

    private ArrayNode parseItems(String json) {
        if (json == null || json.isBlank()) {
            return objectMapper.createArrayNode();
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            if (node instanceof ArrayNode arr) {
                return arr;
            }
        } catch (JsonProcessingException ignored) {
            // 깨진 기존 데이터면 새 배열로 시작(보정을 막지 않는다).
        }
        return objectMapper.createArrayNode();
    }

    private int nextId(ArrayNode items) {
        int max = -1;
        for (JsonNode it : items) {
            max = Math.max(max, it.path("id").asInt(-1));
        }
        return max + 1;
    }

    // 사용자 보정 item 은 자동검출 item 과 같은 shape(bbox/center/area/anchors/polygons)으로 저장해
    // 렌더(center 배지 등) 계약을 깨지 않는다. 단 anchors 는 사이드카가 saliency 로 계산하는 값이라
    // BE 가 재현할 수 없으므로 빈 배열로 둔다(문구 후보 제외 = CardCaptionController 에서 src="user" 필터).
    private ObjectNode userItem(int id, JsonNode polygons) {
        ObjectNode it = objectMapper.createObjectNode();
        it.put("id", id);
        it.put("label", USER_SRC);
        it.put("src", USER_SRC);
        addGeometry(it, polygons);
        it.set("anchors", objectMapper.createArrayNode());
        it.set("polygons", polygons);
        return it;
    }

    // polygons(0~1 정규화 루프 배열)에서 bbox·center·area 를 산출해 자동검출 item 과 같은 키로 채운다.
    private void addGeometry(ObjectNode it, JsonNode polygons) {
        double minX = 1.0;
        double minY = 1.0;
        double maxX = 0.0;
        double maxY = 0.0;
        double area = 0.0;
        boolean any = false;
        for (JsonNode loop : polygons) {
            if (!loop.isArray()) {
                continue;             // schema drift(내부 loop 가 배열 아님) 방어 — get(i) null·NPE 차단
            }
            double shoelace = 0.0;
            int n = loop.size();
            for (int i = 0; i < n; i++) {
                JsonNode p = loop.get(i);
                double x = p.path(0).asDouble();
                double y = p.path(1).asDouble();
                any = true;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                JsonNode q = loop.get((i + 1) % n);
                shoelace += x * q.path(1).asDouble() - q.path(0).asDouble() * y;
            }
            area += Math.abs(shoelace) / 2.0;
        }
        if (!any) {
            minX = minY = maxX = maxY = 0.0;
        }
        ArrayNode bbox = objectMapper.createArrayNode();
        bbox.add(round4(minX)).add(round4(minY)).add(round4(maxX)).add(round4(maxY));
        it.set("bbox", bbox);
        ArrayNode center = objectMapper.createArrayNode();
        center.add(round4((minX + maxX) / 2.0)).add(round4((minY + maxY) / 2.0));
        it.set("center", center);
        it.put("area", round4(area));
    }

    private static double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }

    private String writeJson(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "items 직렬화 실패", e);
        }
    }

    // --- 좌표 검증 (0~1, arity, 유한값, box 순서) ---

    private static void validatePoint(double[] p, String name) {
        if (p == null || p.length != 2) {
            throw invalid(name + " 는 [x, y] 2개여야 합니다.");
        }
        validateCoord(p[0]);
        validateCoord(p[1]);
    }

    private static void validateBox(double[] b) {
        if (b == null || b.length != 4) {
            throw invalid("box 는 [x1, y1, x2, y2] 4개여야 합니다.");
        }
        for (double v : b) {
            validateCoord(v);
        }
        if (!(b[0] < b[2] && b[1] < b[3])) {
            throw invalid("box 는 x1 < x2, y1 < y2 여야 합니다.");
        }
    }

    private static void validatePoints(double[][] pts, boolean required, String name) {
        if (pts == null || pts.length == 0) {
            if (required) {
                throw invalid(name + " 점이 1개 이상 필요합니다.");
            }
            return;
        }
        if (pts.length > MAX_REFINE_POINTS) {
            throw invalid(name + " 점은 최대 " + MAX_REFINE_POINTS + "개까지입니다.");
        }
        for (double[] p : pts) {
            validatePoint(p, name);
        }
    }

    private static void validateCoord(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v) || v < 0.0 || v > 1.0) {
            throw invalid("좌표는 0~1 범위의 유한한 값이어야 합니다.");
        }
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_INPUT, message);
    }
}
