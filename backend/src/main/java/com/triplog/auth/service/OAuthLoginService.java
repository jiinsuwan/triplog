package com.triplog.auth.service;

import com.triplog.auth.domain.SocialAccount;
import com.triplog.auth.dto.AuthTokenResponse;
import com.triplog.auth.mapper.SocialAccountMapper;
import com.triplog.auth.oauth.OAuthProvider;
import com.triplog.auth.oauth.OAuthProviderClient;
import com.triplog.auth.oauth.OAuthRedirects;
import com.triplog.auth.oauth.OAuthState;
import com.triplog.auth.oauth.OAuthStateCodec;
import com.triplog.auth.oauth.OAuthUserInfo;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.user.domain.User;
import com.triplog.user.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Service
public class OAuthLoginService {

    private final Map<OAuthProvider, OAuthProviderClient> clients;
    private final OAuthStateCodec stateCodec;
    private final OAuthRedirects redirects;
    private final SocialAccountMapper socialAccountMapper;
    private final UserMapper userMapper;
    private final AuthService authService;

    public OAuthLoginService(List<OAuthProviderClient> clients,
                             OAuthStateCodec stateCodec,
                             OAuthRedirects redirects,
                             SocialAccountMapper socialAccountMapper,
                             UserMapper userMapper,
                             AuthService authService) {
        this.clients = new EnumMap<>(OAuthProvider.class);
        for (OAuthProviderClient client : clients) {
            this.clients.put(client.provider(), client);
        }
        this.stateCodec = stateCodec;
        this.redirects = redirects;
        this.socialAccountMapper = socialAccountMapper;
        this.userMapper = userMapper;
        this.authService = authService;
    }

    public URI authorizationUri(String providerPath, String redirectPath) {
        OAuthProvider provider = OAuthProvider.fromPath(providerPath);
        return client(provider).authorizationUri(stateCodec.encode(provider, redirectPath));
    }

    public URI callbackUri(String providerPath, String code, String state, String error) {
        try {
            OAuthProvider provider = OAuthProvider.fromPath(providerPath);
            if (hasText(error)) {
                return redirects.failure("cancelled");
            }
            if (!hasText(code)) {
                return redirects.failure("failed");
            }
            OAuthState decodedState = stateCodec.decode(state);
            if (decodedState.provider() != provider) {
                return redirects.failure("state");
            }
            AuthTokenResponse tokens = loginOrSignup(client(provider).fetchUser(code));
            return redirects.success(tokens, decodedState.redirectPath());
        } catch (BusinessException e) {
            return redirects.failure(reason(e.getErrorCode()));
        }
    }

    @Transactional
    public AuthTokenResponse loginOrSignup(OAuthUserInfo userInfo) {
        SocialAccount existing = socialAccountMapper.findByProviderAndProviderUserId(
                userInfo.provider().name(), userInfo.providerUserId());
        if (existing != null) {
            return authService.issueTokens(existing.getUserId());
        }

        if (hasText(userInfo.email()) && userMapper.countByEmail(userInfo.email()) > 0) {
            throw new BusinessException(ErrorCode.OAUTH_EMAIL_CONFLICT);
        }

        User user = new User();
        user.setEmail(null);
        user.setPassword(null);
        user.setNickname(nickname(userInfo));
        user.setProfileImg(userInfo.profileImg());
        userMapper.insert(user);

        SocialAccount socialAccount = new SocialAccount();
        socialAccount.setUserId(user.getId());
        socialAccount.setProvider(userInfo.provider().name());
        socialAccount.setProviderUserId(userInfo.providerUserId());
        socialAccount.setEmail(userInfo.email());
        socialAccount.setNickname(userInfo.nickname());
        socialAccount.setProfileImg(userInfo.profileImg());
        socialAccountMapper.insert(socialAccount);

        return authService.issueTokens(user.getId());
    }

    private OAuthProviderClient client(OAuthProvider provider) {
        OAuthProviderClient client = clients.get(provider);
        if (client == null) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_UNSUPPORTED);
        }
        return client;
    }

    private String nickname(OAuthUserInfo userInfo) {
        String nickname = hasText(userInfo.nickname()) ? userInfo.nickname().trim() : userInfo.provider().name() + " user";
        return nickname.length() > 50 ? nickname.substring(0, 50) : nickname;
    }

    private String reason(ErrorCode errorCode) {
        if (errorCode == ErrorCode.OAUTH_EMAIL_CONFLICT || errorCode == ErrorCode.EMAIL_ALREADY_EXISTS) {
            return "email_conflict";
        }
        if (errorCode == ErrorCode.OAUTH_STATE_INVALID) {
            return "state";
        }
        if (errorCode == ErrorCode.OAUTH_PROVIDER_UNSUPPORTED) {
            return "provider";
        }
        return "failed";
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
