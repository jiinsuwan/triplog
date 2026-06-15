package com.triplog.photo.outline;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 윤곽선 전처리 설정 (S3-LOG-02 #70).
 * InferenceProperties 바인딩 + 백그라운드 워커용 스케줄링 활성화.
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties(InferenceProperties.class)
public class OutlineConfig {
}
