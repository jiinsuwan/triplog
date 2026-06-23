package com.triplog.auth.oauth;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;

import java.util.Arrays;

public enum OAuthProvider {
    KAKAO("kakao"),
    GOOGLE("google"),
    NAVER("naver");

    private final String path;

    OAuthProvider(String path) {
        this.path = path;
    }

    public String path() {
        return path;
    }

    public static OAuthProvider fromPath(String path) {
        return Arrays.stream(values())
                .filter(provider -> provider.path.equalsIgnoreCase(path))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.OAUTH_PROVIDER_UNSUPPORTED));
    }
}
