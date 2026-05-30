package com.triplog.auth.dto;

public record AuthTokenResponse(
        String accessToken,
        String refreshToken,
        String tokenType
) {

    public static AuthTokenResponse bearer(String accessToken, String refreshToken) {
        return new AuthTokenResponse(accessToken, refreshToken, "Bearer");
    }
}
