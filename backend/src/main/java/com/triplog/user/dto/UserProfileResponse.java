package com.triplog.user.dto;

import com.triplog.user.domain.User;

import java.time.LocalDateTime;

public record UserProfileResponse(
        Long id,
        String email,
        String nickname,
        String profileImg,
        LocalDateTime createdAt,
        boolean hasPassword
) {

    public static UserProfileResponse from(User user) {
        return new UserProfileResponse(
                user.getId(),
                user.getEmail(),
                user.getNickname(),
                user.getProfileImg(),
                user.getCreatedAt(),
                user.getPassword() != null && !user.getPassword().isBlank()
        );
    }
}
