package com.triplog.user.service;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.photo.service.PhotoTripCleanup;
import com.triplog.user.domain.User;
import com.triplog.user.dto.UpdateUserProfileRequest;
import com.triplog.user.dto.UserProfileResponse;
import com.triplog.user.dto.WithdrawUserRequest;
import com.triplog.user.mapper.UserMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final PhotoTripCleanup photoTripCleanup;

    public UserService(UserMapper userMapper,
                       PasswordEncoder passwordEncoder,
                       PhotoTripCleanup photoTripCleanup) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
        this.photoTripCleanup = photoTripCleanup;
    }

    @Transactional(readOnly = true)
    public UserProfileResponse getProfile(Long userId) {
        return UserProfileResponse.from(findUser(userId));
    }

    @Transactional
    public UserProfileResponse updateProfile(Long userId, UpdateUserProfileRequest request) {
        int updated = userMapper.updateProfile(userId, request.nickname(), request.profileImg());
        if (updated == 0) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
        return UserProfileResponse.from(findUser(userId));
    }

    @Transactional
    public void withdraw(Long userId, WithdrawUserRequest request) {
        User user = userMapper.findByIdForUpdate(userId);
        if (user == null) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
        if (hasText(user.getPassword())) {
            if (request == null || !hasText(request.password())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT);
            }
            if (!passwordEncoder.matches(request.password(), user.getPassword())) {
                throw new BusinessException(ErrorCode.USER_PASSWORD_MISMATCH);
            }
        }

        photoTripCleanup.scheduleFileCleanupForUser(userId);
        int deleted = userMapper.deleteById(userId);
        if (deleted == 0) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
    }

    private User findUser(Long userId) {
        User user = userMapper.findById(userId);
        if (user == null) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
        return user;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
