package com.triplog.user.dto;

import jakarta.validation.constraints.NotBlank;

public record WithdrawUserRequest(
        @NotBlank String password
) {
}
