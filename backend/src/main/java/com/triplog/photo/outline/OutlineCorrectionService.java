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

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
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

    /** 정제 미리보기 = itemId 객체를 +/− 점으로 다듬은 결과(폴리곤 + 흡수 대상)만 돌려준다. 저장 안 함(적용 전). */
    public OutlineRefinePreview previewRefine(Long userId, Long photoId, Integer itemId, double[][] pos, double[][] neg) {
        if (itemId == null) {
            throw invalid("itemId 가 필요합니다.");
        }
        validatePoints(pos, false, "pos");   // 씨앗을 BE 가 더하므로 사용자 pos 0개 허용(빼기만 가능)
        validatePoints(neg, false, "neg");
        double[][] safePos = (pos != null) ? pos : new double[0][];
        double[][] safeNeg = (neg != null) ? neg : new double[0][];

        Photo photo = photoService.requireOwnedPhoto(userId, photoId);
        PhotoOutline outline = outlineMapper.findByPhotoId(photoId);
        if (outline != null && outline.getStatus() == OutlineStatus.PENDING) {
            throw new BusinessException(ErrorCode.OUTLINE_PROCESSING);
        }
        ArrayNode items = parseItems(outline == null ? null : outline.getItems());
        JsonNode target = findItem(items, itemId);
        if (target == null) {
            return emptyPreview();   // 대상 객체 없음
        }
        double[][] seededPos = prepend(seedPoint(target), safePos);   // 씨앗 = 대상 안쪽 점
        String imageId = (outline != null) ? outline.getImageId() : null;
        OutlineCall call = callInference(photo, imageId, id -> inferenceClient.refine(id, seededPos, safeNeg));
        JsonNode polygons = call.polygons();
        if (polygons == null || !polygons.isArray() || polygons.isEmpty()) {
            return emptyPreview();   // 못 잡음
        }
        // 흡수(병합) 대상 = 사용자 pos 점이 안쪽에 떨어진 다른 객체 id. 적용 전엔 삭제하지 않는다.
        List<Integer> absorb = new ArrayList<>();
        for (JsonNode it : items) {
            int id = it.path("id").asInt(-1);
            if (id != itemId && absorbedByUserPos(it, safePos)) {
                absorb.add(id);
            }
        }
        return new OutlineRefinePreview(itemId, polygons, absorb);
    }

    private OutlineRefinePreview emptyPreview() {
        return new OutlineRefinePreview(NO_OP_ITEM_ID, objectMapper.createArrayNode(), List.of());
    }

    /** 정제 적용 = 미리보기 polygons 로 대상 객체를 교체하고 흡수 대상을 삭제한다(저장). inference 없음. */
    public OutlineCorrectionResponse commitRefine(Long userId, Long photoId, Integer itemId,
                                                  JsonNode polygons, List<Integer> absorbItemIds) {
        if (itemId == null) {
            throw invalid("itemId 가 필요합니다.");
        }
        if (polygons == null || !polygons.isArray() || polygons.isEmpty()) {
            throw invalid("polygons 가 비어 있습니다.");
        }
        validatePolygons(polygons);   // FE 가 보낸 좌표 방어(0~1)
        photoService.requireOwnedPhoto(userId, photoId);
        Set<Integer> absorb = (absorbItemIds != null) ? new HashSet<>(absorbItemIds) : Set.of();

        Boolean ok = txTemplate.execute(status -> {
            PhotoOutline locked = outlineMapper.findByPhotoIdForUpdate(photoId);
            ArrayNode items = parseItems(locked == null ? null : locked.getItems());
            ArrayNode rebuilt = objectMapper.createArrayNode();
            boolean replaced = false;
            for (JsonNode it : items) {
                int id = it.path("id").asInt(-1);
                if (id == itemId) {
                    rebuilt.add(replacedItem(it, polygons));
                    replaced = true;
                } else if (!absorb.contains(id)) {
                    rebuilt.add(it);   // 흡수 대상이 아니면 유지
                }
            }
            if (!replaced) {
                return false;   // 잠금 후 대상 사라짐
            }
            int rows = outlineMapper.updateCorrection(photoId, writeJson(rebuilt),
                    locked != null ? locked.getImageId() : null);
            if (rows == 0) {
                throw new BusinessException(ErrorCode.PHOTO_NOT_FOUND);
            }
            return true;
        });
        if (!Boolean.TRUE.equals(ok)) {
            return noOp();   // 대상이 사라짐
        }
        return new OutlineCorrectionResponse(itemId, polygons);
    }

    private static void validatePolygons(JsonNode polygons) {
        for (JsonNode loop : polygons) {
            if (!loop.isArray()) {
                continue;
            }
            for (JsonNode p : loop) {
                validateCoord(p.path(0).asDouble());
                validateCoord(p.path(1).asDouble());
            }
        }
    }

    /** 삭제 = 잘못 잡힌 객체를 외곽선 통째로 제거(영속). 없으면 멱등(아무것도 안 함). */
    public void deleteItem(Long userId, Long photoId, int itemId) {
        photoService.requireOwnedPhoto(userId, photoId);
        PhotoOutline outline = outlineMapper.findByPhotoId(photoId);
        if (outline != null && outline.getStatus() == OutlineStatus.PENDING) {
            throw new BusinessException(ErrorCode.OUTLINE_PROCESSING);
        }
        txTemplate.executeWithoutResult(status -> {
            PhotoOutline locked = outlineMapper.findByPhotoIdForUpdate(photoId);
            if (locked == null) {
                return;   // 행 없음 → 지울 것 없음(멱등)
            }
            ArrayNode items = parseItems(locked.getItems());
            ArrayNode rebuilt = objectMapper.createArrayNode();
            boolean removed = false;
            for (JsonNode it : items) {
                if (it.path("id").asInt(-1) == itemId) {
                    removed = true;   // 제외 = 삭제
                } else {
                    rebuilt.add(it);
                }
            }
            if (removed) {
                // 마지막 객체 삭제면 items=[] + status READY(FE 는 빈 items 를 "외곽선 없음"으로 처리).
                outlineMapper.updateCorrection(photoId, writeJson(rebuilt), locked.getImageId());
            }
        });
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

    // --- 정제 헬퍼 (교체 객체 만들기 · 씨앗 · 점-다각형) ---

    // 정제된 객체 = 모양만 바뀐 같은 객체. id·label·src 유지, polygons 교체 + geometry·anchors(합성) 재계산
    // (모양이 바뀌어 saliency 앵커는 못 재현하므로 객체 바깥 합성 앵커로 갈음).
    private ObjectNode replacedItem(JsonNode old, JsonNode polygons) {
        ObjectNode it = objectMapper.createObjectNode();
        it.put("id", old.path("id").asInt());
        it.set("label", old.has("label") && !old.get("label").isNull() ? old.get("label") : objectMapper.nullNode());
        it.put("src", old.path("src").asText(USER_SRC));
        addGeometry(it, polygons);
        addUserAnchors(it);
        it.set("polygons", polygons);
        return it;
    }

    // 대상 객체 안쪽 씨앗 점 — 가장 큰 loop 의 "보장된" 내부점(수평 스캔라인 중점). 꼭짓점 평균은 오목/U·다중
    // loop 도형에서 객체 밖(틈새)에 떨어질 수 있어 쓰지 않는다. 실패 시 center, 최후 [0.5, 0.5] 폴백.
    private double[] seedPoint(JsonNode item) {
        JsonNode loop = largestLoop(item.path("polygons"));
        if (loop != null) {
            double[] p = interiorPoint(loop);
            if (p != null) {
                return p;
            }
        }
        JsonNode c = item.get("center");
        if (c != null && c.isArray() && c.size() >= 2) {
            return new double[]{clamp01(c.get(0).asDouble()), clamp01(c.get(1).asDouble())};
        }
        return new double[]{0.5, 0.5};
    }

    private JsonNode largestLoop(JsonNode polygons) {
        JsonNode best = null;
        int bestN = 0;
        for (JsonNode loop : polygons) {
            if (loop.isArray() && loop.size() > bestN) {
                best = loop;
                bestN = loop.size();
            }
        }
        return best;
    }

    // loop 의 보장된 내부점: bbox 중앙 y 의 수평선과 변들의 교점 x 들 → 가장 넓은 내부 구간의 중점.
    // (오목 도형도 내부 구간 안에 들어간다.) 교점이 2개 미만이면 null(폴백 유도).
    private double[] interiorPoint(JsonNode loop) {
        int n = loop.size();
        if (n < 3) {
            return null;
        }
        double minY = 1.0;
        double maxY = 0.0;
        for (JsonNode p : loop) {
            double yy = p.path(1).asDouble();
            minY = Math.min(minY, yy);
            maxY = Math.max(maxY, yy);
        }
        double y = (minY + maxY) / 2.0;
        List<Double> xs = new ArrayList<>();
        for (int i = 0, j = n - 1; i < n; j = i++) {
            double yi = loop.get(i).path(1).asDouble();
            double yj = loop.get(j).path(1).asDouble();
            if ((yi > y) != (yj > y)) {
                double xi = loop.get(i).path(0).asDouble();
                double xj = loop.get(j).path(0).asDouble();
                xs.add(xi + (xj - xi) * (y - yi) / (yj - yi));
            }
        }
        if (xs.size() < 2) {
            return null;
        }
        Collections.sort(xs);
        double bestMid = 0.0;
        double bestW = -1.0;
        for (int k = 0; k + 1 < xs.size(); k += 2) {
            double w = xs.get(k + 1) - xs.get(k);
            if (w > bestW) {
                bestW = w;
                bestMid = (xs.get(k) + xs.get(k + 1)) / 2.0;
            }
        }
        return new double[]{clamp01(bestMid), clamp01(y)};
    }

    private double[][] prepend(double[] seed, double[][] pos) {
        double[][] out = new double[pos.length + 1][];
        out[0] = seed;
        System.arraycopy(pos, 0, out, 1, pos.length);
        return out;
    }

    private JsonNode findItem(ArrayNode items, int itemId) {
        for (JsonNode it : items) {
            if (it.path("id").asInt(-1) == itemId) {
                return it;
            }
        }
        return null;
    }

    // 사용자 pos 점 중 하나라도 이 객체 안쪽이면 흡수(병합) 대상.
    private boolean absorbedByUserPos(JsonNode item, double[][] userPos) {
        for (double[] p : userPos) {
            if (pointInItem(item, p[0], p[1])) {
                return true;
            }
        }
        return false;
    }

    private boolean pointInItem(JsonNode item, double x, double y) {
        for (JsonNode loop : item.path("polygons")) {
            if (pointInLoop(loop, x, y)) {
                return true;
            }
        }
        return false;
    }

    // 광선 투사(ray casting) 점-다각형 포함 검사 (loop = [[x,y], ...] 0~1).
    private boolean pointInLoop(JsonNode loop, double x, double y) {
        if (!loop.isArray()) {
            return false;
        }
        boolean inside = false;
        int n = loop.size();
        for (int i = 0, j = n - 1; i < n; j = i++) {
            double xi = loop.get(i).path(0).asDouble();
            double yi = loop.get(i).path(1).asDouble();
            double xj = loop.get(j).path(0).asDouble();
            double yj = loop.get(j).path(1).asDouble();
            boolean intersect = ((yi > y) != (yj > y))
                    && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) {
                inside = !inside;
            }
        }
        return inside;
    }

    private OutlineCorrectionResponse noOp() {
        return new OutlineCorrectionResponse(NO_OP_ITEM_ID, objectMapper.createArrayNode());
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
    // 렌더(center 배지 등) 계약을 깨지 않는다. anchors 는 saliency 가 없어 재현 못 하므로, 객체 바깥
    // (아래/오른쪽/왼쪽) 빈 공간에 합성 앵커 3개를 부여한다 — 그래야 문구 후보로 들어가 배치된다
    // (CardCaptionController 는 anchors 빈 item 만 제외, ANCHOR_OUT_OF_RANGE 방지).
    private ObjectNode userItem(int id, JsonNode polygons) {
        ObjectNode it = objectMapper.createObjectNode();
        it.put("id", id);
        it.put("label", USER_SRC);
        it.put("src", USER_SRC);
        addGeometry(it, polygons);
        addUserAnchors(it);
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

    // 사용자 보정 item 의 합성 앵커 — bbox 바깥(아래/오른쪽/왼쪽) 빈 공간 3점. 자동검출 anchors 와
    // 같은 [x, y, score] 형식(score 는 우선순위용 합성값). 0~1 로 클램프.
    private void addUserAnchors(ObjectNode it) {
        JsonNode bbox = it.get("bbox");
        double minX = bbox.get(0).asDouble();
        double minY = bbox.get(1).asDouble();
        double maxX = bbox.get(2).asDouble();
        double maxY = bbox.get(3).asDouble();
        double cx = (minX + maxX) / 2.0;
        double cy = (minY + maxY) / 2.0;
        double gap = 0.04; // 객체에서 살짝 띄워 문구가 피사체를 안 가리게
        ArrayNode anchors = objectMapper.createArrayNode();
        anchors.add(anchorNode(cx, maxY + gap, 1.0));   // 아래
        anchors.add(anchorNode(maxX + gap, cy, 0.9));   // 오른쪽
        anchors.add(anchorNode(minX - gap, cy, 0.8));   // 왼쪽
        it.set("anchors", anchors);
    }

    private ArrayNode anchorNode(double x, double y, double score) {
        ArrayNode a = objectMapper.createArrayNode();
        a.add(round4(clamp01(x))).add(round4(clamp01(y))).add(round4(score));
        return a;
    }

    private static double clamp01(double v) {
        return Math.max(0.0, Math.min(1.0, v));
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
