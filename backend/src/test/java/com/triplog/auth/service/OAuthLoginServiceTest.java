package com.triplog.auth.service;

import com.triplog.auth.domain.SocialAccount;
import com.triplog.auth.dto.AuthTokenResponse;
import com.triplog.auth.mapper.SocialAccountMapper;
import com.triplog.auth.oauth.OAuthProvider;
import com.triplog.auth.oauth.OAuthProviderClient;
import com.triplog.auth.oauth.OAuthRedirects;
import com.triplog.auth.oauth.OAuthStateCodec;
import com.triplog.auth.oauth.OAuthUserInfo;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.user.domain.User;
import com.triplog.user.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;

import java.net.URI;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;

class OAuthLoginServiceTest {

    private OAuthStateCodec stateCodec;
    private OAuthRedirects redirects;
    private SocialAccountMapper socialAccountMapper;
    private UserMapper userMapper;
    private AuthService authService;
    private OAuthLoginService service;

    @BeforeEach
    void setUp() {
        stateCodec = mock(OAuthStateCodec.class);
        redirects = mock(OAuthRedirects.class);
        socialAccountMapper = mock(SocialAccountMapper.class);
        userMapper = mock(UserMapper.class);
        authService = mock(AuthService.class);
        service = new OAuthLoginService(
                List.of(fakeClient(OAuthProvider.KAKAO), fakeClient(OAuthProvider.GOOGLE), fakeClient(OAuthProvider.NAVER)),
                stateCodec,
                redirects,
                socialAccountMapper,
                userMapper,
                authService
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
    void existing_social_account_reuses_internal_jwt_issue_flow() {
        SocialAccount existing = new SocialAccount();
        existing.setUserId(12L);
        when(socialAccountMapper.findByProviderAndProviderUserId("KAKAO", "kakao-1")).thenReturn(existing);
        when(authService.issueTokens(12L)).thenReturn(AuthTokenResponse.bearer("access", "refresh"));

        AuthTokenResponse response = service.loginOrSignup(
                new OAuthUserInfo(OAuthProvider.KAKAO, "kakao-1", "kakao@example.com", "kakao", null));

        assertThat(response.accessToken()).isEqualTo("access");
        verify(userMapper, never()).insert(any());
    }

    @Test
    void first_social_login_creates_internal_user_and_social_mapping() {
        when(socialAccountMapper.findByProviderAndProviderUserId("GOOGLE", "google-1")).thenReturn(null);
        when(userMapper.countByEmail("google@example.com")).thenReturn(0);
        doAnswer(invocation -> {
            invocation.getArgument(0, User.class).setId(99L);
            return 1;
        }).when(userMapper).insert(any(User.class));
        when(authService.issueTokens(99L)).thenReturn(AuthTokenResponse.bearer("access", "refresh"));

        AuthTokenResponse response = service.loginOrSignup(
                new OAuthUserInfo(OAuthProvider.GOOGLE, "google-1", "google@example.com", "Google User", "pic"));

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userMapper).insert(userCaptor.capture());
        User insertedUser = userCaptor.getValue();

        ArgumentCaptor<SocialAccount> accountCaptor = ArgumentCaptor.forClass(SocialAccount.class);
        verify(socialAccountMapper).insert(accountCaptor.capture());
        SocialAccount account = accountCaptor.getValue();

        assertThat(insertedUser.getEmail()).isNull();
        assertThat(insertedUser.getPassword()).isNull();
        assertThat(insertedUser.getNickname()).isEqualTo("Google User");
        assertThat(account.getProvider()).isEqualTo("GOOGLE");
        assertThat(account.getProviderUserId()).isEqualTo("google-1");
        assertThat(account.getEmail()).isEqualTo("google@example.com");
        assertThat(response.refreshToken()).isEqualTo("refresh");
    }

    @Test
    void social_login_rejects_email_already_used_by_password_account() {
        when(socialAccountMapper.findByProviderAndProviderUserId("NAVER", "naver-1")).thenReturn(null);
        when(userMapper.countByEmail("same@example.com")).thenReturn(1);

        assertThatThrownBy(() -> service.loginOrSignup(
                new OAuthUserInfo(OAuthProvider.NAVER, "naver-1", "same@example.com", "naver", null)))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.OAUTH_EMAIL_CONFLICT));

        verify(userMapper, never()).insert(any());
        verify(socialAccountMapper, never()).insert(any());
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
