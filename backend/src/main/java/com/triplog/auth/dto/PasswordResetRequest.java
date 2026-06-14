package com.triplog.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasswordResetRequest(
        @Email
        @NotBlank
        @Size(max = 255)
        String email
) {
}
