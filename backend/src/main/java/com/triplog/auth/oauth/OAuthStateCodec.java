package com.triplog.auth.oauth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;

@Component
public class OAuthStateCodec {

    private static final long STATE_TTL_SECONDS = 600;
    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final int NONCE_BYTES = 16;

    private final OAuthProperties properties;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final SecureRandom secureRandom = new SecureRandom();

    public OAuthStateCodec(OAuthProperties properties, ObjectMapper objectMapper, Clock clock) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public String encode(OAuthProvider provider, String redirectPath) {
        OAuthState state = new OAuthState(
                provider,
                sanitizeRedirectPath(redirectPath),
                Instant.now(clock).plusSeconds(STATE_TTL_SECONDS).getEpochSecond(),
                nonce()
        );
        try {
            String payload = base64Url(objectMapper.writeValueAsBytes(state));
            return payload + "." + sign(payload);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.OAUTH_STATE_INVALID);
        }
    }

    public OAuthState decode(String encodedState) {
        if (encodedState == null || encodedState.isBlank() || !encodedState.contains(".")) {
            throw new BusinessException(ErrorCode.OAUTH_STATE_INVALID);
        }
        String[] parts = encodedState.split("\\.", 2);
        if (!constantTimeEquals(sign(parts[0]), parts[1])) {
            throw new BusinessException(ErrorCode.OAUTH_STATE_INVALID);
        }
        try {
            byte[] payload = Base64.getUrlDecoder().decode(parts[0]);
            OAuthState state = objectMapper.readValue(payload, OAuthState.class);
            if (state.expiresAtEpochSecond() < Instant.now(clock).getEpochSecond()) {
                throw new BusinessException(ErrorCode.OAUTH_STATE_INVALID);
            }
            return state;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.OAUTH_STATE_INVALID);
        }
    }

    private String sanitizeRedirectPath(String redirectPath) {
        if (redirectPath == null || redirectPath.isBlank()) {
            return "/trips";
        }
        if (!redirectPath.startsWith("/") || redirectPath.startsWith("//") || redirectPath.length() > 200) {
            return "/trips";
        }
        return redirectPath;
    }

    private String nonce() {
        byte[] bytes = new byte[NONCE_BYTES];
        secureRandom.nextBytes(bytes);
        return base64Url(bytes);
    }

    private String sign(String payload) {
        String secret = properties.getStateSecret();
        if (secret == null || secret.isBlank()) {
            throw new BusinessException(ErrorCode.OAUTH_STATE_INVALID);
        }
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return base64Url(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.OAUTH_STATE_INVALID);
        }
    }

    private String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private boolean constantTimeEquals(String left, String right) {
        if (left == null || right == null) {
            return false;
        }
        byte[] leftBytes = left.getBytes(StandardCharsets.UTF_8);
        byte[] rightBytes = right.getBytes(StandardCharsets.UTF_8);
        if (leftBytes.length != rightBytes.length) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < leftBytes.length; i++) {
            result |= leftBytes[i] ^ rightBytes[i];
        }
        return result == 0;
    }
}
