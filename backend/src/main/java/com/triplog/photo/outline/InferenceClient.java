package com.triplog.photo.outline;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * 윤곽선 추론 서버(inference/) 호출 클라이언트 (S3-LOG-02 #70).
 * 사진 1장을 multipart 로 보내고(POST /v1/images → job_id), 완료까지 폴링(GET /v1/jobs/{id})해
 * items(윤곽선·앵커) JSON 을 돌려준다. 기존 ExternalApiClient 는 텍스트 body 만 지원해 재사용 불가.
 */
@Component
public class InferenceClient {

    private final RestClient restClient;
    private final InferenceProperties props;
    private final ObjectMapper objectMapper;

    public InferenceClient(InferenceProperties props, ObjectMapper objectMapper) {
        this.props = props;
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) props.getConnectTimeout().toMillis());
        factory.setReadTimeout((int) props.getReadTimeout().toMillis());
        this.restClient = RestClient.builder()
                .baseUrl(props.getBaseUrl())
                .requestFactory(factory)
                .build();
    }

    /** 사진 1장을 전처리하고 items(윤곽선·앵커) JSON 문자열을 돌려준다. 실패 시 InferenceException. */
    public String preprocess(byte[] image, String filename) {
        return poll(register(image, filename));
    }

    private String register(byte[] image, String filename) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new NamedByteArrayResource(image, filename));
        String resp = restClient.post()
                .uri("/v1/images")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(String.class);
        JsonNode node = readTree(resp, "register");
        String jobId = node.path("job_id").asText(null);
        if (jobId == null || jobId.isBlank()) {
            throw new InferenceException("register 응답에 job_id 없음: " + resp);
        }
        return jobId;
    }

    private String poll(String jobId) {
        long deadline = System.nanoTime() + props.getPollTimeout().toNanos();
        long intervalMs = props.getPollInterval().toMillis();
        while (System.nanoTime() < deadline) {
            String resp = restClient.get().uri("/v1/jobs/{id}", jobId).retrieve().body(String.class);
            JsonNode node = readTree(resp, "job");
            String status = node.path("status").asText("");
            if ("done".equals(status)) {
                JsonNode items = node.path("result").path("items");
                return writeJson(items);
            }
            if ("error".equals(status)) {
                throw new InferenceException("추론 작업 실패: " + node.path("error").asText(""));
            }
            sleep(intervalMs);
        }
        throw new InferenceException("추론 작업 시간 초과 (job " + jobId + ")");
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
