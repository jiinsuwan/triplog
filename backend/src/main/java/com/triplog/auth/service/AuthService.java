package com.triplog.auth.service;

import com.triplog.auth.domain.RefreshToken;
import com.triplog.auth.dto.AuthTokenResponse;
import com.triplog.auth.dto.LoginRequest;
import com.triplog.auth.dto.SignupRequest;
import com.triplog.auth.jwt.JwtTokenProvider;
import com.triplog.auth.mapper.RefreshTokenMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.user.domain.User;
import com.triplog.user.dto.UserProfileResponse;
import com.triplog.user.mapper.UserMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
public class AuthService {

    private final UserMapper userMapper;
    private final RefreshTokenMapper refreshTokenMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final Clock clock;

    public AuthService(UserMapper userMapper,
                       RefreshTokenMapper refreshTokenMapper,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider tokenProvider,
                       Clock clock) {
        this.userMapper = userMapper;
        this.refreshTokenMapper = refreshTokenMapper;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
        this.clock = clock;
    }

    @Transactional
    public UserProfileResponse signup(SignupRequest request) {
        if (userMapper.countByEmail(request.email()) > 0) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }

        User user = new User();
        user.setEmail(request.email());
        user.setPassword(passwordEncoder.encode(request.password()));
        user.setNickname(request.nickname());
        userMapper.insert(user);
        return UserProfileResponse.from(userMapper.findById(user.getId()));
    }

    @Transactional
    public AuthTokenResponse login(LoginRequest request) {
        User user = userMapper.findByEmail(request.email());
        if (user == null || !passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        return issueTokens(user.getId());
    }

    @Transactional(noRollbackFor = BusinessException.class)
    public AuthTokenResponse refresh(String refreshTokenValue) {
        Long tokenUserId = tokenProvider.parseUserIdOrThrow(refreshTokenValue);
        RefreshToken refreshToken = refreshTokenMapper.findByToken(refreshTokenValue);
        LocalDateTime now = now();

        if (refreshToken == null || !tokenUserId.equals(refreshToken.getUserId())) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }
        if (refreshToken.isRevoked()) {
            refreshTokenMapper.revokeAllByUserId(refreshToken.getUserId(), now);
            throw new BusinessException(ErrorCode.REFRESH_TOKEN_REUSED);
        }
        if (refreshToken.isExpired(now)) {
            refreshTokenMapper.revokeByToken(refreshTokenValue, now);
            throw new BusinessException(ErrorCode.EXPIRED_TOKEN);
        }

        refreshTokenMapper.revokeByToken(refreshTokenValue, now);
        return issueTokens(refreshToken.getUserId());
    }

    @Transactional
    public void logout(Long userId, String refreshTokenValue) {
        Long tokenUserId = tokenProvider.parseUserIdOrThrow(refreshTokenValue);
        if (!userId.equals(tokenUserId)) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }
        RefreshToken refreshToken = refreshTokenMapper.findByToken(refreshTokenValue);
        if (refreshToken == null || !userId.equals(refreshToken.getUserId()) || refreshToken.isRevoked()) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }
        refreshTokenMapper.revokeByToken(refreshTokenValue, now());
    }

    private AuthTokenResponse issueTokens(Long userId) {
        String accessToken = tokenProvider.createAccessToken(userId);
        String refreshTokenValue = tokenProvider.createRefreshToken(userId);

        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setUserId(userId);
        refreshToken.setToken(refreshTokenValue);
        refreshToken.setExpiresAt(now().plusNanos(tokenProvider.getRefreshTokenValidityMs() * 1_000_000));
        refreshTokenMapper.insert(refreshToken);

        return AuthTokenResponse.bearer(accessToken, refreshTokenValue);
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }
}
