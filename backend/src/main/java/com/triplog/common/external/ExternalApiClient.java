package com.triplog.common.external;

import com.triplog.common.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;

public class ExternalApiClient {

    private static final Logger log = LoggerFactory.getLogger(ExternalApiClient.class);

    private final ExternalHttpTransport transport;
    private final ExternalApiProperties properties;
    private final RetrySleeper sleeper;

    public ExternalApiClient(ExternalHttpTransport transport, ExternalApiProperties properties) {
        this(transport, properties, duration -> Thread.sleep(duration.toMillis()));
    }

    ExternalApiClient(ExternalHttpTransport transport, ExternalApiProperties properties, RetrySleeper sleeper) {
        this.transport = transport;
        this.properties = properties;
        this.sleeper = sleeper;
    }

    public ExternalApiResponse exchange(ExternalApiRequest request) {
        int maxAttempts = Math.max(1, properties.getMaxAttempts());
        long totalStartedAt = System.nanoTime();

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                HttpResponse<String> response = transport.send(toHttpRequest(request));
                int statusCode = response.statusCode();
                long durationMs = elapsedMillis(totalStartedAt);

                if (shouldRetry(statusCode) && attempt < maxAttempts) {
                    log.warn("External API retry provider={} method={} uri={} status={} attempt={}/{}",
                            request.provider(), request.method(), redact(request.uri()), statusCode, attempt, maxAttempts);
                    sleepBeforeRetry(request, attempt);
                    continue;
                }

                if (!isSuccess(statusCode)) {
                    log.warn("External API failed provider={} method={} uri={} status={} attempts={} durationMs={}",
                            request.provider(), request.method(), redact(request.uri()), statusCode, attempt, durationMs);
                    throw new ExternalApiException(
                            ErrorCode.EXTERNAL_API_FAILURE, request.provider(), statusCode, attempt);
                }

                log.info("External API success provider={} method={} uri={} status={} attempts={} durationMs={}",
                        request.provider(), request.method(), redact(request.uri()), statusCode, attempt, durationMs);
                return new ExternalApiResponse(statusCode, response.body(), attempt, durationMs);
            } catch (HttpTimeoutException e) {
                if (attempt < maxAttempts) {
                    log.warn("External API timeout retry provider={} method={} uri={} attempt={}/{}",
                            request.provider(), request.method(), redact(request.uri()), attempt, maxAttempts);
                    sleepBeforeRetry(request, attempt);
                    continue;
                }
                throw new ExternalApiException(ErrorCode.EXTERNAL_API_TIMEOUT, request.provider(), null, attempt);
            } catch (IOException e) {
                if (attempt < maxAttempts) {
                    log.warn("External API IO retry provider={} method={} uri={} attempt={}/{}",
                            request.provider(), request.method(), redact(request.uri()), attempt, maxAttempts);
                    sleepBeforeRetry(request, attempt);
                    continue;
                }
                throw new ExternalApiException(ErrorCode.EXTERNAL_API_FAILURE, request.provider(), null, attempt);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new ExternalApiException(ErrorCode.EXTERNAL_API_FAILURE, request.provider(), null, attempt);
            }
        }

        throw new ExternalApiException(ErrorCode.EXTERNAL_API_FAILURE, request.provider(), null, maxAttempts);
    }

    private HttpRequest toHttpRequest(ExternalApiRequest request) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(request.uri())
                .timeout(properties.getReadTimeout());

        request.headers().forEach(builder::header);

        if (request.body() == null) {
            builder.method(request.method().name(), HttpRequest.BodyPublishers.noBody());
        } else {
            builder.method(request.method().name(), HttpRequest.BodyPublishers.ofString(request.body()));
        }

        return builder.build();
    }

    private boolean shouldRetry(int statusCode) {
        return statusCode == 429 || statusCode >= 500;
    }

    private boolean isSuccess(int statusCode) {
        return statusCode >= 200 && statusCode < 300;
    }

    private void sleepBeforeRetry(ExternalApiRequest request, int attempt) {
        Duration backoff = properties.getBackoff();
        if (!backoff.isZero() && !backoff.isNegative()) {
            try {
                sleeper.sleep(backoff);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new ExternalApiException(ErrorCode.EXTERNAL_API_FAILURE, request.provider(), null, attempt);
            }
        }
    }

    private long elapsedMillis(long startedAt) {
        return Duration.ofNanos(System.nanoTime() - startedAt).toMillis();
    }

    private String redact(URI uri) {
        if (uri.getQuery() == null) {
            return uri.toString();
        }
        return URI.create(uri.getScheme() + "://" + uri.getAuthority() + uri.getPath()).toString();
    }
}
