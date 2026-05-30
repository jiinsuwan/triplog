package com.triplog.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateUserProfileRequest(
        @NotBlank
        @Size(max = 50)
        String nickname,

        @Size(max = 512)
        String profileImg
) {
}
