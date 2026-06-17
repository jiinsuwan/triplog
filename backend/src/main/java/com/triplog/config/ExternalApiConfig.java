package com.triplog.config;

import com.triplog.common.external.ExternalApiClient;
import com.triplog.common.external.ExternalApiProperties;
import com.triplog.common.external.JavaNetExternalHttpTransport;
import com.triplog.itinerary.route.TmapRouteProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.net.http.HttpClient;

@Configuration
@EnableConfigurationProperties({ExternalApiProperties.class, TmapRouteProperties.class})
public class ExternalApiConfig {

    @Bean
    HttpClient externalHttpClient(ExternalApiProperties properties) {
        return HttpClient.newBuilder()
                .connectTimeout(properties.getConnectTimeout())
                .build();
    }

    @Bean
    ExternalApiClient externalApiClient(HttpClient externalHttpClient, ExternalApiProperties properties) {
        return new ExternalApiClient(new JavaNetExternalHttpTransport(externalHttpClient), properties);
    }
}
