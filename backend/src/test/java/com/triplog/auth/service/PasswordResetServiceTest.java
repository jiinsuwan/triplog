package com.triplog.auth.service;

import com.triplog.auth.config.PasswordResetProperties;
import com.triplog.auth.domain.PasswordResetToken;
import com.triplog.auth.dto.PasswordResetConfirmRequest;
import com.triplog.auth.dto.PasswordResetRequest;
import com.triplog.auth.mapper.PasswordResetTokenMapper;
import com.triplog.auth.mapper.RefreshTokenMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.user.domain.User;
import com.triplog.user.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.env.Environment;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
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
class PasswordResetServiceTest {

    private static final Clock FIXED_CLOCK = Clock.fixed(
            Instant.parse("2026-06-13T03:00:00Z"), ZoneId.of("Asia/Seoul"));

    @Mock
    private UserMapper userMapper;

    @Mock
    private PasswordResetTokenMapper passwordResetTokenMapper;

    @Mock
    private RefreshTokenMapper refreshTokenMapper;

    @Mock
    private PasswordEncoder passwordEncoder;

    private PasswordResetProperties properties;
    private Environment environment;
    private PasswordResetService service;

    @BeforeEach
    void setUp() {
        properties = new PasswordResetProperties();
        properties.setMinResponseDelay(Duration.ZERO);
        environment = new MockEnvironment();
        service = new PasswordResetService(userMapper, passwordResetTokenMapper, refreshTokenMapper,
                passwordEncoder, properties, environment, FIXED_CLOCK);
    }

    @Test
    void request_for_existing_email_stores_sha256_hash_and_returns_demo_url_only_when_enabled() {
        properties.setExposeDemoUrl(true);
        properties.setTtl(Duration.ofMinutes(20));
        User user = user(7L, "me@example.com");
        when(userMapper.findByEmail("me@example.com")).thenReturn(user);

        var response = service.request(new PasswordResetRequest("me@example.com"));

        assertThat(response.demoResetUrl()).startsWith("http://localhost:5173/reset-password?token=");
        String rawToken = response.demoResetUrl().substring(response.demoResetUrl().indexOf("token=") + 6);
        ArgumentCaptor<PasswordResetToken> captor = ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(passwordResetTokenMapper).revokeUnusedByUserId(eq(7L), any(LocalDateTime.class));
        verify(passwordResetTokenMapper).insert(captor.capture());
        PasswordResetToken stored = captor.getValue();
        assertThat(stored.getUserId()).isEqualTo(7L);
        assertThat(stored.getTokenHash()).hasSize(64);
        assertThat(stored.getTokenHash()).isNotEqualTo(rawToken);
        assertThat(stored.getExpiresAt()).isEqualTo(LocalDateTime.now(FIXED_CLOCK).plusMinutes(20));
    }

    @Test
    void request_does_not_expose_demo_url_by_default() {
        when(userMapper.findByEmail("me@example.com")).thenReturn(user(7L, "me@example.com"));

        var response = service.request(new PasswordResetRequest("me@example.com"));

        assertThat(response.demoResetUrl()).isNull();
        verify(passwordResetTokenMapper).insert(any(PasswordResetToken.class));
    }

    @Test
    void request_for_missing_email_returns_same_shape_without_storing_token() {
        when(userMapper.findByEmail("missing@example.com")).thenReturn(null);
        when(passwordEncoder.encode(any())).thenReturn("dummy-hash");

        var response = service.request(new PasswordResetRequest("missing@example.com"));

        assertThat(response.demoResetUrl()).isNull();
        verify(passwordResetTokenMapper, never()).insert(any());
        verify(passwordResetTokenMapper, never()).revokeUnusedByUserId(any(), any());
        verify(passwordEncoder).encode(any());
    }

    @Test
    void confirm_consumes_token_updates_password_and_revokes_refresh_tokens() {
        String rawToken = "raw-token";
        String tokenHash = sha256(rawToken);
        PasswordResetToken token = new PasswordResetToken();
        token.setUserId(7L);

        when(passwordResetTokenMapper.consumeByHash(eq(tokenHash), any(LocalDateTime.class))).thenReturn(1);
        when(passwordResetTokenMapper.findByHash(tokenHash)).thenReturn(token);
        when(passwordEncoder.encode("new-password")).thenReturn("encoded-new-password");

        service.confirm(new PasswordResetConfirmRequest(rawToken, "new-password"));

        verify(userMapper).updatePassword(7L, "encoded-new-password");
        verify(refreshTokenMapper).revokeAllByUserId(eq(7L), any(LocalDateTime.class));
    }

    @Test
    void confirm_uses_generic_failure_for_invalid_token() {
        when(passwordResetTokenMapper.consumeByHash(any(), any(LocalDateTime.class))).thenReturn(0);

        assertThatThrownBy(() -> service.confirm(new PasswordResetConfirmRequest("bad-token", "new-password")))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.PASSWORD_RESET_FAILED));

        verify(userMapper, never()).updatePassword(any(), any());
        verify(refreshTokenMapper, never()).revokeAllByUserId(any(), any());
    }

    private User user(Long id, String email) {
        User user = new User();
        user.setId(id);
        user.setEmail(email);
        user.setPassword("encoded-password");
        user.setNickname("tester");
        return user;
    }

    private String sha256(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                builder.append(String.format("%02x", b));
            }
            return builder.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
