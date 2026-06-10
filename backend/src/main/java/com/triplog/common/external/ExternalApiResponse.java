package com.triplog.common.external;

public record ExternalApiResponse(
        int statusCode,
        String body,
        int attempts,
        long durationMs
) {

    public boolean isSuccessful() {
        return statusCode >= 200 && statusCode < 300;
    }
}
