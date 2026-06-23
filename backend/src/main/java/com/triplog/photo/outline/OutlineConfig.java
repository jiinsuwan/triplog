package com.triplog.photo.outline;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.client.RestClient;

/**
 * 윤곽선 전처리 설정 (S3-LOG-02 #70).
 * InferenceProperties 바인딩 + 백그라운드 워커용 스케줄링 활성화 + 추론 서버 전용 RestClient.
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties(InferenceProperties.class)
public class OutlineConfig {

    /** 추론 서버 전용 RestClient — baseUrl·connect/read timeout 고정(InferenceClient 가 주입받아 쓴다). */
    @Bean
    RestClient inferenceRestClient(InferenceProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) props.getConnectTimeout().toMillis());
        factory.setReadTimeout((int) props.getReadTimeout().toMillis());
        return RestClient.builder()
                .baseUrl(props.getBaseUrl())
                .requestFactory(factory)
                .build();
    }
}
