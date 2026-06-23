package com.triplog.auth.oauth;

import com.triplog.auth.dto.AuthTokenResponse;
import org.junit.jupiter.api.Test;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;

class OAuthRedirectsTest {

    @Test
    void failure_adds_error_reason_to_configured_frontend_login_uri() {
        OAuthProperties properties = new OAuthProperties();
        properties.getFrontend().setFailureUri("https://front.example.com/login");
        OAuthRedirects redirects = new OAuthRedirects(properties);

        URI uri = redirects.failure("state");

        assertThat(uri.toString()).isEqualTo("https://front.example.com/login?oauthError=state");
    }

    @Test
    void failure_falls_back_to_default_login_uri_when_configured_uri_is_invalid() {
        OAuthProperties properties = new OAuthProperties();
        properties.getFrontend().setFailureUri("http://[bad");
        OAuthRedirects redirects = new OAuthRedirects(properties);

        URI uri = redirects.failure("failed");

        assertThat(uri.toString()).isEqualTo("http://localhost:5173/login?oauthError=failed");
    }

    @Test
    void success_strips_existing_fragment_before_appending_tokens() {
        OAuthProperties properties = new OAuthProperties();
        properties.getFrontend().setSuccessUri("https://front.example.com/oauth/callback#old");
        OAuthRedirects redirects = new OAuthRedirects(properties);

        URI uri = redirects.success(AuthTokenResponse.bearer("a token", "r token"), "/trips");

        assertThat(uri.toString()).startsWith("https://front.example.com/oauth/callback#");
        assertThat(uri.getFragment()).contains("accessToken=a+token");
        assertThat(uri.getFragment()).contains("refreshToken=r+token");
        assertThat(uri.toString()).contains("redirect=%2Ftrips");
    }
}
