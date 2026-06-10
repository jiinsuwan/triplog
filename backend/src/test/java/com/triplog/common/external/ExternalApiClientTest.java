package com.triplog.common.external;

import com.triplog.common.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.net.ssl.SSLSession;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Queue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ExternalApiClientTest {

    private ExternalApiProperties properties;
    private List<Duration> sleeps;

    @BeforeEach
    void setUp() {
        properties = new ExternalApiProperties();
        properties.setConnectTimeout(Duration.ofMillis(500));
        properties.setReadTimeout(Duration.ofSeconds(2));
        properties.setMaxAttempts(3);
        properties.setBackoff(Duration.ofMillis(10));
        sleeps = new java.util.ArrayList<>();
    }

    @Test
    void exchange_returns_success_response() {
        CapturingTransport transport = new CapturingTransport(
                success(200, "{\"ok\":true}"));
        ExternalApiClient client = client(transport);

        ExternalApiResponse response = client.exchange(ExternalApiRequest
                .get("kakao", URI.create("https://dapi.kakao.com/v2/local/search/keyword.json?query=cafe"))
                .header("Authorization", "KakaoAK secret")
                .build());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("{\"ok\":true}");
        assertThat(response.attempts()).isEqualTo(1);
        assertThat(response.isSuccessful()).isTrue();
        assertThat(transport.requests()).hasSize(1);
        assertThat(transport.requests().getFirst().timeout()).contains(Duration.ofSeconds(2));
        assertThat(transport.requests().getFirst().headers().firstValue("Authorization"))
                .contains("KakaoAK secret");
    }

    @Test
    void exchange_retries_retryable_status_then_succeeds() {
        CapturingTransport transport = new CapturingTransport(
                success(502, "bad gateway"),
                success(200, "ok"));
        ExternalApiClient client = client(transport);

        ExternalApiResponse response = client.exchange(ExternalApiRequest
                .get("kakao", URI.create("https://dapi.kakao.com/v2/local/search/keyword.json"))
                .build());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.attempts()).isEqualTo(2);
        assertThat(transport.requests()).hasSize(2);
        assertThat(sleeps).containsExactly(Duration.ofMillis(10));
    }

    @Test
    void exchange_retries_too_many_requests_then_succeeds() {
        CapturingTransport transport = new CapturingTransport(
                success(429, "rate limited"),
                success(200, "ok"));
        ExternalApiClient client = client(transport);

        ExternalApiResponse response = client.exchange(ExternalApiRequest
                .get("tour-api", URI.create("https://api.data.go.kr/openapi/tn_pubr_public_trrsrt_api"))
                .build());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.attempts()).isEqualTo(2);
        assertThat(transport.requests()).hasSize(2);
        assertThat(sleeps).containsExactly(Duration.ofMillis(10));
    }

    @Test
    void exchange_does_not_retry_client_error() {
        CapturingTransport transport = new CapturingTransport(success(400, "bad request"));
        ExternalApiClient client = client(transport);

        assertThatThrownBy(() -> client.exchange(ExternalApiRequest
                .get("kakao", URI.create("https://dapi.kakao.com/v2/local/search/keyword.json"))
                .build()))
                .isInstanceOfSatisfying(ExternalApiException.class, e -> {
                    assertThat(e.getErrorCode()).isEqualTo(ErrorCode.EXTERNAL_API_FAILURE);
                    assertThat(e.getProvider()).isEqualTo("kakao");
                    assertThat(e.getStatusCode()).isEqualTo(400);
                    assertThat(e.getAttempts()).isEqualTo(1);
                });

        assertThat(transport.requests()).hasSize(1);
        assertThat(sleeps).isEmpty();
    }

    @Test
    void exchange_does_not_retry_post_by_default() {
        CapturingTransport transport = new CapturingTransport(success(502, "bad gateway"));
        ExternalApiClient client = client(transport);

        assertThatThrownBy(() -> client.exchange(ExternalApiRequest
                .post("payment-api", URI.create("https://api.example.com/orders"))
                .body("{\"name\":\"trip\"}")
                .build()))
                .isInstanceOfSatisfying(ExternalApiException.class, e -> {
                    assertThat(e.getErrorCode()).isEqualTo(ErrorCode.EXTERNAL_API_FAILURE);
                    assertThat(e.getStatusCode()).isEqualTo(502);
                    assertThat(e.getAttempts()).isEqualTo(1);
                });

        assertThat(transport.requests()).hasSize(1);
        assertThat(transport.requests().getFirst().method()).isEqualTo("POST");
        assertThat(transport.requests().getFirst().bodyPublisher()).isPresent();
        assertThat(sleeps).isEmpty();
    }

    @Test
    void exchange_retries_post_when_explicitly_enabled() {
        CapturingTransport transport = new CapturingTransport(
                success(502, "bad gateway"),
                success(200, "ok"));
        ExternalApiClient client = client(transport);

        ExternalApiResponse response = client.exchange(ExternalApiRequest
                .post("idempotent-post-api", URI.create("https://api.example.com/search"))
                .body("{\"keyword\":\"cafe\"}")
                .retryable(true)
                .build());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.attempts()).isEqualTo(2);
        assertThat(transport.requests()).hasSize(2);
        assertThat(sleeps).containsExactly(Duration.ofMillis(10));
    }

    @Test
    void exchange_retries_timeout_until_max_attempts() {
        CapturingTransport transport = new CapturingTransport(
                failure(new HttpTimeoutException("timeout")),
                failure(new HttpTimeoutException("timeout")),
                failure(new HttpTimeoutException("timeout")));
        ExternalApiClient client = client(transport);

        assertThatThrownBy(() -> client.exchange(ExternalApiRequest
                .get("weather", URI.create("https://api.example.com/weather"))
                .build()))
                .isInstanceOfSatisfying(ExternalApiException.class, e -> {
                    assertThat(e.getErrorCode()).isEqualTo(ErrorCode.EXTERNAL_API_TIMEOUT);
                    assertThat(e.getProvider()).isEqualTo("weather");
                    assertThat(e.getStatusCode()).isNull();
                    assertThat(e.getAttempts()).isEqualTo(3);
                    assertThat(e).hasCauseInstanceOf(HttpTimeoutException.class);
                });

        assertThat(transport.requests()).hasSize(3);
        assertThat(sleeps).containsExactly(Duration.ofMillis(10), Duration.ofMillis(10));
    }

    @Test
    void exchange_retries_io_failure_until_max_attempts_and_keeps_cause() {
        IOException ioException = new IOException("network down");
        CapturingTransport transport = new CapturingTransport(
                failure(ioException),
                failure(ioException),
                failure(ioException));
        ExternalApiClient client = client(transport);

        assertThatThrownBy(() -> client.exchange(ExternalApiRequest
                .get("tour-api", URI.create("https://api.data.go.kr/openapi/tn_pubr_public_trrsrt_api"))
                .build()))
                .isInstanceOfSatisfying(ExternalApiException.class, e -> {
                    assertThat(e.getErrorCode()).isEqualTo(ErrorCode.EXTERNAL_API_FAILURE);
                    assertThat(e.getStatusCode()).isNull();
                    assertThat(e.getAttempts()).isEqualTo(3);
                    assertThat(e).hasCauseInstanceOf(IOException.class);
                });

        assertThat(transport.requests()).hasSize(3);
        assertThat(sleeps).containsExactly(Duration.ofMillis(10), Duration.ofMillis(10));
    }

    @Test
    void redact_for_log_removes_query_parameters() {
        ExternalApiClient client = client(new CapturingTransport(success(200, "ok")));

        String redacted = client.redactForLog(URI.create(
                "https://api.example.com/search?serviceKey=secret&query=cafe"));

        assertThat(redacted).isEqualTo("https://api.example.com/search");
    }

    private ExternalApiClient client(CapturingTransport transport) {
        return new ExternalApiClient(transport, properties, sleeps::add);
    }

    private TransportResult success(int statusCode, String body) {
        return () -> new StubResponse(statusCode, body);
    }

    private TransportResult failure(IOException exception) {
        return () -> {
            throw exception;
        };
    }

    @FunctionalInterface
    private interface TransportResult {
        HttpResponse<String> send() throws IOException;
    }

    private static final class CapturingTransport implements ExternalHttpTransport {
        private final Queue<TransportResult> results = new ArrayDeque<>();
        private final java.util.ArrayList<HttpRequest> requests = new java.util.ArrayList<>();

        CapturingTransport(TransportResult... results) {
            this.results.addAll(List.of(results));
        }

        @Override
        public HttpResponse<String> send(HttpRequest request) throws IOException {
            requests.add(request);
            return results.remove().send();
        }

        java.util.ArrayList<HttpRequest> requests() {
            return requests;
        }
    }

    private record StubResponse(int statusCode, String body) implements HttpResponse<String> {

        @Override
        public HttpRequest request() {
            return null;
        }

        @Override
        public Optional<HttpResponse<String>> previousResponse() {
            return Optional.empty();
        }

        @Override
        public HttpHeaders headers() {
            return HttpHeaders.of(Map.of(), (name, value) -> true);
        }

        @Override
        public Optional<SSLSession> sslSession() {
            return Optional.empty();
        }

        @Override
        public URI uri() {
            return URI.create("https://example.com");
        }

        @Override
        public HttpClient.Version version() {
            return HttpClient.Version.HTTP_1_1;
        }
    }
}
