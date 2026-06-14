package com.triplog.auth.controller;

import com.triplog.auth.dto.AuthTokenResponse;
import com.triplog.auth.dto.LoginRequest;
import com.triplog.auth.dto.LogoutRequest;
import com.triplog.auth.dto.PasswordResetConfirmRequest;
import com.triplog.auth.dto.PasswordResetRequest;
import com.triplog.auth.dto.PasswordResetRequestResponse;
import com.triplog.auth.dto.RefreshTokenRequest;
import com.triplog.auth.dto.SignupRequest;
import com.triplog.auth.service.AuthService;
import com.triplog.auth.service.PasswordResetService;
import com.triplog.common.ApiResponse;
import com.triplog.user.dto.UserProfileResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Auth", description = "회원가입, 로그인, 토큰, 비밀번호 재설정 API")
@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordResetService;

    public AuthController(AuthService authService, PasswordResetService passwordResetService) {
        this.authService = authService;
        this.passwordResetService = passwordResetService;
    }

    @Operation(summary = "회원가입")
    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<UserProfileResponse> signup(@Valid @RequestBody SignupRequest request) {
        return ApiResponse.success("회원가입이 완료되었습니다.", authService.signup(request));
    }

    @Operation(summary = "로그인")
    @PostMapping("/login")
    public ApiResponse<AuthTokenResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.success("로그인되었습니다.", authService.login(request));
    }

    @Operation(summary = "토큰 재발급")
    @PostMapping("/refresh")
    public ApiResponse<AuthTokenResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ApiResponse.success("토큰이 재발급되었습니다.", authService.refresh(request.refreshToken()));
    }

    @Operation(summary = "비밀번호 재설정 요청")
    @PostMapping("/password-reset/request")
    public ApiResponse<PasswordResetRequestResponse> requestPasswordReset(
            @Valid @RequestBody PasswordResetRequest request) {
        return ApiResponse.success("계정이 존재하면 재설정 경로를 준비했습니다.",
                passwordResetService.request(request));
    }

    @Operation(summary = "비밀번호 재설정 완료")
    @PostMapping("/password-reset/confirm")
    public ApiResponse<Void> confirmPasswordReset(@Valid @RequestBody PasswordResetConfirmRequest request) {
        passwordResetService.confirm(request);
        return ApiResponse.success("비밀번호가 재설정되었습니다.", null);
    }

    @Operation(summary = "로그아웃")
    @PostMapping("/logout")
    public ApiResponse<Void> logout(@AuthenticationPrincipal Long userId,
                                    @Valid @RequestBody LogoutRequest request) {
        authService.logout(userId, request.refreshToken());
        return ApiResponse.success("로그아웃되었습니다.", null);
    }
}
