package com.triplog.auth.config;

import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@Component
@Validated
@ConfigurationProperties(prefix = "app.password-reset")
public class PasswordResetProperties {

    @NotNull
    private Duration ttl = Duration.ofMinutes(20);

    @NotNull
    private Duration minResponseDelay = Duration.ofMillis(250);

    private boolean exposeDemoUrl = false;

    @NotNull
    private String demoBaseUrl = "http://localhost:5173/reset-password";

    public Duration getTtl() {
        return ttl;
    }

    public void setTtl(Duration ttl) {
        this.ttl = ttl;
    }

    public Duration getMinResponseDelay() {
        return minResponseDelay;
    }

    public void setMinResponseDelay(Duration minResponseDelay) {
        this.minResponseDelay = minResponseDelay;
    }

    public boolean isExposeDemoUrl() {
        return exposeDemoUrl;
    }

    public void setExposeDemoUrl(boolean exposeDemoUrl) {
        this.exposeDemoUrl = exposeDemoUrl;
    }

    public String getDemoBaseUrl() {
        return demoBaseUrl;
    }

    public void setDemoBaseUrl(String demoBaseUrl) {
        this.demoBaseUrl = demoBaseUrl;
    }
}
