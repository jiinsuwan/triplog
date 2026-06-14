package com.triplog.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasswordResetConfirmRequest(
        @NotBlank
        @Size(max = 512)
        String token,

        @NotBlank
        @Size(min = 8, max = 100)
        String newPassword
) {
}
