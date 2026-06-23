package com.triplog.auth.oauth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class NaverOAuthProviderClient extends AbstractOAuthProviderClient {

    public NaverOAuthProviderClient(RestClient.Builder restClientBuilder,
                                    ObjectMapper objectMapper,
                                    OAuthProperties properties) {
        super(restClientBuilder, objectMapper, properties.getNaver());
    }

    @Override
    public OAuthProvider provider() {
        return OAuthProvider.NAVER;
    }

    @Override
    public OAuthUserInfo fetchUser(String code) {
        JsonNode response = fetchUserInfo(accessToken(exchangeToken(code))).path("response");
        String id = text(response, "id");
        if (!hasText(id)) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_FAILURE);
        }
        return new OAuthUserInfo(
                provider(),
                id,
                text(response, "email"),
                text(response, "nickname"),
                text(response, "profile_image")
        );
    }
}
