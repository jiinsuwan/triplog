package com.triplog.auth.service;

import com.triplog.auth.config.PasswordResetProperties;
import com.triplog.auth.domain.PasswordResetToken;
import com.triplog.auth.dto.PasswordResetConfirmRequest;
import com.triplog.auth.dto.PasswordResetRequest;
import com.triplog.auth.dto.PasswordResetRequestResponse;
import com.triplog.auth.mapper.PasswordResetTokenMapper;
import com.triplog.auth.mapper.RefreshTokenMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.user.domain.User;
import com.triplog.user.mapper.UserMapper;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Base64;
import java.util.Objects;

@Service
public class PasswordResetService {

    private static final int TOKEN_BYTES = 32;
    private static final String PROD_PROFILE = "prod";

    private final UserMapper userMapper;
    private final PasswordResetTokenMapper passwordResetTokenMapper;
    private final RefreshTokenMapper refreshTokenMapper;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetProperties properties;
    private final Environment environment;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;
    private final SecureRandom secureRandom = new SecureRandom();

    public PasswordResetService(UserMapper userMapper,
                                PasswordResetTokenMapper passwordResetTokenMapper,
                                RefreshTokenMapper refreshTokenMapper,
                                PasswordEncoder passwordEncoder,
                                PasswordResetProperties properties,
                                Environment environment,
                                TransactionTemplate transactionTemplate,
                                Clock clock) {
        this.userMapper = userMapper;
        this.passwordResetTokenMapper = passwordResetTokenMapper;
        this.refreshTokenMapper = refreshTokenMapper;
        this.passwordEncoder = passwordEncoder;
        this.properties = properties;
        this.environment = environment;
        this.transactionTemplate = transactionTemplate;
        this.clock = clock;
    }

    public PasswordResetRequestResponse request(PasswordResetRequest request) {
        long startedAt = System.nanoTime();
        try {
            return Objects.requireNonNull(transactionTemplate.execute(status -> requestInTransaction(request)));
        } finally {
            waitForMinimumDelay(startedAt);
        }
    }

    private PasswordResetRequestResponse requestInTransaction(PasswordResetRequest request) {
        User user = userMapper.findByEmail(request.email());
        if (user == null) {
            runDummyWork();
            return PasswordResetRequestResponse.withoutDemoUrl();
        }

        LocalDateTime now = now();
        passwordResetTokenMapper.revokeUnusedByUserId(user.getId(), now);

        String rawToken = generateRawToken();
        PasswordResetToken token = new PasswordResetToken();
        token.setUserId(user.getId());
        token.setTokenHash(hashToken(rawToken));
        token.setExpiresAt(now.plus(properties.getTtl()));
        passwordResetTokenMapper.insert(token);

        if (shouldExposeDemoUrl()) {
            return new PasswordResetRequestResponse(buildDemoResetUrl(rawToken));
        }
        return PasswordResetRequestResponse.withoutDemoUrl();
    }

    @Transactional
    public void confirm(PasswordResetConfirmRequest request) {
        String tokenHash = hashToken(request.token());
        LocalDateTime now = now();
        int consumed = passwordResetTokenMapper.consumeByHash(tokenHash, now);
        if (consumed != 1) {
            throw resetFailed();
        }

        PasswordResetToken token = passwordResetTokenMapper.findByHash(tokenHash);
        if (token == null) {
            throw resetFailed();
        }

        userMapper.updatePassword(token.getUserId(), passwordEncoder.encode(request.newPassword()));
        refreshTokenMapper.revokeAllByUserId(token.getUserId(), now);
    }

    private String generateRawToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hashed.length * 2);
            for (byte value : hashed) {
                builder.append(String.format("%02x", value));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable.", e);
        }
    }

    private void runDummyWork() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        hashToken(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
        passwordEncoder.encode("password-reset-dummy-work");
    }

    private void waitForMinimumDelay(long startedAt) {
        Duration minDelay = properties.getMinResponseDelay();
        if (minDelay.isZero() || minDelay.isNegative()) {
            return;
        }
        long elapsedNanos = System.nanoTime() - startedAt;
        long remainingMillis = minDelay.minusNanos(elapsedNanos).toMillis();
        if (remainingMillis <= 0) {
            return;
        }
        try {
            Thread.sleep(remainingMillis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private boolean shouldExposeDemoUrl() {
        if (!properties.isExposeDemoUrl()) {
            return false;
        }
        return Arrays.stream(environment.getActiveProfiles()).noneMatch(PROD_PROFILE::equalsIgnoreCase);
    }

    private String buildDemoResetUrl(String rawToken) {
        String separator = properties.getDemoBaseUrl().contains("?") ? "&" : "?";
        return properties.getDemoBaseUrl()
                + separator
                + "token="
                + URLEncoder.encode(rawToken, StandardCharsets.UTF_8);
    }

    private BusinessException resetFailed() {
        return new BusinessException(ErrorCode.PASSWORD_RESET_FAILED);
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }
}
