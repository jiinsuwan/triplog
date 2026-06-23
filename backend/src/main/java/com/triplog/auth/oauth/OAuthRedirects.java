package com.triplog.auth.oauth;

import com.triplog.auth.dto.AuthTokenResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@Component
public class OAuthRedirects {

    private final OAuthProperties properties;

    public OAuthRedirects(OAuthProperties properties) {
        this.properties = properties;
    }

    public URI success(AuthTokenResponse tokens, String redirectPath) {
        String fragment = "accessToken=" + encode(tokens.accessToken())
                + "&refreshToken=" + encode(tokens.refreshToken())
                + "&tokenType=" + encode(tokens.tokenType())
                + "&redirect=" + encode(redirectPath);
        return URI.create(stripFragment(properties.getFrontend().getSuccessUri()) + "#" + fragment);
    }

    public URI failure(String reason) {
        return UriComponentsBuilder.fromUriString(properties.getFrontend().getFailureUri())
                .queryParam("oauthError", reason)
                .build()
                .encode()
                .toUri();
    }

    private String stripFragment(String uri) {
        int fragmentIndex = uri.indexOf('#');
        return fragmentIndex >= 0 ? uri.substring(0, fragmentIndex) : uri;
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
