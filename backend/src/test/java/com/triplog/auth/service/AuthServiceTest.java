package com.triplog.auth.service;

import com.triplog.auth.domain.RefreshToken;
import com.triplog.auth.dto.LoginRequest;
import com.triplog.auth.dto.SignupRequest;
import com.triplog.auth.jwt.JwtTokenProvider;
import com.triplog.auth.mapper.RefreshTokenMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.user.domain.User;
import com.triplog.user.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    private static final Clock FIXED_CLOCK = Clock.fixed(
            Instant.parse("2026-05-30T12:00:00Z"), ZoneId.of("Asia/Seoul"));

    @Mock
    private UserMapper userMapper;

    @Mock
    private RefreshTokenMapper refreshTokenMapper;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtTokenProvider tokenProvider;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userMapper, refreshTokenMapper, passwordEncoder, tokenProvider, FIXED_CLOCK);
    }

    @Test
    void signup_rejects_duplicate_email() {
        SignupRequest request = new SignupRequest("me@example.com", "password123", "tester");
        when(userMapper.countByEmail("me@example.com")).thenReturn(1);

        assertThatThrownBy(() -> authService.signup(request))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS));

        verify(userMapper, never()).insert(any());
    }

    @Test
    void login_rejects_invalid_password() {
        User user = user(1L, "me@example.com", "encoded-password");
        when(userMapper.findByEmail("me@example.com")).thenReturn(user);
        when(passwordEncoder.matches("wrong-password", "encoded-password")).thenReturn(false);

        assertThatThrownBy(() -> authService.login(new LoginRequest("me@example.com", "wrong-password")))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_CREDENTIALS));

        verify(refreshTokenMapper, never()).insert(any());
    }

    @Test
    void refresh_rejects_expired_refresh_token() {
        String oldRefresh = "old-refresh";
        RefreshToken expired = refreshToken(1L, oldRefresh, LocalDateTime.now(FIXED_CLOCK).minusSeconds(1), null);
        when(tokenProvider.parseUserIdOrThrow(oldRefresh)).thenReturn(1L);
        when(refreshTokenMapper.findByToken(oldRefresh)).thenReturn(expired);

        assertThatThrownBy(() -> authService.refresh(oldRefresh))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.EXPIRED_TOKEN));

        verify(refreshTokenMapper).revokeByToken(eq(oldRefresh), any(LocalDateTime.class));
    }

    @Test
    void refresh_rotates_token_and_rejects_reused_old_token() {
        String oldRefresh = "old-refresh";
        String newRefresh = "new-refresh";
        RefreshToken active = refreshToken(1L, oldRefresh, LocalDateTime.now(FIXED_CLOCK).plusDays(1), null);
        RefreshToken revoked = refreshToken(1L, oldRefresh, LocalDateTime.now(FIXED_CLOCK).plusDays(1),
                LocalDateTime.now(FIXED_CLOCK));

        when(tokenProvider.parseUserIdOrThrow(oldRefresh)).thenReturn(1L);
        when(refreshTokenMapper.findByToken(oldRefresh)).thenReturn(active, revoked);
        when(tokenProvider.createAccessToken(1L)).thenReturn("new-access");
        when(tokenProvider.createRefreshToken(1L)).thenReturn(newRefresh);
        when(tokenProvider.getRefreshTokenValidityMs()).thenReturn(86_400_000L);

        var response = authService.refresh(oldRefresh);

        assertThat(response.accessToken()).isEqualTo("new-access");
        assertThat(response.refreshToken()).isEqualTo(newRefresh);
        verify(refreshTokenMapper).revokeByToken(eq(oldRefresh), any(LocalDateTime.class));
        verify(refreshTokenMapper).insert(any(RefreshToken.class));

        assertThatThrownBy(() -> authService.refresh(oldRefresh))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.REFRESH_TOKEN_REUSED));

        verify(refreshTokenMapper).revokeAllByUserId(eq(1L), any(LocalDateTime.class));
    }

    private User user(Long id, String email, String password) {
        User user = new User();
        user.setId(id);
        user.setEmail(email);
        user.setPassword(password);
        user.setNickname("tester");
        return user;
    }

    private RefreshToken refreshToken(Long userId, String token, LocalDateTime expiresAt, LocalDateTime revokedAt) {
        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setUserId(userId);
        refreshToken.setToken(token);
        refreshToken.setExpiresAt(expiresAt);
        refreshToken.setRevokedAt(revokedAt);
        return refreshToken;
    }
}
