package com.triplog.auth.jwt;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

/**
 * JWT 생성·검증 골격 (architecture §7). Sprint 0 에서는 토큰 발급/파싱의 최소 기능만 둔다.
 * 실제 로그인/리프레시 흐름은 Sprint 1 인증 마무리에서 붙인다.
 */
@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final long accessTokenValidityMs;
    private final long refreshTokenValidityMs;

    public JwtTokenProvider(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.access-token-validity-ms}") long accessTokenValidityMs,
            @Value("${jwt.refresh-token-validity-ms}") long refreshTokenValidityMs) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessTokenValidityMs = accessTokenValidityMs;
        this.refreshTokenValidityMs = refreshTokenValidityMs;
    }

    public String createAccessToken(String subject) {
        return createToken(subject, accessTokenValidityMs);
    }

    public String createAccessToken(Long userId) {
        return createAccessToken(String.valueOf(userId));
    }

    public String createRefreshToken(String subject) {
        return createToken(subject, refreshTokenValidityMs);
    }

    public String createRefreshToken(Long userId) {
        return createRefreshToken(String.valueOf(userId));
    }

    public long getRefreshTokenValidityMs() {
        return refreshTokenValidityMs;
    }

    private String createToken(String subject, long validityMs) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + validityMs);
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(subject)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    /** 토큰이 유효하면 subject 를 반환하고, 그렇지 않으면 null 을 반환한다. */
    public String parseSubject(String token) {
        try {
            return parseClaims(token).getSubject();
        } catch (Exception e) {
            return null;
        }
    }

    public Long parseUserId(String token) {
        String subject = parseSubject(token);
        if (subject == null) {
            return null;
        }
        try {
            return Long.valueOf(subject);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public Long parseUserIdOrThrow(String token) {
        try {
            String subject = parseClaims(token).getSubject();
            return Long.valueOf(subject);
        } catch (ExpiredJwtException e) {
            throw new BusinessException(ErrorCode.EXPIRED_TOKEN);
        } catch (NumberFormatException e) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
