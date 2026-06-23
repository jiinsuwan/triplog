package com.triplog.auth.oauth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class KakaoOAuthProviderClient extends AbstractOAuthProviderClient {

    public KakaoOAuthProviderClient(RestClient.Builder restClientBuilder,
                                    ObjectMapper objectMapper,
                                    OAuthProperties properties) {
        super(restClientBuilder, objectMapper, properties.getKakao());
    }

    @Override
    public OAuthProvider provider() {
        return OAuthProvider.KAKAO;
    }

    @Override
    public OAuthUserInfo fetchUser(String code) {
        JsonNode user = fetchUserInfo(accessToken(exchangeToken(code)));
        String id = text(user, "id");
        if (!hasText(id)) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_FAILURE);
        }
        return new OAuthUserInfo(
                provider(),
                id,
                nestedText(user, "kakao_account", "email"),
                nestedText(user, "kakao_account", "profile", "nickname"),
                nestedText(user, "kakao_account", "profile", "profile_image_url")
        );
    }
}
