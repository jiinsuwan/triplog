package com.triplog.auth.oauth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;

abstract class AbstractOAuthProviderClient implements OAuthProviderClient {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final OAuthProperties.Provider properties;

    protected AbstractOAuthProviderClient(RestClient.Builder restClientBuilder,
                                          ObjectMapper objectMapper,
                                          OAuthProperties.Provider properties) {
        this.restClient = restClientBuilder.build();
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    @Override
    public URI authorizationUri(String state) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(required(properties.getAuthorizationUri()))
                .queryParam("response_type", "code")
                .queryParam("client_id", required(properties.getClientId()))
                .queryParam("redirect_uri", required(properties.getRedirectUri()))
                .queryParam("state", state);
        if (hasText(properties.getScope())) {
            builder.queryParam("scope", properties.getScope());
        }
        return builder.build().encode().toUri();
    }

    protected JsonNode exchangeToken(String code) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", required(properties.getClientId()));
        form.add("redirect_uri", required(properties.getRedirectUri()));
        form.add("code", code);
        if (hasText(properties.getClientSecret())) {
            form.add("client_secret", properties.getClientSecret());
        }

        return postForm(required(properties.getTokenUri()), form);
    }

    protected JsonNode fetchUserInfo(String accessToken) {
        try {
            String body = restClient.get()
                    .uri(required(properties.getUserInfoUri()))
                    .headers(headers -> headers.setBearerAuth(accessToken))
                    .retrieve()
                    .body(String.class);
            return objectMapper.readTree(body);
        } catch (Exception e) {
            throw providerFailure(e);
        }
    }

    protected String accessToken(JsonNode tokenResponse) {
        String accessToken = text(tokenResponse, "access_token");
        if (!hasText(accessToken)) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_FAILURE);
        }
        return accessToken;
    }

    protected String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asText();
        return hasText(text) ? text : null;
    }

    protected String nestedText(JsonNode node, String... path) {
        JsonNode current = node;
        for (String field : path) {
            current = current.path(field);
        }
        if (current.isMissingNode() || current.isNull()) {
            return null;
        }
        String text = current.asText();
        return hasText(text) ? text : null;
    }

    protected boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private JsonNode postForm(String uri, MultiValueMap<String, String> form) {
        try {
            String body = restClient.post()
                    .uri(uri)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(String.class);
            return objectMapper.readTree(body);
        } catch (Exception e) {
            throw providerFailure(e);
        }
    }

    private String required(String value) {
        if (!hasText(value)) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_FAILURE);
        }
        return value;
    }

    private BusinessException providerFailure(Exception e) {
        if (e instanceof RestClientException || e instanceof java.io.IOException) {
            return new BusinessException(ErrorCode.OAUTH_PROVIDER_FAILURE);
        }
        return new BusinessException(ErrorCode.OAUTH_PROVIDER_FAILURE);
    }
}
