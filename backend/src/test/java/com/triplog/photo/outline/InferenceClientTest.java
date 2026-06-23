package com.triplog.photo.outline;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.net.SocketTimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * InferenceClient 단위 테스트(MockRestServiceServer로 사이드카 응답 모킹).
 * 계약: tap/box/refine → polygons 추출(빈 결과 빈 배열), 404 → InferenceImageMissingException,
 * 그 외 4xx/5xx·타임아웃 → InferenceException, preprocess → job result 에서 image_id 캡처.
 */
class InferenceClientTest {

    private MockRestServiceServer server;
    private InferenceClient client;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setup() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://inference");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new InferenceClient(new InferenceProperties(), mapper, builder.build());
    }

    @Test
    void tap_parses_polygons() {
        server.expect(requestTo("http://inference/v1/outline/tap"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"polygons\":[[[0.1,0.2],[0.3,0.4]]],\"item_id\":5}",
                        MediaType.APPLICATION_JSON));

        JsonNode polygons = client.tap("img-1", new double[]{0.5, 0.5});

        assertThat(polygons.isArray()).isTrue();
        assertThat(polygons).hasSize(1);
        server.verify();
    }

    @Test
    void tap_empty_result_returns_empty_array() {
        server.expect(requestTo("http://inference/v1/outline/tap"))
                .andRespond(withSuccess("{\"polygons\":[]}", MediaType.APPLICATION_JSON));

        JsonNode polygons = client.tap("img-1", new double[]{0.5, 0.5});

        assertThat(polygons.isArray()).isTrue();
        assertThat(polygons.isEmpty()).isTrue();
    }

    @Test
    void missing_image_id_maps_to_image_missing_exception() {
        server.expect(requestTo("http://inference/v1/outline/tap"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND)
                        .body("{\"detail\":\"unknown image_id (register first)\"}")
                        .contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.tap("gone", new double[]{0.5, 0.5}))
                .isInstanceOf(InferenceImageMissingException.class);
    }

    @Test
    void server_error_maps_to_inference_exception() {
        server.expect(requestTo("http://inference/v1/outline/box"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.box("img-1", new double[]{0.1, 0.1, 0.5, 0.5}))
                .isInstanceOf(InferenceException.class)
                .isNotInstanceOf(InferenceImageMissingException.class);
    }

    @Test
    void timeout_maps_to_inference_exception() {
        server.expect(requestTo("http://inference/v1/outline/refine"))
                .andRespond(withException(new SocketTimeoutException("read timed out")));

        assertThatThrownBy(() -> client.refine("img-1", new double[][]{{0.5, 0.5}}, new double[0][]))
                .isInstanceOf(InferenceException.class);
    }

    @Test
    void non_array_polygons_maps_to_inference_exception() {
        // 200 이라도 polygons 가 배열이 아니면(에러 바디·schema drift) 실패로 본다(no-op 아님).
        server.expect(requestTo("http://inference/v1/outline/tap"))
                .andRespond(withSuccess("{\"error\":\"boom\"}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.tap("img-1", new double[]{0.5, 0.5}))
                .isInstanceOf(InferenceException.class)
                .isNotInstanceOf(InferenceImageMissingException.class);
    }

    @Test
    void register_http_failure_maps_to_inference_exception() {
        server.expect(requestTo("http://inference/v1/images")).andRespond(withServerError());

        assertThatThrownBy(() -> client.preprocess(new byte[]{1, 2, 3}, "p.jpg"))
                .isInstanceOf(InferenceException.class)
                .isNotInstanceOf(InferenceImageMissingException.class);
    }

    @Test
    void job_poll_http_failure_maps_to_inference_exception() {
        server.expect(requestTo("http://inference/v1/images"))
                .andRespond(withSuccess("{\"job_id\":\"j1\",\"status\":\"queued\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://inference/v1/jobs/j1")).andRespond(withServerError());

        assertThatThrownBy(() -> client.preprocess(new byte[]{1, 2, 3}, "p.jpg"))
                .isInstanceOf(InferenceException.class);
    }

    @Test
    void preprocess_captures_image_id_from_job_result() {
        server.expect(requestTo("http://inference/v1/images"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"job_id\":\"job-1\",\"status\":\"queued\"}",
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://inference/v1/jobs/job-1"))
                .andRespond(withSuccess(
                        "{\"job_id\":\"job-1\",\"status\":\"done\","
                                + "\"result\":{\"image_id\":\"img-xyz\",\"items\":[{\"id\":0}]}}",
                        MediaType.APPLICATION_JSON));

        InferenceClient.PreprocessResult result = client.preprocess(new byte[]{1, 2, 3}, "p.jpg");

        assertThat(result.imageId()).isEqualTo("img-xyz");
        assertThat(result.items()).contains("\"id\":0");
        server.verify();
    }
}
