package com.triplog.common.external;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;

public class ExternalApiException extends BusinessException {

    private final String provider;
    private final Integer statusCode;
    private final int attempts;

    public ExternalApiException(ErrorCode errorCode, String provider, Integer statusCode, int attempts) {
        super(errorCode, errorCode.getMessage());
        this.provider = provider;
        this.statusCode = statusCode;
        this.attempts = attempts;
    }

    public String getProvider() {
        return provider;
    }

    public Integer getStatusCode() {
        return statusCode;
    }

    public int getAttempts() {
        return attempts;
    }
}
