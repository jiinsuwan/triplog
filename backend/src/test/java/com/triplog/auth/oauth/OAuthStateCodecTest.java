package com.triplog.auth.oauth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OAuthStateCodecTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-23T12:00:00Z"), ZoneId.of("Asia/Seoul"));

    @Test
    void encodes_and_decodes_signed_state() {
        OAuthStateCodec codec = codec();

        OAuthState state = codec.decode(codec.encode(OAuthProvider.GOOGLE, "/profile"));

        assertThat(state.provider()).isEqualTo(OAuthProvider.GOOGLE);
        assertThat(state.redirectPath()).isEqualTo("/profile");
    }

    @Test
    void rejects_tampered_state() {
        OAuthStateCodec codec = codec();
        String encoded = codec.encode(OAuthProvider.KAKAO, "/trips");

        assertThatThrownBy(() -> codec.decode(encoded + "tampered"))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.OAUTH_STATE_INVALID));
    }

    @Test
    void unsafe_redirect_falls_back_to_trips() {
        OAuthStateCodec codec = codec();

        OAuthState state = codec.decode(codec.encode(OAuthProvider.NAVER, "https://evil.example.com"));

        assertThat(state.redirectPath()).isEqualTo("/trips");
    }

    private OAuthStateCodec codec() {
        OAuthProperties properties = new OAuthProperties();
        properties.setStateSecret("test-state-secret");
        return new OAuthStateCodec(properties, new ObjectMapper(), CLOCK);
    }
}
