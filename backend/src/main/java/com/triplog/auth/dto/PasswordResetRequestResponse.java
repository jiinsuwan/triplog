package com.triplog.auth.dto;

public record PasswordResetRequestResponse(String demoResetUrl) {

    public static PasswordResetRequestResponse withoutDemoUrl() {
        return new PasswordResetRequestResponse(null);
    }
}
