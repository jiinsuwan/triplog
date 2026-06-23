package com.triplog.auth.oauth;

import com.triplog.auth.dto.AuthTokenResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@Component
public class OAuthRedirects {

    private static final String DEFAULT_FAILURE_URI = "http://localhost:5173/login";

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
        try {
            return failure(properties.getFrontend().getFailureUri(), reason);
        } catch (RuntimeException e) {
            return failure(DEFAULT_FAILURE_URI, reason);
        }
    }

    private URI failure(String baseUri, String reason) {
        URI uri = UriComponentsBuilder.fromUriString(baseUri)
                .queryParam("oauthError", reason)
                .build()
                .encode()
                .toUri();
        if (("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                && (uri.getHost() == null || uri.getHost().isBlank())) {
            throw new IllegalArgumentException("OAuth failure URI host is blank.");
        }
        return uri;
    }

    private String stripFragment(String uri) {
        int fragmentIndex = uri.indexOf('#');
        return fragmentIndex >= 0 ? uri.substring(0, fragmentIndex) : uri;
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
