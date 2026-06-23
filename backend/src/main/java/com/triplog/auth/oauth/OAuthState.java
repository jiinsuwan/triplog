package com.triplog.auth.oauth;

public record OAuthState(
        OAuthProvider provider,
        String redirectPath,
        long expiresAtEpochSecond,
        String nonce
) {
}
