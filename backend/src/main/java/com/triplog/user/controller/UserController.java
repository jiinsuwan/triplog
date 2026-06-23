package com.triplog.user.controller;

import com.triplog.common.ApiResponse;
import com.triplog.user.dto.UpdateUserProfileRequest;
import com.triplog.user.dto.UserProfileResponse;
import com.triplog.user.dto.WithdrawUserRequest;
import com.triplog.user.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "User", description = "프로필 API")
@RestController
@RequestMapping("/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @Operation(summary = "내 프로필 조회")
    @GetMapping("/me")
    public ApiResponse<UserProfileResponse> me(@AuthenticationPrincipal Long userId) {
        return ApiResponse.success(userService.getProfile(userId));
    }

    @Operation(summary = "내 프로필 수정")
    @PutMapping("/me")
    public ApiResponse<UserProfileResponse> updateMe(@AuthenticationPrincipal Long userId,
                                                     @Valid @RequestBody UpdateUserProfileRequest request) {
        return ApiResponse.success("프로필이 수정되었습니다.", userService.updateProfile(userId, request));
    }

    @Operation(summary = "회원 탈퇴")
    @DeleteMapping("/me")
    public ApiResponse<Void> withdrawMe(@AuthenticationPrincipal Long userId,
                                        @Valid @RequestBody WithdrawUserRequest request) {
        userService.withdraw(userId, request);
        return ApiResponse.success("회원 탈퇴가 완료되었습니다.", null);
    }
}
