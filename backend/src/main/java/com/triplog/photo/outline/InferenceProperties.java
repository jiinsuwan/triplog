package com.triplog.photo.outline;

import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * 윤곽선 추론 서버(inference/) 연동 설정 (S3-LOG-02 #70).
 * 같은 호스트 내부 비공개 포트. base-url 은 운영자 고정값으로만 두고 요청에서 파생하지 않는다.
 */
@Validated
@ConfigurationProperties(prefix = "inference")
public class InferenceProperties {

    private String baseUrl = "http://127.0.0.1:8765";
    private Duration connectTimeout = Duration.ofSeconds(2);
    private Duration readTimeout = Duration.ofSeconds(10);
    private Duration pollInterval = Duration.ofMillis(500);
    private Duration pollTimeout = Duration.ofSeconds(60);

    /** 워커가 한 번에 처리할 PENDING 사진 수(추론 서버 워커=1 직렬화에 맞춰 기본 1). */
    @Min(1)
    private int batchSize = 1;

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public Duration getConnectTimeout() {
        return connectTimeout;
    }

    public void setConnectTimeout(Duration connectTimeout) {
        this.connectTimeout = connectTimeout;
    }

    public Duration getReadTimeout() {
        return readTimeout;
    }

    public void setReadTimeout(Duration readTimeout) {
        this.readTimeout = readTimeout;
    }

    public Duration getPollInterval() {
        return pollInterval;
    }

    public void setPollInterval(Duration pollInterval) {
        this.pollInterval = pollInterval;
    }

    public Duration getPollTimeout() {
        return pollTimeout;
    }

    public void setPollTimeout(Duration pollTimeout) {
        this.pollTimeout = pollTimeout;
    }

    public int getBatchSize() {
        return batchSize;
    }

    public void setBatchSize(int batchSize) {
        this.batchSize = batchSize;
    }
}
