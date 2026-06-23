package com.triplog.auth.service;

import com.triplog.auth.dto.AuthTokenResponse;
import com.triplog.auth.oauth.OAuthProvider;
import com.triplog.auth.oauth.OAuthProviderClient;
import com.triplog.auth.oauth.OAuthRedirects;
import com.triplog.auth.oauth.OAuthState;
import com.triplog.auth.oauth.OAuthStateCodec;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Service
public class OAuthLoginService {

    private static final Logger log = LoggerFactory.getLogger(OAuthLoginService.class);

    private final Map<OAuthProvider, OAuthProviderClient> clients;
    private final OAuthStateCodec stateCodec;
    private final OAuthRedirects redirects;
    private final OAuthAccountService accountService;

    public OAuthLoginService(List<OAuthProviderClient> clients,
                             OAuthStateCodec stateCodec,
                             OAuthRedirects redirects,
                             OAuthAccountService accountService) {
        this.clients = new EnumMap<>(OAuthProvider.class);
        for (OAuthProviderClient client : clients) {
            this.clients.put(client.provider(), client);
        }
        this.stateCodec = stateCodec;
        this.redirects = redirects;
        this.accountService = accountService;
    }

    public URI authorizationUri(String providerPath, String redirectPath) {
        try {
            OAuthProvider provider = OAuthProvider.fromPath(providerPath);
            return client(provider).authorizationUri(stateCodec.encode(provider, redirectPath));
        } catch (BusinessException e) {
            return redirects.failure(reason(e.getErrorCode()));
        } catch (Exception e) {
            log.warn("OAuth authorization failed. providerPath={}", providerPath, e);
            return redirects.failure("failed");
        }
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
            AuthTokenResponse tokens = accountService.loginOrSignup(client(provider).fetchUser(code));
            return redirects.success(tokens, decodedState.redirectPath());
        } catch (BusinessException e) {
            return redirects.failure(reason(e.getErrorCode()));
        } catch (Exception e) {
            log.warn("OAuth callback failed. providerPath={}", providerPath, e);
            return redirects.failure("failed");
        }
    }

    private OAuthProviderClient client(OAuthProvider provider) {
        OAuthProviderClient client = clients.get(provider);
        if (client == null) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_UNSUPPORTED);
        }
        return client;
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
