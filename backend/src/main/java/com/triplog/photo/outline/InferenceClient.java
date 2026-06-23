package com.triplog.photo.outline;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Map;

/**
 * 윤곽선 추론 서버(inference/) 호출 클라이언트 (S3-LOG-02 #70, 보정 추가 S4-LOG-01 #114).
 * 자동 초안: 사진 1장을 multipart 로 보내고(POST /v1/images → job_id), 완료까지 폴링(GET /v1/jobs/{id})해
 * items(윤곽선·앵커)와 image_id 를 돌려준다. 보정: image_id 로 tap/box/refine 을 동기 호출해 폴리곤을 받는다.
 * 기존 ExternalApiClient 는 텍스트 body 만 지원해 재사용 불가.
 */
@Component
public class InferenceClient {

    private final RestClient restClient;
    private final InferenceProperties props;
    private final ObjectMapper objectMapper;

    public InferenceClient(InferenceProperties props, ObjectMapper objectMapper, RestClient inferenceRestClient) {
        this.props = props;
        this.objectMapper = objectMapper;
        // baseUrl·connect/read timeout 설정은 OutlineConfig#inferenceRestClient 에서 (테스트는 MockRestServiceServer 주입).
        this.restClient = inferenceRestClient;
    }

    /** 전처리 결과: items(폴리곤·앵커 JSON 문자열) + image_id(보정용 캐시 키). */
    public record PreprocessResult(String items, String imageId) {
    }

    /** 사진 1장을 전처리하고 items·image_id 를 돌려준다. 실패 시 InferenceException. */
    public PreprocessResult preprocess(byte[] image, String filename) {
        return poll(register(image, filename));
    }

    /** 탭 보정: 한 점으로 단일 객체 외곽선. 폴리곤(0~1 정규화) 배열을 돌려준다(객체 없으면 빈 배열). */
    public JsonNode tap(String imageId, double[] point) {
        return callOutline("/v1/outline/tap", Map.of("image_id", imageId, "point", point));
    }

    /** 박스 보정: 드래그 영역으로 무리 외곽선. */
    public JsonNode box(String imageId, double[] boxXyxy) {
        return callOutline("/v1/outline/box", Map.of("image_id", imageId, "box", boxXyxy));
    }

    /** +/− 정제: 포지티브/네거티브 점 묶음으로 한 객체를 다듬는다(호출마다 전체 점 전달). */
    public JsonNode refine(String imageId, double[][] pos, double[][] neg) {
        return callOutline("/v1/outline/refine", Map.of("image_id", imageId, "pos", pos, "neg", neg));
    }

    private String register(byte[] image, String filename) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new NamedByteArrayResource(image, filename));
        String resp;
        try {
            resp = restClient.post()
                    .uri("/v1/images")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .retrieve()
                    .body(String.class);
        } catch (RestClientException e) {                 // 5xx·연결불가·타임아웃 → 503 으로 흡수되도록 래핑
            throw new InferenceException("register 호출 실패", e);
        }
        JsonNode node = readTree(resp, "register");
        String jobId = node.path("job_id").asText(null);
        if (jobId == null || jobId.isBlank()) {
            throw new InferenceException("register 응답에 job_id 없음: " + resp);
        }
        return jobId;
    }

    private PreprocessResult poll(String jobId) {
        long deadline = System.nanoTime() + props.getPollTimeout().toNanos();
        long intervalMs = props.getPollInterval().toMillis();
        while (System.nanoTime() < deadline) {
            String resp;
            try {
                resp = restClient.get().uri("/v1/jobs/{id}", jobId).retrieve().body(String.class);
            } catch (RestClientException e) {             // 5xx·연결불가·타임아웃 → 503 으로 흡수되도록 래핑
                throw new InferenceException("job 조회 실패", e);
            }
            JsonNode node = readTree(resp, "job");
            String status = node.path("status").asText("");
            if ("done".equals(status)) {
                JsonNode result = node.path("result");
                String imageId = result.path("image_id").asText(null);
                return new PreprocessResult(writeJson(result.path("items")), imageId);
            }
            if ("error".equals(status)) {
                throw new InferenceException("추론 작업 실패: " + node.path("error").asText(""));
            }
            sleep(intervalMs);
        }
        throw new InferenceException("추론 작업 시간 초과 (job " + jobId + ")");
    }

    // 보정 엔드포인트 공통 호출. 404(image_id 미존재)는 InferenceImageMissingException 으로,
    // 그 외 4xx/5xx·연결불가·타임아웃은 InferenceException 으로 매핑한다. 응답의 polygons 배열을 돌려준다.
    private JsonNode callOutline(String path, Map<String, Object> body) {
        String resp;
        try {
            resp = restClient.post()
                    .uri(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(s -> s.value() == 404, (req, res) -> {
                        throw new InferenceImageMissingException("unknown image_id (" + path + ")");
                    })
                    .body(String.class);
        } catch (InferenceException e) {
            throw e;                                  // 우리가 onStatus 에서 던진 404 등은 그대로
        } catch (RestClientException e) {
            throw new InferenceException("보정 호출 실패: " + path, e);
        }
        // 200 이라도 polygons 가 배열이 아니면(에러 바디·schema drift) 계약 위반 → 실패로 본다.
        // "객체 못 찾음"은 polygons:[](빈 배열)뿐이고, 그 no-op 판정은 호출측(OutlineCorrectionService)이 한다.
        JsonNode polygons = readTree(resp, "outline").path("polygons");
        if (!polygons.isArray()) {
            throw new InferenceException("보정 응답에 polygons 배열 없음: " + path);
        }
        return polygons;
    }

    private JsonNode readTree(String body, String where) {
        try {
            return objectMapper.readTree(body);
        } catch (JsonProcessingException e) {
            throw new InferenceException(where + " 응답 파싱 실패", e);
        }
    }

    private String writeJson(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            throw new InferenceException("items 직렬화 실패", e);
        }
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new InferenceException("추론 폴링 중단됨");
        }
    }

    /** multipart part 의 filename 을 지정하기 위한 ByteArrayResource. */
    private static final class NamedByteArrayResource extends ByteArrayResource {
        private final String filename;

        NamedByteArrayResource(byte[] bytes, String filename) {
            super(bytes);
            this.filename = filename;
        }

        @Override
        public String getFilename() {
            return filename;
        }
    }
}
