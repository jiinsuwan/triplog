package com.triplog.user.service;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.user.domain.User;
import com.triplog.user.dto.UpdateUserProfileRequest;
import com.triplog.user.dto.UserProfileResponse;
import com.triplog.user.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private final UserMapper userMapper;

    public UserService(UserMapper userMapper) {
        this.userMapper = userMapper;
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

    private User findUser(Long userId) {
        User user = userMapper.findById(userId);
        if (user == null) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
        return user;
    }
}
