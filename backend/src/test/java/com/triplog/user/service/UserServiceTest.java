package com.triplog.user.service;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.card.service.CardFileCleanup;
import com.triplog.photo.service.PhotoTripCleanup;
import com.triplog.user.domain.User;
import com.triplog.user.dto.WithdrawUserRequest;
import com.triplog.user.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserMapper userMapper;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private PhotoTripCleanup photoTripCleanup;
    @Mock
    private CardFileCleanup cardFileCleanup;

    private UserService userService;

    @BeforeEach
    void setUp() {
        userService = new UserService(userMapper, passwordEncoder, photoTripCleanup, cardFileCleanup);
    }

    @Test
    void withdraw_checks_password_then_schedules_file_cleanup_before_user_delete() {
        User user = user(1L, "encoded-password");
        when(userMapper.findByIdForUpdate(1L)).thenReturn(user);
        when(passwordEncoder.matches("password123", "encoded-password")).thenReturn(true);
        when(userMapper.deleteById(1L)).thenReturn(1);

        userService.withdraw(1L, new WithdrawUserRequest("password123"));

        InOrder order = inOrder(userMapper, passwordEncoder, photoTripCleanup, cardFileCleanup);
        order.verify(userMapper).findByIdForUpdate(1L);
        order.verify(passwordEncoder).matches("password123", "encoded-password");
        order.verify(photoTripCleanup).scheduleFileCleanupForUser(1L);
        order.verify(cardFileCleanup).scheduleFileCleanupForUser(1L);
        order.verify(userMapper).deleteById(1L);
    }

    @Test
    void withdraw_rejects_wrong_password_without_cleanup_or_delete() {
        User user = user(1L, "encoded-password");
        when(userMapper.findByIdForUpdate(1L)).thenReturn(user);
        when(passwordEncoder.matches("wrong", "encoded-password")).thenReturn(false);

        assertThatThrownBy(() -> userService.withdraw(1L, new WithdrawUserRequest("wrong")))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.USER_PASSWORD_MISMATCH));

        verify(photoTripCleanup, never()).scheduleFileCleanupForUser(1L);
        verify(userMapper, never()).deleteById(1L);
    }

    @Test
    void withdraw_rejects_blank_password_for_password_user_without_cleanup_or_delete() {
        User user = user(1L, "encoded-password");
        when(userMapper.findByIdForUpdate(1L)).thenReturn(user);

        assertThatThrownBy(() -> userService.withdraw(1L, new WithdrawUserRequest(" ")))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));

        verify(passwordEncoder, never()).matches(" ", "encoded-password");
        verify(photoTripCleanup, never()).scheduleFileCleanupForUser(1L);
        verify(cardFileCleanup, never()).scheduleFileCleanupForUser(1L);
        verify(userMapper, never()).deleteById(1L);
    }

    @Test
    void withdraw_social_only_user_without_password_check() {
        User user = user(1L, null);
        when(userMapper.findByIdForUpdate(1L)).thenReturn(user);
        when(userMapper.deleteById(1L)).thenReturn(1);

        userService.withdraw(1L, new WithdrawUserRequest(null));

        verify(passwordEncoder, never()).matches(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(photoTripCleanup).scheduleFileCleanupForUser(1L);
        verify(cardFileCleanup).scheduleFileCleanupForUser(1L);
        verify(userMapper).deleteById(1L);
    }

    @Test
    void withdraw_rejects_missing_user() {
        when(userMapper.findByIdForUpdate(1L)).thenReturn(null);

        assertThatThrownBy(() -> userService.withdraw(1L, new WithdrawUserRequest("password123")))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.USER_NOT_FOUND));

        verify(photoTripCleanup, never()).scheduleFileCleanupForUser(1L);
        verify(cardFileCleanup, never()).scheduleFileCleanupForUser(1L);
        verify(userMapper, never()).deleteById(1L);
    }

    private User user(Long id, String password) {
        User user = new User();
        user.setId(id);
        user.setEmail("me@example.com");
        user.setPassword(password);
        user.setNickname("tester");
        return user;
    }
}
