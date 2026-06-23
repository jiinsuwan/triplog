package com.triplog.auth.service;

import com.triplog.auth.oauth.OAuthProvider;
import com.triplog.auth.oauth.OAuthProviderClient;
import com.triplog.auth.oauth.OAuthRedirects;
import com.triplog.auth.oauth.OAuthState;
import com.triplog.auth.oauth.OAuthStateCodec;
import com.triplog.auth.oauth.OAuthUserInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.net.URI;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OAuthLoginServiceTest {

    private OAuthStateCodec stateCodec;
    private OAuthRedirects redirects;
    private OAuthAccountService accountService;
    private OAuthLoginService service;

    @BeforeEach
    void setUp() {
        stateCodec = mock(OAuthStateCodec.class);
        redirects = mock(OAuthRedirects.class);
        accountService = mock(OAuthAccountService.class);
        service = new OAuthLoginService(
                List.of(fakeClient(OAuthProvider.KAKAO), fakeClient(OAuthProvider.GOOGLE), fakeClient(OAuthProvider.NAVER)),
                stateCodec,
                redirects,
                accountService
        );
    }

    @ParameterizedTest
    @EnumSource(OAuthProvider.class)
    void authorization_uri_uses_provider_specific_client(OAuthProvider provider) {
        when(stateCodec.encode(provider, "/profile")).thenReturn("state-" + provider.path());

        URI uri = service.authorizationUri(provider.path(), "/profile");

        assertThat(uri.toString()).isEqualTo("https://example.com/" + provider.path() + "?state=state-" + provider.path());
    }

    @Test
    void authorization_unsupported_provider_redirects_to_failure() {
        when(redirects.failure("provider")).thenReturn(URI.create("http://front/login?oauthError=provider"));

        URI uri = service.authorizationUri("unknown", "/profile");

        assertThat(uri).isEqualTo(URI.create("http://front/login?oauthError=provider"));
    }

    @Test
    void callback_unexpected_exception_redirects_to_failure() {
        when(stateCodec.decode("state")).thenReturn(new OAuthState(OAuthProvider.KAKAO, "/trips", 1L, "nonce"));
        when(accountService.loginOrSignup(any())).thenThrow(new RuntimeException("duplicate"));
        when(redirects.failure("failed")).thenReturn(URI.create("http://front/login?oauthError=failed"));

        URI uri = service.callbackUri("kakao", "kakao@example.com", "state", null);

        assertThat(uri).isEqualTo(URI.create("http://front/login?oauthError=failed"));
        verify(accountService).loginOrSignup(any());
    }

    private OAuthProviderClient fakeClient(OAuthProvider provider) {
        return new OAuthProviderClient() {
            @Override
            public OAuthProvider provider() {
                return provider;
            }

            @Override
            public URI authorizationUri(String state) {
                return URI.create("https://example.com/" + provider.path() + "?state=" + state);
            }

            @Override
            public OAuthUserInfo fetchUser(String code) {
                return new OAuthUserInfo(provider, provider.path() + "-user", null, provider.path(), null);
            }
        };
    }
}
