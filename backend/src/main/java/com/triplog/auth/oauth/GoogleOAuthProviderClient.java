package com.triplog.auth.oauth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class GoogleOAuthProviderClient extends AbstractOAuthProviderClient {

    public GoogleOAuthProviderClient(RestClient.Builder restClientBuilder,
                                     ObjectMapper objectMapper,
                                     OAuthProperties properties) {
        super(restClientBuilder, objectMapper, properties.getGoogle());
    }

    @Override
    public OAuthProvider provider() {
        return OAuthProvider.GOOGLE;
    }

    @Override
    public OAuthUserInfo fetchUser(String code) {
        JsonNode user = fetchUserInfo(accessToken(exchangeToken(code)));
        String id = text(user, "sub");
        if (!hasText(id)) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_FAILURE);
        }
        return new OAuthUserInfo(
                provider(),
                id,
                text(user, "email"),
                text(user, "name"),
                text(user, "picture")
        );
    }
}
