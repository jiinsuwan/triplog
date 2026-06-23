package com.triplog.auth.oauth;

public record OAuthUserInfo(
        OAuthProvider provider,
        String providerUserId,
        String email,
        String nickname,
        String profileImg
) {
}
